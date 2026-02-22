/**
 * API Key & Config Injection — writes proxy keys and openclaw.json to containers.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ ARCHITECTURE DECISIONS — DO NOT CHANGE WITHOUT UNDERSTANDING           │
 * │                                                                        │
 * │ 1. PROXY KEYS (val_sk_*): Containers NEVER get real OpenAI/Anthropic   │
 * │    keys. They get proxy keys that only work against our /proxy/*       │
 * │    endpoints. The proxy validates the key, deducts tokens, then        │
 * │    forwards with the real provider key. If a container is compromised, │
 * │    the attacker only gets a proxy key scoped to one user.              │
 * │                                                                        │
 * │ 2. MODEL FORMAT: OpenClaw requires models as objects with `id` field:  │
 * │    { id: "gpt-4o", name: "GPT-4o" }. Plain strings crash the gateway. │
 * │    normalizeModel() handles legacy string→object conversion.           │
 * │                                                                        │
 * │ 3. BASE URL CASING: OpenClaw expects `baseUrl` (camelCase), NOT       │
 * │    `baseURL`. The wrong casing silently fails.                         │
 * │                                                                        │
 * │ 4. GATEWAY CONFIG (buildOpenclawConfig):                               │
 * │    - allowInsecureAuth: REQUIRED. TLS terminates at Cloudflare/Traefik │
 * │      so the Traefik→container hop is plain WS. Without this, the      │
 * │      gateway rejects token auth over non-TLS.                          │
 * │    - dangerouslyDisableDeviceAuth: REQUIRED. OpenClaw's device pairing │
 * │      requires browser crypto + operator approval. In a SaaS the       │
 * │      gateway token IS the security — device pairing adds nothing.     │
 * │      See: github.com/openclaw/openclaw/issues/1679                    │
 * │    - trustedProxies: REQUIRED. Without it, the gateway sees Traefik's │
 * │      Docker IP as untrusted and rejects connections.                   │
 * │    DO NOT REMOVE THESE — the dashboard will show "pairing required".  │
 * │                                                                        │
 * │ 5. KEY LOGGING: Only log last 4 chars of proxy keys (key=...xxxx).    │
 * │    Never log full keys or first N chars.                               │
 * └─────────────────────────────────────────────────────────────────────────┘
 */
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
 *
 * Uses OpenClaw's CUSTOM PROVIDER mechanism:
 *   - Built-in "anthropic" provider ignores baseUrl (hardcoded to api.anthropic.com).
 *   - Custom providers with `api: "anthropic-messages"` DO respect baseUrl.
 *   - We register "anthropic-proxy" and "openai-proxy" as custom providers
 *     pointing to the platform proxy, with the per-user proxy key as apiKey.
 *   - The default model is set to "anthropic-proxy/claude-sonnet-4-20250514"
 *     so the gateway routes through our proxy automatically.
 *
 * See: https://docs.openclaw.ai/gateway/configuration-reference#custom-providers-and-base-urls
 *
 * When OpenClaw calls the AI, it hits our proxy which validates the
 * proxy key, deducts tokens, then forwards with the real provider key.
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

  // Remove legacy built-in provider overrides and any real keys
  if (config.models?.providers?.openai) delete config.models.providers.openai;
  if (config.models?.providers?.anthropic) delete config.models.providers.anthropic;

  if (!config.models) config.models = {};
  config.models.mode = 'merge';
  if (!config.models.providers) config.models.providers = {};

  // Custom provider: OpenClaw respects baseUrl on custom providers
  // api: "openai-chat" tells OpenClaw to use OpenAI-compatible request format
  config.models.providers['openai-proxy'] = {
    baseUrl: baseUrls.openai,
    apiKey: proxyKey,
    api: 'openai-chat',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
      { id: 'o3-mini', name: 'O3 Mini' },
    ],
  };

  // Custom provider: api: "anthropic-messages" tells OpenClaw to use Anthropic
  // request format. baseUrl should OMIT /v1 — the client appends it.
  config.models.providers['anthropic-proxy'] = {
    baseUrl: baseUrls.anthropic,
    apiKey: proxyKey,
    api: 'anthropic-messages',
    models: [
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
      { id: 'claude-3-5-haiku-latest', name: 'Claude 3.5 Haiku' },
    ],
  };

  // Set default model to use the custom provider
  if (!config.agents) config.agents = {};
  if (!config.agents.defaults) config.agents.defaults = {};
  config.agents.defaults.model = {
    primary: 'anthropic-proxy/claude-sonnet-4-20250514',
  };

  const configB64 = Buffer.from(JSON.stringify(config, null, 2)).toString('base64');
  await sshExec(
    serverIp,
    `echo '${configB64}' | base64 -d > ${INSTANCE_DIR}/${userId}/openclaw.json`
  );

  // Remove legacy auth-profiles.json — credentials are now in the
  // custom provider config, not in a separate auth profile store.
  await sshExec(
    serverIp,
    [
      `mkdir -p ${INSTANCE_DIR}/${userId}/agents/main/agent`,
      `rm -f ${INSTANCE_DIR}/${userId}/agents/main/agent/auth-profiles.json`,
    ].join(' && ')
  );

  console.log(`[apiKeys] Proxy key injected for user ${userId} (key=...${proxyKey.slice(-4)})`);
}

/**
 * Build the initial openclaw.json config — gateway settings only.
 * No API keys are included. Those go through the proxy system.
 */
export function buildOpenclawConfig(gatewayToken: string): Record<string, any> {
  // In a SaaS deployment behind Traefik/Cloudflare:
  //   - allowInsecureAuth: allows token auth over the non-TLS Traefik→container hop
  //   - dangerouslyDisableDeviceAuth: skips device pairing (the token IS the security)
  //   - trustedProxies: tells the gateway to trust Traefik's Docker network IPs
  return {
    gateway: {
      bind: 'lan',
      trustedProxies: ['172.16.0.0/12', '10.0.0.0/8', '192.168.0.0/16'],
      controlUi: {
        enabled: true,
        allowInsecureAuth: true,
        dangerouslyDisableDeviceAuth: true,
      },
      auth: { mode: 'token', token: gatewayToken },
    },
  };
}
