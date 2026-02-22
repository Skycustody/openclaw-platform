import db from '../lib/db';
import redis from '../lib/redis';
import { CronJob } from '../types';
import { autoWorkExecute } from './tokenBudget';
import { getUserContainer, sendContainerMessage } from './containerConfig';
import { v4 as uuid } from 'uuid';

export function parseToCron(schedule: string): string {
  const lower = schedule.toLowerCase().trim();

  if (lower === 'every hour' || lower === 'hourly') return '0 * * * *';
  if (lower === 'every day' || lower === 'daily') return '0 9 * * *';
  if (lower === 'every morning') return '0 8 * * *';
  if (lower === 'every evening') return '0 18 * * *';
  if (lower === 'every night') return '0 22 * * *';
  if (lower === 'every week' || lower === 'weekly') return '0 9 * * 1';
  if (lower === 'every monday') return '0 9 * * 1';
  if (lower === 'every tuesday') return '0 9 * * 2';
  if (lower === 'every wednesday') return '0 9 * * 3';
  if (lower === 'every thursday') return '0 9 * * 4';
  if (lower === 'every friday') return '0 9 * * 5';
  if (lower === 'every saturday') return '0 9 * * 6';
  if (lower === 'every sunday') return '0 9 * * 0';
  if (lower === 'twice daily') return '0 9,18 * * *';

  const minMatch = lower.match(/every (\d+) minutes?/);
  if (minMatch) return `*/${minMatch[1]} * * * *`;

  const hrMatch = lower.match(/every (\d+) hours?/);
  if (hrMatch) return `0 */${hrMatch[1]} * * *`;

  const atMatch = lower.match(/(?:daily|every day) (?:at )?(\d{1,2}):(\d{2})/);
  if (atMatch) return `${parseInt(atMatch[2])} ${parseInt(atMatch[1])} * * *`;

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

async function executeJobTask(job: CronJob, budget: number): Promise<{ response: string; tokensUsed: number; model: string }> {
  try {
    const { serverIp, containerName } = await getUserContainer(job.user_id);
    const response = await sendContainerMessage(
      serverIp,
      containerName,
      job.description || job.name,
    );
    return {
      response: response || `Completed: ${job.name}`,
      tokensUsed: 0,
      model: 'openclaw',
    };
  } catch (err: any) {
    return {
      response: `Error executing task: ${err.message}`,
      tokensUsed: 0,
      model: 'none',
    };
  }
}

export async function runDueCronJobs(): Promise<number> {
  const dueJobs = await db.getMany<CronJob>(
    `SELECT * FROM cron_jobs
     WHERE enabled = true AND next_run <= NOW()
     ORDER BY next_run
     LIMIT 10`
  );

  let ran = 0;

  for (const job of dueJobs) {
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
        async (budget) => executeJobTask(job, budget)
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

export async function runCronJobNow(userId: string, jobId: string): Promise<{ ok: boolean; result?: string; tokensUsed?: number }> {
  const job = await db.getOne<CronJob>(
    'SELECT * FROM cron_jobs WHERE id = $1 AND user_id = $2',
    [jobId, userId]
  );
  if (!job) throw new Error('Job not found');

  const lockKey = `cron:lock:${job.id}`;
  const locked = await redis.set(lockKey, '1', 'EX', job.timeout_secs, 'NX');
  if (!locked) return { ok: false, result: 'Job is already running' };

  try {
    const result = await autoWorkExecute(
      userId,
      {
        description: job.description || job.name,
        type: inferTaskType(job.name),
        tokenBudget: job.token_budget,
      },
      async (budget) => executeJobTask(job, budget)
    );

    await db.query(
      `UPDATE cron_jobs
       SET last_run = NOW(), last_result = $1, last_tokens = $2
       WHERE id = $3`,
      [result.response, result.tokensUsed, job.id]
    );

    return { ok: true, result: result.response, tokensUsed: result.tokensUsed };
  } finally {
    await redis.del(lockKey);
  }
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

  const next = new Date(now.getTime() + 3600000);
  return next;
}
