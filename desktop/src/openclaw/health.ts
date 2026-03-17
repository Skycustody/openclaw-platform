import http from 'http';

export type HealthStatus = 'starting' | 'healthy' | 'unhealthy' | 'stopped';

const POLL_INTERVAL_MS = 5000;
const UNHEALTHY_THRESHOLD_MS = 30000;

let pollTimer: ReturnType<typeof setInterval> | null = null;
let currentStatus: HealthStatus = 'stopped';
let unhealthySince: number | null = null;

type StatusCallback = (status: HealthStatus) => void;

function checkHealth(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}`, { timeout: 3000 }, (res) => {
      resolve(res.statusCode !== undefined);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * Start polling the gateway for health status.
 * Calls onStatus whenever the status changes.
 * Returns a function to trigger auto-restart when unhealthy too long.
 */
export function startHealthPolling(
  port: number,
  onStatus: StatusCallback,
  onUnhealthyTooLong: () => void,
): void {
  stopHealthPolling();
  currentStatus = 'starting';
  unhealthySince = null;
  onStatus(currentStatus);

  pollTimer = setInterval(async () => {
    const ok = await checkHealth(port);
    const prev = currentStatus;

    if (ok) {
      currentStatus = 'healthy';
      unhealthySince = null;
    } else if (currentStatus === 'healthy') {
      currentStatus = 'unhealthy';
      unhealthySince = Date.now();
    } else if (currentStatus === 'starting') {
      // stay in starting until first healthy
    } else if (currentStatus === 'unhealthy' && unhealthySince) {
      if (Date.now() - unhealthySince > UNHEALTHY_THRESHOLD_MS) {
        onUnhealthyTooLong();
        unhealthySince = Date.now(); // reset to avoid rapid restarts
      }
    }

    if (currentStatus !== prev) {
      onStatus(currentStatus);
    }
  }, POLL_INTERVAL_MS);
}

export function stopHealthPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  currentStatus = 'stopped';
  unhealthySince = null;
}

export function getHealthStatus(): HealthStatus {
  return currentStatus;
}
