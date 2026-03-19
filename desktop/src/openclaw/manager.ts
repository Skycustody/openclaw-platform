import { ChildProcess, spawn } from 'child_process';
import { EventEmitter } from 'events';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { IS_WIN, getOpenClawDir } from '../lib/platform';
import { classifyProcessError } from '../lib/errors';
import { logApp, logOpenclaw } from './logger';
import { findOpenClawBinary, findNemoClawBinary } from './installer';
import { startHealthPolling, stopHealthPolling, HealthStatus } from './health';
import { findAvailablePort, PortResult } from '../lib/ports';
import { loadRuntime, RuntimeType, isSandboxReady, ensurePortForward, OPENCLAW_PORT } from '../lib/runtime';

function checkPortReady(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}`, { timeout: 2000 }, (res) => {
      resolve(res.statusCode !== undefined);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

export type AgentState = 'stopped' | 'starting' | 'running' | 'stopping' | 'crashed' | 'installing';

export interface AgentStatus {
  state: AgentState;
  port: number | null;
  health: HealthStatus;
  pid: number | null;
  error: string | null;
  errorDetails: string | null;
  reused: boolean;
  gatewayToken: string | null;
  runtime: RuntimeType;
}

function readGatewayToken(): string | null {
  try {
    const cfgPath = path.join(getOpenClawDir(), 'openclaw.json');
    const raw = fs.readFileSync(cfgPath, 'utf-8');
    const cfg = JSON.parse(raw);
    return cfg?.gateway?.auth?.token || null;
  } catch {
    return null;
  }
}

const MAX_RESTART_ATTEMPTS = 3;
const RESTART_BACKOFF_MS = [2000, 5000, 10000];
const STARTUP_TIMEOUT_MS = 30000;

class OpenClawManager extends EventEmitter {
  private proc: ChildProcess | null = null;
  private state: AgentState = 'stopped';
  private port: number | null = null;
  private health: HealthStatus = 'stopped';
  private restartCount = 0;
  private startupTimer: ReturnType<typeof setTimeout> | null = null;
  private readinessPoll: ReturnType<typeof setInterval> | null = null;
  private stderrBuffer = '';
  private reused = false;
  private lastError: string | null = null;
  private lastErrorDetails: string | null = null;

  getStatus(): AgentStatus {
    const pref = loadRuntime();
    return {
      state: this.state,
      port: this.port,
      health: this.health,
      pid: this.proc?.pid ?? null,
      error: this.lastError,
      errorDetails: this.lastErrorDetails,
      reused: this.reused,
      gatewayToken: readGatewayToken(),
      runtime: pref?.runtime || 'openclaw',
    };
  }

  async start(): Promise<void> {
    if (this.state === 'running' || this.state === 'starting') return;

    this.lastError = null;
    this.lastErrorDetails = null;
    this.reused = false;

    const pref = loadRuntime();
    const runtime = pref?.runtime || 'openclaw';

    if (runtime === 'nemoclaw') {
      const nemoBin = findNemoClawBinary();
      if (!nemoBin) {
        this.setState('installing');
        this.lastError = 'NemoClaw is not installed. Installing...';
        this.emitStatus();
        return;
      }
      this.restartCount = 0;
      this.connectToNemoClawSandbox();
      return;
    }

    // OpenClaw flow: allocate port and spawn gateway
    let portResult: PortResult;
    try {
      portResult = await findAvailablePort();
    } catch (err: any) {
      this.setState('crashed');
      this.lastError = err.message;
      return;
    }

    this.port = portResult.port;

    if (portResult.reused) {
      logApp('info', `Reusing existing gateway on port ${this.port}`);
      this.reused = true;
      this.setState('running');
      this.startHealthCheck();
      return;
    }

    const bin = findOpenClawBinary();
    if (!bin) {
      this.setState('installing');
      this.lastError = 'OpenClaw is not installed. Installing...';
      this.emitStatus();
      return;
    }
    this.restartCount = 0;
    this.spawnProcess(bin);
  }

  private spawnProcess(bin: string): void {
    this.setState('starting');
    this.stderrBuffer = '';

    logApp('info', `Starting OpenClaw: ${bin} gateway --port ${this.port}`);

    const args = ['gateway', '--port', String(this.port), '--bind', 'loopback', '--allow-unconfigured', 'run'];

    this.proc = spawn(bin, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
      shell: IS_WIN,
      windowsHide: true,
    });

    this.proc.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      logOpenclaw(text);
      if (this.state === 'starting' && (text.includes('listening') || text.includes('ready') || text.includes('[gateway]'))) {
        this.onGatewayReady();
      }
    });

    this.proc.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      this.stderrBuffer += text;
      logOpenclaw(text);
    });

    // Fallback: poll HTTP port in case stdout readiness message is missed
    this.readinessPoll = setInterval(async () => {
      if (this.state !== 'starting' || !this.port) return;
      if (await checkPortReady(this.port)) {
        this.clearReadinessPoll();
        this.onGatewayReady();
      }
    }, 500);

    this.proc.on('close', (code, signal) => {
      this.clearStartupTimer();
      this.clearReadinessPoll();
      stopHealthPolling();

      if (this.state === 'stopping') {
        logApp('info', 'OpenClaw stopped gracefully');
        this.setState('stopped');
        return;
      }

      const err = classifyProcessError(code, signal, this.stderrBuffer);
      logApp('error', err.userMessage, err.details);
      this.lastError = err.userMessage;
      this.lastErrorDetails = err.details;

      if (this.restartCount < MAX_RESTART_ATTEMPTS && err.recoverable) {
        const delay = RESTART_BACKOFF_MS[this.restartCount] || 10000;
        this.restartCount++;
        logApp('warn', `Auto-restart attempt ${this.restartCount}/${MAX_RESTART_ATTEMPTS} in ${delay}ms`);
        this.setState('starting');
        setTimeout(async () => {
          // If port is already responding (e.g. gateway from prior run), reuse it instead of spawning
          if (this.port && (await checkPortReady(this.port))) {
            logApp('info', `Reusing existing gateway on port ${this.port}`);
            this.reused = true;
            this.restartCount = 0;
            this.onGatewayReady();
            return;
          }
          const b = findOpenClawBinary();
          if (b) this.spawnProcess(b);
          else this.setState('crashed');
        }, delay);
      } else {
        this.setState('crashed');
      }
    });

    this.proc.on('error', (err) => {
      logApp('error', 'Failed to spawn OpenClaw process', err.message);
      this.lastError = 'Failed to start OpenClaw process.';
      this.lastErrorDetails = err.message;
      this.setState('crashed');
    });

    this.startupTimer = setTimeout(() => {
      if (this.state === 'starting') {
        logApp('warn', 'Startup timeout — OpenClaw did not become ready in time');
        this.lastError = 'OpenClaw took too long to start. Check the logs.';
        this.stop();
        this.setState('crashed');
      }
    }, STARTUP_TIMEOUT_MS);
  }

  /**
   * NemoClaw runs OpenClaw inside a Docker sandbox managed by OpenShell.
   * The OpenClaw gateway runs on port 18789 inside the sandbox, forwarded
   * to localhost via `openshell forward`.
   */
  private connectToNemoClawSandbox(): void {
    this.setState('starting');
    logApp('info', 'Connecting to NemoClaw sandbox...');

    const { execSync } = require('child_process');
    const GATEWAY_CONTAINER = 'openshell-cluster-nemoclaw';

    // 1. Ensure the gateway cluster container is running
    try {
      const state = execSync(
        `docker inspect ${GATEWAY_CONTAINER} --format "{{.State.Status}}"`,
        { encoding: 'utf-8', timeout: 5000, stdio: 'pipe' }
      ).trim();
      if (state !== 'running') {
        execSync(`docker start ${GATEWAY_CONTAINER}`, { timeout: 15000, stdio: 'pipe' });
        logApp('info', 'Started gateway container');
      }
    } catch {
      this.lastError = 'NemoClaw gateway container not found. Run setup again.';
      this.setState('crashed');
      return;
    }

    // 2. Check that the sandbox exists
    if (!isSandboxReady()) {
      this.lastError = 'NemoClaw sandbox not found. Run setup again.';
      this.setState('crashed');
      return;
    }

    // 3. Ensure port forward is active
    ensurePortForward();

    // 4. Poll for the OpenClaw gateway on port 18789
    this.port = OPENCLAW_PORT;
    logApp('info', `Waiting for OpenClaw gateway on port ${OPENCLAW_PORT}...`);

    // Use a longer timeout — the sandbox may take time to start up after reboot
    const SANDBOX_CONNECT_TIMEOUT = 60000;

    this.readinessPoll = setInterval(async () => {
      if (this.state !== 'starting' || !this.port) return;
      if (await checkPortReady(this.port)) {
        this.clearReadinessPoll();
        this.onGatewayReady();
      }
    }, 2000);

    this.startupTimer = setTimeout(() => {
      if (this.state === 'starting') {
        this.clearReadinessPoll();
        ensurePortForward();
        logApp('warn', `OpenClaw gateway not responding on port ${OPENCLAW_PORT} after ${SANDBOX_CONNECT_TIMEOUT}ms`);
        this.lastError = 'OpenClaw gateway inside sandbox is not responding. The sandbox may still be starting up — try again in a moment.';
        this.setState('crashed');
      }
    }, SANDBOX_CONNECT_TIMEOUT);
  }

  private onGatewayReady(): void {
    this.clearStartupTimer();
    this.clearReadinessPoll();
    this.restartCount = 0;
    this.setState('running');
    this.startHealthCheck();
    logApp('info', `OpenClaw gateway ready on port ${this.port}`);
  }

  private startHealthCheck(): void {
    startHealthPolling(
      this.port!,
      (status) => {
        this.health = status;
        this.emitStatus();
      },
      () => {
        logApp('warn', 'OpenClaw unhealthy for too long — restarting');
        this.stop();
        this.start();
      },
    );
  }

  async stop(): Promise<void> {
    this.clearStartupTimer();
    this.clearReadinessPoll();
    stopHealthPolling();

    if (!this.proc || this.proc.killed) {
      this.setState('stopped');
      return;
    }

    this.setState('stopping');
    logApp('info', `Stopping OpenClaw (PID ${this.proc.pid})`);

    this.proc.kill('SIGTERM');

    await new Promise<void>((resolve) => {
      const forceKill = setTimeout(() => {
        if (this.proc && !this.proc.killed) {
          logApp('warn', 'Force-killing OpenClaw (SIGKILL)');
          this.proc.kill('SIGKILL');
        }
        resolve();
      }, 5000);

      this.proc!.once('close', () => {
        clearTimeout(forceKill);
        resolve();
      });
    });

    this.proc = null;
    this.setState('stopped');
  }

  async restart(): Promise<void> {
    await this.stop();
    this.restartCount = 0;
    await this.start();
  }

  /** Called after installer finishes — start the process with the new binary. */
  async onInstallComplete(binPath: string): Promise<void> {
    this.port = this.port || 18789;
    this.restartCount = 0;
    this.spawnProcess(binPath);
  }

  private setState(s: AgentState): void {
    this.state = s;
    this.emitStatus();
  }

  private emitStatus(): void {
    this.emit('status', this.getStatus());
  }

  private clearStartupTimer(): void {
    if (this.startupTimer) {
      clearTimeout(this.startupTimer);
      this.startupTimer = null;
    }
  }

  private clearReadinessPoll(): void {
    if (this.readinessPoll) {
      clearInterval(this.readinessPoll);
      this.readinessPoll = null;
    }
  }
}

export const manager = new OpenClawManager();
