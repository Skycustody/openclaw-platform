import { sshExec } from './ssh';

const INSTANCE_DIR = '/opt/openclaw/instances';

/**
 * Inject platform API keys into a user's OpenClaw instance on the host volume.
 *
 * Writes to two places that OpenClaw checks:
 *   1. openclaw.json — `models.providers` section (runtime config)
 *   2. agents/main/agent/auth-profiles.json — credential store
 *
 * Also passes keys as env vars via docker update (for processes that read env).
 *
 * This is idempotent — safe to call multiple times.
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

  // 1. Read existing openclaw.json and merge in providers
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

  if (!config.models) config.models = {};
  if (!config.models.providers) config.models.providers = {};

  if (openaiKey) {
    config.models.providers.openai = { apiKey: openaiKey };
  }
  if (anthropicKey) {
    config.models.providers.anthropic = { apiKey: anthropicKey };
  }

  // Write merged config back
  const configB64 = Buffer.from(JSON.stringify(config, null, 2)).toString('base64');
  await sshExec(
    serverIp,
    `echo '${configB64}' | base64 -d > ${INSTANCE_DIR}/${userId}/openclaw.json`
  );

  // 2. Write auth-profiles.json (OpenClaw's credential store)
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

  const authProfilesJson = JSON.stringify(authProfiles, null, 2);
  const authB64 = Buffer.from(authProfilesJson).toString('base64');

  // Create directory structure and write file
  await sshExec(
    serverIp,
    [
      `mkdir -p ${INSTANCE_DIR}/${userId}/agents/main/agent`,
      `echo '${authB64}' | base64 -d > ${INSTANCE_DIR}/${userId}/agents/main/agent/auth-profiles.json`,
    ].join(' && ')
  );

  console.log(`[apiKeys] Keys injected for user ${userId}`);
}

/**
 * Build the initial openclaw.json config with gateway + provider keys.
 */
export function buildOpenclawConfig(gatewayToken: string): Record<string, any> {
  const openaiKey = process.env.OPENAI_API_KEY || '';
  const anthropicKey = process.env.ANTHROPIC_API_KEY || '';

  const config: Record<string, any> = {
    gateway: {
      bind: 'lan',
      controlUi: { enabled: true, allowInsecureAuth: true },
      auth: { mode: 'token', token: gatewayToken },
    },
  };

  const providers: Record<string, any> = {};
  if (openaiKey) providers.openai = { apiKey: openaiKey };
  if (anthropicKey) providers.anthropic = { apiKey: anthropicKey };

  if (Object.keys(providers).length > 0) {
    config.models = { providers };
  }

  return config;
}
