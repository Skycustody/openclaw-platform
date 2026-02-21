import db from '../lib/db';
import redis from '../lib/redis';
import { CronJob } from '../types';
import { autoWorkExecute } from './tokenBudget';
import { loadTaskSpecificMemory } from './memory';
import { v4 as uuid } from 'uuid';

// Parse human-readable schedule to cron expression
export function parseToCron(schedule: string): string {
  const lower = schedule.toLowerCase().trim();

  if (lower === 'every hour' || lower === 'hourly') return '0 * * * *';
  if (lower === 'every day' || lower === 'daily') return '0 9 * * *';
  if (lower === 'every morning') return '0 8 * * *';
  if (lower === 'every evening') return '0 18 * * *';
  if (lower === 'every week' || lower === 'weekly') return '0 9 * * 1';
  if (lower === 'every monday') return '0 9 * * 1';
  if (lower === 'every friday') return '0 9 * * 5';
  if (lower.match(/every (\d+) minutes?/)) {
    const mins = lower.match(/every (\d+) minutes?/)![1];
    return `*/${mins} * * * *`;
  }
  if (lower.match(/every (\d+) hours?/)) {
    const hrs = lower.match(/every (\d+) hours?/)![1];
    return `0 */${hrs} * * *`;
  }

  // Assume it's already a cron expression
  return schedule;
}

export async function createCronJob(
  userId: string,
  name: string,
  description: string,
  schedule: string,
  tokenBudget = 3000,
  timeoutSecs = 120
): Promise<CronJob> {
  const cronExpr = parseToCron(schedule);
  const nextRun = getNextRun(cronExpr);

  const result = await db.getOne<CronJob>(
    `INSERT INTO cron_jobs (user_id, name, description, schedule, token_budget, timeout_secs, next_run)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [userId, name, description, cronExpr, tokenBudget, timeoutSecs, nextRun]
  );

  return result!;
}

export async function updateCronJob(
  userId: string,
  jobId: string,
  updates: Partial<Pick<CronJob, 'name' | 'description' | 'schedule' | 'token_budget' | 'timeout_secs' | 'enabled'>>
): Promise<CronJob> {
  const fields: string[] = [];
  const values: any[] = [];
  let idx = 1;

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      const dbKey = key === 'token_budget' ? 'token_budget' : key === 'timeout_secs' ? 'timeout_secs' : key;
      fields.push(`${dbKey} = $${idx++}`);
      values.push(key === 'schedule' ? parseToCron(value as string) : value);
    }
  }

  if (!fields.length) {
    return (await db.getOne<CronJob>('SELECT * FROM cron_jobs WHERE id = $1 AND user_id = $2', [jobId, userId]))!;
  }

  values.push(jobId, userId);
  const result = await db.getOne<CronJob>(
    `UPDATE cron_jobs SET ${fields.join(', ')}
     WHERE id = $${idx++} AND user_id = $${idx}
     RETURNING *`,
    values
  );

  return result!;
}

export async function deleteCronJob(userId: string, jobId: string): Promise<void> {
  await db.query('DELETE FROM cron_jobs WHERE id = $1 AND user_id = $2', [jobId, userId]);
}

export async function getUserCronJobs(userId: string): Promise<CronJob[]> {
  return db.getMany<CronJob>(
    'SELECT * FROM cron_jobs WHERE user_id = $1 ORDER BY created_at',
    [userId]
  );
}

// Run due cron jobs — called by the main scheduler every minute
export async function runDueCronJobs(): Promise<number> {
  const dueJobs = await db.getMany<CronJob>(
    `SELECT * FROM cron_jobs
     WHERE enabled = true AND next_run <= NOW()
     ORDER BY next_run
     LIMIT 10`
  );

  let ran = 0;

  for (const job of dueJobs) {
    // Lock to prevent double execution
    const lockKey = `cron:lock:${job.id}`;
    const locked = await redis.set(lockKey, '1', 'EX', job.timeout_secs, 'NX');
    if (!locked) continue;

    try {
      console.log(`Running cron job: ${job.name} for user ${job.user_id}`);

      const result = await autoWorkExecute(
        job.user_id,
        {
          description: job.description || job.name,
          type: inferTaskType(job.name),
          tokenBudget: job.token_budget,
        },
        async (budget) => {
          return {
            response: `Executed: ${job.name}`,
            tokensUsed: Math.min(budget, 500),
            model: 'claude-haiku-4-5',
          };
        }
      );

      const nextRun = getNextRun(job.schedule);
      await db.query(
        `UPDATE cron_jobs
         SET last_run = NOW(), last_result = $1, last_tokens = $2, next_run = $3
         WHERE id = $4`,
        [result.response, result.tokensUsed, nextRun, job.id]
      );

      ran++;
    } catch (err: any) {
      await db.query(
        `UPDATE cron_jobs
         SET last_run = NOW(), last_result = $1, next_run = $2
         WHERE id = $3`,
        [`ERROR: ${err.message}`, getNextRun(job.schedule), job.id]
      );
    } finally {
      await redis.del(lockKey);
    }
  }

  return ran;
}

function inferTaskType(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('email')) return 'email_reply';
  if (lower.includes('price') || lower.includes('monitor')) return 'price_monitor';
  if (lower.includes('news') || lower.includes('brief')) return 'news_briefing';
  if (lower.includes('calendar') || lower.includes('schedule')) return 'calendar';
  return 'general';
}

function getNextRun(cronExpr: string): Date {
  const now = new Date();
  const parts = cronExpr.split(' ');

  if (parts[0].startsWith('*/')) {
    const mins = parseInt(parts[0].slice(2));
    const next = new Date(now);
    next.setMinutes(Math.ceil(now.getMinutes() / mins) * mins);
    next.setSeconds(0);
    if (next <= now) next.setMinutes(next.getMinutes() + mins);
    return next;
  }

  if (parts[1].startsWith('*/')) {
    const hrs = parseInt(parts[1].slice(2));
    const next = new Date(now);
    next.setHours(Math.ceil(now.getHours() / hrs) * hrs);
    next.setMinutes(parseInt(parts[0]) || 0);
    next.setSeconds(0);
    if (next <= now) next.setHours(next.getHours() + hrs);
    return next;
  }

  // Default: run in 1 hour
  return new Date(now.getTime() + 3600000);
}
