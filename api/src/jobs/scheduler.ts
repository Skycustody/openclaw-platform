import cron from 'node-cron';
import { runSleepCycle } from '../services/sleepWake';
import { runDueCronJobs } from '../services/cronScheduler';
import { checkCapacity } from '../services/serverRegistry';
import { processGracePeriods } from '../services/gracePeriod';
import { migrateKeyToNoReset } from '../services/nexos';
import { sendFeedbackRequest } from '../services/email';
import db from '../lib/db';

async function migrateExistingKeysOnce() {
  try {
    const users = await db.getMany<{ id: string }>(
      "SELECT id FROM users WHERE nexos_api_key IS NOT NULL AND status IN ('active', 'grace_period', 'sleeping')"
    );
    let migrated = 0;
    for (const u of users) {
      const ok = await migrateKeyToNoReset(u.id);
      if (ok) migrated++;
    }
    if (migrated > 0) {
      console.log(`[scheduler] Migrated ${migrated}/${users.length} OpenRouter keys to limitReset:none`);
    }
  } catch (err: any) {
    console.error('[scheduler] Key migration error:', err.message);
  }
}

export function startScheduler() {
  // Sleep/wake cycle — every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    const start = Date.now();
    try {
      const result = await runSleepCycle();
      const elapsed = Date.now() - start;
      if (result.slept > 0) {
        console.log(`[scheduler] Sleep cycle: ${result.slept} containers slept (${elapsed}ms)`);
      }
    } catch (err: any) {
      console.error(`[scheduler] Sleep cycle error (${Date.now() - start}ms):`, err.message);
    }
  });

  // Cron job runner — every minute
  cron.schedule('* * * * *', async () => {
    try {
      const ran = await runDueCronJobs();
      if (ran > 0) {
        console.log(`[scheduler] Cron runner: ${ran} jobs executed`);
      }
    } catch (err: any) {
      console.error('[scheduler] Cron runner error:', err.message);
    }
  });

  // Capacity check — every 10 minutes
  cron.schedule('*/10 * * * *', async () => {
    const start = Date.now();
    try {
      await checkCapacity();
      console.log(`[scheduler] Capacity check completed (${Date.now() - start}ms)`);
    } catch (err: any) {
      console.error(`[scheduler] Capacity check error (${Date.now() - start}ms):`, err.message);
    }
  });

  // Grace period processing — every 6 hours
  cron.schedule('0 */6 * * *', async () => {
    const start = Date.now();
    try {
      await processGracePeriods();
      console.log(`[scheduler] Grace period check completed (${Date.now() - start}ms)`);
    } catch (err: any) {
      console.error(`[scheduler] Grace period check error (${Date.now() - start}ms):`, err.message);
    }
  });

  // Feedback email — every hour, send to users who paid 24h+ ago and haven't received one
  cron.schedule('0 * * * *', async () => {
    const adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase();
    try {
      const users = await db.getMany<{ id: string; email: string }>(
        `SELECT id, email FROM users
         WHERE stripe_customer_id IS NOT NULL
           AND feedback_email_sent_at IS NULL
           AND created_at < NOW() - INTERVAL '24 hours'
           AND LOWER(email) != $1
         LIMIT 5`,
        [adminEmail]
      );
      for (const u of users) {
        const sent = await sendFeedbackRequest(u.email);
        if (sent) {
          await db.query('UPDATE users SET feedback_email_sent_at = NOW() WHERE id = $1', [u.id]);
          console.log(`[scheduler] Feedback email sent to ${u.email}`);
        }
      }
    } catch (err: any) {
      console.error('[scheduler] Feedback email error:', err.message);
    }
  });

  // One-time migration: convert existing keys from monthly auto-reset to no-reset
  setTimeout(() => migrateExistingKeysOnce(), 10_000);

  console.log('[scheduler] Started: sleep=*/5min, cron=*/1min, capacity=*/10min, grace=*/6h, feedback=*/1h');
}
