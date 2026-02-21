import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import db from '../lib/db';
import { generateToken, refreshToken as issueRefreshToken } from '../middleware/auth';
import { rateLimitAuth } from '../middleware/rateLimit';
import { BadRequestError, UnauthorizedError } from '../lib/errors';
import { v4 as uuid } from 'uuid';
import { PLAN_LIMITS, Plan } from '../types';

const router = Router();

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

async function grantInitialTokens(userId: string, plan: Plan): Promise<void> {
  const limits = PLAN_LIMITS[plan];
  await Promise.all([
    db.query(
      `INSERT INTO user_settings (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    ),
    db.query(
      `INSERT INTO user_channels (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    ),
    db.query(
      `INSERT INTO token_balances (user_id, balance, total_purchased)
       VALUES ($1, $2, $2) ON CONFLICT (user_id) DO NOTHING`,
      [userId, limits.includedTokens]
    ),
    db.query(
      `INSERT INTO token_transactions (user_id, amount, type, description)
       VALUES ($1, $2, 'subscription_grant', $3)`,
      [userId, limits.includedTokens, `${plan} plan signup bonus`]
    ),
  ]);
}

// ── Email + Password Signup ──
router.post('/signup', rateLimitAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new BadRequestError('Email and password are required');
    }

    const existing = await db.getOne('SELECT id FROM users WHERE email = $1', [email]);
    if (existing) throw new BadRequestError('Email already registered');

    const passwordHash = await bcrypt.hash(password, 12);
    const userId = uuid();

    await db.query(
      `INSERT INTO users (id, email, plan, status, password_hash) VALUES ($1, $2, 'pro', 'provisioning', $3)`,
      [userId, email, passwordHash]
    );

    await grantInitialTokens(userId, 'pro');

    const token = generateToken(userId, 'pro');

    res.json({
      token,
      user: { id: userId, email, plan: 'pro', status: 'provisioning' },
      isNewUser: true,
    });
  } catch (err) {
    next(err);
  }
});

// ── Email + Password Login ──
router.post('/login', rateLimitAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new BadRequestError('Email and password are required');
    }

    const user = await db.getOne<any>(
      'SELECT id, email, password_hash, plan, status FROM users WHERE email = $1',
      [email]
    );

    if (!user || !user.password_hash) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) throw new UnauthorizedError('Invalid email or password');

    const token = generateToken(user.id, user.plan);

    res.json({
      token,
      user: { id: user.id, email: user.email, plan: user.plan, status: user.status },
    });
  } catch (err) {
    next(err);
  }
});

// ── Google Sign-In ──
router.post('/google', rateLimitAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      throw new BadRequestError('Google credential is required');
    }

    if (!process.env.GOOGLE_CLIENT_ID) {
      throw new BadRequestError('Google sign-in is not configured. Please contact support.');
    }

    let payload: any;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch (verifyErr: any) {
      console.error('Google token verification failed:', verifyErr.message);
      console.error('Server GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID?.slice(0, 20) + '...');
      const msg = verifyErr.message || '';
      if (msg.includes('Token used too late') || msg.includes('expired')) {
        throw new BadRequestError('Google sign-in expired. Please try again.');
      }
      if (msg.includes('audience') || msg.includes('recipient') || msg.includes('client_id')) {
        throw new BadRequestError(
          'Google sign-in configuration mismatch. The server GOOGLE_CLIENT_ID does not match the dashboard. Please verify both are identical.'
        );
      }
      throw new BadRequestError('Google sign-in failed. Please try again.');
    }

    if (!payload || !payload.email) {
      throw new UnauthorizedError('Could not get email from Google. Please try again.');
    }

    const { email, name, picture, sub: googleId } = payload;

    const existingUser = await db.getOne<any>(
      'SELECT id, email, plan, status FROM users WHERE email = $1',
      [email]
    );

    if (existingUser) {
      await db.query(
        `UPDATE users SET google_id = COALESCE(google_id, $1), avatar_url = COALESCE(avatar_url, $2), display_name = COALESCE(display_name, $3), last_active = NOW() WHERE id = $4`,
        [googleId, picture, name, existingUser.id]
      );

      const token = generateToken(existingUser.id, existingUser.plan);

      return res.json({
        token,
        user: { id: existingUser.id, email: existingUser.email, plan: existingUser.plan, status: existingUser.status },
        isNewUser: false,
      });
    }

    const userId = uuid();
    await db.query(
      `INSERT INTO users (id, email, plan, status, google_id, avatar_url, display_name)
       VALUES ($1, $2, 'pro', 'provisioning', $3, $4, $5)`,
      [userId, email, googleId, picture, name]
    );

    await grantInitialTokens(userId, 'pro');

    const token = generateToken(userId, 'pro');
    res.json({
      token,
      user: { id: userId, email, plan: 'pro', status: 'provisioning' },
      isNewUser: true,
    });
  } catch (err: any) {
    next(err);
  }
});

// ── Token Refresh (accepts current JWT in Authorization; works even if expired) ──
router.post('/refresh', rateLimitAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing authorization token');
    }
    const currentToken = header.slice(7);
    const payload = jwt.verify(currentToken, process.env.JWT_SECRET!, {
      ignoreExpiration: true,
    }) as { userId: string };
    const token = await issueRefreshToken(payload.userId);
    res.json({ token });
  } catch (err) {
    next(err);
  }
});

export default router;
