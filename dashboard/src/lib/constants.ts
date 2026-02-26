/**
 * Statuses that allow access to the dashboard.
 * Single source of truth — used by layout, auth, and pricing redirects.
 */
export const DASHBOARD_ALLOWED_STATUSES = ['active', 'sleeping', 'grace_period', 'provisioning', 'starting'] as const;
