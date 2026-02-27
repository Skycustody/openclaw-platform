export type Plan = 'starter' | 'pro' | 'business';
export type UserStatus = 'pending' | 'provisioning' | 'starting' | 'active' | 'sleeping' | 'paused' | 'cancelled' | 'grace_period';
export type ServerStatus = 'active' | 'provisioning' | 'draining' | 'offline';
/** @deprecated Legacy token type — billing now uses credits */
export type TokenTransactionType = 'purchase' | 'usage' | 'bonus' | 'refund' | 'subscription_grant' | 'auto_topup';
export type MemoryType = 'fact' | 'preference' | 'episode' | 'skill' | 'person' | 'context';
export type TaskComplexity = 'simple' | 'medium' | 'complex';
export type AgentTone = 'professional' | 'casual' | 'friendly' | 'balanced' | 'custom';

export interface User {
  id: string;
  email: string;
  stripe_customer_id: string | null;
  plan: Plan;
  status: UserStatus;
  server_id: string | null;
  container_name: string | null;
  subdomain: string | null;
  s3_bucket: string | null;
  timezone: string;
  referral_code: string | null;
  referred_by: string | null;
  gateway_token: string | null;
  api_proxy_key: string | null;
  nexos_api_key: string | null;
  grace_period_end: Date | null;
  api_budget_addon_usd: number;
  is_admin: boolean;
  created_at: Date;
  last_active: Date;
}

export interface Server {
  id: string;
  hostinger_id: string | null;
  ip: string;
  hostname: string | null;
  ram_total: number;
  ram_used: number;
  cpu_cores: number;
  status: ServerStatus;
  region: string;
  registered_at: Date;
}

export interface UserSettings {
  user_id: string;
  agent_name: string;
  agent_tone: string;
  response_length: string;
  language: string;
  custom_instructions: string | null;
  brain_mode: 'auto' | 'manual';
  manual_model: string | null;
  quiet_hours_enabled: boolean;
  quiet_start: number;
  quiet_end: number;
  max_task_duration: number;
  loop_detection: boolean;
  token_budget_simple: number;
  token_budget_medium: number;
  token_budget_complex: number;
  budget_action: 'stop' | 'continue' | 'ask';
  approval_emails: boolean;
  approval_purchases: boolean;
  approval_file_delete: boolean;
  approval_commands: boolean;
  approval_social: boolean;
  /** @deprecated Use OpenRouter instead */
  own_openai_key: string | null;
  /** @deprecated Use OpenRouter instead */
  own_anthropic_key: string | null;
  own_openrouter_key: string | null;
}

export interface TokenBalance {
  user_id: string;
  balance: number;
  total_purchased: number;
  total_used: number;
  auto_topup: boolean;
  auto_topup_amount: number;
  auto_topup_threshold: number;
  low_balance_alert: number;
}

export interface Memory {
  id: string;
  user_id: string;
  content: string;
  type: MemoryType;
  importance: number;
  tags: string[];
  pinned: boolean;
  created_at: Date;
  accessed_at: Date;
}

export interface CronJob {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  schedule: string;
  token_budget: number;
  timeout_secs: number;
  enabled: boolean;
  last_run: Date | null;
  last_result: string | null;
  last_tokens: number | null;
  next_run: Date | null;
}

export interface TaskClassification {
  needsInternet: boolean;
  needsVision: boolean;
  needsDeepAnalysis: boolean;
  needsCode: boolean;
  needsAgentic?: boolean;
  complexity: TaskComplexity;
  estimatedTokens: number;
}

export interface ModelCapability {
  name: string;
  displayName: string;
  internet: boolean;
  vision: boolean;
  deepAnalysis: boolean;
  costPer1MTokens: number;
  maxContext: number;
  speed: 'very_fast' | 'fast' | 'slower';
}

export interface RoutingDecision {
  model: string;
  reason: string;
  estimatedCost: number;
  tokensSaved: number;
}

export interface PlanLimits {
  ramMb: number;
  cpus: string;
  maxSkills: number;
  maxCronJobs: number;
  storageGb: number;
  /** Monthly AI budget in USD (matches OpenRouter key limit) */
  includedBudgetUsd: number;
  /** Plan retail price in USD cents */
  priceUsdCents: number;
  hasBrowser: boolean;
  allChannels: boolean;
  maxAgents: number;
  /**
   * OpenRouter credit budget per user per month (our wholesale cost in USD cents).
   * This is what OpenRouter charges us (no markup on provider pricing).
   * Plan retail price must be ≥1.5× this + server cost for ≥50% profit margin.
   */
  nexosCreditBudgetUsdCents: number;
  /** Estimated server cost share per user per month in USD cents */
  serverCostShareUsdCents: number;
}

/**
 * ┌────────────────────────────────────────────────────────────────────────┐
 * │ PLAN PRICING (USD) — 50%+ profit target                               │
 * │                                                                       │
 * │ Formula:  retailPrice ≥ (nexosCost + serverCost) × 1.5               │
 * │                                                                       │
 * │ Plan      AI$(real) Server$ Total$  Retail$  Margin                   │
 * │ starter    1.38     4.00    5.38    15.00    64% ✓                    │
 * │ pro        3.45     8.00   11.45    25.00    54% ✓                    │
 * │ business   6.90    11.00   17.90    50.00    64% ✓                    │
 * │                                                                       │
 * │ Smart routing (cheap default models) further reduces API costs       │
 * │ by 40-60%, improving actual margins above targets.                    │
 * │                                                                       │
 * │ Credit purchases: 6% OpenRouter fee + 25% platform margin.           │
 * │ User pays $5 → $3.45 API budget. User sees $5 in dashboard.         │
 * └────────────────────────────────────────────────────────────────────────┘
 */
export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  starter: {
    ramMb: 2048,
    cpus: '1.0',
    maxSkills: 10,
    maxCronJobs: 3,
    storageGb: 10,
    includedBudgetUsd: 2,
    priceUsdCents: 1500,
    nexosCreditBudgetUsdCents: 138,   // $2 × 0.69 (after 6% OR + 25% platform)
    serverCostShareUsdCents: 400,
    hasBrowser: false,
    allChannels: false,
    maxAgents: 1,
  },
  pro: {
    ramMb: 4096,
    cpus: '2.0',
    maxSkills: 53,
    maxCronJobs: 20,
    storageGb: 50,
    includedBudgetUsd: 5,
    priceUsdCents: 2500,
    nexosCreditBudgetUsdCents: 345,   // $5 × 0.69 (after 6% OR + 25% platform)
    serverCostShareUsdCents: 800,
    hasBrowser: true,
    allChannels: true,
    maxAgents: 2,
  },
  business: {
    ramMb: 8192,
    cpus: '4.0',
    maxSkills: 53,
    maxCronJobs: 100,
    storageGb: 100,
    includedBudgetUsd: 10,
    priceUsdCents: 5000,
    nexosCreditBudgetUsdCents: 690,   // $10 × 0.69 (after 6% OR + 25% platform)
    serverCostShareUsdCents: 1100,
    hasBrowser: true,
    allChannels: true,
    maxAgents: 4,
  },
};

/** Minimum profit margin target (50% = 1.5× cost) */
export const PROFIT_MARGIN_TARGET = 0.50;

/** @deprecated Token packages removed — OpenRouter handles billing via credits */
export const TOKEN_PACKAGES: any[] = [];

export interface CreditPurchase {
  id: string;
  user_id: string;
  /** Stored as USD cents (DB column is still named amount_eur_cents for compat) */
  amount_usd_cents: number;
  credits_usd: number;
  stripe_session_id: string | null;
  created_at: Date;
}

/**
 * Credit top-up packs. Backend split: 6% OpenRouter, 25% platform, rest → API limit.
 * orBudgetUsd = (1 - 0.06 - 0.25) * usd = 0.69 * usd
 * Frontend shows amount paid ($5 → "$5 bought") and consumption reduces proportionally.
 */
const OPENROUTER_FEE = 0.06;
const PLATFORM_FEE = 0.25;
const TO_API_FRACTION = 1 - OPENROUTER_FEE - PLATFORM_FEE; // 0.69

function orBudgetFromUsd(usd: number): number {
  return Math.round(usd * TO_API_FRACTION * 100) / 100;
}

export const CREDIT_PACKS: Record<string, {
  priceUsdCents: number;
  label: string;
  orBudgetUsd: number;
  displayAmount: number;
  envKey: string;
}> = {
  '500k':  { priceUsdCents: 500,  label: '$5 Credits',  orBudgetUsd: orBudgetFromUsd(5),  displayAmount: 5,  envKey: 'STRIPE_PRICE_CREDITS_500K'  },
  '1200k': { priceUsdCents: 1000, label: '$10 Credits', orBudgetUsd: orBudgetFromUsd(10), displayAmount: 10, envKey: 'STRIPE_PRICE_CREDITS_1200K' },
  '3500k': { priceUsdCents: 2500, label: '$25 Credits', orBudgetUsd: orBudgetFromUsd(25), displayAmount: 25, envKey: 'STRIPE_PRICE_CREDITS_3500K' },
  '8m':    { priceUsdCents: 5000, label: '$50 Credits', orBudgetUsd: orBudgetFromUsd(50), displayAmount: 50, envKey: 'STRIPE_PRICE_CREDITS_8M'    },
};
