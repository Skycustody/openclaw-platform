import OpenAI from 'openai';
import db from '../lib/db';
import redis from '../lib/redis';
import { TaskClassification, ModelCapability, RoutingDecision, Plan } from '../types';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Cost per 1M tokens (input) — used for savings calculations
export const MODEL_MAP: Record<string, ModelCapability> = {
  'gpt-4o-mini': {
    name: 'gpt-4o-mini',
    displayName: 'Fast & Cheap',
    internet: false,
    vision: true,
    deepAnalysis: false,
    costPer1MTokens: 0.15,
    maxContext: 128000,
    speed: 'very_fast',
  },
  'gpt-4o-mini-search-preview': {
    name: 'gpt-4o-mini-search-preview',
    displayName: 'Fast & Cheap (Web)',
    internet: true,
    vision: false,
    deepAnalysis: false,
    costPer1MTokens: 0.30,
    maxContext: 128000,
    speed: 'fast',
  },
  'gpt-4o': {
    name: 'gpt-4o',
    displayName: 'Smart & Balanced',
    internet: false,
    vision: true,
    deepAnalysis: true,
    costPer1MTokens: 5.00,
    maxContext: 128000,
    speed: 'fast',
  },
  'gpt-4o-search-preview': {
    name: 'gpt-4o-search-preview',
    displayName: 'Smart & Balanced (Web)',
    internet: true,
    vision: false,
    deepAnalysis: true,
    costPer1MTokens: 5.50,
    maxContext: 128000,
    speed: 'fast',
  },
  'claude-haiku-4-5': {
    name: 'claude-haiku-4-5',
    displayName: 'Fast & Cheap',
    internet: false,
    vision: true,
    deepAnalysis: false,
    costPer1MTokens: 0.25,
    maxContext: 200000,
    speed: 'very_fast',
  },
  'claude-sonnet-4-6': {
    name: 'claude-sonnet-4-6',
    displayName: 'Powerful',
    internet: true,
    vision: true,
    deepAnalysis: true,
    costPer1MTokens: 3.00,
    maxContext: 200000,
    speed: 'fast',
  },
  'claude-opus-4-6': {
    name: 'claude-opus-4-6',
    displayName: 'Most Powerful',
    internet: true,
    vision: true,
    deepAnalysis: true,
    costPer1MTokens: 15.00,
    maxContext: 200000,
    speed: 'slower',
  },
};

// Retail price per 1M tokens (what we charge users)
export const RETAIL_PRICES: Record<string, number> = {
  'gpt-4o-mini': 0.50,
  'gpt-4o-mini-search-preview': 0.80,
  'gpt-4o': 10.00,
  'gpt-4o-search-preview': 11.00,
  'claude-haiku-4-5': 0.75,
  'claude-sonnet-4-6': 7.00,
  'claude-opus-4-6': 30.00,
};

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

  // Edge case: needs BOTH internet AND vision
  if (needsInternet && needsVision) {
    model = 'claude-sonnet-4-6';
    reason = 'Requires both internet access and vision capability';
  }
  // Very long context
  else if (estimatedTokens > 100000) {
    model = needsInternet ? 'claude-opus-4-6' : 'claude-sonnet-4-6';
    reason = `Large context (${estimatedTokens} est. tokens) requires extended context window`;
  }
  // Internet required
  else if (needsInternet) {
    if (complexity === 'simple') {
      model = 'gpt-4o-mini-search-preview';
      reason = 'Simple internet task — cheapest model with web search';
    } else if (needsDeepAnalysis) {
      model = 'claude-opus-4-6';
      reason = 'Complex internet research requiring deep analysis';
    } else {
      model = 'claude-sonnet-4-6';
      reason = 'Internet task with moderate complexity';
    }
  }
  // Vision required
  else if (needsVision) {
    if (complexity === 'simple') {
      model = 'gpt-4o-mini';
      reason = 'Simple vision task — cheapest model with vision';
    } else {
      model = 'gpt-4o';
      reason = 'Complex vision task';
    }
  }
  // Text-only tasks
  else if (complexity === 'simple') {
    model = 'gpt-4o-mini';
    reason = 'Simple text task — cheapest model';
  } else if (needsCode) {
    model = 'claude-sonnet-4-6';
    reason = 'Code task — best code generation model';
  } else if (needsDeepAnalysis) {
    model = 'claude-opus-4-6';
    reason = 'Deep analysis required — most capable model';
  } else {
    model = 'gpt-4o';
    reason = 'Balanced fallback for medium complexity';
  }

  // Calculate savings vs always using opus
  const opusCost = MODEL_MAP['claude-opus-4-6'].costPer1MTokens;
  const selectedCost = MODEL_MAP[model].costPer1MTokens;
  const tokensSaved = Math.round(
    ((opusCost - selectedCost) / opusCost) * estimatedTokens
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
