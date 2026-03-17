import fs from 'fs';
import path from 'path';
import { getAppDataDir, IS_WIN } from './platform';

export type RuntimeType = 'openclaw' | 'nemoclaw';

export interface RuntimePreference {
  runtime: RuntimeType;
  savedAt: number;
}

const CONFIG_PATH = path.join(getAppDataDir(), 'runtime.json');

export function loadRuntime(): RuntimePreference | null {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const data = JSON.parse(raw);
    if (data.runtime === 'openclaw' || data.runtime === 'nemoclaw') {
      return data as RuntimePreference;
    }
  } catch { /* no config yet */ }
  return null;
}

export function saveRuntime(runtime: RuntimeType): void {
  const dir = path.dirname(CONFIG_PATH);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify({ runtime, savedAt: Date.now() } satisfies RuntimePreference));
}

export function clearRuntime(): void {
  try { fs.unlinkSync(CONFIG_PATH); } catch { /* ok */ }
}

export function isNemoClawSupported(): boolean {
  return true;
}

export function isDockerInstalled(): boolean {
  try {
    const { execSync } = require('child_process');
    execSync('docker --version', { encoding: 'utf-8', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

export function isDockerRunning(): boolean {
  try {
    const { execSync } = require('child_process');
    execSync('docker info', { encoding: 'utf-8', timeout: 10000, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

export function findNemoClawBinary(): string | null {
  if (IS_WIN) {
    try {
      const { execSync } = require('child_process');
      const result = execSync('wsl which nemoclaw', { encoding: 'utf-8', timeout: 5000 }).trim();
      if (result) return 'wsl';
    } catch { /* not in WSL */ }
    return null;
  }
  try {
    const { execSync } = require('child_process');
    const result = execSync('which nemoclaw', { encoding: 'utf-8', timeout: 5000 }).trim();
    if (result) return result.split('\n')[0].trim();
  } catch { /* not found */ }
  return null;
}

/**
 * The NemoClaw install script handles everything:
 * 1. Installs Node.js if missing
 * 2. Installs OpenClaw + NemoClaw CLI
 * 3. Runs the guided setup wizard (sandbox creation, inference config, security policies)
 * After this, the sandbox is running with the OpenClaw gateway inside.
 */
export function getNemoClawInstallCommand(): string {
  if (IS_WIN) {
    return 'wsl bash -c "curl -fsSL https://nvidia.com/nemoclaw.sh | bash"';
  }
  return 'curl -fsSL https://nvidia.com/nemoclaw.sh | bash';
}

/**
 * For users who already have NemoClaw installed but need to re-run setup
 * (e.g. sandbox was deleted, first time after manual install).
 */
export function getNemoClawSetupCommand(): string {
  if (IS_WIN) {
    return 'wsl nemoclaw setup';
  }
  return 'nemoclaw setup';
}

export interface NemoClawSandboxStatus {
  running: boolean;
  port: number | null;
}

const DEFAULT_NEMOCLAW_PORT = 18789;

/**
 * Check if the NemoClaw sandbox is running by querying `nemoclaw status`.
 * Falls back to checking Docker directly.
 */
export function getNemoClawSandboxStatus(): NemoClawSandboxStatus {
  const prefix = IS_WIN ? 'wsl ' : '';

  try {
    const { execSync } = require('child_process');
    const out = execSync(`${prefix}nemoclaw status`, {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: 'pipe',
    });
    const running = /running|active|up/i.test(out);
    return { running, port: running ? DEFAULT_NEMOCLAW_PORT : null };
  } catch { /* nemoclaw status failed */ }

  try {
    const { execSync } = require('child_process');
    const out = execSync(`${prefix}docker ps --filter "name=openclaw" --format "{{.Ports}}"`, {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: 'pipe',
    });
    if (out.trim()) {
      const portMatch = out.match(/0\.0\.0\.0:(\d+)/);
      const port = portMatch ? parseInt(portMatch[1], 10) : DEFAULT_NEMOCLAW_PORT;
      return { running: true, port };
    }
  } catch { /* docker query failed */ }

  return { running: false, port: null };
}

/**
 * Check if NemoClaw setup has been completed (sandbox exists).
 */
export function nemoClawNeedsSetup(): boolean {
  const nemoBin = findNemoClawBinary();
  if (!nemoBin) return true;

  const prefix = IS_WIN ? 'wsl ' : '';
  try {
    const { execSync } = require('child_process');
    const out = execSync(`${prefix}nemoclaw status`, {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: 'pipe',
    });
    return /no sandbox|not found|not configured/i.test(out);
  } catch {
    return true;
  }
}
