import cron from 'node-cron';
import { runSleepCycle } from '../services/sleepWake';
import { runDueCronJobs } from '../services/cronScheduler';
import { checkCapacity } from '../services/serverRegistry';
import { resetMonthlyAddons } from '../services/nexos';

export function startScheduler() {
  // Sleep/wake cycle — every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    try {
      const result = await runSleepCycle();
      if (result.slept > 0) {
        console.log(`Sleep cycle: ${result.slept} containers slept`);
      }
    } catch (err) {
      console.error('Sleep cycle error:', err);
    }
  });

  // Cron job runner — every minute
  cron.schedule('* * * * *', async () => {
    try {
      const ran = await runDueCronJobs();
      if (ran > 0) {
        console.log(`Cron runner: ${ran} jobs executed`);
      }
    } catch (err) {
      console.error('Cron runner error:', err);
    }
  });

  // Capacity check — every 10 minutes
  cron.schedule('*/10 * * * *', async () => {
    try {
      await checkCapacity();
    } catch (err) {
      console.error('Capacity check error:', err);
    }
  });

  // Monthly add-on credit reset — 1st of each month at 00:05 UTC
  // (OpenRouter resets key usage monthly at midnight UTC)
  cron.schedule('5 0 1 * *', async () => {
    try {
      const reset = await resetMonthlyAddons();
      if (reset.length > 0) {
        console.log(`Monthly credit reset: ${reset.length} users`);
      }
    } catch (err) {
      console.error('Monthly credit reset error:', err);
    }
  });

  console.log('Scheduler started');
}
