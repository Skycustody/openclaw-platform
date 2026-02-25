import cron from 'node-cron';
import { runSleepCycle } from '../services/sleepWake';
import { runDueCronJobs } from '../services/cronScheduler';
import { checkCapacity } from '../services/serverRegistry';


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

  console.log('[scheduler] Started: sleep=*/5min, cron=*/1min, capacity=*/10min');
}
