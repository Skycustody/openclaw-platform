import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import db from '../lib/db';
import { generateToken, refreshToken as issueRefreshToken } from '../middleware/auth';
import { rateLimitAuth } from '../middleware/rateLimit';
import { BadRequestError, UnauthorizedError } from '../lib/errors';
import { v4 as uuid } from 'uuid';

const router = Router();

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

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

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      throw new UnauthorizedError('Invalid Google token');
    }

    const { email, name, picture, sub: googleId } = payload;

    const existingUser = await db.getOne<any>(
      'SELECT id, email, plan, status FROM users WHERE email = $1',
      [email]
    );

    if (existingUser) {
      // Existing user — log them in
      // Link Google account if not already linked
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

    // New user — create account, then they pick plan on /pricing
    const userId = uuid();
    await db.query(
      `INSERT INTO users (id, email, plan, status, google_id, avatar_url, display_name)
       VALUES ($1, $2, 'pro', 'provisioning', $3, $4, $5)`,
      [userId, email, googleId, picture, name]
    );

    const token = generateToken(userId, 'pro');
    res.json({
      token,
      user: { id: userId, email, plan: 'pro', status: 'provisioning' },
      isNewUser: true,
    });
  } catch (err: any) {
    if (err.message?.includes('Token used too late') || err.message?.includes('Invalid token')) {
      return next(new UnauthorizedError('Google sign-in expired. Please try again.'));
    }
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
