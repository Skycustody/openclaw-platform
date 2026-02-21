import { sshExec } from './ssh';

const INSTANCE_DIR = '/opt/openclaw/instances';

/**
 * Inject platform API keys into a user's OpenClaw container securely.
 *
 * Keys are written ONLY to:
 *   - auth-profiles.json (credential store, not visible in OpenClaw UI)
 *   - Docker env vars (set at container creation, not readable via UI)
 *
 * Keys are intentionally NOT stored in openclaw.json — that file is
 * readable through the OpenClaw Control UI settings page.
 *
 * File permissions are locked to owner-only (chmod 600).
 *
 * Idempotent — safe to call multiple times.
 */
export async function injectApiKeys(
  serverIp: string,
  userId: string,
  containerName: string
): Promise<void> {
  const openaiKey = process.env.OPENAI_API_KEY || '';
  const anthropicKey = process.env.ANTHROPIC_API_KEY || '';

  if (!openaiKey && !anthropicKey) {
    console.warn(`[apiKeys] No API keys in env — skipping injection for ${userId}`);
    return;
  }

  // Strip any leftover keys from openclaw.json (may exist from previous version)
  const configResult = await sshExec(
    serverIp,
    `cat ${INSTANCE_DIR}/${userId}/openclaw.json 2>/dev/null || echo '{}'`
  ).catch(() => ({ stdout: '{}', stderr: '', code: 0 }));

  let config: Record<string, any>;
  try {
    config = JSON.parse(configResult.stdout);
  } catch {
    config = {};
  }

  let configDirty = false;
  if (config.models?.providers?.openai?.apiKey) {
    delete config.models.providers.openai.apiKey;
    if (Object.keys(config.models.providers.openai).length === 0) delete config.models.providers.openai;
    configDirty = true;
  }
  if (config.models?.providers?.anthropic?.apiKey) {
    delete config.models.providers.anthropic.apiKey;
    if (Object.keys(config.models.providers.anthropic).length === 0) delete config.models.providers.anthropic;
    configDirty = true;
  }
  if (config.models?.providers && Object.keys(config.models.providers).length === 0) {
    delete config.models.providers;
  }
  if (config.models && Object.keys(config.models).length === 0) {
    delete config.models;
  }

  if (configDirty) {
    const configB64 = Buffer.from(JSON.stringify(config, null, 2)).toString('base64');
    await sshExec(
      serverIp,
      `echo '${configB64}' | base64 -d > ${INSTANCE_DIR}/${userId}/openclaw.json`
    );
  }

  // Write auth-profiles.json — the secure credential store
  const authProfiles: Record<string, any> = {};

  if (openaiKey) {
    authProfiles['openai:platform'] = {
      provider: 'openai',
      mode: 'api_key',
      apiKey: openaiKey,
    };
  }
  if (anthropicKey) {
    authProfiles['anthropic:platform'] = {
      provider: 'anthropic',
      mode: 'api_key',
      apiKey: anthropicKey,
    };
  }

  const authB64 = Buffer.from(JSON.stringify(authProfiles, null, 2)).toString('base64');

  // Create directory, write file, and lock permissions (owner-only read/write)
  await sshExec(
    serverIp,
    [
      `mkdir -p ${INSTANCE_DIR}/${userId}/agents/main/agent`,
      `echo '${authB64}' | base64 -d > ${INSTANCE_DIR}/${userId}/agents/main/agent/auth-profiles.json`,
      `chmod 600 ${INSTANCE_DIR}/${userId}/agents/main/agent/auth-profiles.json`,
    ].join(' && ')
  );

  console.log(`[apiKeys] Keys injected securely for user ${userId}`);
}

/**
 * Build the initial openclaw.json config — gateway settings only.
 * API keys are NOT included here; they go only into auth-profiles.json
 * so they are never visible through the OpenClaw Control UI.
 */
export function buildOpenclawConfig(gatewayToken: string): Record<string, any> {
  return {
    gateway: {
      bind: 'lan',
      controlUi: { enabled: true, allowInsecureAuth: true },
      auth: { mode: 'token', token: gatewayToken },
    },
  };
}
