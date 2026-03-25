import fs from 'fs';
import path from 'path';
import { getLogsDir } from '../lib/platform';

const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_LOG_FILES = 5;

let openclawStream: fs.WriteStream | null = null;
let appStream: fs.WriteStream | null = null;
let logDir: string;

function ensureLogDir(): void {
  if (!logDir) logDir = getLogsDir();
  fs.mkdirSync(logDir, { recursive: true });
}

function rotateIfNeeded(filePath: string): void {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size < MAX_LOG_SIZE) return;
  } catch {
    return; // file doesn't exist yet
  }

  for (let i = MAX_LOG_FILES - 1; i >= 1; i--) {
    const older = `${filePath}.${i}`;
    const newer = i === 1 ? filePath : `${filePath}.${i - 1}`;
    try { fs.renameSync(newer, older); } catch { /* ok */ }
  }
}

function getStream(type: 'openclaw' | 'app'): fs.WriteStream {
  ensureLogDir();
  const filePath = path.join(logDir, `${type}.log`);

  if (type === 'openclaw') {
    if (!openclawStream || openclawStream.destroyed) {
      rotateIfNeeded(filePath);
      openclawStream = fs.createWriteStream(filePath, { flags: 'a' });
    }
    return openclawStream;
  }

  if (!appStream || appStream.destroyed) {
    rotateIfNeeded(filePath);
    appStream = fs.createWriteStream(filePath, { flags: 'a' });
  }
  return appStream;
}

function ts(): string {
  return new Date().toISOString();
}

export function logOpenclaw(data: string): void {
  const lines = data.split('\n').filter(Boolean);
  const stream = getStream('openclaw');
  for (const line of lines) {
    stream.write(`[${ts()}] ${line}\n`);
  }
}

export function logApp(level: 'info' | 'warn' | 'error', message: string, details?: string): void {
  const stream = getStream('app');
  stream.write(`[${ts()}] [${level.toUpperCase()}] ${message}\n`);
  if (details) stream.write(`  ${details}\n`);
  if (level === 'error') console.error(`[app] ${message}`, details || '');
  else console.log(`[app] ${message}`);
}

/** Read the last N lines from the openclaw log for display in the UI. */
export function readRecentLogs(maxLines = 200): string {
  ensureLogDir();
  const filePath = path.join(logDir, 'openclaw.log');
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    return lines.slice(-maxLines).join('\n');
  } catch {
    return '(No logs yet)';
  }
}

export function getLogFilePath(): string {
  ensureLogDir();
  return path.join(logDir, 'openclaw.log');
}

/** Main-process / Valnaa diagnostics (PTY, startup, IPC errors). */
export function getAppLogPath(): string {
  ensureLogDir();
  return path.join(logDir, 'app.log');
}

export function closeStreams(): void {
  openclawStream?.end();
  appStream?.end();
  openclawStream = null;
  appStream = null;
}
