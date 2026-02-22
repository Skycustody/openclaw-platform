/**
 * Task execution wrapper with budget limits and loop detection.
 *
 * Token billing is handled by OpenRouter credits — this module only provides
 * the execution scaffolding for cron jobs (budget limits, loop detection).
 */
import { TaskComplexity, Plan, UserSettings } from '../types';
import { loopDetector } from './loopDetector';
import { v4 as uuid } from 'uuid';
import db from '../lib/db';

const DEFAULT_BUDGETS: Record<TaskComplexity, Record<Plan, number>> = {
  simple: { starter: 2000, pro: 3000, business: 5000 },
  medium: { starter: 5000, pro: 10000, business: 20000 },
  complex: { starter: 10000, pro: 25000, business: 50000 },
};

export async function getTokenBudget(
  userId: string,
  complexity: TaskComplexity,
  plan: Plan
): Promise<number> {
  const settings = await db.getOne<UserSettings>(
    'SELECT * FROM user_settings WHERE user_id = $1',
    [userId]
  );

  if (settings) {
    switch (complexity) {
      case 'simple':
        return settings.token_budget_simple;
      case 'medium':
        return settings.token_budget_medium;
      case 'complex':
        return settings.token_budget_complex;
    }
  }

  return DEFAULT_BUDGETS[complexity][plan];
}

interface ExecutionResult {
  response: string;
  tokensUsed: number;
  model: string;
  budgetReached: boolean;
}

export async function executeWithBudget(
  userId: string,
  plan: Plan,
  complexity: TaskComplexity,
  executeFn: (budget: number, taskId: string) => Promise<{ response: string; tokensUsed: number; model: string }>
): Promise<ExecutionResult> {
  const budget = await getTokenBudget(userId, complexity, plan);
  const taskId = uuid();

  await loopDetector.startMonitoring(userId, taskId);

  try {
    const result = await executeFn(budget, taskId);
    return {
      ...result,
      budgetReached: result.tokensUsed >= budget * 0.9,
    };
  } finally {
    loopDetector.stopMonitoring(userId, taskId);
  }
}

export async function autoWorkExecute(
  userId: string,
  task: { description: string; type: string; tokenBudget?: number; requiredTools?: any[] },
  executeFn: (budget: number) => Promise<{ response: string; tokensUsed: number; model: string }>
): Promise<ExecutionResult> {
  const budget = task.tokenBudget || 2000;

  try {
    const result = await executeFn(budget);
    return {
      ...result,
      budgetReached: result.tokensUsed >= budget * 0.9,
    };
  } catch (err) {
    console.error(`Auto work failed for ${userId}:`, err);
    throw err;
  }
}
