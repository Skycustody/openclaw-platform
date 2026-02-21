export type Plan = 'starter' | 'pro' | 'business';
export type UserStatus = 'provisioning' | 'active' | 'sleeping' | 'paused' | 'cancelled' | 'grace_period';
export type ServerStatus = 'active' | 'provisioning' | 'draining' | 'offline';
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
  grace_period_end: Date | null;
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
  includedTokens: number;
  priceCents: number;
  hasBrowser: boolean;
  allChannels: boolean;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  starter: {
    ramMb: 2048,
    cpus: '1.0',
    maxSkills: 10,
    maxCronJobs: 3,
    storageGb: 1,
    includedTokens: 500000,
    priceCents: 1000,
    hasBrowser: false,
    allChannels: false,
  },
  pro: {
    ramMb: 4096,
    cpus: '2.0',
    maxSkills: 53,
    maxCronJobs: 20,
    storageGb: 5,
    includedTokens: 1500000,
    priceCents: 2000,
    hasBrowser: true,
    allChannels: true,
  },
  business: {
    ramMb: 8192,
    cpus: '4.0',
    maxSkills: 53,
    maxCronJobs: 100,
    storageGb: 20,
    includedTokens: 5000000,
    priceCents: 5000,
    hasBrowser: true,
    allChannels: true,
  },
};

export const TOKEN_PACKAGES = [
  { id: 'tokens_500k', name: 'Starter Pack', tokens: 500000, priceCents: 500 },
  { id: 'tokens_1200k', name: 'Basic Pack', tokens: 1200000, priceCents: 1000 },
  { id: 'tokens_3500k', name: 'Pro Pack', tokens: 3500000, priceCents: 2500 },
  { id: 'tokens_8m', name: 'Power Pack', tokens: 8000000, priceCents: 5000, bestValue: true },
];
