import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import db from '../lib/db';
import { generateToken } from '../middleware/auth';
import { rateLimitAuth } from '../middleware/rateLimit';
import { BadRequestError, UnauthorizedError } from '../lib/errors';
import { createCheckoutSession } from '../services/stripe';
import { Plan } from '../types';

const router = Router();

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// ── Email + Password Signup ──
router.post('/signup', rateLimitAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password, plan, referralCode } = req.body;

    if (!email || !password || !plan) {
      throw new BadRequestError('Email, password, and plan are required');
    }

    if (!['starter', 'pro', 'business'].includes(plan)) {
      throw new BadRequestError('Invalid plan');
    }

    const existing = await db.getOne('SELECT id FROM users WHERE email = $1', [email]);
    if (existing) throw new BadRequestError('Email already registered');

    const passwordHash = await bcrypt.hash(password, 12);

    const checkoutUrl = await createCheckoutSession(email, plan as Plan, referralCode);

    await db.query(
      `UPDATE users SET password_hash = $1 WHERE email = $2`,
      [passwordHash, email]
    );

    res.json({ checkoutUrl });
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
    const { credential, plan, referralCode } = req.body;

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

    // New user — needs to pick a plan and pay
    const selectedPlan = plan || 'pro';
    if (!['starter', 'pro', 'business'].includes(selectedPlan)) {
      throw new BadRequestError('Invalid plan');
    }

    const checkoutUrl = await createCheckoutSession(email!, selectedPlan as Plan, referralCode);

    // Store the Google info so it's ready when payment completes
    await db.query(
      `UPDATE users SET google_id = $1, avatar_url = $2, display_name = $3 WHERE email = $4`,
      [googleId, picture, name, email]
    );

    res.json({ checkoutUrl, isNewUser: true });
  } catch (err: any) {
    if (err.message?.includes('Token used too late') || err.message?.includes('Invalid token')) {
      return next(new UnauthorizedError('Google sign-in expired. Please try again.'));
    }
    next(err);
  }
});

// ── Token Refresh ──
router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken: userId } = req.body;
    if (!userId) throw new BadRequestError('User ID required');

    const { refreshToken } = await import('../middleware/auth');
    const token = await refreshToken(userId);
    res.json({ token });
  } catch (err) {
    next(err);
  }
});

export default router;
