import { Router, Response, NextFunction } from 'express';
import { AuthRequest, authenticate } from '../middleware/auth';
import db from '../lib/db';
import {
  checkBalance,
  getDailyUsage,
  getUsageByModel,
  getTopTasks,
  estimateDaysRemaining,
} from '../services/tokenTracker';
import { createTokenPurchaseSession } from '../services/stripe';
import { TokenBalance } from '../types';

const router = Router();
router.use(authenticate);

// Get token balance and stats
router.get('/balance', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const balance = await checkBalance(req.userId!);
    const daysRemaining = await estimateDaysRemaining(req.userId!);

    const tokenBalance = await db.getOne<TokenBalance>(
      'SELECT * FROM token_balances WHERE user_id = $1',
      [req.userId]
    );

    res.json({
      balance,
      totalPurchased: tokenBalance?.total_purchased || 0,
      totalUsed: tokenBalance?.total_used || 0,
      daysRemaining,
      autoTopup: tokenBalance?.auto_topup || false,
      autoTopupAmount: tokenBalance?.auto_topup_amount || 1000,
      lowBalanceAlert: tokenBalance?.low_balance_alert || 50000,
    });
  } catch (err) {
    next(err);
  }
});

// Get daily usage chart data
router.get('/usage/daily', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const usage = await getDailyUsage(req.userId!, days);
    res.json({ usage });
  } catch (err) {
    next(err);
  }
});

// Get usage by model (pie chart)
router.get('/usage/models', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const models = await getUsageByModel(req.userId!, days);
    res.json({ models });
  } catch (err) {
    next(err);
  }
});

// Get top token-consuming tasks
router.get('/usage/top-tasks', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tasks = await getTopTasks(req.userId!);
    res.json({ tasks });
  } catch (err) {
    next(err);
  }
});

// Get token packages
router.get('/packages', async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const packages = await db.getMany(
      'SELECT id, name, tokens, price_cents, bonus_percent FROM token_packages WHERE active = true ORDER BY price_cents'
    );
    res.json({ packages });
  } catch (err) {
    next(err);
  }
});

// Purchase tokens
router.post('/purchase', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { packageId } = req.body;
    if (!packageId) return res.status(400).json({ error: 'Package ID required' });

    const checkoutUrl = await createTokenPurchaseSession(req.userId!, packageId);
    res.json({ checkoutUrl });
  } catch (err) {
    next(err);
  }
});

// Transaction history
router.get('/transactions', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const transactions = await db.getMany(
      `SELECT * FROM token_transactions
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.userId, limit, offset]
    );

    res.json({ transactions });
  } catch (err) {
    next(err);
  }
});

// Update auto top-up settings
router.put('/auto-topup', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { enabled, amount, alertThreshold } = req.body;

    await db.query(
      `UPDATE token_balances
       SET auto_topup = COALESCE($1, auto_topup),
           auto_topup_amount = COALESCE($2, auto_topup_amount),
           low_balance_alert = COALESCE($3, low_balance_alert)
       WHERE user_id = $4`,
      [enabled, amount, alertThreshold, req.userId]
    );

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
