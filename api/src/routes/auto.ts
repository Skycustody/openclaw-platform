import { Router, Response, NextFunction } from 'express';
import { AuthRequest, authenticate, requireActiveSubscription } from '../middleware/auth';
import { runAutoMode } from '../services/autoMode';

const router = Router();
router.use(authenticate);
router.use(requireActiveSubscription);

/**
 * POST /auto/run — Run a task in auto mode.
 * The smart router picks the best model, decomposes multi-step tasks,
 * and streams step results back as newline-delimited JSON (NDJSON).
 */
router.post('/run', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { task } = req.body;
    if (!task || typeof task !== 'string' || task.trim().length < 2) {
      return res.status(400).json({ error: 'Please provide a task to run.' });
    }

    // Stream response as NDJSON so the frontend can show progress in real time
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const result = await runAutoMode(req.userId!, task.trim(), (step, totalTokens, balance) => {
      // Stream each step as it completes
      const event = JSON.stringify({
        type: 'step',
        step,
        totalTokens,
        balance,
      });
      res.write(event + '\n');
    });

    // Send final result
    const final = JSON.stringify({
      type: 'result',
      ...result,
    });
    res.write(final + '\n');
    res.end();
  } catch (err) {
    next(err);
  }
});

export default router;
