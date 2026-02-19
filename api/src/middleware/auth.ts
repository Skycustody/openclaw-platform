import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import db from '../lib/db';
import { UnauthorizedError } from '../lib/errors';

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
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as {
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

export function internalAuth(req: Request, _res: Response, next: NextFunction) {
  const secret = req.headers['x-internal-secret'];
  if (secret !== process.env.INTERNAL_SECRET) {
    next(new UnauthorizedError('Invalid internal secret'));
    return;
  }
  next();
}

export function generateToken(userId: string, plan: string): string {
  return jwt.sign({ userId, plan }, process.env.JWT_SECRET!, {
    expiresIn: '7d',
  });
}

export async function refreshToken(userId: string): Promise<string> {
  const user = await db.getOne('SELECT id, plan FROM users WHERE id = $1', [userId]);
  if (!user) throw new UnauthorizedError('User not found');
  return generateToken(user.id, user.plan);
}
