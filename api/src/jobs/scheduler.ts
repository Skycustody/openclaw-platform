import cron from 'node-cron';
import { runSleepCycle } from '../services/sleepWake';
import { runDueCronJobs } from '../services/cronScheduler';
import { checkCapacity } from '../services/serverRegistry';
import { processTrialExpiry } from '../services/trialExpiry';
import { sendFeedbackRequest } from '../services/email';
import db from '../lib/db';

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

  // Trial expiry — daily: remove container on day 4, delete data on day 34
  cron.schedule('0 4 * * *', async () => {
    const start = Date.now();
    try {
      await processTrialExpiry();
      console.log(`[scheduler] Trial expiry check completed (${Date.now() - start}ms)`);
    } catch (err: any) {
      console.error(`[scheduler] Trial expiry error (${Date.now() - start}ms):`, err.message);
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

  console.log('[scheduler] Started: sleep=*/5min, cron=*/1min, capacity=*/10min, trial=4am daily, feedback=*/1h');
}
