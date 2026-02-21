import db from '../lib/db';
import redis from '../lib/redis';

interface TaskStats {
  startTime: number;
  tokensUsed: number;
  actionCount: number;
}

interface ActionEntry {
  type: string;
  timestamp: number;
}

export class LoopDetector {
  private intervals: Map<string, NodeJS.Timeout> = new Map();

  async startMonitoring(userId: string, taskId: string): Promise<void> {
    const key = `${userId}:${taskId}`;

    // Store task start time
    await redis.set(`task:start:${key}`, Date.now().toString(), 'EX', 3600);
    await redis.set(`task:tokens:${key}`, '0', 'EX', 3600);
    await redis.del(`task:actions:${key}`);

    const interval = setInterval(async () => {
      try {
        await this.check(userId, taskId);
      } catch (err) {
        console.error(`Loop detector error for ${key}:`, err);
      }
    }, 30000);

    this.intervals.set(key, interval);
  }

  async recordAction(userId: string, taskId: string, actionType: string): Promise<void> {
    const key = `${userId}:${taskId}`;
    const entry: ActionEntry = { type: actionType, timestamp: Date.now() };
    await redis.rpush(`task:actions:${key}`, JSON.stringify(entry));
    await redis.expire(`task:actions:${key}`, 3600);
  }

  async addTokens(userId: string, taskId: string, tokens: number): Promise<void> {
    const key = `${userId}:${taskId}`;
    await redis.incrby(`task:tokens:${key}`, tokens);
  }

  private async check(userId: string, taskId: string): Promise<void> {
    const key = `${userId}:${taskId}`;
    const stats = await this.getStats(key);

    if (!stats) {
      this.stopMonitoring(userId, taskId);
      return;
    }

    const runMinutes = (Date.now() - stats.startTime) / 60000;

    // Kill if running too long (5 minutes)
    if (runMinutes > 5) {
      await this.killTask(userId, taskId, 'Task stopped after 5 minutes');
      return;
    }

    // Kill if repeating same actions
    const recentActions = await this.getRecentActions(key, 5);
    if (recentActions.length >= 5) {
      const uniqueTypes = new Set(recentActions.map((a) => a.type));
      if (uniqueTypes.size === 1) {
        await this.killTask(userId, taskId, 'Agent loop detected — repeating same action');
        return;
      }
    }

    // Pause if token spike (>10k tokens in one task)
    if (stats.tokensUsed > 10000) {
      await this.pauseTask(userId, taskId,
        `Task used ${stats.tokensUsed.toLocaleString()} tokens`);
    }
  }

  private async getStats(key: string): Promise<TaskStats | null> {
    const startTime = await redis.get(`task:start:${key}`);
    const tokensUsed = await redis.get(`task:tokens:${key}`);
    const actionCount = await redis.llen(`task:actions:${key}`);

    if (!startTime) return null;

    return {
      startTime: parseInt(startTime),
      tokensUsed: parseInt(tokensUsed || '0'),
      actionCount,
    };
  }

  private async getRecentActions(key: string, count: number): Promise<ActionEntry[]> {
    const raw = await redis.lrange(`task:actions:${key}`, -count, -1);
    return raw.map((r) => JSON.parse(r));
  }

  private async killTask(userId: string, taskId: string, reason: string): Promise<void> {
    this.stopMonitoring(userId, taskId);

    // Notify user through activity log
    await db.query(
      `INSERT INTO activity_log (user_id, type, summary, details)
       VALUES ($1, 'loop_killed', $2, $3)`,
      [userId, reason, JSON.stringify({ taskId })]
    );

    console.log(`Task killed: ${userId}/${taskId} — ${reason}`);
  }

  private async pauseTask(userId: string, taskId: string, reason: string): Promise<void> {
    this.stopMonitoring(userId, taskId);

    await db.query(
      `INSERT INTO activity_log (user_id, type, summary, details)
       VALUES ($1, 'loop_paused', $2, $3)`,
      [userId, reason, JSON.stringify({ taskId })]
    );

    console.log(`Task paused: ${userId}/${taskId} — ${reason}`);
  }

  stopMonitoring(userId: string, taskId: string): void {
    const key = `${userId}:${taskId}`;
    const interval = this.intervals.get(key);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(key);
    }
  }

  stopAll(): void {
    for (const [key, interval] of this.intervals) {
      clearInterval(interval);
    }
    this.intervals.clear();
  }
}

export const loopDetector = new LoopDetector();
