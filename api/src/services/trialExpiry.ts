import db from '../lib/db';
import { User } from '../types';
import { deprovisionUser, removeTrialContainer } from './provisioning';

/**
 * Trial expiry flow:
 * Day 4: trial_ends_at passed, no stripe_customer_id → remove container, keep data 30 days
 * Day 34: trial_data_retention_until passed → delete data permanently
 */
export async function processTrialExpiry(): Promise<void> {
  // Day 4: Remove container for trial users who never paid
  const toRemove = await db.getMany<User>(
    `SELECT * FROM users
     WHERE trial_ends_at < NOW()
       AND stripe_customer_id IS NULL
       AND server_id IS NOT NULL
       AND status NOT IN ('trial_expired', 'cancelled')`,
  );

  for (const user of toRemove) {
    try {
      await removeTrialContainer(user.id);
    } catch (err) {
      console.error(`[trialExpiry] Failed to remove trial container for ${user.id}:`, err);
    }
  }

  // Day 34: Delete data for trial_expired users past retention
  const toDelete = await db.getMany<User>(
    `SELECT * FROM users
     WHERE status = 'trial_expired'
       AND stripe_customer_id IS NULL
       AND (trial_data_retention_until IS NULL OR trial_data_retention_until <= NOW())
       AND server_id IS NOT NULL`,
  );

  for (const user of toDelete) {
    try {
      await deprovisionUser(user.id);
      console.log(`[trialExpiry] Deleted trial data for ${user.id}`);
    } catch (err) {
      console.error(`[trialExpiry] Failed to deprovision trial user ${user.id}:`, err);
    }
  }
}
