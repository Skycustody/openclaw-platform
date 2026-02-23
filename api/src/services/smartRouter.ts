import OpenAI from 'openai';
import db from '../lib/db';
import redis from '../lib/redis';
import { TaskClassification, ModelCapability, RoutingDecision, Plan } from '../types';
import { OPENROUTER_MODEL_COSTS, RETAIL_MARKUP } from './nexos';

const routerClient = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
  timeout: 3500,
  defaultHeaders: {
    'HTTP-Referer': 'https://valnaa.com',
    'X-Title': 'OpenClaw Router',
  },
});

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

const ROUTER_SYSTEM_PROMPT = `You are a model router for an AI agent platform. The agent has these tools: browser (navigate pages, click, type, fill forms, take screenshots), exec (run shell commands, install software), web_search, web_fetch, file read/write, memory, cron jobs, messaging.

Your job: pick the CHEAPEST model that will handle the user's task well. Cost matters — don't pick expensive models for simple tasks.

AVAILABLE MODELS (sorted cheapest first):
${MODEL_CATALOG}

ROUTING RULES (follow strictly):
1. Simple greetings, thanks, basic Q&A, translations, short factual answers → openai/gpt-4.1-nano ($0.10) or meta-llama/llama-4-scout ($0.08)
2. Browser automation, fill forms, visit websites, apply to jobs, sign up, login, click buttons, scrape pages, download files, any web interaction → anthropic/claude-sonnet-4 ($3.00) — ONLY model reliable at multi-step tool orchestration
3. Coding, debugging, code review, build apps, fix bugs, write scripts → anthropic/claude-sonnet-4 ($3.00)
4. Math, logic, proofs, complex reasoning, puzzles → deepseek/deepseek-r1 ($0.70) or openai/o3-mini ($1.10)
5. Research, summarize, analyze documents, compare options → deepseek/deepseek-chat-v3-0324 ($0.19) or google/gemini-2.5-flash ($0.30)
6. Creative writing, stories, essays → openai/gpt-4o ($2.50) or meta-llama/llama-4-maverick ($0.15)
7. Image/vision analysis → google/gemini-2.5-flash ($0.30) or google/gemini-2.5-pro ($1.25)
8. Very large documents (>50K tokens) → google/gemini-2.5-pro ($1.25) or openai/gpt-4.1 ($2.00)
9. General medium-complexity tasks → google/gemini-2.5-flash ($0.30) or openai/gpt-4o-mini ($0.15)
10. If conversation has active tool calls (agent is mid-task) → KEEP using anthropic/claude-sonnet-4, never downgrade mid-task
11. Shell commands, install software, system administration → anthropic/claude-sonnet-4 ($3.00)
12. Send messages, schedule tasks, manage files → anthropic/claude-sonnet-4 ($3.00)
13. Only use anthropic/claude-opus-4 ($15.00) for extremely complex multi-hour analysis tasks — almost never

IMPORTANT: You must return EXACTLY one of the model IDs listed above. Do not invent model IDs or add suffixes.

Return JSON: {"model":"<exact_model_id_from_list>","reason":"<why in max 10 words>"}`;

export interface RouterContext {
  messageCount: number;
  toolCallCount: number;
  lastAssistantSnippet?: string;
}

/**
 * AI-powered model router with cascading fallback:
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
): Promise<{ model: string; reason: string; routerUsed: string }> {
  const depth = ctx?.messageCount ?? 0;
  const toolCalls = ctx?.toolCallCount ?? 0;

  const msgKey = userMessage.slice(0, 200);
  const cacheKey = `aiRoute3:${Buffer.from(msgKey).toString('base64')}:${hasImage}:${hasToolHistory}:${depth}:${toolCalls}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch { /* cache miss */ }

  const contextLines: string[] = [];
  if (hasImage) contextLines.push('Image attached: yes');
  if (hasToolHistory) contextLines.push('Conversation has active tool calls: yes (agent is mid-task, keep strong model)');
  if (depth > 0) contextLines.push(`Conversation depth: ${depth} messages`);
  if (toolCalls > 0) contextLines.push(`Tool calls so far: ${toolCalls} (complex multi-step task in progress)`);
  if (ctx?.lastAssistantSnippet) contextLines.push(`Last assistant action: "${ctx.lastAssistantSnippet}"`);
  contextLines.push(`User message: "${userMessage.slice(0, 600)}"`);
  const userContent = contextLines.join('\n');

  const cacheTTL = (hasToolHistory || toolCalls > 0) ? 120 : 600;

  for (const routerModel of ROUTER_MODELS) {
    try {
      const res = await routerClient.chat.completions.create({
        model: routerModel,
        messages: [
          { role: 'system', content: ROUTER_SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
        max_tokens: 80,
        temperature: 0,
        response_format: { type: 'json_object' },
      });

      const content = res.choices[0]?.message?.content?.trim();
      if (!content) continue;

      const parsed = parseRouterResponse(content);
      if (!parsed) continue;

      const result = { ...parsed, routerUsed: routerModel };
      await redis.set(cacheKey, JSON.stringify(result), 'EX', cacheTTL).catch(() => {});
      console.log(`[router] ${routerModel} picked ${result.model} — ${result.reason} (depth=${depth}, tools=${toolCalls})`);
      return result;
    } catch (err) {
      console.warn(`[router] ${routerModel} failed:`, (err as Error).message);
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
  if (needsAgentic) {
    model = 'anthropic/claude-sonnet-4';
    reason = 'Agentic task (browser/automation/actions) - requires strong tool-calling model';
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
