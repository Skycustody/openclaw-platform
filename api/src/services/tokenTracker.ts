import db from '../lib/db';
import redis from '../lib/redis';
import { sendTokenAlert } from './email';
import { InsufficientTokensError } from '../lib/errors';
import { User, TokenBalance } from '../types';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function trackUsage(
  userId: string,
  model: string,
  tokensUsed: number,
  taskId?: string
): Promise<number> {
  // Atomically deduct from balance
  const result = await db.getOne<{ balance: number }>(
    `UPDATE token_balances
     SET balance = balance - $1,
         total_used = total_used + $1,
         updated_at = NOW()
     WHERE user_id = $2
     RETURNING balance`,
    [tokensUsed, userId]
  );

  if (!result) throw new Error(`No token balance for user ${userId}`);
  const newBalance = result.balance;

  // Invalidate cached balance immediately so reads see the updated value
  await redis.del(`tokens:balance:${userId}`);

  // Log transaction
  await db.query(
    `INSERT INTO token_transactions (user_id, amount, type, model, task_id)
     VALUES ($1, $2, 'usage', $3, $4)`,
    [userId, -tokensUsed, model, taskId || null]
  );

  // Track in Redis for real-time analytics
  const dayKey = `tokens:used:${userId}:${today()}`;
  await redis.incrby(dayKey, tokensUsed);
  await redis.expire(dayKey, 86400 * 30);

  // Model-specific tracking
  const modelKey = `tokens:model:${userId}:${model}:${today()}`;
  await redis.incrby(modelKey, tokensUsed);
  await redis.expire(modelKey, 86400 * 30);

  // Check alerts
  await checkAlerts(userId, newBalance);

  return newBalance;
}

export async function checkBalance(userId: string): Promise<number> {
  const cached = await redis.get(`tokens:balance:${userId}`);
  if (cached) return parseInt(cached);

  const result = await db.getOne<TokenBalance>(
    'SELECT balance FROM token_balances WHERE user_id = $1',
    [userId]
  );
  const balance = result?.balance ?? 0;
  await redis.set(`tokens:balance:${userId}`, balance.toString(), 'EX', 60);
  return balance;
}

export async function requireBalance(userId: string, minTokens = 100): Promise<void> {
  const balance = await checkBalance(userId);
  if (balance < minTokens) {
    throw new InsufficientTokensError();
  }
}

export async function addTokens(
  userId: string,
  amount: number,
  type: 'purchase' | 'bonus' | 'refund' | 'subscription_grant',
  description: string
): Promise<number> {
  const result = await db.getOne<{ balance: number }>(
    `UPDATE token_balances
     SET balance = balance + $1,
         total_purchased = total_purchased + $1,
         updated_at = NOW()
     WHERE user_id = $2
     RETURNING balance`,
    [amount, userId]
  );

  await db.query(
    `INSERT INTO token_transactions (user_id, amount, type, description)
     VALUES ($1, $2, $3, $4)`,
    [userId, amount, type, description]
  );

  await redis.del(`tokens:balance:${userId}`);

  return result?.balance ?? amount;
}

async function checkAlerts(userId: string, balance: number): Promise<void> {
  // Throttle alerts to once per hour
  const alertKey = `token:alert:${userId}`;
  const lastAlert = await redis.get(alertKey);
  if (lastAlert) return;

  const user = await db.getOne<User>('SELECT email FROM users WHERE id = $1', [userId]);
  if (!user) return;

  const tokenBalance = await db.getOne<TokenBalance>(
    'SELECT * FROM token_balances WHERE user_id = $1',
    [userId]
  );

  if (balance <= 0) {
    // Pause the agent
    await db.query("UPDATE users SET status = 'paused' WHERE id = $1", [userId]);
    await sendTokenAlert(user.email, 'OUT_OF_TOKENS',
      'Your token balance is empty. Your agent has been paused. Top up to continue.');
    await redis.set(alertKey, '1', 'EX', 3600);

    // Handle auto top-up
    if (tokenBalance?.auto_topup) {
      await triggerAutoTopup(userId, tokenBalance.auto_topup_amount);
    }
  } else if (tokenBalance && balance < tokenBalance.low_balance_alert) {
    const daysLeft = await estimateDaysRemaining(userId, balance);
    await sendTokenAlert(user.email, 'LOW_BALANCE',
      `You have approximately ${daysLeft} days of tokens remaining at your current usage rate.`);
    await redis.set(alertKey, '1', 'EX', 3600);
  }
}

async function triggerAutoTopup(userId: string, amountCents: number): Promise<void> {
  // This will be handled by the Stripe service
  console.log(`Auto top-up triggered for ${userId}: $${amountCents / 100}`);
}

export async function estimateDaysRemaining(userId: string, currentBalance?: number): Promise<number> {
  const balance = currentBalance ?? (await checkBalance(userId));

  // Get average daily usage over past 7 days
  const result = await db.getOne<{ avg_daily: string }>(
    `SELECT COALESCE(AVG(daily_total), 1) as avg_daily FROM (
       SELECT DATE(created_at) as day, SUM(ABS(amount)) as daily_total
       FROM token_transactions
       WHERE user_id = $1 AND type = 'usage' AND created_at > NOW() - INTERVAL '7 days'
       GROUP BY DATE(created_at)
     ) sub`,
    [userId]
  );

  const avgDaily = parseFloat(result?.avg_daily || '1');
  if (avgDaily <= 0) return 999;

  return Math.floor(balance / avgDaily);
}

export async function getDailyUsage(userId: string, days = 30): Promise<Array<{ date: string; tokens: number }>> {
  const safeDays = Math.max(1, Math.min(Math.floor(Number(days)), 365));
  return db.getMany(
    `SELECT DATE(created_at) as date, SUM(ABS(amount)) as tokens
     FROM token_transactions
     WHERE user_id = $1 AND type = 'usage' AND created_at > NOW() - make_interval(days => $2)
     GROUP BY DATE(created_at)
     ORDER BY date`,
    [userId, safeDays]
  );
}

export async function getUsageByModel(userId: string, days = 30): Promise<Array<{ model: string; tokens: number }>> {
  const safeDays = Math.max(1, Math.min(Math.floor(Number(days)), 365));
  return db.getMany(
    `SELECT model, SUM(ABS(amount)) as tokens
     FROM token_transactions
     WHERE user_id = $1 AND type = 'usage' AND model IS NOT NULL AND created_at > NOW() - make_interval(days => $2)
     GROUP BY model
     ORDER BY tokens DESC`,
    [userId, safeDays]
  );
}

export async function getTopTasks(userId: string, limit = 5): Promise<Array<{ description: string; tokens: number }>> {
  return db.getMany(
    `SELECT description, SUM(ABS(amount)) as tokens
     FROM token_transactions
     WHERE user_id = $1 AND type = 'usage' AND description IS NOT NULL
       AND created_at > NOW() - INTERVAL '30 days'
     GROUP BY description
     ORDER BY tokens DESC
     LIMIT $2`,
    [userId, limit]
  );
}
