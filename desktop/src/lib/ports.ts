import net from 'net';
import http from 'http';

const DEFAULT_PORT = 18789;
const MAX_PORT_ATTEMPTS = 10;

/** Check if a TCP port is available. */
function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => {
      srv.close(() => resolve(true));
    });
    srv.listen(port, '127.0.0.1');
  });
}

/** Check if an existing OpenClaw gateway is responding on a port. */
function isOpenClawRunning(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}`, { timeout: 2000 }, (res) => {
      resolve(res.statusCode !== undefined);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

export interface PortResult {
  port: number;
  /** true if we found an existing OpenClaw instance to reuse */
  reused: boolean;
}

/**
 * Find an available port for the OpenClaw gateway.
 * Checks 18789 first; if busy, checks if it's an existing OpenClaw instance (reuse it).
 * Otherwise scans upward for a free port.
 */
export async function findAvailablePort(): Promise<PortResult> {
  if (await isPortFree(DEFAULT_PORT)) {
    return { port: DEFAULT_PORT, reused: false };
  }

  if (await isOpenClawRunning(DEFAULT_PORT)) {
    return { port: DEFAULT_PORT, reused: true };
  }

  for (let i = 1; i <= MAX_PORT_ATTEMPTS; i++) {
    const candidate = DEFAULT_PORT + i;
    if (await isPortFree(candidate)) {
      return { port: candidate, reused: false };
    }
  }

  throw new Error(
    `All ports ${DEFAULT_PORT}-${DEFAULT_PORT + MAX_PORT_ATTEMPTS} are in use. Close other applications and try again.`,
  );
}
