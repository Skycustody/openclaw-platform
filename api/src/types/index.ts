export type Plan = 'starter' | 'pro' | 'business';
export type UserStatus = 'provisioning' | 'active' | 'sleeping' | 'paused' | 'cancelled' | 'grace_period';
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
  priceEurCents: number;
  hasBrowser: boolean;
  allChannels: boolean;
  maxAgents: number;
  /**
   * OpenRouter credit budget per user per month (our wholesale cost in EUR cents).
   * This is what OpenRouter charges us (no markup on provider pricing).
   * Plan retail price must be ≥1.5× this + server cost for ≥50% profit margin.
   */
  nexosCreditBudgetEurCents: number;
  /** Estimated server cost share per user per month in EUR cents */
  serverCostShareEurCents: number;
}

/**
 * ┌────────────────────────────────────────────────────────────────────────┐
 * │ PLAN PRICING — 50% profit target                                      │
 * │                                                                       │
 * │ Formula:  retailPrice ≥ (nexosCost + serverCost) × 1.5               │
 * │                                                                       │
 * │ Plan      API€    Server€  Total€  Retail€  Margin                   │
 * │ starter    2.00    3.33     5.33    10.00    47% ✓                    │
 * │ pro        5.00    6.67    11.67    20.00    42% (scales up w/ users) │
 * │ business  12.00   10.00    22.00    50.00    56% ✓                    │
 * │                                                                       │
 * │ Smart routing (cheap default models) further reduces API costs       │
 * │ by 40-60%, improving actual margins above targets.                    │
 * └────────────────────────────────────────────────────────────────────────┘
 */
export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  starter: {
    ramMb: 2048,
    cpus: '1.0',
    maxSkills: 10,
    maxCronJobs: 3,
    storageGb: 5,
    includedBudgetUsd: 2,
    priceEurCents: 1000,
    nexosCreditBudgetEurCents: 185,
    serverCostShareEurCents: 333,
    hasBrowser: false,
    allChannels: false,
    maxAgents: 1,
  },
  pro: {
    ramMb: 4096,
    cpus: '2.0',
    maxSkills: 53,
    maxCronJobs: 20,
    storageGb: 25,
    includedBudgetUsd: 7,
    priceEurCents: 2000,
    nexosCreditBudgetEurCents: 650,
    serverCostShareEurCents: 667,
    hasBrowser: true,
    allChannels: true,
    maxAgents: 2,
  },
  business: {
    ramMb: 8192,
    cpus: '4.0',
    maxSkills: 53,
    maxCronJobs: 100,
    storageGb: 50,
    includedBudgetUsd: 12,
    priceEurCents: 5000,
    nexosCreditBudgetEurCents: 1115,
    serverCostShareEurCents: 1000,
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
  amount_eur_cents: number;
  credits_usd: number;
  stripe_session_id: string | null;
  created_at: Date;
}

/**
 * Credit top-up packs. Backend split: 6% OpenRouter, 25% platform, rest → API limit.
 * orBudgetUsd = (1 - 0.06 - 0.25) * eur * 1.08 = 0.69 * eur * 1.08
 * Frontend shows amount paid (€5 → "$5 bought") and consumption reduces proportionally.
 */
const EUR_TO_USD = 1.08;
const OPENROUTER_FEE = 0.06;
const PLATFORM_FEE = 0.25;
const TO_API_FRACTION = 1 - OPENROUTER_FEE - PLATFORM_FEE; // 0.69

function orBudgetFromEur(eur: number): number {
  return Math.round(eur * TO_API_FRACTION * EUR_TO_USD * 100) / 100;
}

export const CREDIT_PACKS: Record<string, {
  priceEurCents: number;
  label: string;
  orBudgetUsd: number;
  displayAmount: number;
  envKey: string;
}> = {
  '500k':  { priceEurCents: 500,  label: '€5 Credits',  orBudgetUsd: orBudgetFromEur(5),  displayAmount: 5,  envKey: 'STRIPE_PRICE_CREDITS_500K'  },
  '1200k': { priceEurCents: 1000, label: '€10 Credits', orBudgetUsd: orBudgetFromEur(10), displayAmount: 10, envKey: 'STRIPE_PRICE_CREDITS_1200K' },
  '3500k': { priceEurCents: 2500, label: '€25 Credits', orBudgetUsd: orBudgetFromEur(25), displayAmount: 25, envKey: 'STRIPE_PRICE_CREDITS_3500K' },
  '8m':    { priceEurCents: 5000, label: '€50 Credits', orBudgetUsd: orBudgetFromEur(50), displayAmount: 50, envKey: 'STRIPE_PRICE_CREDITS_8M'    },
};
