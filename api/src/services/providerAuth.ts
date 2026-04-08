/**
 * Provider Subscription Auth — connect ChatGPT / Claude subscriptions to containers.
 *
 * OpenClaw supports two subscription auth mechanisms:
 *   1. OpenAI Codex OAuth — ChatGPT Plus subscribers use their subscription credits
 *   2. Anthropic setup-token — Claude Pro subscribers paste a token from `claude setup-token`
 *
 * These write to `auth-profiles.json` inside the container, which OpenClaw reads
 * at runtime alongside env-var-based API key auth.
 *
 * The OpenAI OAuth flow is interactive (PKCE) and has a known bug on VPS:
 *   https://github.com/openclaw/openclaw/issues/41885
 * We handle this with generous timeouts and clear fallback messaging.
 */
import { SSHStream, sshExec, sshExecStream } from './ssh';
import { getUserContainer, requireRunningContainer } from './containerConfig';

const UUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const INSTANCE_DIR = '/opt/openclaw/instances';
const OAUTH_SESSION_TTL_MS = 5 * 60 * 1000;

function validateUserId(userId: string): void {
  if (!UUID_RE.test(userId)) throw new Error('Invalid user ID format');
}

interface OAuthSession {
  stream: SSHStream;
  output: string;
  url: string | null;
  timer: ReturnType<typeof setTimeout>;
}

const activeSessions = new Map<string, OAuthSession>();

function cleanupSession(userId: string): void {
  const session = activeSessions.get(userId);
  if (session) {
    clearTimeout(session.timer);
    session.stream.kill();
    activeSessions.delete(userId);
  }
}

// ── Anthropic setup-token ──

export async function saveAnthropicSetupToken(
  userId: string,
  token: string,
): Promise<{ success: boolean; error?: string }> {
  validateUserId(userId);
  const { serverIp, containerName } = await requireRunningContainer(userId);

  const tokenB64 = Buffer.from(token.trim()).toString('base64');
  const result = await sshExec(
    serverIp,
    `echo '${tokenB64}' | base64 -d | docker exec -i ${containerName} openclaw models auth paste-token --provider anthropic 2>&1`,
    1,
    60000,
  );

  if (result.code !== 0 && !result.stdout.toLowerCase().includes('success') && !result.stdout.toLowerCase().includes('saved')) {
    console.error(`[providerAuth] Anthropic setup-token failed for ${userId}: ${result.stderr || result.stdout}`);
    return { success: false, error: result.stderr || result.stdout || 'Failed to save token' };
  }

  return { success: true };
}

// ── OpenAI OAuth (interactive PKCE flow) ──

export function startOpenAIOAuth(
  userId: string,
  serverIp: string,
  containerName: string,
): Promise<{ url?: string; error?: string }> {
  cleanupSession(userId);

  return new Promise((resolve) => {
    let resolved = false;

    const stream = sshExecStream(
      serverIp,
      `docker exec -i ${containerName} openclaw models auth login --provider openai-codex 2>&1`,
    );

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve({ error: 'OAuth flow timed out' });
      }
      cleanupSession(userId);
    }, OAUTH_SESSION_TTL_MS);

    const session: OAuthSession = { stream, output: '', url: null, timer };
    activeSessions.set(userId, session);

    const urlWaitTimeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        if (session.url) {
          resolve({ url: session.url });
        } else {
          resolve({
            error: 'Could not extract OAuth URL. The command may need a TTY. Try using an API key instead. Output: '
              + session.output.slice(0, 300),
          });
          cleanupSession(userId);
        }
      }
    }, 15000);

    stream.on('data', (chunk: string) => {
      session.output += chunk;

      const urlMatch = session.output.match(/https:\/\/auth\.openai\.com\/[^\s\n"']+/);
      if (urlMatch && !session.url) {
        session.url = urlMatch[0];
        if (!resolved) {
          resolved = true;
          clearTimeout(urlWaitTimeout);
          resolve({ url: session.url });
        }
      }
    });

    stream.on('error', (err: Error) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(urlWaitTimeout);
        resolve({ error: err.message });
      }
      cleanupSession(userId);
    });

    stream.on('close', () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(urlWaitTimeout);
        resolve({ error: 'Process exited before the OAuth URL was received. Output: ' + session.output.slice(0, 300) });
      }
    });
  });
}

export function completeOpenAIOAuth(
  userId: string,
  redirectUrl: string,
): Promise<{ success: boolean; error?: string }> {
  const session = activeSessions.get(userId);
  if (!session) {
    return Promise.resolve({
      success: false,
      error: 'No active OAuth session. Please start the flow again.',
    });
  }

  return new Promise((resolve) => {
    let resolved = false;

    const completeTimeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve({
          success: false,
          error: 'OAuth completion timed out. This is a known issue on VPS environments. Try using an API key instead.',
        });
        cleanupSession(userId);
      }
    }, 30000);

    const prevLen = session.output.length;

    const onData = (chunk: string) => {
      session.output += chunk;
      const newOutput = session.output.slice(prevLen).toLowerCase();
      if (
        newOutput.includes('authenticated') ||
        newOutput.includes('success') ||
        newOutput.includes('logged in') ||
        newOutput.includes('saved')
      ) {
        if (!resolved) {
          resolved = true;
          clearTimeout(completeTimeout);
          resolve({ success: true });
          cleanupSession(userId);
        }
      }
    };

    session.stream.on('data', onData);

    session.stream.on('close', () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(completeTimeout);
        resolve({ success: true });
      }
    });

    session.stream.write(redirectUrl.trim() + '\n');
  });
}

// ── Auth status: read auth-profiles.json from container host ──

export async function getProviderAuthStatus(
  userId: string,
): Promise<Record<string, { connected: boolean; email?: string }>> {
  validateUserId(userId);

  const status: Record<string, { connected: boolean; email?: string; type?: string }> = {};

  try {
    const { serverIp } = await getUserContainer(userId);

    const result = await sshExec(
      serverIp,
      `cat ${INSTANCE_DIR}/${userId}/agents/main/agent/auth-profiles.json 2>/dev/null || echo '{}'`,
      1,
      10000,
    );

    let profiles: Record<string, any>;
    try {
      profiles = JSON.parse(result.stdout || '{}');
    } catch {
      profiles = {};
    }

    for (const key of Object.keys(profiles)) {
      if (key === 'version' || key === 'lastGood' || key === 'usageStats') continue;
      const parts = key.split(':');
      const provider = parts[0];
      const email = parts.length > 1 && parts[1] !== 'default' ? parts.slice(1).join(':') : undefined;
      const entry = profiles[key];
      status[provider] = { connected: true, email, type: entry?.type || 'api_key' };
    }
  } catch {
    // Container not provisioned — all disconnected
  }

  return status;
}

// ── Save API key for any provider (writes to auth-profiles.json) ──

export async function saveProviderApiKey(
  userId: string,
  provider: string,
  key: string,
): Promise<{ success: boolean; error?: string }> {
  validateUserId(userId);
  if (!key || !key.trim()) return { success: false, error: 'API key is required' };
  if (!provider || !provider.trim()) return { success: false, error: 'Provider is required' };

  const { serverIp } = await getUserContainer(userId);

  const result = await sshExec(
    serverIp,
    `cat ${INSTANCE_DIR}/${userId}/agents/main/agent/auth-profiles.json 2>/dev/null || echo '{}'`,
    1,
    10000,
  );

  let profiles: Record<string, any>;
  try {
    profiles = JSON.parse(result.stdout || '{}');
  } catch {
    profiles = {};
  }

  const profileKey = `${provider}:default`;
  profiles[profileKey] = { type: 'api_key', provider, key: key.trim() };

  if (!profiles.lastGood) profiles.lastGood = {};
  profiles.lastGood[provider] = profileKey;
  if (!profiles.version) profiles.version = 1;

  const json = JSON.stringify(profiles, null, 2);
  const b64 = Buffer.from(json).toString('base64');
  await sshExec(
    serverIp,
    `mkdir -p ${INSTANCE_DIR}/${userId}/agents/main/agent && echo '${b64}' | base64 -d > ${INSTANCE_DIR}/${userId}/agents/main/agent/auth-profiles.json`,
  );

  return { success: true };
}

// ── Disconnect: remove auth profile entries for a provider ──

export async function disconnectProviderAuth(
  userId: string,
  provider: string,
): Promise<void> {
  validateUserId(userId);
  const { serverIp } = await getUserContainer(userId);

  const result = await sshExec(
    serverIp,
    `cat ${INSTANCE_DIR}/${userId}/agents/main/agent/auth-profiles.json 2>/dev/null || echo '{}'`,
    1,
    10000,
  );

  let profiles: Record<string, any>;
  try {
    profiles = JSON.parse(result.stdout || '{}');
  } catch {
    profiles = {};
  }

  for (const key of Object.keys(profiles)) {
    if (key === provider || key.startsWith(`${provider}:`)) {
      delete profiles[key];
    }
  }

  const json = JSON.stringify(profiles, null, 2);
  const b64 = Buffer.from(json).toString('base64');
  await sshExec(
    serverIp,
    `echo '${b64}' | base64 -d > ${INSTANCE_DIR}/${userId}/agents/main/agent/auth-profiles.json`,
  );
}
