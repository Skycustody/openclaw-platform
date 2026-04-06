import { execFile, spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { IS_WIN, getNpmGlobalPrefix, getNpmGlobalBin } from '../lib/platform';
import { classifyInstallError } from '../lib/errors';
import { logApp, logOpenclaw } from './logger';
import { findNemoClawBinary, getNemoClawInstallCommand, getNemoClawSetupCommand } from '../lib/runtime';

/** Check if Node.js is available on the system. */
export function isNodeInstalled(): boolean {
  try {
    const { execSync } = require('child_process');
    const ver = execSync('node --version', { encoding: 'utf-8', timeout: 5000 }).trim();
    logApp('info', `Node.js found: ${ver}`);
    return true;
  } catch {
    return false;
  }
}

/** Get the install command for the official OpenClaw install script (skips onboard since we do it separately). */
export function getInstallScriptCommand(): string {
  if (IS_WIN) {
    // Use powershell.exe with .exe extension — some Windows configs don't
    // resolve bare 'powershell' when Electron has an incomplete PATH.
    return 'powershell.exe -ExecutionPolicy Bypass -Command "& ([scriptblock]::Create((iwr -useb https://openclaw.ai/install.ps1))) -NoOnboard"';
  }
  return 'curl -fsSL https://openclaw.ai/install.sh | bash -s -- --no-onboard';
}

/**
 * NemoClaw install script: installs nemoclaw CLI, OpenClaw, Node.js if needed,
 * then runs the guided setup wizard (sandbox + inference + security).
 * After exit 0 the sandbox is running.
 */
export function getNemoClawInstallScriptCommand(): string {
  return getNemoClawInstallCommand();
}

/**
 * For existing nemoclaw installations that need to re-run setup
 * (e.g. sandbox deleted, fresh Docker).
 */
export function getNemoClawSetupScriptCommand(): string {
  return getNemoClawSetupCommand();
}

/** Locate the openclaw binary on disk. Returns full path or null. */
export function findOpenClawBinary(): string | null {
  const cmd = IS_WIN ? 'where' : 'which';
  try {
    const { execSync } = require('child_process');
    const result = execSync(`${cmd} openclaw`, { encoding: 'utf-8', timeout: 5000 }).trim();
    if (result) return result.split('\n')[0].trim();
  } catch { /* not found */ }

  const globalBin = getNpmGlobalBin();
  const candidates: string[] = [
    path.join(globalBin, IS_WIN ? 'openclaw.cmd' : 'openclaw'),
    path.join(os.homedir(), '.local', 'bin', IS_WIN ? 'openclaw.cmd' : 'openclaw'),
  ];
  if (!IS_WIN) {
    candidates.push('/opt/homebrew/bin/openclaw', '/usr/local/bin/openclaw');
  }
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch { /* ok */ }
  }

  return null;
}

export { findNemoClawBinary };

/** Get installed openclaw version, or null. */
export function getInstalledVersion(): string | null {
  const bin = findOpenClawBinary();
  if (!bin) return null;
  try {
    const { execSync } = require('child_process');
    const ver = execSync(`"${bin}" --version`, { encoding: 'utf-8', timeout: 10000 }).trim();
    return ver || null;
  } catch {
    return null;
  }
}

export interface InstallProgress {
  stage: 'checking' | 'downloading' | 'installing' | 'done' | 'error';
  message: string;
  details?: string;
}

type ProgressCallback = (progress: InstallProgress) => void;

/**
 * Install openclaw using the official install script.
 * The script auto-installs Node.js if missing, then installs OpenClaw via npm.
 */
export async function installOpenClaw(onProgress: ProgressCallback): Promise<string> {
  onProgress({ stage: 'checking', message: 'Checking for existing installation...' });

  const existing = findOpenClawBinary();
  if (existing) {
    logApp('info', `OpenClaw already installed at ${existing}`);
    onProgress({ stage: 'done', message: 'OpenClaw is already installed.' });
    return existing;
  }

  const cmd = getInstallScriptCommand();
  onProgress({ stage: 'downloading', message: 'Installing OpenClaw (includes Node.js if needed)... This may take a few minutes.' });
  logApp('info', `Running official install script: ${cmd}`);

  return new Promise((resolve, reject) => {
    let shellName: string;
    let shellArgs: string[];
    if (IS_WIN) {
      const windir = process.env.SystemRoot || 'C:\\Windows';
      shellName = `${windir}\\System32\\cmd.exe`;
      shellArgs = ['/c', cmd];
    } else {
      shellName = 'bash';
      shellArgs = ['-c', cmd];
    }

    // On Windows, Electron may not inherit the full system PATH — ensure
    // critical dirs (System32, PowerShell) are present so the install script
    // can find powershell.exe and network utilities.
    const envPath = process.env.PATH || '';
    let fullPath = envPath;
    if (IS_WIN) {
      const windir = process.env.SystemRoot || 'C:\\Windows';
      const requiredDirs = [
        `${windir}\\System32`,
        `${windir}\\System32\\WindowsPowerShell\\v1.0`,
        `${windir}\\System32\\Wbem`,
        windir,
      ];
      for (const dir of requiredDirs) {
        if (!fullPath.toLowerCase().includes(dir.toLowerCase())) {
          fullPath = `${fullPath};${dir}`;
        }
      }
    }

    const proc = spawn(shellName, shellArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PATH: fullPath },
      shell: false,
    });

    let stderr = '';

    proc.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      logOpenclaw(text);
      if (text.includes('Node.js')) {
        onProgress({ stage: 'installing', message: 'Installing Node.js...' });
      } else if (text.includes('openclaw')) {
        onProgress({ stage: 'installing', message: 'Installing OpenClaw...' });
      } else if (text.includes('added') || text.includes('installed')) {
        onProgress({ stage: 'installing', message: 'Finalizing installation...' });
      }
    });

    proc.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      stderr += text;
      logOpenclaw(text);
    });

    proc.on('close', (code) => {
      if (code === 0) {
        const bin = findOpenClawBinary();
        if (bin) {
          logApp('info', `OpenClaw installed at ${bin}`);
          onProgress({ stage: 'done', message: 'OpenClaw installed successfully!' });
          resolve(bin);
        } else {
          const err = classifyInstallError('Install script succeeded but binary not found in PATH');
          onProgress({ stage: 'error', message: err.userMessage, details: err.details });
          reject(err);
        }
      } else {
        const err = classifyInstallError(stderr);
        logApp('error', 'OpenClaw installation failed', stderr);
        onProgress({ stage: 'error', message: err.userMessage, details: err.details });
        reject(err);
      }
    });

    proc.on('error', (err) => {
      const appErr = classifyInstallError(err.message);
      logApp('error', 'Install script spawn error', err.message);
      onProgress({ stage: 'error', message: appErr.userMessage, details: appErr.details });
      reject(appErr);
    });
  });
}
