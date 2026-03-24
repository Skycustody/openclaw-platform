/**
 * Auth middleware — JWT verification, role checks, internal auth.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ SECURITY — DO NOT CHANGE WITHOUT UNDERSTANDING                         │
 * │                                                                        │
 * │ 1. TRUST PROXY: app.set('trust proxy', 1) is set in index.ts so       │
 * │    req.ip returns the real client IP (from X-Forwarded-For via         │
 * │    Nginx/Cloudflare). Never use X-Forwarded-For directly.             │
 * │                                                                        │
 * │ 2. INTERNAL AUTH (internalAuth): Checks x-internal-secret header      │
 * │    against INTERNAL_SECRET. Used for server registration only.        │
 * │    Container webhooks should use verifyContainerAuth() in webhooks.ts │
 * │    which validates per-user HMAC tokens.                               │
 * │                                                                        │
 * │ 3. TOKEN REFRESH: Expired tokens can only be refreshed within 24h.    │
 * │    This prevents indefinite session extension with stolen refresh      │
 * │    tokens.                                                             │
 * └─────────────────────────────────────────────────────────────────────────┘
 */
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import db from '../lib/db';
import { UnauthorizedError } from '../lib/errors';

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET environment variable is required and must be at least 32 characters. Generate with: openssl rand -hex 32');
}
if (!process.env.INTERNAL_SECRET || process.env.INTERNAL_SECRET.length < 16) {
  throw new Error('INTERNAL_SECRET environment variable is required and must be at least 16 characters. Generate with: openssl rand -hex 32');
}

const JWT_SECRET: string = process.env.JWT_SECRET;
const INTERNAL_SECRET: string = process.env.INTERNAL_SECRET;

export interface AuthRequest extends Request {
  userId?: string;
  userPlan?: string;
}

export function authenticate(req: AuthRequest, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing authorization token');
    }

    const token = header.slice(7);
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as {
      userId: string;
      plan: string;
    };

    req.userId = payload.userId;
    req.userPlan = payload.plan;
    next();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      next(err);
    } else {
      next(new UnauthorizedError('Invalid or expired token'));
    }
  }
}

export async function requireActiveSubscription(req: AuthRequest, _res: Response, next: NextFunction) {
  try {
    if (!req.userId) {
      throw new UnauthorizedError('Authentication required');
    }

    const user = await db.getOne<{ status: string }>(
      'SELECT status FROM users WHERE id = $1',
      [req.userId]
    );

    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    const allowed = ['active', 'grace_period', 'provisioning', 'starting', 'sleeping', 'paused', 'pending', 'trial_expired'];
    if (!allowed.includes(user.status)) {
      console.warn(`[auth] Blocked ${req.userId} — status '${user.status}' not in allowed list (${allowed.join(', ')})`);
      const err: any = new Error('Active subscription required');
      err.statusCode = 403;
      err.code = 'SUBSCRIPTION_REQUIRED';
      err.userStatus = user.status;
      return next(err);
    }

    next();
  } catch (err) {
    next(err);
  }
}

export async function requireAdmin(req: AuthRequest, _res: Response, next: NextFunction) {
  try {
    if (!req.userId) {
      throw new UnauthorizedError('Authentication required');
    }

    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) {
      console.error('[admin] ADMIN_EMAIL env var is not set — blocking all admin access');
      const err: any = new Error('Admin panel not configured');
      err.statusCode = 403;
      return next(err);
    }

    const user = await db.getOne<{ email: string }>(
      'SELECT email FROM users WHERE id = $1',
      [req.userId]
    );

    if (!user || user.email.toLowerCase() !== adminEmail.toLowerCase()) {
      const err: any = new Error('Admin access required');
      err.statusCode = 403;
      return next(err);
    }

    next();
  } catch (err) {
    next(err);
  }
}

export function internalAuth(req: Request, _res: Response, next: NextFunction) {
  const secret = req.headers['x-internal-secret'];
  if (typeof secret !== 'string' || secret.length !== INTERNAL_SECRET.length) {
    next(new UnauthorizedError('Invalid internal secret'));
    return;
  }
  const isValid = crypto.timingSafeEqual(
    Buffer.from(secret),
    Buffer.from(INTERNAL_SECRET)
  );
  if (!isValid) {
    next(new UnauthorizedError('Invalid internal secret'));
    return;
  }
  next();
}

export function generateToken(userId: string, plan: string): string {
  return jwt.sign({ userId, plan }, JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '30d',
  });
}

export function generateDesktopToken(userId: string): string {
  return jwt.sign({ userId, type: 'desktop' }, JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '30d',
  });
}

export function authenticateDesktop(req: AuthRequest, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing authorization token');
    }
    const token = header.slice(7);
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as {
      userId: string;
      type?: string;
    };
    if (payload.type !== 'desktop') {
      throw new UnauthorizedError('Invalid desktop token');
    }
    req.userId = payload.userId;
    next();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      next(err);
    } else {
      next(new UnauthorizedError('Invalid or expired token'));
    }
  }
}

export async function refreshToken(userId: string): Promise<string> {
  const user = await db.getOne('SELECT id, plan FROM users WHERE id = $1', [userId]);
  if (!user) throw new UnauthorizedError('User not found');
  return generateToken(user.id, user.plan);
}
