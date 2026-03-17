import path from 'path';
import os from 'os';

export const IS_MAC = process.platform === 'darwin';
export const IS_WIN = process.platform === 'win32';
export const IS_LINUX = process.platform === 'linux';
export const IS_DEV = !process.execPath.includes('app.asar');

/** ~/.openclaw-desktop/ — app data, logs, config */
export function getAppDataDir(): string {
  if (IS_WIN) {
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'openclaw-desktop');
  }
  return path.join(os.homedir(), '.openclaw-desktop');
}

export function getLogsDir(): string {
  return path.join(getAppDataDir(), 'logs');
}

/** The openclaw CLI stores config here */
export function getOpenClawDir(): string {
  return path.join(os.homedir(), '.openclaw');
}

export function getNpmGlobalPrefix(): string {
  if (IS_WIN) return path.join(os.homedir(), 'AppData', 'Roaming', 'npm');
  return path.join(os.homedir(), '.local');
}

export function getNpmGlobalBin(): string {
  if (IS_WIN) return getNpmGlobalPrefix();
  return path.join(getNpmGlobalPrefix(), 'bin');
}
