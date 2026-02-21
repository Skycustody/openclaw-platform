import db from '../lib/db';
import { User } from '../types';
import { sleepContainer } from './sleepWake';
import { deprovisionUser } from './provisioning';
import { sendTokenAlert } from './email';

/**
 * Grace period flow for failed payments:
 * Day 0: Payment fails → warn user, agent keeps running
 * Day 1: Stripe auto-retries → if fails, second warning
 * Day 3: Stripe retries again → if fails, pause agent
 * Day 7: If still unpaid → cancel subscription, keep data 30 days
 * Day 37: If no renewal → delete container and data permanently
 */

export async function handlePaymentFailure(userId: string): Promise<void> {
  const user = await db.getOne<User>('SELECT * FROM users WHERE id = $1', [userId]);
  if (!user) return;

  const gracePeriodEnd = new Date();
  gracePeriodEnd.setDate(gracePeriodEnd.getDate() + 7);

  await db.query(
    `UPDATE users SET status = 'grace_period', grace_period_end = $1 WHERE id = $2`,
    [gracePeriodEnd, userId]
  );

  await sendTokenAlert(user.email, 'LOW_BALANCE',
    'Your payment failed. Please update your payment method to keep your agent running. ' +
    'Your agent will continue working for the next 3 days while we retry.'
  );
}

export async function processGracePeriods(): Promise<void> {
  // Day 3+: Pause agents that haven't paid
  const toPause = await db.getMany<User>(
    `SELECT * FROM users
     WHERE status = 'grace_period'
       AND grace_period_end <= NOW() + INTERVAL '4 days'
       AND grace_period_end > NOW()`,
  );

  for (const user of toPause) {
    try {
      await db.query("UPDATE users SET status = 'paused' WHERE id = $1", [user.id]);
      await sendTokenAlert(user.email, 'OUT_OF_TOKENS',
        'Your agent has been paused due to an unpaid balance. ' +
        'Update your payment method to resume.'
      );
    } catch (err) {
      console.error(`Failed to pause user ${user.id}:`, err);
    }
  }

  // Day 7+: Cancel subscriptions
  const toCancel = await db.getMany<User>(
    `SELECT * FROM users
     WHERE status IN ('grace_period', 'paused')
       AND grace_period_end <= NOW()`,
  );

  for (const user of toCancel) {
    try {
      await db.query(
        "UPDATE users SET status = 'cancelled' WHERE id = $1",
        [user.id]
      );
    } catch (err) {
      console.error(`Failed to cancel user ${user.id}:`, err);
    }
  }

  // Day 37+: Delete data permanently
  const toDelete = await db.getMany<User>(
    `SELECT * FROM users
     WHERE status = 'cancelled'
       AND grace_period_end <= NOW() - INTERVAL '30 days'
       AND server_id IS NOT NULL`,
  );

  for (const user of toDelete) {
    try {
      await deprovisionUser(user.id);
    } catch (err) {
      console.error(`Failed to deprovision user ${user.id}:`, err);
    }
  }
}
