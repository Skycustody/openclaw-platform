import cron from 'node-cron';
import { runSleepCycle } from '../services/sleepWake';
import { runDueCronJobs } from '../services/cronScheduler';
import { checkCapacity } from '../services/serverRegistry';
import { processGracePeriods } from '../services/gracePeriod';
import { migrateKeyToNoReset } from '../services/nexos';
import { updateImageOnAllWorkers } from '../services/dockerImage';
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

  // OpenClaw image update — weekly (Sunday 3am) so users get latest version
  const openclawUpdateSchedule = process.env.OPENCLAW_AUTO_UPDATE_SCHEDULE || '0 3 * * 0';
  cron.schedule(openclawUpdateSchedule, async () => {
    const start = Date.now();
    try {
      const { updated, failed } = await updateImageOnAllWorkers();
      const elapsed = ((Date.now() - start) / 1000).toFixed(0);
      console.log(`[scheduler] OpenClaw update: ${updated.length} workers updated, ${failed.length} failed (${elapsed}s)`);
    } catch (err: any) {
      console.error(`[scheduler] OpenClaw update error:`, err.message);
    }
  });

  // One-time migration: convert existing keys from monthly auto-reset to no-reset
  setTimeout(() => migrateExistingKeysOnce(), 10_000);

  console.log(`[scheduler] Started: sleep=*/5min, cron=*/1min, capacity=*/10min, grace=*/6h, openclaw=${openclawUpdateSchedule}`);
}
