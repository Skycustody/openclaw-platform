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
import { writeContainerConfig as writeConfigAtomic } from './containerConfig';
import db from '../lib/db';

const INSTANCE_DIR = '/opt/openclaw/instances';
const UUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

function validateUserId(userId: string): void {
  if (!UUID_RE.test(userId)) throw new Error('Invalid user ID format');
}

// Proxy URL that containers use to reach the smart router.
// Goes through Nginx/Cloudflare (port 4000 is not directly accessible from workers).
const PROXY_BASE_URL = process.env.API_URL
  ? `${process.env.API_URL}/proxy/v1`
  : 'https://api.valnaa.com/proxy/v1';

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
  validateUserId(userId);
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

  // ── Environment variables ──
  // Inject the OpenRouter key under multiple names so skills that expect
  // OPENAI_API_KEY or GEMINI_API_KEY work automatically through OpenRouter.
  if (!config.env) config.env = {};
  config.env.OPENROUTER_API_KEY = apiKey;
  config.env.OPENAI_API_KEY = apiKey;
  config.env.OPENAI_BASE_URL = 'https://openrouter.ai/api/v1';
  config.env.ANTHROPIC_API_KEY = apiKey;
  config.env.ANTHROPIC_BASE_URL = 'https://openrouter.ai/api/v1';
  if (process.env.BROWSERLESS_TOKEN) {
    config.env.BROWSERLESS_TOKEN = process.env.BROWSERLESS_TOKEN;
  }

  // ── Model provider config ──
  // BYOK users → direct to OpenRouter (no proxy, no router, no compression)
  // Platform users → through the smart routing proxy
  if (usingOwnKey) {
    config.models = {
      providers: {
        openrouter: {
          baseUrl: 'https://openrouter.ai/api/v1',
          apiKey: apiKey,
          api: 'openai-completions',
          models: [
            { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', contextWindow: 200000, maxTokens: 8192 },
            { id: 'anthropic/claude-3.5-haiku', name: 'Claude 3.5 Haiku', contextWindow: 200000, maxTokens: 8192 },
            { id: 'anthropic/claude-opus-4', name: 'Claude Opus 4', contextWindow: 200000, maxTokens: 8192 },

            { id: 'openai/gpt-4o', name: 'GPT-4o', contextWindow: 128000, maxTokens: 4096 },
            { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', contextWindow: 128000, maxTokens: 4096 },
            { id: 'openai/gpt-4.1', name: 'GPT-4.1', contextWindow: 1000000, maxTokens: 32768 },
            { id: 'openai/gpt-4.1-mini', name: 'GPT-4.1 Mini', contextWindow: 1000000, maxTokens: 32768 },
            { id: 'openai/gpt-4.1-nano', name: 'GPT-4.1 Nano', contextWindow: 1000000, maxTokens: 32768 },
            { id: 'openai/o3-mini', name: 'o3-mini', contextWindow: 200000, maxTokens: 65536 },

            { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro', contextWindow: 1000000, maxTokens: 65536 },
            { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash', contextWindow: 1000000, maxTokens: 65536 },
            { id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash', contextWindow: 1000000, maxTokens: 8192 },

            { id: 'deepseek/deepseek-chat-v3-0324', name: 'DeepSeek V3', contextWindow: 128000, maxTokens: 8192 },
            { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1', contextWindow: 128000, maxTokens: 8192 },

            { id: 'meta-llama/llama-4-maverick', name: 'Llama 4 Maverick', contextWindow: 1000000, maxTokens: 32768 },
            { id: 'meta-llama/llama-4-scout', name: 'Llama 4 Scout', contextWindow: 10000000, maxTokens: 32768 },

            { id: 'mistralai/mistral-large-2', name: 'Mistral Large 2', contextWindow: 128000, maxTokens: 4096 },
            { id: 'qwen/qwen-2.5-coder-32b-instruct', name: 'Qwen 2.5 Coder 32B', contextWindow: 32768, maxTokens: 4096 },

            { id: 'x-ai/grok-3-mini-beta', name: 'Grok 3 Mini', contextWindow: 131072, maxTokens: 8192 },
            { id: 'x-ai/grok-3-beta', name: 'Grok 3', contextWindow: 131072, maxTokens: 8192 },
          ],
        },
      },
    };

    if (!config.agents) config.agents = {};
    if (!config.agents.defaults) config.agents.defaults = {};
    config.agents.defaults.model = {
      primary: 'openrouter/anthropic/claude-sonnet-4',
      fallbacks: ['openrouter/openai/gpt-4o', 'openrouter/google/gemini-2.5-flash'],
    };
  } else {
    config.models = {
      providers: {
        platform: {
          baseUrl: PROXY_BASE_URL,
          apiKey: apiKey,
          api: 'openai-completions',
          models: [
            { id: 'auto', name: '⚡ Smart Auto (picks best model per task)', contextWindow: 128000, maxTokens: 4096 },

            { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4 (best for agents & tool use)', contextWindow: 200000, maxTokens: 8192 },
            { id: 'anthropic/claude-3.5-haiku', name: 'Claude 3.5 Haiku (fast & cheap)', contextWindow: 200000, maxTokens: 8192 },
            { id: 'anthropic/claude-opus-4', name: 'Claude Opus 4 (most powerful)', contextWindow: 200000, maxTokens: 8192 },

            { id: 'openai/gpt-4o', name: 'GPT-4o (smart & balanced)', contextWindow: 128000, maxTokens: 4096 },
            { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini (fast & cheap)', contextWindow: 128000, maxTokens: 4096 },
            { id: 'openai/gpt-4.1', name: 'GPT-4.1 (latest, 1M context)', contextWindow: 1000000, maxTokens: 32768 },
            { id: 'openai/gpt-4.1-mini', name: 'GPT-4.1 Mini (latest mini, 1M context)', contextWindow: 1000000, maxTokens: 32768 },
            { id: 'openai/gpt-4.1-nano', name: 'GPT-4.1 Nano (ultra cheap)', contextWindow: 1000000, maxTokens: 32768 },
            { id: 'openai/o3-mini', name: 'o3-mini (reasoning)', contextWindow: 200000, maxTokens: 65536 },

            { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro (strong, 1M context)', contextWindow: 1000000, maxTokens: 65536 },
            { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash (fast & smart)', contextWindow: 1000000, maxTokens: 65536 },
            { id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash (cheapest)', contextWindow: 1000000, maxTokens: 8192 },

            { id: 'deepseek/deepseek-chat-v3-0324', name: 'DeepSeek V3 (strong & very cheap)', contextWindow: 128000, maxTokens: 8192 },
            { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1 (reasoning, cheap)', contextWindow: 128000, maxTokens: 8192 },

            { id: 'meta-llama/llama-4-maverick', name: 'Llama 4 Maverick (open source, strong)', contextWindow: 1000000, maxTokens: 32768 },
            { id: 'meta-llama/llama-4-scout', name: 'Llama 4 Scout (open source, 10M context)', contextWindow: 10000000, maxTokens: 32768 },

            { id: 'mistralai/mistral-large-2', name: 'Mistral Large 2 (strong European model)', contextWindow: 128000, maxTokens: 4096 },
            { id: 'qwen/qwen-2.5-coder-32b-instruct', name: 'Qwen 2.5 Coder 32B (great for coding, free)', contextWindow: 32768, maxTokens: 4096 },

            { id: 'x-ai/grok-3-mini-beta', name: 'Grok 3 Mini (fast reasoning)', contextWindow: 131072, maxTokens: 8192 },
            { id: 'x-ai/grok-3-beta', name: 'Grok 3 (powerful)', contextWindow: 131072, maxTokens: 8192 },
          ],
        },
      },
    };

    if (!config.agents) config.agents = {};
    if (!config.agents.defaults) config.agents.defaults = {};
    config.agents.defaults.model = {
      primary: 'platform/auto',
      fallbacks: ['openrouter/anthropic/claude-sonnet-4', 'openrouter/openai/gpt-4o'],
    };
  }

  // Ensure the main agent always exists in agents.list — the OpenClaw gateway
  // dashboard needs this to show agents and enable the "Start Agent" button.
  if (!Array.isArray(config.agents.list)) config.agents.list = [];

  const dbAgents = await db.getMany<{ name: string; is_primary: boolean; openclaw_agent_id: string | null }>(
    `SELECT name, is_primary, openclaw_agent_id FROM agents WHERE user_id = $1 ORDER BY is_primary DESC, created_at ASC`,
    [userId]
  ).catch(() => []);

  for (const ag of dbAgents) {
    const ocId = ag.is_primary ? 'main' : (ag.openclaw_agent_id || ag.name.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 20));
    const existIdx = config.agents.list.findIndex((a: any) => a.id === ocId);
    const entry = {
      id: ocId,
      ...(ag.is_primary ? { default: true } : {}),
      workspace: ag.is_primary ? '~/.openclaw/workspace' : `~/.openclaw/workspace-${ocId}`,
      agentDir: `~/.openclaw/agents/${ocId}/agent`,
      identity: { name: ag.name },
    };
    if (existIdx >= 0) {
      config.agents.list[existIdx] = { ...config.agents.list[existIdx], ...entry };
    } else {
      config.agents.list.push(entry);
    }
  }

  if (config.agents.list.length === 0) {
    config.agents.list.push({
      id: 'main',
      default: true,
      workspace: '~/.openclaw/workspace',
      agentDir: '~/.openclaw/agents/main/agent',
      identity: { name: 'Main Agent' },
    });
  }

  // ── Tools configuration ──
  // OpenClaw tools schema supports: profile, allow, deny, byProvider, web, exec, loopDetection.
  // profile: "full" = all tools available (browser, exec, read, write, web_search, web_fetch, etc.)
  // See https://docs.openclaw.ai/tools for the full reference.
  if (!config.tools) config.tools = {};
  config.tools.profile = 'full';
  if (!config.tools.web) config.tools.web = {};
  config.tools.web.search = {
    enabled: true,
    provider: 'perplexity',
    perplexity: {
      apiKey: apiKey,
      baseUrl: 'https://openrouter.ai/api/v1',
      model: 'perplexity/sonar-pro',
    },
  };
  config.tools.web.fetch = { enabled: true };

  // Only remove keys that are truly invalid in the tools schema.
  // Valid: profile, allow, deny, byProvider, web, exec, loopDetection, sessions
  const validToolKeys = ['profile', 'allow', 'deny', 'byProvider', 'web', 'exec', 'loopDetection', 'sessions'];
  for (const key of Object.keys(config.tools)) {
    if (!validToolKeys.includes(key)) delete config.tools[key];
  }

  // Remove stale invalid top-level keys from previous versions.
  // Note: `browser` and `bindings` are valid and re-set below — only delete truly invalid ones.
  delete config.personality;

  // ── Per-agent channel bindings ──
  // Merge channel connections from agent_channels table into config
  try {
    const agentChannels = await db.getMany<{
      channel_type: string; token: string | null; config: any;
      agent_name: string; agent_is_primary: boolean; agent_ocid: string | null;
    }>(
      `SELECT ac.channel_type, ac.token, ac.config,
              a.name as agent_name, a.is_primary as agent_is_primary,
              a.openclaw_agent_id as agent_ocid
       FROM agent_channels ac
       JOIN agents a ON a.id = ac.agent_id
       WHERE ac.user_id = $1 AND ac.connected = true
       ORDER BY ac.created_at ASC`,
      [userId]
    );

    if (agentChannels.length > 0) {
      if (!config.channels) config.channels = {};
      if (!config.bindings) config.bindings = [];

      const countByType: Record<string, number> = {};

      for (const ch of agentChannels) {
        countByType[ch.channel_type] = (countByType[ch.channel_type] || 0) + 1;
        const idx = countByType[ch.channel_type];
        const channelKey = idx === 1 ? ch.channel_type : `${ch.channel_type}-${idx}`;
        const agentId = ch.agent_is_primary ? 'main'
          : (ch.agent_ocid || ch.agent_name.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 20));

        if (ch.channel_type === 'telegram' && ch.token) {
          config.channels[channelKey] = {
            enabled: true, botToken: ch.token,
            dmPolicy: 'open', allowFrom: ['*'],
            groups: { '*': { requireMention: true } },
          };
        } else if (ch.channel_type === 'discord' && ch.token) {
          config.channels[channelKey] = {
            enabled: true, token: ch.token,
            dmPolicy: 'open', allowFrom: ['*'],
            ...(ch.config?.guildId ? { guildId: ch.config.guildId } : {}),
          };
        } else if (ch.channel_type === 'slack' && ch.token) {
          config.channels[channelKey] = { enabled: true, token: ch.token };
        } else if (ch.channel_type === 'whatsapp') {
          config.channels[channelKey] = { dmPolicy: 'open', allowFrom: ['*'] };
        }

        config.bindings.push({ channel: channelKey, agentId });
      }
    }
  } catch (err) {
    console.warn(`[apiKeys] Failed to sync agent channels:`, err);
  }

  // ── Per-agent communication permissions ──
  try {
    const comms = await db.getMany<{
      source_ocid: string; target_ocid: string;
    }>(
      `SELECT
         COALESCE(sa.openclaw_agent_id, CASE WHEN sa.is_primary THEN 'main' END) as source_ocid,
         COALESCE(ta.openclaw_agent_id, CASE WHEN ta.is_primary THEN 'main' END) as target_ocid
       FROM agent_communications ac
       JOIN agents sa ON sa.id = ac.source_agent_id
       JOIN agents ta ON ta.id = ac.target_agent_id
       WHERE ac.user_id = $1 AND ac.enabled = true`,
      [userId]
    );

    if (comms.length > 0 && config.agents?.list) {
      const allowMap: Record<string, string[]> = {};
      for (const c of comms) {
        if (c.source_ocid && c.target_ocid) {
          if (!allowMap[c.source_ocid]) allowMap[c.source_ocid] = [];
          if (!allowMap[c.source_ocid].includes(c.target_ocid)) {
            allowMap[c.source_ocid].push(c.target_ocid);
          }
        }
      }

      for (const entry of config.agents.list) {
        const allowed = allowMap[entry.id];
        if (allowed) {
          entry.subagents = { allow: allowed, maxConcurrent: 3 };
        }
      }
    }
  } catch (err) {
    console.warn(`[apiKeys] Failed to sync agent communications:`, err);
  }

  // ── Gateway config ──
  // ALWAYS read token from DB (not from config file — doctor --fix can strip it).
  // Without this, the dashboard shows "pairing required".
  const tokenRow = await db.getOne<{ gateway_token: string }>(
    'SELECT gateway_token FROM users WHERE id = $1',
    [userId]
  );
  const gatewayToken = tokenRow?.gateway_token || config.gateway?.auth?.token;
  if (gatewayToken) {
    config.gateway = {
      mode: 'local',
      bind: 'lan',
      trustedProxies: ['0.0.0.0/0'],
      controlUi: {
        enabled: true,
        allowInsecureAuth: true,
        dangerouslyDisableDeviceAuth: true,
        dangerouslyAllowHostHeaderOriginFallback: true,
      },
      auth: {
        mode: 'token',
        token: gatewayToken,
      },
    };
  }

  // ── Browser: headless Chromium, no sandbox (Docker requires it) ──
  config.browser = {
    enabled: true,
    defaultProfile: 'openclaw',
    headless: true,
    noSandbox: true,
  };

  // ── Skills: enable useful bundled skills by default ──
  if (!config.skills) config.skills = {};
  if (!config.skills.entries) config.skills.entries = {};
  if (!config.skills.load) config.skills.load = {};
  config.skills.load.watch = true;

  await writeConfigAtomic(serverIp, userId, config);

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
      mode: 'local',
      bind: 'lan',
      trustedProxies: ['0.0.0.0/0'],
      controlUi: {
        enabled: true,
        allowInsecureAuth: true,
        dangerouslyDisableDeviceAuth: true,
        dangerouslyAllowHostHeaderOriginFallback: true,
      },
      auth: { mode: 'token', token: gatewayToken },
    },
  };
}
