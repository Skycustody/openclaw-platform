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
  email?: string;
  desktopSubscription: boolean;
  desktopTrialActive: boolean;
  hasDesktopPaid: boolean;
  hasStripe: boolean;
}

function getSessionPath(): string {
  return path.join(getAppDataDir(), 'session.json');
}

export function loadSession(): Session | null {
  try {
    const raw = fs.readFileSync(getSessionPath(), 'utf-8');
    const session: Session = JSON.parse(raw);
    if (!session.token) return null;
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

function apiPost<T>(endpoint: string, token: string, body: Record<string, unknown> = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, API_BASE);
    const data = JSON.stringify(body);
    const req = https.request(url.toString(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
      timeout: 10000,
    }, (res) => {
      let respBody = '';
      res.on('data', (chunk: Buffer) => { respBody += chunk.toString(); });
      res.on('end', () => {
        if (res.statusCode === 401) {
          reject(new Error('unauthorized'));
          return;
        }
        try {
          const parsed = JSON.parse(respBody);
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(parsed.error || parsed.message || `API error ${res.statusCode}`));
            return;
          }
          resolve(parsed);
        } catch {
          reject(new Error(`API error ${res.statusCode}: ${respBody}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('API timeout')); });
    req.write(data);
    req.end();
  });
}

export async function getStripePortalUrl(token: string): Promise<string | null> {
  try {
    const result = await apiPost<{ url: string }>('/billing/portal', token);
    return result.url || null;
  } catch (err: any) {
    logApp('warn', 'Stripe portal URL failed', err.message);
    return null;
  }
}

export async function getDesktopCheckoutUrl(token: string): Promise<string | null> {
  try {
    const result = await apiPost<{ checkoutUrl: string }>('/billing/desktop-checkout', token);
    return result.checkoutUrl || null;
  } catch (err: any) {
    logApp('warn', 'Desktop checkout URL failed', err.message);
    return null;
  }
}

export async function startDesktopTrial(token: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const result = await apiPost<{ ok: boolean; trialEndsAt: string }>('/billing/desktop-trial', token);
    logApp('info', `Desktop trial started, ends ${result.trialEndsAt}`);
    return { ok: true };
  } catch (err: any) {
    logApp('warn', 'Desktop trial start failed', err.message);
    return { ok: false, error: err.message };
  }
}

export async function checkSubscription(token: string): Promise<SubscriptionResult> {
  try {
    const billing = await apiGet<{
      email?: string;
      plan: string;
      status: string;
      stripeCustomerId?: string;
      hasDesktopPaid?: boolean;
      desktopSubscription?: boolean;
      desktopTrialActive?: boolean;
      desktopTrialEndsAt?: string;
    }>('/billing', token);

    const hasDesktop = !!billing.desktopSubscription;
    const ok = hasDesktop;

    if (ok) {
      stampLastVerified();
    }

    if (billing.email) {
      const session = loadSession();
      if (session && session.email !== billing.email) {
        saveSession(session.token, billing.email);
      }
    }

    const effectiveStatus = !ok && billing.desktopTrialEndsAt && !billing.desktopTrialActive
      ? 'trial_expired' : billing.status;

    return {
      ok,
      status: effectiveStatus,
      plan: billing.plan,
      email: billing.email,
      desktopSubscription: hasDesktop,
      desktopTrialActive: !!billing.desktopTrialActive,
      hasDesktopPaid: !!billing.hasDesktopPaid,
      hasStripe: !!billing.stripeCustomerId,
    };
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

const TRIAL_CLAIMED_FILE = 'trial-claimed';

/** Mark this computer as having used a free trial (persists across accounts). */
export function markLocalTrialClaimed(): void {
  try {
    const dir = getAppDataDir();
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, TRIAL_CLAIMED_FILE), Date.now().toString(), 'utf-8');
    logApp('info', 'Local trial-claimed flag written');
  } catch (err: any) {
    logApp('warn', 'Failed to write trial-claimed flag', err.message);
  }
}

/** Check whether any account on this computer has already used the free trial. */
export function isLocalTrialClaimed(): boolean {
  try {
    return fs.existsSync(path.join(getAppDataDir(), TRIAL_CLAIMED_FILE));
  } catch {
    return false;
  }
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
