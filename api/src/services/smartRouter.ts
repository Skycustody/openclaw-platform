import db from '../lib/db';
import redis from '../lib/redis';
import { TaskClassification, ModelCapability, RoutingDecision, Plan } from '../types';
import { OPENROUTER_MODEL_COSTS, RETAIL_MARKUP } from './nexos';

const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';
const ROUTER_TIMEOUT_MS = 2000;

const ROUTER_MODELS = [
  'google/gemini-2.5-flash',
  'openai/gpt-4o-mini',
];

const FINAL_FALLBACK_MODEL = 'anthropic/claude-sonnet-4';

/**
 * Model capabilities + OpenRouter wholesale costs (no markup on provider pricing).
 * costPer1MTokens = OpenRouter input cost (same as direct provider).
 * Retail price = costPer1MTokens × RETAIL_MARKUP (1.5×) for 50% margin.
 */
export const MODEL_MAP: Record<string, ModelCapability> = {
  // ── Ultra cheap (< $0.20/1M) ──
  'qwen/qwen-2.5-coder-32b-instruct': {
    name: 'qwen/qwen-2.5-coder-32b-instruct',
    displayName: 'Qwen 2.5 Coder',
    internet: false, vision: false, deepAnalysis: false,
    costPer1MTokens: OPENROUTER_MODEL_COSTS['qwen/qwen-2.5-coder-32b-instruct']?.inputPer1M ?? 0.06,
    maxContext: 32768, speed: 'very_fast',
  },
  'meta-llama/llama-4-scout': {
    name: 'meta-llama/llama-4-scout',
    displayName: 'Llama 4 Scout',
    internet: false, vision: true, deepAnalysis: false,
    costPer1MTokens: OPENROUTER_MODEL_COSTS['meta-llama/llama-4-scout']?.inputPer1M ?? 0.08,
    maxContext: 1048576, speed: 'fast',
  },
  'google/gemini-2.0-flash-001': {
    name: 'google/gemini-2.0-flash-001',
    displayName: 'Gemini 2.0 Flash',
    internet: false, vision: true, deepAnalysis: false,
    costPer1MTokens: OPENROUTER_MODEL_COSTS['google/gemini-2.0-flash-001']?.inputPer1M ?? 0.10,
    maxContext: 1048576, speed: 'very_fast',
  },
  'openai/gpt-4.1-nano': {
    name: 'openai/gpt-4.1-nano',
    displayName: 'GPT-4.1 Nano',
    internet: false, vision: true, deepAnalysis: false,
    costPer1MTokens: OPENROUTER_MODEL_COSTS['openai/gpt-4.1-nano']?.inputPer1M ?? 0.10,
    maxContext: 1048576, speed: 'very_fast',
  },
  'openai/gpt-4o-mini': {
    name: 'openai/gpt-4o-mini',
    displayName: 'GPT-4o Mini',
    internet: false, vision: true, deepAnalysis: false,
    costPer1MTokens: OPENROUTER_MODEL_COSTS['openai/gpt-4o-mini']?.inputPer1M ?? 0.15,
    maxContext: 128000, speed: 'very_fast',
  },
  'meta-llama/llama-4-maverick': {
    name: 'meta-llama/llama-4-maverick',
    displayName: 'Llama 4 Maverick',
    internet: false, vision: true, deepAnalysis: true,
    costPer1MTokens: OPENROUTER_MODEL_COSTS['meta-llama/llama-4-maverick']?.inputPer1M ?? 0.15,
    maxContext: 1048576, speed: 'fast',
  },

  // ── Cheap ($0.20 – $0.50/1M) ──
  'deepseek/deepseek-chat-v3-0324': {
    name: 'deepseek/deepseek-chat-v3-0324',
    displayName: 'DeepSeek V3',
    internet: false, vision: false, deepAnalysis: true,
    costPer1MTokens: OPENROUTER_MODEL_COSTS['deepseek/deepseek-chat-v3-0324']?.inputPer1M ?? 0.19,
    maxContext: 163840, speed: 'fast',
  },
  'google/gemini-2.5-flash': {
    name: 'google/gemini-2.5-flash',
    displayName: 'Gemini 2.5 Flash',
    internet: false, vision: true, deepAnalysis: true,
    costPer1MTokens: OPENROUTER_MODEL_COSTS['google/gemini-2.5-flash']?.inputPer1M ?? 0.30,
    maxContext: 1048576, speed: 'very_fast',
  },
  'x-ai/grok-3-mini-beta': {
    name: 'x-ai/grok-3-mini-beta',
    displayName: 'Grok 3 Mini',
    internet: false, vision: false, deepAnalysis: true,
    costPer1MTokens: OPENROUTER_MODEL_COSTS['x-ai/grok-3-mini-beta']?.inputPer1M ?? 0.30,
    maxContext: 131072, speed: 'fast',
  },
  'openai/gpt-4.1-mini': {
    name: 'openai/gpt-4.1-mini',
    displayName: 'GPT-4.1 Mini',
    internet: false, vision: true, deepAnalysis: false,
    costPer1MTokens: OPENROUTER_MODEL_COSTS['openai/gpt-4.1-mini']?.inputPer1M ?? 0.40,
    maxContext: 1048576, speed: 'very_fast',
  },

  // ── Mid-range ($0.50 – $2.00/1M) ──
  'deepseek/deepseek-r1': {
    name: 'deepseek/deepseek-r1',
    displayName: 'DeepSeek R1',
    internet: false, vision: false, deepAnalysis: true,
    costPer1MTokens: OPENROUTER_MODEL_COSTS['deepseek/deepseek-r1']?.inputPer1M ?? 0.70,
    maxContext: 64000, speed: 'fast',
  },
  'anthropic/claude-3.5-haiku': {
    name: 'anthropic/claude-3.5-haiku',
    displayName: 'Claude 3.5 Haiku',
    internet: false, vision: true, deepAnalysis: false,
    costPer1MTokens: OPENROUTER_MODEL_COSTS['anthropic/claude-3.5-haiku']?.inputPer1M ?? 1.00,
    maxContext: 200000, speed: 'very_fast',
  },
  'openai/o3-mini': {
    name: 'openai/o3-mini',
    displayName: 'o3-mini',
    internet: false, vision: false, deepAnalysis: true,
    costPer1MTokens: OPENROUTER_MODEL_COSTS['openai/o3-mini']?.inputPer1M ?? 1.10,
    maxContext: 200000, speed: 'fast',
  },
  'google/gemini-2.5-pro': {
    name: 'google/gemini-2.5-pro',
    displayName: 'Gemini 2.5 Pro',
    internet: false, vision: true, deepAnalysis: true,
    costPer1MTokens: OPENROUTER_MODEL_COSTS['google/gemini-2.5-pro']?.inputPer1M ?? 1.25,
    maxContext: 1048576, speed: 'fast',
  },

  // ── Premium ($2.00+/1M) ──
  'openai/gpt-4.1': {
    name: 'openai/gpt-4.1',
    displayName: 'GPT-4.1',
    internet: false, vision: true, deepAnalysis: true,
    costPer1MTokens: OPENROUTER_MODEL_COSTS['openai/gpt-4.1']?.inputPer1M ?? 2.00,
    maxContext: 1048576, speed: 'fast',
  },
  'openai/gpt-4o': {
    name: 'openai/gpt-4o',
    displayName: 'GPT-4o',
    internet: false, vision: true, deepAnalysis: true,
    costPer1MTokens: OPENROUTER_MODEL_COSTS['openai/gpt-4o']?.inputPer1M ?? 2.50,
    maxContext: 128000, speed: 'fast',
  },
  'anthropic/claude-sonnet-4': {
    name: 'anthropic/claude-sonnet-4',
    displayName: 'Claude Sonnet 4',
    internet: true, vision: true, deepAnalysis: true,
    costPer1MTokens: OPENROUTER_MODEL_COSTS['anthropic/claude-sonnet-4']?.inputPer1M ?? 3.00,
    maxContext: 200000, speed: 'fast',
  },
  'x-ai/grok-3-beta': {
    name: 'x-ai/grok-3-beta',
    displayName: 'Grok 3',
    internet: false, vision: false, deepAnalysis: true,
    costPer1MTokens: OPENROUTER_MODEL_COSTS['x-ai/grok-3-beta']?.inputPer1M ?? 3.00,
    maxContext: 131072, speed: 'fast',
  },
  'mistralai/mistral-large-2': {
    name: 'mistralai/mistral-large-2',
    displayName: 'Mistral Large 2',
    internet: false, vision: true, deepAnalysis: true,
    costPer1MTokens: OPENROUTER_MODEL_COSTS['mistralai/mistral-large-2']?.inputPer1M ?? 3.00,
    maxContext: 128000, speed: 'fast',
  },
  'anthropic/claude-opus-4': {
    name: 'anthropic/claude-opus-4',
    displayName: 'Claude Opus 4',
    internet: true, vision: true, deepAnalysis: true,
    costPer1MTokens: OPENROUTER_MODEL_COSTS['anthropic/claude-opus-4']?.inputPer1M ?? 15.00,
    maxContext: 200000, speed: 'slower',
  },
};

const DEFAULT_COST_PER_1M = 1.00;

function buildModelCatalog(): string {
  return Object.entries(MODEL_MAP)
    .sort((a, b) => a[1].costPer1MTokens - b[1].costPer1MTokens)
    .map(([id, m]) => {
      const caps: string[] = [];
      if (m.vision) caps.push('vision');
      if (m.deepAnalysis) caps.push('deep-analysis');
      if (m.internet) caps.push('internet');
      return `${id} | $${m.costPer1MTokens}/1M | ${m.displayName} | ${caps.join(', ') || 'basic'} | ${Math.round(m.maxContext / 1000)}k ctx`;
    })
    .join('\n');
}

const MODEL_CATALOG = buildModelCatalog();
const VALID_MODEL_IDS = new Set(Object.keys(MODEL_MAP));

export interface TaskCategory {
  key: string;
  label: string;
  description: string;
  defaultModel: string;
  ruleNumber: number;
}

export const TASK_CATEGORIES: TaskCategory[] = [
  { key: 'greeting',       label: 'Simple Q&A',            description: 'Greetings, thanks, basic questions, translations, short answers',                  defaultModel: 'openai/gpt-4.1-nano',              ruleNumber: 1 },
  { key: 'browser',        label: 'Browser Automation',    description: 'Fill forms, visit websites, apply to jobs, sign up, scrape pages, web interaction', defaultModel: 'anthropic/claude-sonnet-4',         ruleNumber: 2 },
  { key: 'coding',         label: 'Coding',                description: 'Coding, debugging, code review, build apps, fix bugs, write scripts',               defaultModel: 'google/gemini-2.5-flash',           ruleNumber: 3 },
  { key: 'math',           label: 'Math & Reasoning',      description: 'Math, logic, proofs, complex reasoning, puzzles',                                  defaultModel: 'deepseek/deepseek-r1',              ruleNumber: 4 },
  { key: 'research',       label: 'Research & Summarize',  description: 'Research, summarize, analyze documents, compare options',                           defaultModel: 'google/gemini-2.5-flash',           ruleNumber: 5 },
  { key: 'creative',       label: 'Creative Writing',      description: 'Creative writing, stories, essays',                                                defaultModel: 'openai/gpt-4o',                     ruleNumber: 6 },
  { key: 'vision',         label: 'Image & Vision',        description: 'Image/vision analysis',                                                            defaultModel: 'google/gemini-2.5-flash',           ruleNumber: 7 },
  { key: 'large_context',  label: 'Large Documents',       description: 'Very large documents (>50K tokens)',                                               defaultModel: 'google/gemini-2.5-pro',             ruleNumber: 8 },
  { key: 'general',        label: 'General Tasks',         description: 'General medium-complexity tasks',                                                  defaultModel: 'google/gemini-2.5-flash',           ruleNumber: 9 },
  { key: 'shell',          label: 'Shell & Sysadmin',      description: 'Shell commands, install software, system administration',                           defaultModel: 'google/gemini-2.5-flash',           ruleNumber: 10 },
  { key: 'messaging',      label: 'Messaging & Files',     description: 'Send messages, schedule tasks, manage files',                                      defaultModel: 'openai/gpt-4o-mini',                ruleNumber: 11 },
  { key: 'complex',        label: 'Extremely Complex',     description: 'Extremely complex multi-hour analysis tasks',                                      defaultModel: 'anthropic/claude-opus-4',           ruleNumber: 12 },
];

const VALID_CATEGORY_KEYS = new Set(TASK_CATEGORIES.map(c => c.key));

const BASE_ROUTER_SYSTEM_PROMPT = `You are a cost-optimizing model router for an AI agent platform. The agent has tools: browser, exec, web_search, web_fetch, file read/write, memory, cron, messaging.

Your job: pick the CHEAPEST model that can handle the user's CURRENT message well.

AVAILABLE MODELS (sorted cheapest first):
${MODEL_CATALOG}

ROUTING RULES:
1. Simple greetings, thanks, "hi", "hello", "yes", "no", basic Q&A, short factual answers, status checks, confirmations → openai/gpt-4.1-nano ($0.10)
2. Browser automation requiring multi-step tool orchestration (fill forms, apply to jobs, navigate complex workflows) → anthropic/claude-sonnet-4 ($3.00)
3. Complex coding: build full apps, architect systems, debug complex issues → anthropic/claude-sonnet-4 ($3.00). Simple code questions, short scripts, config edits → google/gemini-2.5-flash ($0.30)
4. Math, logic, proofs, complex reasoning → deepseek/deepseek-r1 ($0.70)
5. Research, summarize, analyze documents → google/gemini-2.5-flash ($0.30)
6. Creative writing → openai/gpt-4o ($2.50)
7. Image/vision → google/gemini-2.5-flash ($0.30)
8. Very large documents (>50K tokens) → google/gemini-2.5-pro ($1.25)
9. General medium tasks, explanations, planning → google/gemini-2.5-flash ($0.30)
10. Shell commands, install software, file operations → google/gemini-2.5-flash ($0.30)
11. Send messages, manage files, schedule tasks → openai/gpt-4o-mini ($0.15)
12. Only use anthropic/claude-opus-4 ($15.00) for extremely complex multi-hour tasks — almost never

CONTINUATION MESSAGES:
If the user's message is a short continuation like "continue", "do it", "go ahead", "next", "fix that", "try again", "apply to the next one" — look at what the agent was LAST DOING (provided in context) to decide the model:
- If the agent was browsing/automating → anthropic/claude-sonnet-4
- If the agent was coding something complex → anthropic/claude-sonnet-4
- If the agent was doing research/summarizing → google/gemini-2.5-flash
- If the agent was doing simple tasks → keep it cheap

COST RULES:
- Don't lock to an expensive model just because tools were used before. Route based on what the current message ACTUALLY NEEDS.
- A user saying "thanks" or "ok cool" after a coding session gets gpt-4.1-nano — they're not asking for more code.
- anthropic/claude-sonnet-4 is ONLY for tasks that genuinely need strong multi-step tool orchestration or complex code generation.
- When in doubt between two models, pick the cheaper one.
- You must return EXACTLY one of the model IDs listed above.

Return JSON: {"model":"<exact_model_id_from_list>","reason":"<why in max 10 words>"}`;

function buildRouterPrompt(
  userPreferences?: Record<string, string>,
  installedSkills?: string[],
): string {
  const parts = [BASE_ROUTER_SYSTEM_PROMPT];

  if (userPreferences && Object.keys(userPreferences).length > 0) {
    const overrideLines: string[] = [];
    for (const cat of TASK_CATEGORIES) {
      const override = userPreferences[cat.key];
      if (override && VALID_MODEL_IDS.has(override)) {
        overrideLines.push(`- ${cat.description} → ${override} (USER OVERRIDE — always use this model for this task type)`);
      }
    }
    if (overrideLines.length > 0) {
      parts.push(`\nUSER MODEL PREFERENCES (these override the defaults above):\n${overrideLines.join('\n')}`);
    }
  }

  if (installedSkills && installedSkills.length > 0) {
    const skillList = installedSkills.slice(0, 30).join(', ');
    const browserSkills = installedSkills.filter(s =>
      /browser|scraper?|firecrawl|autofillin|job-auto/i.test(s)
    );
    const hints: string[] = [`Agent has these skills installed: ${skillList}.`];
    if (browserSkills.length > 0) {
      hints.push(`Skills [${browserSkills.join(', ')}] require strong tool orchestration (prefer claude-sonnet-4 or equivalent).`);
    }
    parts.push(`\nINSTALLED SKILLS:\n${hints.join('\n')}`);
  }

  return parts.join('');
}

export { VALID_CATEGORY_KEYS };

const GREETING_RE = /^(hi|hey|hello|yo|sup|thanks|thank you|thx|ok|okay|cool|nice|great|got it|sure|yes|no|yep|nope|bye|goodbye|good morning|good evening|good night|gm|gn|how are you|what's up|whats up)[.!?\s]*$/i;
const CONTINUATION_RE = /^(continue|go ahead|do it|next|go on|keep going|proceed|try again|retry|fix that|fix it|apply|yes do it|ok do it|start|run it|do that)[.!?\s]*$/i;

/**
 * Fast local classifier for obvious messages — returns a model instantly
 * without calling the AI router. Returns null if the message is ambiguous
 * and needs AI routing.
 */
function quickClassify(
  message: string,
  hasImage: boolean,
  hasToolHistory: boolean,
  ctx?: RouterContext,
): { model: string; reason: string } | null {
  const trimmed = message.trim();
  const lower = trimmed.toLowerCase();

  if (hasImage) {
    return { model: 'google/gemini-2.5-flash', reason: 'Image attached — fast vision model' };
  }

  if (trimmed.length <= 30 && GREETING_RE.test(trimmed)) {
    return { model: 'openai/gpt-4.1-nano', reason: 'Simple greeting/acknowledgment' };
  }

  if (trimmed.length <= 40 && CONTINUATION_RE.test(trimmed)) {
    if (ctx?.taskSummary?.includes('browser')) {
      return { model: 'anthropic/claude-sonnet-4', reason: 'Continue browser automation' };
    }
    if (ctx?.taskSummary?.includes('coding')) {
      return { model: 'anthropic/claude-sonnet-4', reason: 'Continue coding task' };
    }
    return { model: 'google/gemini-2.5-flash', reason: 'Continue previous task' };
  }

  if (trimmed.length < 60 && !hasToolHistory) {
    if (/^(what('?s| is) (the )?(time|date|weather)|translate |define |how do you say )/i.test(lower)) {
      return { model: 'openai/gpt-4.1-nano', reason: 'Simple factual question' };
    }
  }

  return null;
}

export interface RouterContext {
  messageCount: number;
  toolCallCount: number;
  lastAssistantSnippet?: string;
  recentToolNames?: string[];
  previousUserMessage?: string;
  taskSummary?: string;
}

/**
 * AI-powered model router with cascading fallback.
 * Uses the user's own API key for routing. Falls back to OPENROUTER_API_KEY
 * (shared platform key) if no user key is provided. Never uses the management
 * key (OPENROUTER_MGMT_KEY) — that key can create/delete keys and must never
 * be sent to chat endpoints.
 *
 *   1. Gemini 2.5 Flash ($0.30/1M) — primary router, fast + smart
 *   2. GPT-4o-mini ($0.15/1M) — backup if Gemini fails
 *   3. Claude Sonnet 4 direct — if both routers fail, safe default
 *
 * Always returns a result — never returns null.
 */
export async function pickModelWithAI(
  userMessage: string,
  hasImage: boolean,
  hasToolHistory: boolean,
  ctx?: RouterContext,
  apiKey?: string,
  userPreferences?: Record<string, string>,
  installedSkills?: string[],
  userId?: string,
): Promise<{ model: string; reason: string; routerUsed: string }> {
  // Fast path: obvious messages handled locally without any AI call
  const quick = quickClassify(userMessage, hasImage, hasToolHistory, ctx);
  if (quick) {
    // Respect user preference overrides for the category
    if (userPreferences) {
      const catKey = quick.model.includes('nano') ? 'greeting'
        : quick.model.includes('sonnet') && quick.reason.includes('browser') ? 'browser'
        : quick.model.includes('sonnet') ? 'coding'
        : hasImage ? 'vision' : 'general';
      const override = userPreferences[catKey];
      if (override && VALID_MODEL_IDS.has(override)) {
        return { model: override, reason: `${quick.reason} (user override)`, routerUsed: 'heuristic' };
      }
    }
    return { ...quick, routerUsed: 'heuristic' };
  }

  const key = apiKey || process.env.OPENROUTER_API_KEY || '';
  if (!key) {
    return { model: FINAL_FALLBACK_MODEL, reason: 'No API key available for router', routerUsed: 'fallback' };
  }

  const depth = ctx?.messageCount ?? 0;
  const toolCalls = ctx?.toolCallCount ?? 0;

  const prefHash = userPreferences ? Buffer.from(JSON.stringify(userPreferences)).toString('base64').slice(0, 20) : '';
  const skillHash = installedSkills?.length ? Buffer.from(installedSkills.sort().join(',')).toString('base64').slice(0, 20) : '';
  const userKey = userId ? userId.slice(0, 12) : 'anon';
  const msgKey = userMessage.slice(0, 200);
  const cacheKey = `aiRoute7:${userKey}:${Buffer.from(msgKey).toString('base64')}:${hasImage}:${hasToolHistory}:${depth}:${toolCalls}:${prefHash}:${skillHash}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch { /* cache miss */ }

  const systemPrompt = buildRouterPrompt(userPreferences, installedSkills);

  const contextLines: string[] = [];
  if (hasImage) contextLines.push('Image attached: yes');
  contextLines.push(`User message: "${userMessage.slice(0, 600)}"`);
  if (ctx?.previousUserMessage) contextLines.push(`Previous user request: "${ctx.previousUserMessage}"`);
  if (ctx?.lastAssistantSnippet) contextLines.push(`Agent's last response: "${ctx.lastAssistantSnippet}"`);
  if (ctx?.recentToolNames && ctx.recentToolNames.length > 0) contextLines.push(`Tools agent recently used: ${ctx.recentToolNames.join(', ')}`);
  if (ctx?.taskSummary) contextLines.push(`Recent task type: ${ctx.taskSummary}`);
  if (depth > 0) contextLines.push(`Conversation depth: ${depth} messages`);
  const userContent = contextLines.join('\n');

  const cacheTTL = 600;

  for (const routerModel of ROUTER_MODELS) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), ROUTER_TIMEOUT_MS);

      const res = await fetch(OPENROUTER_CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`,
          'HTTP-Referer': 'https://valnaa.com',
          'X-Title': 'OpenClaw Router',
        },
        body: JSON.stringify({
          model: routerModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent },
          ],
          max_tokens: 80,
          temperature: 0,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.warn(`[router] ${routerModel} failed: ${res.status} ${errText.slice(0, 100)}`);
        continue;
      }

      const data: any = await res.json();
      const content = data?.choices?.[0]?.message?.content?.trim();
      if (!content) continue;

      const parsed = parseRouterResponse(content);
      if (!parsed) continue;

      const result = { ...parsed, routerUsed: routerModel };
      await redis.set(cacheKey, JSON.stringify(result), 'EX', cacheTTL).catch(() => {});
      console.log(`[router] ${routerModel} picked ${result.model} — ${result.reason} (depth=${depth}, tools=${toolCalls})`);
      return result;
    } catch (err: any) {
      const msg = err?.name === 'AbortError' ? 'timeout' : (err?.message || 'unknown');
      console.warn(`[router] ${routerModel} failed: ${msg}`);
    }
  }

  const fallback = {
    model: FINAL_FALLBACK_MODEL,
    reason: 'All routers failed — using safe default (Claude Sonnet)',
    routerUsed: 'fallback',
  };
  console.warn(`[router] All AI routers failed, falling back to ${FINAL_FALLBACK_MODEL}`);
  return fallback;
}

// ── Skills cache (written by skills routes, read by proxy at routing time) ──

const SKILLS_CACHE_TTL = 3600; // 1 hour

export async function cacheUserSkills(userId: string, enabledSkillIds: string[]): Promise<void> {
  const key = `userSkills:${userId}`;
  try {
    await redis.set(key, JSON.stringify(enabledSkillIds), 'EX', SKILLS_CACHE_TTL);
  } catch { /* non-critical */ }
}

export async function getCachedUserSkills(userId: string): Promise<string[]> {
  try {
    const raw = await redis.get(`userSkills:${userId}`);
    if (raw) return JSON.parse(raw);
  } catch { /* cache miss */ }
  return [];
}

function parseRouterResponse(content: string): { model: string; reason: string } | null {
  try {
    const parsed = JSON.parse(content);
    if (parsed.model && typeof parsed.model === 'string') {
      const model = parsed.model.trim();
      if (VALID_MODEL_IDS.has(model)) {
        return { model, reason: parsed.reason || 'AI router selection' };
      }
      console.warn(`[router] AI returned unknown model "${model}", rejecting`);
    }
  } catch { /* not valid JSON */ }

  const match = content.match(/([a-z][a-z0-9-]*\/[a-z0-9._-]+)/i);
  if (match && VALID_MODEL_IDS.has(match[1])) {
    return { model: match[1], reason: 'AI router selection' };
  }

  return null;
}

/**
 * Retail price per 1M tokens (what we effectively charge users).
 * = OpenRouter wholesale cost × 1.5 (50% profit margin).
 */
export const RETAIL_PRICES: Record<string, number> = Object.fromEntries(
  Object.entries(MODEL_MAP).map(([id, m]) => [id, Math.round(m.costPer1MTokens * RETAIL_MARKUP * 100) / 100])
);

export function selectModel(
  classification: TaskClassification,
  userPlan: Plan,
  manualModel?: string | null
): RoutingDecision {
  if (manualModel) {
    const cost = MODEL_MAP[manualModel]?.costPer1MTokens ?? DEFAULT_COST_PER_1M;
    return {
      model: manualModel,
      reason: 'Manual model selection',
      estimatedCost: cost,
      tokensSaved: 0,
    };
  }

  const {
    needsInternet,
    needsVision,
    needsDeepAnalysis,
    needsCode,
    needsAgentic,
    estimatedTokens,
    complexity,
  } = classification;

  let model: string;
  let reason: string;

  // Cost-optimised routing: use the cheapest OpenRouter model that handles the task.
  // This maximises our profit margin (target ≥50%) on API costs.
  //
  // Agentic tasks (browser, forms, automation, multi-step actions) need strong
  // tool-calling models — cheap models fail at multi-step tool orchestration.
  if (needsAgentic && complexity !== 'simple') {
    model = 'anthropic/claude-sonnet-4';
    reason = 'Complex agentic task - requires strong tool-calling model';
  } else if (needsAgentic) {
    model = 'google/gemini-2.5-flash';
    reason = 'Simple agentic task - fast and capable';
  } else if (needsInternet && needsVision) {
    model = 'anthropic/claude-sonnet-4';
    reason = 'Requires both internet access and vision capability';
  } else if (estimatedTokens > 100000) {
    model = 'openai/gpt-4.1';
    reason = `Large context (${estimatedTokens} est. tokens) - cheapest large-context model`;
  } else if (needsInternet) {
    if (complexity === 'simple') {
      model = 'openai/gpt-4o-mini';
      reason = 'Simple internet task - cheapest capable model';
    } else if (needsDeepAnalysis) {
      model = 'anthropic/claude-sonnet-4';
      reason = 'Complex internet research requiring deep analysis';
    } else {
      model = 'openai/gpt-4o';
      reason = 'Internet task with moderate complexity';
    }
  } else if (needsVision) {
    if (complexity === 'simple') {
      model = 'google/gemini-2.5-flash';
      reason = 'Simple vision task - cheapest capable vision model';
    } else {
      model = 'openai/gpt-4o';
      reason = 'Complex vision task';
    }
  } else if (complexity === 'simple') {
    model = 'openai/gpt-4.1-nano';
    reason = 'Simple text task - cheapest model';
  } else if (needsCode) {
    model = 'anthropic/claude-sonnet-4';
    reason = 'Code task - best code generation model';
  } else if (needsDeepAnalysis) {
    model = 'openai/o3-mini';
    reason = 'Deep analysis - reasoning model at lower cost than Sonnet';
  } else {
    model = 'openai/gpt-4o-mini';
    reason = 'Balanced fallback - cost-efficient for medium complexity';
  }

  const expensiveCost = MODEL_MAP['anthropic/claude-sonnet-4']?.costPer1MTokens ?? 3.0;
  const selectedCost = MODEL_MAP[model]?.costPer1MTokens ?? DEFAULT_COST_PER_1M;
  const tokensSaved = Math.round(
    ((expensiveCost - selectedCost) / expensiveCost) * estimatedTokens
  );

  return { model, reason, estimatedCost: selectedCost, tokensSaved };
}

export async function routeAndLog(
  userId: string,
  message: string,
  hasImage: boolean,
  _userPlan: Plan,
  brainMode: string,
  manualModel?: string | null
): Promise<RoutingDecision> {
  if (brainMode === 'manual' && manualModel) {
    const cost = MODEL_MAP[manualModel]?.costPer1MTokens ?? DEFAULT_COST_PER_1M;
    const decision: RoutingDecision = { model: manualModel, reason: 'Manual override', estimatedCost: cost, tokensSaved: 0 };
    await db.query(
      `INSERT INTO routing_decisions (user_id, message_preview, classification, model_selected, reason, tokens_saved)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, message.slice(0, 200), '{"method":"manual"}', decision.model, decision.reason, 0]
    );
    return decision;
  }

  const aiPick = await pickModelWithAI(message, hasImage, false);
  const cost = MODEL_MAP[aiPick.model]?.costPer1MTokens ?? DEFAULT_COST_PER_1M;
  const decision: RoutingDecision = { model: aiPick.model, reason: aiPick.reason, estimatedCost: cost, tokensSaved: 0 };
  await db.query(
    `INSERT INTO routing_decisions (user_id, message_preview, classification, model_selected, reason, tokens_saved)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, message.slice(0, 200), JSON.stringify({ method: 'ai', routerUsed: aiPick.routerUsed }), decision.model, decision.reason, 0]
  );
  return decision;
}

export async function getRoutingHistory(
  userId: string,
  limit = 20
): Promise<any[]> {
  return db.getMany(
    `SELECT * FROM routing_decisions WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [userId, limit]
  );
}

export async function getTokensSavedThisMonth(userId: string): Promise<number> {
  const result = await db.getOne<{ total: string }>(
    `SELECT COALESCE(SUM(tokens_saved), 0) as total
     FROM routing_decisions
     WHERE user_id = $1 AND created_at > DATE_TRUNC('month', NOW())`,
    [userId]
  );
  return parseInt(result?.total || '0');
}
