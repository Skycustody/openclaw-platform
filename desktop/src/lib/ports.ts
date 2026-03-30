import net from 'net';
import http from 'http';
import { execSync } from 'child_process';
import { logApp } from '../openclaw/logger';

const DEFAULT_PORT = 18789;
const DEFAULT_RELAY_OFFSET = 3;
const MAX_PORT_ATTEMPTS = 10;

/** Check if a TCP port is available. */
export function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => {
      srv.close(() => resolve(true));
    });
    srv.listen(port, '127.0.0.1');
  });
}

/** Synchronous port-free check (for use in non-async contexts). */
export function isPortFreeSync(port: number): boolean {
  try {
    if (process.platform === 'win32') {
      const out = execSync(
        `powershell -Command "Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue"`,
        { encoding: 'utf-8', timeout: 5000, stdio: 'pipe', windowsHide: true },
      );
      return !out.includes('Listen');
    }
    execSync(`lsof -i :${port} -sTCP:LISTEN -t 2>/dev/null`, {
      encoding: 'utf-8', timeout: 5000, stdio: 'pipe',
    });
    return false;
  } catch {
    return true;
  }
}

/**
 * Identify the process name holding a port (macOS/Linux only).
 * Returns empty string if nothing found or on Windows.
 */
function getProcessNameOnPort(port: number): string {
  if (process.platform === 'win32') return '';
  try {
    return execSync(`lsof -i :${port} -sTCP:LISTEN -Fc 2>/dev/null | grep '^c' | head -1`, {
      encoding: 'utf-8', timeout: 5000, stdio: 'pipe',
    }).replace(/^c/, '').trim();
  } catch {
    return '';
  }
}

/**
 * Stop Docker containers whose published port mappings include the given port.
 * Uses `docker ps` to find them and `docker stop + rm` to release the port
 * without killing Docker's engine process.
 * Works on macOS, Linux, and Windows (Docker Desktop).
 */
const PROTECTED_CONTAINERS = ['openshell-cli'];

function stopDockerContainerOnPort(port: number): boolean {
  try {
    const fmt = process.platform === 'win32'
      ? '{{.ID}} {{.Names}} {{.Ports}}'
      : "'{{.ID}} {{.Names}} {{.Ports}}'";
    const out = execSync(
      `docker ps --format ${fmt}`,
      { encoding: 'utf-8', timeout: 10000, stdio: 'pipe', windowsHide: true },
    );
    const pattern = new RegExp(`0\\.0\\.0\\.0:${port}->`);
    for (const line of out.split('\n')) {
      if (pattern.test(line)) {
        const parts = line.split(' ');
        const cid = parts[0];
        const name = parts[1] || '';

        if (PROTECTED_CONTAINERS.includes(name)) {
          logApp('info', `Port ${port} held by protected container "${name}" — skipping destruction`);
          return false;
        }

        logApp('info', `Stopping Docker container ${cid} (${name}) that holds port ${port}`);
        try { execSync(`docker stop ${cid}`, { timeout: 15000, stdio: 'pipe', windowsHide: true }); } catch { /* ok */ }
        try { execSync(`docker rm -f ${cid}`, { timeout: 10000, stdio: 'pipe', windowsHide: true }); } catch { /* ok */ }
        return true;
      }
    }
  } catch (err: any) {
    logApp('warn', `stopDockerContainerOnPort(${port}): ${err.message}`);
  }
  return false;
}

/**
 * Attempt to free a port so it can be reused.
 *
 * IMPORTANT: On macOS, Docker's `com.docker.backend` process listens on
 * published container ports.  Killing it with SIGKILL would crash the
 * entire Docker engine.  Instead we detect Docker-owned ports and stop
 * the container that mapped them.
 */
export function freePort(port: number): boolean {
  if (isPortFreeSync(port)) return true;

  logApp('info', `Attempting to free port ${port}...`);

  if (process.platform === 'win32') {
    try {
      execSync(
        `powershell -Command "Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"`,
        { timeout: 8000, stdio: 'pipe', windowsHide: true },
      );
    } catch (err: any) {
      logApp('warn', `freePort(${port}) win32: ${err.message}`);
    }
  } else {
    const procName = getProcessNameOnPort(port);
    const isDocker = /^com\.docker|^docker-proxy|^Docker/i.test(procName);

    if (isDocker) {
      logApp('info', `Port ${port} held by Docker process "${procName}" — stopping container instead of killing`);
      stopDockerContainerOnPort(port);
    } else {
      try {
        execSync(`lsof -ti :${port} | xargs kill -9 2>/dev/null || true`, {
          timeout: 8000, stdio: 'pipe',
        });
      } catch (err: any) {
        logApp('warn', `freePort(${port}): ${err.message}`);
      }
    }
  }

  // Brief pause for the OS to release the port.
  // Use a Node-compatible sleep that works on all platforms.
  try { execSync(
    process.platform === 'win32' ? 'ping -n 1 127.0.0.1 >nul' : 'sleep 0.5',
    { stdio: 'pipe', timeout: 2000, windowsHide: true },
  ); } catch { /* ok */ }

  const freed = isPortFreeSync(port);
  logApp('info', `Port ${port} ${freed ? 'is now free' : 'could not be freed'}`);
  return freed;
}

/**
 * Free a pair of ports (gateway + relay). Returns true if both are free.
 */
export function freePorts(gateway: number, relay: number): boolean {
  const a = freePort(gateway);
  const b = freePort(relay);
  return a && b;
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

export interface PortPairResult {
  gateway: number;
  relay: number;
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

/**
 * Find an available gateway+relay port pair.
 * Tries to free the default pair first. If that fails, scans upward.
 * The relay port is always gateway + RELAY_OFFSET (3).
 */
export function findAvailablePortPairSync(preferFree = true): PortPairResult {
  const defaultGateway = DEFAULT_PORT;
  const defaultRelay = DEFAULT_PORT + DEFAULT_RELAY_OFFSET;

  if (preferFree) {
    freePorts(defaultGateway, defaultRelay);
  }

  if (isPortFreeSync(defaultGateway) && isPortFreeSync(defaultRelay)) {
    return { gateway: defaultGateway, relay: defaultRelay };
  }

  for (let i = 1; i <= MAX_PORT_ATTEMPTS; i++) {
    const gw = DEFAULT_PORT + i;
    const rl = gw + DEFAULT_RELAY_OFFSET;
    if (isPortFreeSync(gw) && isPortFreeSync(rl)) {
      logApp('info', `Default ports busy; using alternative pair ${gw}/${rl}`);
      return { gateway: gw, relay: rl };
    }
  }

  logApp('warn', `No free port pair found in range ${DEFAULT_PORT}-${DEFAULT_PORT + MAX_PORT_ATTEMPTS}; falling back to defaults`);
  return { gateway: defaultGateway, relay: defaultRelay };
}

export { DEFAULT_PORT, DEFAULT_RELAY_OFFSET };
