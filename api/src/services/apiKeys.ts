/**
 * API Key & Config Injection — writes OpenRouter API key and openclaw.json to containers.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ ARCHITECTURE — Smart Model Routing via Platform Proxy                  │
 * │                                                                        │
 * │ 1. Each user gets an OpenRouter API key (stored in users.nexos_api_key │
 * │    column). OpenRouter provides access to Claude, GPT, Gemini, etc.   │
 * │    with no markup on provider pricing.                                 │
 * │                                                                        │
 * │ 2. Containers route ALL AI requests through our smart proxy at         │
 * │    https://api.valnaa.com/proxy/v1. The proxy:                        │
 * │    a) Classifies the task using fast heuristics (< 1ms)               │
 * │    b) Picks the cheapest capable model (flash for "hello",            │
 * │       sonnet for "build me an app")                                   │
 * │    c) Forwards to OpenRouter with the selected model                  │
 * │    d) Logs routing decisions for the dashboard                        │
 * │    This cuts API costs by ~60-80% vs always using one model.          │
 * │                                                                        │
 * │ 3. The proxy is configured as a custom OpenAI-compatible provider     │
 * │    named "platform" in openclaw.json. The model "platform/auto"       │
 * │    triggers smart routing. Direct openrouter/ models still work as    │
 * │    fallbacks if the proxy is unreachable.                             │
 * │                                                                        │
 * │ 4. GATEWAY CONFIG (buildOpenclawConfig):                               │
 * │    - allowInsecureAuth: REQUIRED (Traefik→container is plain WS)     │
 * │    - dangerouslyDisableDeviceAuth: REQUIRED (gateway token = auth)    │
 * │    - trustedProxies: REQUIRED (Docker bridge IPs)                     │
 * │    DO NOT REMOVE THESE — the dashboard will show "pairing required". │
 * └─────────────────────────────────────────────────────────────────────────┘
 */
import { sshExec } from './ssh';
import { ensureNexosKey } from './nexos';
import { Plan } from '../types';
import db from '../lib/db';

const INSTANCE_DIR = '/opt/openclaw/instances';

// Containers must reach the proxy without going through Cloudflare/Nginx
// (which returns 502 for server-to-server calls). When CONTROL_PLANE_IP is
// set, containers call the API directly over HTTP on its port.
const PROXY_BASE_URL = (() => {
  if (process.env.CONTROL_PLANE_IP) {
    const port = process.env.PORT || '4000';
    return `http://${process.env.CONTROL_PLANE_IP}:${port}/proxy/v1`;
  }
  if (process.env.API_URL) return `${process.env.API_URL}/proxy/v1`;
  return 'https://api.valnaa.com/proxy/v1';
})();

/**
 * Inject the user's OpenRouter API key into their OpenClaw container and
 * configure smart model routing via the platform proxy.
 *
 * The proxy classifies each request and picks the cheapest capable model:
 *   "hello"        → gemini-flash  ($0.10/1M)
 *   "summarize"    → gpt-4o-mini   ($0.15/1M)
 *   "build an app" → claude-sonnet ($3.00/1M)
 *
 * Idempotent — safe to call multiple times.
 */
export async function injectApiKeys(
  serverIp: string,
  userId: string,
  containerName: string,
  plan: Plan = 'starter'
): Promise<void> {
  const settings = await db.getOne<{ own_openrouter_key: string | null }>(
    'SELECT own_openrouter_key FROM user_settings WHERE user_id = $1',
    [userId]
  );
  const usingOwnKey = !!settings?.own_openrouter_key;
  const apiKey = usingOwnKey ? settings!.own_openrouter_key! : await ensureNexosKey(userId);

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

  // Clean up any stale keys from previous config versions
  if (config.agents?.defaults) {
    delete config.agents.defaults.fallbacks;
  }

  // Set API key in env (used by the proxy for auth + forwarding to OpenRouter)
  if (!config.env) config.env = {};
  config.env.OPENROUTER_API_KEY = apiKey;

  // Configure "platform" as a custom OpenAI-compatible provider pointing to our proxy.
  // The proxy receives requests, classifies complexity, selects the real model,
  // and forwards to OpenRouter. The "auto" model ID is a placeholder — the proxy
  // replaces it with the actual model before forwarding.
  config.models = {
    providers: {
      platform: {
        baseUrl: PROXY_BASE_URL,
        apiKey: apiKey,
        api: 'openai-completions',
        models: [
          { id: 'auto', name: 'Smart Auto (picks best model per task)', contextWindow: 128000, maxTokens: 4096 },
        ],
      },
    },
  };

  if (!config.agents) config.agents = {};
  if (!config.agents.defaults) config.agents.defaults = {};
  config.agents.defaults.model = {
    primary: 'platform/auto',
    fallbacks: ['openrouter/openai/gpt-4o-mini'],
  };

  // Enforce gateway config every time — prevents "pairing required" drift
  const gatewayToken = config.gateway?.auth?.token;
  if (gatewayToken) {
    if (!config.gateway) config.gateway = {};
    config.gateway.bind = 'lan';
    config.gateway.trustedProxies = ['0.0.0.0/0'];
    if (!config.gateway.controlUi) config.gateway.controlUi = {};
    config.gateway.controlUi.enabled = true;
    config.gateway.controlUi.allowInsecureAuth = true;
    config.gateway.controlUi.dangerouslyDisableDeviceAuth = true;
    config.gateway.auth = { mode: 'token', token: gatewayToken };
  }

  const configB64 = Buffer.from(JSON.stringify(config, null, 2)).toString('base64');
  await sshExec(
    serverIp,
    `echo '${configB64}' | base64 -d > ${INSTANCE_DIR}/${userId}/openclaw.json`
  );

  await sshExec(
    serverIp,
    [
      `mkdir -p ${INSTANCE_DIR}/${userId}/agents/main/agent`,
      `rm -f ${INSTANCE_DIR}/${userId}/agents/main/agent/auth-profiles.json`,
    ].join(' && ')
  );

  console.log(`[apiKeys] Smart routing proxy configured for user ${userId} (plan=${plan}, model=platform/auto, byok=${usingOwnKey})`);
}

/**
 * Build the initial openclaw.json config — gateway settings only.
 * API keys are added later via injectApiKeys().
 */
export function buildOpenclawConfig(gatewayToken: string): Record<string, any> {
  return {
    gateway: {
      bind: 'lan',
      trustedProxies: ['0.0.0.0/0'],
      controlUi: {
        enabled: true,
        allowInsecureAuth: true,
        dangerouslyDisableDeviceAuth: true,
      },
      auth: { mode: 'token', token: gatewayToken },
    },
  };
}
