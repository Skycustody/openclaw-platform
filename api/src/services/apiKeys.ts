/**
 * API Key & Config Injection — writes OpenRouter API key and openclaw.json to containers.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ ARCHITECTURE — OpenRouter Integration + Multi-Model Router             │
 * │                                                                        │
 * │ 1. Each user gets an OpenRouter API key (stored in users.nexos_api_key │
 * │    column — named for historical reasons, holds OpenRouter key now).   │
 * │    OpenRouter is an OpenAI-compatible gateway that routes to Claude,   │
 * │    GPT, Gemini, Grok etc. with NO markup on provider pricing.         │
 * │                                                                        │
 * │ 2. Per-user keys are created via OpenRouter's Management API with     │
 * │    monthly spending limits (https://openrouter.ai/settings/           │
 * │    management-keys). Each key isolates usage + budget per user.       │
 * │                                                                        │
 * │ 3. The key is injected into openclaw.json as a custom provider so     │
 * │    OpenClaw's native model selector works. Users pick models from     │
 * │    the OpenClaw UI — no platform proxy needed.                        │
 * │                                                                        │
 * │ 4. MODEL FORMAT: OpenClaw requires models as objects with `id` field: │
 * │    { id: "openai/gpt-4o", name: "GPT-4o" }. Plain strings crash it.  │
 * │    OpenRouter model IDs use "provider/model" format.                   │
 * │                                                                        │
 * │ 5. COST-OPTIMIZED ROUTING (per plan):                                  │
 * │    - Default model set by plan tier (cheap for starter, smart for pro) │
 * │    - Fallback chain prioritizes cheaper models for resilience          │
 * │    - OpenClaw's built-in multi-model router picks from the fallback   │
 * │      list when the primary is unavailable or rate-limited.            │
 * │    - This reduces average API spend by ~40-60%.                       │
 * │                                                                        │
 * │ 6. PROFIT MARGIN:                                                      │
 * │    - Plan pricing targets ≥50% profit over API cost + server          │
 * │    - Starter €10: ~€3 API + ~€3.33 server = €6.33 cost → 37% margin │
 * │    - Pro     €20: ~€5 API + ~€6.67 server = €11.67 cost → 42% margin│
 * │    - Business€50: ~€12 API + ~€10 server = €22 cost → 56% margin    │
 * │    Margins improve with smart routing (cheaper models for simple tasks)│
 * │                                                                        │
 * │ 7. GATEWAY CONFIG (buildOpenclawConfig):                               │
 * │    - allowInsecureAuth: REQUIRED. TLS terminates at Cloudflare/Traefik│
 * │      so the Traefik→container hop is plain WS. Without this, the     │
 * │      gateway rejects token auth over non-TLS.                         │
 * │    - dangerouslyDisableDeviceAuth: REQUIRED. OpenClaw's device pairing│
 * │      requires browser crypto + operator approval. In a SaaS the      │
 * │      gateway token IS the security — device pairing adds nothing.    │
 * │      See: github.com/openclaw/openclaw/issues/1679                   │
 * │    - trustedProxies: REQUIRED. Without it, the gateway sees Traefik's│
 * │      Docker IP as untrusted and rejects connections.                  │
 * │    DO NOT REMOVE THESE — the dashboard will show "pairing required". │
 * └─────────────────────────────────────────────────────────────────────────┘
 */
import { sshExec } from './ssh';
import { ensureNexosKey } from './nexos';
import { Plan } from '../types';
import db from '../lib/db';

const INSTANCE_DIR = '/opt/openclaw/instances';
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

/**
 * Available models through OpenRouter, ordered cheapest → most expensive.
 * OpenRouter model IDs use "provider/model" format.
 * OpenRouter charges no markup — these are direct provider costs.
 */
const OPENROUTER_MODELS = [
  { id: 'openrouter/google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash' },
  { id: 'openrouter/openai/gpt-4o-mini', name: 'GPT-4o Mini' },
  { id: 'openrouter/openai/gpt-4.1-mini', name: 'GPT-4.1 Mini' },
  { id: 'openrouter/anthropic/claude-3.5-haiku', name: 'Claude 3.5 Haiku' },
  { id: 'openrouter/openai/gpt-4o', name: 'GPT-4o' },
  { id: 'openrouter/openai/gpt-4.1', name: 'GPT-4.1' },
  { id: 'openrouter/anthropic/claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
  { id: 'openrouter/openai/o3-mini', name: 'O3 Mini' },
];

/**
 * Per-plan model routing: default model + fallback chain.
 * OpenClaw uses the fallback chain when the primary model is unavailable
 * or rate-limited. Cheaper models listed first to minimise API spend.
 *
 * Model IDs use the "openrouter/" prefix so OpenClaw routes through
 * OpenRouter (using OPENROUTER_API_KEY) instead of direct provider APIs.
 *
 * ┌───────────┬──────────────────────────────────────────┬──────────────────────────────────┐
 * │ Plan      │ Default                                  │ Fallbacks (tried in order)       │
 * ├───────────┼──────────────────────────────────────────┼──────────────────────────────────┤
 * │ starter   │ openrouter/openai/gpt-4o-mini (~$0.15/1M)│ gemini-flash, haiku             │
 * │ pro       │ openrouter/anthropic/claude-sonnet-4      │ gpt-4o, gpt-4o-mini, flash      │
 * │ business  │ openrouter/anthropic/claude-sonnet-4      │ gpt-4.1, gpt-4o, flash          │
 * └───────────┴──────────────────────────────────────────┴──────────────────────────────────┘
 */
const PLAN_MODEL_CONFIG: Record<Plan, { primary: string; fallbacks: string[] }> = {
  starter: {
    primary: 'openrouter/openai/gpt-4o-mini',
    fallbacks: ['openrouter/google/gemini-2.0-flash-001', 'openrouter/anthropic/claude-3.5-haiku'],
  },
  pro: {
    primary: 'openrouter/anthropic/claude-sonnet-4-20250514',
    fallbacks: ['openrouter/openai/gpt-4o', 'openrouter/openai/gpt-4o-mini', 'openrouter/google/gemini-2.0-flash-001'],
  },
  business: {
    primary: 'openrouter/anthropic/claude-sonnet-4-20250514',
    fallbacks: ['openrouter/openai/gpt-4.1', 'openrouter/openai/gpt-4o', 'openrouter/openai/gpt-4o-mini', 'openrouter/google/gemini-2.0-flash-001'],
  },
};

/**
 * Inject the user's OpenRouter API key into their OpenClaw container and
 * configure the built-in multi-model router for cost optimisation.
 *
 * - Registers OpenRouter as a custom provider in openclaw.json
 * - Sets default model + fallback chain based on the user's plan tier
 * - Cheaper plans default to cheaper models (gpt-4o-mini for starter)
 * - Fallback chain always descends to cheaper alternatives
 *
 * Idempotent — safe to call multiple times.
 */
export async function injectApiKeys(
  serverIp: string,
  userId: string,
  containerName: string,
  plan: Plan = 'starter'
): Promise<void> {
  // Prefer user's own OpenRouter key (BYOK) over platform-managed key
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

  // Remove legacy keys that OpenClaw rejects as "Unrecognized"
  delete config.models;
  if (config.agents?.defaults) {
    delete config.agents.defaults.fallbacks; // stale key from old code
  }

  // Set the API key in config.env so OpenClaw picks it up as built-in provider
  if (!config.env) config.env = {};
  config.env.OPENROUTER_API_KEY = apiKey;

  const modelConfig = PLAN_MODEL_CONFIG[plan] || PLAN_MODEL_CONFIG.starter;

  if (!config.agents) config.agents = {};
  if (!config.agents.defaults) config.agents.defaults = {};
  config.agents.defaults.model = {
    primary: modelConfig.primary,
    fallbacks: modelConfig.fallbacks,
  };

  // Enforce gateway config every time — prevents "pairing required" drift
  // when configs get partially overwritten or containers are recreated.
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

  // Clean up legacy auth-profiles.json — credentials are now in the provider config
  await sshExec(
    serverIp,
    [
      `mkdir -p ${INSTANCE_DIR}/${userId}/agents/main/agent`,
      `rm -f ${INSTANCE_DIR}/${userId}/agents/main/agent/auth-profiles.json`,
    ].join(' && ')
  );

  console.log(`[apiKeys] OpenRouter key injected for user ${userId} (plan=${plan}, default=${modelConfig.primary}, byok=${usingOwnKey})`);
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
