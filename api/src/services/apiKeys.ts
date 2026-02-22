import crypto from 'crypto';
import { sshExec } from './ssh';
import db from '../lib/db';

const INSTANCE_DIR = '/opt/openclaw/instances';

/**
 * Generate a unique per-user proxy key.
 * Format: val_sk_<32 hex chars> — looks like an API key but only works
 * against the platform proxy. Useless outside the platform.
 */
export function generateProxyKey(): string {
  return 'val_sk_' + crypto.randomBytes(16).toString('hex');
}

/**
 * Ensure a user has a proxy key. Generates one if missing.
 * Returns the proxy key.
 */
export async function ensureProxyKey(userId: string): Promise<string> {
  const row = await db.getOne<{ api_proxy_key: string | null }>(
    'SELECT api_proxy_key FROM users WHERE id = $1',
    [userId]
  );

  if (row?.api_proxy_key) return row.api_proxy_key;

  const key = generateProxyKey();
  await db.query(
    'UPDATE users SET api_proxy_key = $1 WHERE id = $2',
    [key, userId]
  );
  return key;
}

/**
 * Get the proxy base URLs derived from the platform API URL.
 */
function getProxyBaseUrls(): { openai: string; anthropic: string } {
  const apiUrl = (process.env.API_URL || 'https://api.yourdomain.com').replace(/\/$/, '');
  return {
    openai: `${apiUrl}/proxy/openai/v1`,
    anthropic: `${apiUrl}/proxy/anthropic`,
  };
}

/**
 * Inject the user's proxy key into their OpenClaw container.
 *
 * NO real API keys are written anywhere in the container.
 * Instead, the container gets:
 *   - auth-profiles.json with the proxy key (val_sk_xxx)
 *   - openclaw.json with baseURL pointing to the platform proxy
 *
 * When OpenClaw calls OpenAI/Anthropic, it hits our proxy which
 * validates the key and forwards with the real provider key.
 *
 * Idempotent — safe to call multiple times.
 */
export async function injectApiKeys(
  serverIp: string,
  userId: string,
  containerName: string
): Promise<void> {
  const proxyKey = await ensureProxyKey(userId);
  const baseUrls = getProxyBaseUrls();

  // 1. Update openclaw.json with proxy base URLs (no actual keys)
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

  // Remove any real keys that may exist from previous versions
  if (config.models?.providers?.openai?.apiKey) delete config.models.providers.openai.apiKey;
  if (config.models?.providers?.anthropic?.apiKey) delete config.models.providers.anthropic.apiKey;

  // Set proxy base URLs so SDKs call our proxy instead of the real provider
  // OpenClaw expects "baseUrl" (camelCase), NOT "baseURL"
  if (!config.models) config.models = {};
  if (!config.models.providers) config.models.providers = {};
  const defaultOpenaiModels = [
    { name: 'gpt-4o' },
    { name: 'gpt-4o-mini' },
    { name: 'o3-mini' },
  ];
  const defaultAnthropicModels = [
    { name: 'claude-sonnet-4-20250514' },
    { name: 'claude-3-5-haiku-20241022' },
  ];

  config.models.providers.openai = {
    ...(config.models.providers.openai || {}),
    baseUrl: baseUrls.openai,
    models: config.models.providers.openai?.models?.length
      ? config.models.providers.openai.models.map((m: any) => typeof m === 'string' ? { name: m } : m)
      : defaultOpenaiModels,
  };
  delete config.models.providers.openai.baseURL;
  config.models.providers.anthropic = {
    ...(config.models.providers.anthropic || {}),
    baseUrl: baseUrls.anthropic,
    models: config.models.providers.anthropic?.models?.length
      ? config.models.providers.anthropic.models.map((m: any) => typeof m === 'string' ? { name: m } : m)
      : defaultAnthropicModels,
  };
  delete config.models.providers.anthropic.baseURL;

  const configB64 = Buffer.from(JSON.stringify(config, null, 2)).toString('base64');
  await sshExec(
    serverIp,
    `echo '${configB64}' | base64 -d > ${INSTANCE_DIR}/${userId}/openclaw.json`
  );

  // 2. Write auth-profiles.json with the proxy key (not real key)
  const authProfiles: Record<string, any> = {
    'openai:platform': {
      provider: 'openai',
      mode: 'api_key',
      apiKey: proxyKey,
    },
    'anthropic:platform': {
      provider: 'anthropic',
      mode: 'api_key',
      apiKey: proxyKey,
    },
  };

  const authB64 = Buffer.from(JSON.stringify(authProfiles, null, 2)).toString('base64');

  await sshExec(
    serverIp,
    [
      `mkdir -p ${INSTANCE_DIR}/${userId}/agents/main/agent`,
      `echo '${authB64}' | base64 -d > ${INSTANCE_DIR}/${userId}/agents/main/agent/auth-profiles.json`,
      `chmod 600 ${INSTANCE_DIR}/${userId}/agents/main/agent/auth-profiles.json`,
    ].join(' && ')
  );

  console.log(`[apiKeys] Proxy key injected for user ${userId} (key=...${proxyKey.slice(-4)})`);
}

/**
 * Build the initial openclaw.json config — gateway settings only.
 * No API keys are included. Those go through the proxy system.
 */
export function buildOpenclawConfig(gatewayToken: string): Record<string, any> {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    gateway: {
      bind: 'lan',
      controlUi: { enabled: true, ...(isProd ? {} : { allowInsecureAuth: true }) },
      auth: { mode: 'token', token: gatewayToken },
    },
  };
}
