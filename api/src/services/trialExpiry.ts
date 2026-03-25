import db from '../lib/db';
import { User } from '../types';
import { deprovisionUser, removeTrialContainer } from './provisioning';
import { sendTrialReminder } from './email';

/**
 * Trial expiry flow:
 * Day 2: Send "trial ends tomorrow" email
 * Day 3: Send "last day" email
 * Day 4: Remove container, send "data saved for 30 days" email
 * Day 34: Delete data permanently
 */
export async function processTrialExpiry(): Promise<void> {
  await sendTrialReminders();

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
      await sendTrialReminder(user.email, -1).catch(() => {});
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

/**
 * Send reminder emails to trial users approaching expiry.
 * Uses trial_reminder_sent to avoid duplicate emails.
 */
async function sendTrialReminders(): Promise<void> {
  // Day 2 of trial (1 day left): trial ends tomorrow
  const oneDayLeft = await db.getMany<User>(
    `SELECT * FROM users
     WHERE trial_ends_at BETWEEN NOW() AND NOW() + INTERVAL '1 day'
       AND stripe_customer_id IS NULL
       AND status NOT IN ('trial_expired', 'cancelled')
       AND (trial_reminder_sent IS NULL OR trial_reminder_sent < 1)`,
  );

  for (const user of oneDayLeft) {
    const sent = await sendTrialReminder(user.email, 1);
    if (sent) {
      await db.query('UPDATE users SET trial_reminder_sent = 1 WHERE id = $1', [user.id]);
    }
  }

  // Day 3 of trial (last day): today is your last day
  const lastDay = await db.getMany<User>(
    `SELECT * FROM users
     WHERE trial_ends_at BETWEEN NOW() - INTERVAL '1 hour' AND NOW() + INTERVAL '1 hour'
       AND stripe_customer_id IS NULL
       AND status NOT IN ('trial_expired', 'cancelled')
       AND (trial_reminder_sent IS NULL OR trial_reminder_sent < 2)`,
  );

  for (const user of lastDay) {
    const sent = await sendTrialReminder(user.email, 0);
    if (sent) {
      await db.query('UPDATE users SET trial_reminder_sent = 2 WHERE id = $1', [user.id]);
    }
  }
}
