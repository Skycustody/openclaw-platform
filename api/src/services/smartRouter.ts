import OpenAI from 'openai';
import db from '../lib/db';
import redis from '../lib/redis';
import { TaskClassification, ModelCapability, RoutingDecision, Plan } from '../types';
import { OPENROUTER_MODEL_COSTS, RETAIL_MARKUP } from './nexos';

const openai = new OpenAI({ apiKey: process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY });

/**
 * Model capabilities + OpenRouter wholesale costs (no markup on provider pricing).
 * costPer1MTokens = OpenRouter input cost (same as direct provider).
 * Retail price = costPer1MTokens × RETAIL_MARKUP (1.5×) for 50% margin.
 */
export const MODEL_MAP: Record<string, ModelCapability> = {
  'openai/gpt-4o-mini': {
    name: 'openai/gpt-4o-mini',
    displayName: 'Fast & Cheap',
    internet: false,
    vision: true,
    deepAnalysis: false,
    costPer1MTokens: OPENROUTER_MODEL_COSTS['openai/gpt-4o-mini']?.inputPer1M ?? 0.15,
    maxContext: 128000,
    speed: 'very_fast',
  },
  'google/gemini-2.0-flash-001': {
    name: 'google/gemini-2.0-flash-001',
    displayName: 'Fastest & Cheapest',
    internet: false,
    vision: true,
    deepAnalysis: false,
    costPer1MTokens: OPENROUTER_MODEL_COSTS['google/gemini-2.0-flash-001']?.inputPer1M ?? 0.10,
    maxContext: 1000000,
    speed: 'very_fast',
  },
  'openai/gpt-4.1-mini': {
    name: 'openai/gpt-4.1-mini',
    displayName: 'Fast & Affordable',
    internet: false,
    vision: true,
    deepAnalysis: false,
    costPer1MTokens: OPENROUTER_MODEL_COSTS['openai/gpt-4.1-mini']?.inputPer1M ?? 0.40,
    maxContext: 1000000,
    speed: 'very_fast',
  },
  'anthropic/claude-3.5-haiku': {
    name: 'anthropic/claude-3.5-haiku',
    displayName: 'Fast & Cheap',
    internet: false,
    vision: true,
    deepAnalysis: false,
    costPer1MTokens: OPENROUTER_MODEL_COSTS['anthropic/claude-3.5-haiku']?.inputPer1M ?? 0.80,
    maxContext: 200000,
    speed: 'very_fast',
  },
  'openai/gpt-4o': {
    name: 'openai/gpt-4o',
    displayName: 'Smart & Balanced',
    internet: false,
    vision: true,
    deepAnalysis: true,
    costPer1MTokens: OPENROUTER_MODEL_COSTS['openai/gpt-4o']?.inputPer1M ?? 2.50,
    maxContext: 128000,
    speed: 'fast',
  },
  'openai/gpt-4.1': {
    name: 'openai/gpt-4.1',
    displayName: 'Smart & Balanced',
    internet: false,
    vision: true,
    deepAnalysis: true,
    costPer1MTokens: OPENROUTER_MODEL_COSTS['openai/gpt-4.1']?.inputPer1M ?? 2.00,
    maxContext: 1000000,
    speed: 'fast',
  },
  'anthropic/claude-sonnet-4-20250514': {
    name: 'anthropic/claude-sonnet-4-20250514',
    displayName: 'Powerful',
    internet: true,
    vision: true,
    deepAnalysis: true,
    costPer1MTokens: OPENROUTER_MODEL_COSTS['anthropic/claude-sonnet-4-20250514']?.inputPer1M ?? 3.00,
    maxContext: 200000,
    speed: 'fast',
  },
  'openai/o3-mini': {
    name: 'openai/o3-mini',
    displayName: 'Reasoning',
    internet: false,
    vision: false,
    deepAnalysis: true,
    costPer1MTokens: OPENROUTER_MODEL_COSTS['openai/o3-mini']?.inputPer1M ?? 1.10,
    maxContext: 200000,
    speed: 'fast',
  },
};

/**
 * Retail price per 1M tokens (what we effectively charge users).
 * = OpenRouter wholesale cost × 1.5 (50% profit margin).
 */
export const RETAIL_PRICES: Record<string, number> = Object.fromEntries(
  Object.entries(MODEL_MAP).map(([id, m]) => [id, Math.round(m.costPer1MTokens * RETAIL_MARKUP * 100) / 100])
);

export async function classifyTask(
  message: string,
  hasImage: boolean
): Promise<TaskClassification> {
  // Cache identical classifications for 10 minutes
  const cacheKey = `classify:${Buffer.from(message.slice(0, 200)).toString('base64')}:${hasImage}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: `Classify this task. Return JSON only, no markdown.
Message: "${message.slice(0, 500)}"
Has image: ${hasImage}
Return: {
  "needsInternet": bool,
  "needsVision": bool,
  "needsDeepAnalysis": bool,
  "needsCode": bool,
  "complexity": "simple"|"medium"|"complex",
  "estimatedTokens": number
}`,
        },
      ],
      max_tokens: 120,
      response_format: { type: 'json_object' },
      temperature: 0,
    });

    const classification = JSON.parse(
      res.choices[0].message.content || '{}'
    ) as TaskClassification;

    // Override vision if image is attached
    if (hasImage) classification.needsVision = true;

    await redis.set(cacheKey, JSON.stringify(classification), 'EX', 600);
    return classification;
  } catch (err) {
    console.error('Task classification failed, using defaults:', err);
    return {
      needsInternet: false,
      needsVision: hasImage,
      needsDeepAnalysis: false,
      needsCode: false,
      complexity: 'medium',
      estimatedTokens: 2000,
    };
  }
}

export function selectModel(
  classification: TaskClassification,
  userPlan: Plan,
  manualModel?: string | null
): RoutingDecision {
  // Manual override
  if (manualModel && MODEL_MAP[manualModel]) {
    return {
      model: manualModel,
      reason: 'Manual model selection',
      estimatedCost: MODEL_MAP[manualModel].costPer1MTokens,
      tokensSaved: 0,
    };
  }

  const {
    needsInternet,
    needsVision,
    needsDeepAnalysis,
    needsCode,
    estimatedTokens,
    complexity,
  } = classification;

  let model: string;
  let reason: string;

  // Cost-optimised routing: use the cheapest OpenRouter model that handles the task.
  // This maximises our profit margin (target ≥50%) on API costs.
  if (needsInternet && needsVision) {
    model = 'anthropic/claude-sonnet-4-20250514';
    reason = 'Requires both internet access and vision capability';
  } else if (estimatedTokens > 100000) {
    model = 'openai/gpt-4.1';
    reason = `Large context (${estimatedTokens} est. tokens) - cheapest large-context model`;
  } else if (needsInternet) {
    if (complexity === 'simple') {
      model = 'openai/gpt-4o-mini';
      reason = 'Simple internet task - cheapest capable model';
    } else if (needsDeepAnalysis) {
      model = 'anthropic/claude-sonnet-4-20250514';
      reason = 'Complex internet research requiring deep analysis';
    } else {
      model = 'openai/gpt-4o';
      reason = 'Internet task with moderate complexity';
    }
  } else if (needsVision) {
    if (complexity === 'simple') {
      model = 'google/gemini-2.0-flash-001';
      reason = 'Simple vision task - cheapest model with vision';
    } else {
      model = 'openai/gpt-4o';
      reason = 'Complex vision task';
    }
  } else if (complexity === 'simple') {
    model = 'google/gemini-2.0-flash-001';
    reason = 'Simple text task - cheapest model (Gemini Flash)';
  } else if (needsCode) {
    model = 'anthropic/claude-sonnet-4-20250514';
    reason = 'Code task - best code generation model';
  } else if (needsDeepAnalysis) {
    model = 'openai/o3-mini';
    reason = 'Deep analysis - reasoning model at lower cost than Sonnet';
  } else {
    model = 'openai/gpt-4o-mini';
    reason = 'Balanced fallback - cost-efficient for medium complexity';
  }

  // Calculate savings vs always using the most expensive available model (Sonnet)
  const expensiveCost = MODEL_MAP['anthropic/claude-sonnet-4-20250514']?.costPer1MTokens ?? 3.0;
  const selectedCost = MODEL_MAP[model]?.costPer1MTokens ?? expensiveCost;
  const tokensSaved = Math.round(
    ((expensiveCost - selectedCost) / expensiveCost) * estimatedTokens
  );

  return { model, reason, estimatedCost: selectedCost, tokensSaved };
}

export async function routeAndLog(
  userId: string,
  message: string,
  hasImage: boolean,
  userPlan: Plan,
  brainMode: string,
  manualModel?: string | null
): Promise<RoutingDecision> {
  const classification = await classifyTask(message, hasImage);

  const decision =
    brainMode === 'manual' && manualModel
      ? selectModel(classification, userPlan, manualModel)
      : selectModel(classification, userPlan);

  // Log routing decision
  await db.query(
    `INSERT INTO routing_decisions (user_id, message_preview, classification, model_selected, reason, tokens_saved)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      userId,
      message.slice(0, 200),
      JSON.stringify(classification),
      decision.model,
      decision.reason,
      decision.tokensSaved,
    ]
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
