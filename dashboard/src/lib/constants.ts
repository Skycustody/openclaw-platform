/**
 * Statuses that allow access to the dashboard.
 * Single source of truth — used by layout, auth, and pricing redirects.
 * 'pending' = trial users (3-day free trial with no credits)
 */
export const DASHBOARD_ALLOWED_STATUSES = ['active', 'sleeping', 'grace_period', 'provisioning', 'starting', 'pending', 'trial_expired'] as const;
