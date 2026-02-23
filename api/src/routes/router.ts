import { Router, Response, NextFunction } from 'express';
import { AuthRequest, authenticate } from '../middleware/auth';
import {
  getRoutingHistory,
  getTokensSavedThisMonth,
  MODEL_MAP,
  RETAIL_PRICES,
  TASK_CATEGORIES,
} from '../services/smartRouter';

const router = Router();
router.use(authenticate);

// Get available models
router.get('/models', async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const models = Object.values(MODEL_MAP).map((m) => ({
      ...m,
      retailPrice: RETAIL_PRICES[m.name],
    }));
    res.json({ models });
  } catch (err) {
    next(err);
  }
});

// Get task categories with default models (for preferences UI)
router.get('/categories', async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const models = Object.values(MODEL_MAP).map((m) => ({
      id: m.name,
      displayName: m.displayName,
      costPer1MTokens: m.costPer1MTokens,
      retailPrice: RETAIL_PRICES[m.name],
    }));
    res.json({ categories: TASK_CATEGORIES, models });
  } catch (err) {
    next(err);
  }
});

// Get routing history
router.get('/history', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const history = await getRoutingHistory(req.userId!, limit);
    res.json({ history });
  } catch (err) {
    next(err);
  }
});

// Get tokens saved
router.get('/savings', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const saved = await getTokensSavedThisMonth(req.userId!);
    res.json({ tokensSavedThisMonth: saved });
  } catch (err) {
    next(err);
  }
});

export default router;
