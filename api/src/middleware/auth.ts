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
    const payload = jwt.verify(token, JWT_SECRET) as {
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

    const allowed = ['active', 'grace_period', 'provisioning'];
    if (!allowed.includes(user.status)) {
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

    // IP allowlist check
    const allowedIps = (process.env.ADMIN_ALLOWED_IPS || '').split(',').map(s => s.trim()).filter(Boolean);
    if (allowedIps.length > 0) {
      const clientIp = req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim()
        || req.socket.remoteAddress || '';
      const normalizedIp = clientIp.replace('::ffff:', '');
      if (!allowedIps.includes(normalizedIp) && !allowedIps.includes(clientIp)) {
        console.warn(`[admin] Blocked IP: ${clientIp} (allowed: ${allowedIps.join(', ')})`);
        const err: any = new Error('Access denied from this IP');
        err.statusCode = 403;
        return next(err);
      }
    }

    const user = await db.getOne<{ is_admin: boolean }>(
      'SELECT is_admin FROM users WHERE id = $1',
      [req.userId]
    );

    if (!user || !user.is_admin) {
      const err: any = new Error('Admin access required');
      err.statusCode = 403;
      return next(err);
    }

    // Admin password check (required for all admin endpoints)
    // Uses 403 (not 401) to avoid the frontend's auto-redirect to login
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (adminPassword) {
      const providedPassword = req.headers['x-admin-password'] as string;
      if (!providedPassword) {
        const err: any = new Error('Admin password required');
        err.statusCode = 403;
        err.code = 'ADMIN_PASSWORD_REQUIRED';
        return next(err);
      }
      if (providedPassword.length !== adminPassword.length ||
          !crypto.timingSafeEqual(Buffer.from(providedPassword), Buffer.from(adminPassword))) {
        const err: any = new Error('Invalid admin password');
        err.statusCode = 403;
        err.code = 'ADMIN_PASSWORD_INVALID';
        return next(err);
      }
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
    expiresIn: '7d',
  });
}

export async function refreshToken(userId: string): Promise<string> {
  const user = await db.getOne('SELECT id, plan FROM users WHERE id = $1', [userId]);
  if (!user) throw new UnauthorizedError('User not found');
  return generateToken(user.id, user.plan);
}
