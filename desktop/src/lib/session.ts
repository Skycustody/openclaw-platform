import fs from 'fs';
import path from 'path';
import https from 'https';
import { getAppDataDir } from './platform';
import { logApp } from '../openclaw/logger';

const API_BASE = process.env.VALNAA_API_URL || 'https://api.valnaa.com';
const OFFLINE_GRACE_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface Session {
  token: string;
  email: string;
  savedAt: number;
  /** Timestamp of last successful subscription verification */
  lastVerifiedAt?: number;
}

export interface SubscriptionResult {
  ok: boolean;
  status: string;
  plan: string;
  desktopSubscription: boolean;
}

function getSessionPath(): string {
  return path.join(getAppDataDir(), 'session.json');
}

export function loadSession(): Session | null {
  try {
    const raw = fs.readFileSync(getSessionPath(), 'utf-8');
    const session: Session = JSON.parse(raw);
    if (!session.token || !session.email) return null;
    return session;
  } catch {
    return null;
  }
}

export function saveSession(token: string, email: string): void {
  const dir = getAppDataDir();
  fs.mkdirSync(dir, { recursive: true });
  const session: Session = { token, email, savedAt: Date.now() };
  fs.writeFileSync(getSessionPath(), JSON.stringify(session, null, 2), 'utf-8');
  logApp('info', `Session saved for ${email}`);
}

export function clearSession(): void {
  try {
    fs.unlinkSync(getSessionPath());
    logApp('info', 'Session cleared');
  } catch {}
}

function apiGet<T>(endpoint: string, token: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, API_BASE);
    const req = https.get(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 10000,
    }, (res) => {
      let body = '';
      res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      res.on('end', () => {
        if (res.statusCode === 401) {
          reject(new Error('unauthorized'));
          return;
        }
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`API error ${res.statusCode}: ${body}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error('Invalid JSON from API'));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('API timeout')); });
  });
}

export async function checkSubscription(token: string): Promise<SubscriptionResult> {
  try {
    const billing = await apiGet<{
      plan: string;
      status: string;
      stripeCustomerId?: string;
      desktopSubscription?: boolean;
      desktopTrialActive?: boolean;
      desktopTrialEndsAt?: string;
    }>('/billing', token);

    const hasDesktop = !!billing.desktopSubscription;
    const ok = hasDesktop;

    if (ok) {
      stampLastVerified();
    }

    const effectiveStatus = !ok && billing.desktopTrialEndsAt && !billing.desktopTrialActive
      ? 'trial_expired' : billing.status;

    return { ok, status: effectiveStatus, plan: billing.plan, desktopSubscription: hasDesktop };
  } catch (err: any) {
    if (err.message === 'unauthorized') {
      throw err;
    }
    logApp('warn', 'Subscription check failed (network?)', err.message);
    throw err;
  }
}

/**
 * Update the last-verified timestamp in the session file.
 * Used for offline grace period enforcement.
 */
export function stampLastVerified(): void {
  try {
    const session = loadSession();
    if (!session) return;
    session.lastVerifiedAt = Date.now();
    const dir = getAppDataDir();
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(getSessionPath(), JSON.stringify(session, null, 2), 'utf-8');
  } catch {}
}

/**
 * Check if the offline grace period (24h since last successful verification) has expired.
 * Returns true if the user should still be allowed in, false if they must reconnect.
 */
export function isOfflineGraceValid(): boolean {
  const session = loadSession();
  if (!session?.lastVerifiedAt) return false;
  return (Date.now() - session.lastVerifiedAt) < OFFLINE_GRACE_MS;
}

export function parseDeepLinkToken(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'valnaa:' || parsed.hostname !== 'auth-callback') return null;
    return parsed.searchParams.get('token') || null;
  } catch {
    return null;
  }
}

export function parseDeepLinkEmail(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get('email') || null;
  } catch {
    return null;
  }
}
