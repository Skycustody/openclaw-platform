import { Router, Response, NextFunction } from 'express';
import { AuthRequest, authenticate, requireActiveSubscription } from '../middleware/auth';
import {
  createCronJob,
  updateCronJob,
  deleteCronJob,
  getUserCronJobs,
} from '../services/cronScheduler';
import db from '../lib/db';

const router = Router();
router.use(authenticate);
router.use(requireActiveSubscription);

// List cron jobs
router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const jobs = await getUserCronJobs(req.userId!);
    res.json({ jobs });
  } catch (err) {
    next(err);
  }
});

// Create cron job
router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { name, description, schedule, tokenBudget, timeoutSecs } = req.body;
    if (!name || !schedule) {
      return res.status(400).json({ error: 'Name and schedule are required' });
    }

    const job = await createCronJob(
      req.userId!,
      name,
      description || '',
      schedule,
      tokenBudget,
      timeoutSecs
    );

    res.json({ job });
  } catch (err) {
    next(err);
  }
});

// Update cron job
router.put('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const job = await updateCronJob(req.userId!, req.params.id as string, req.body);
    res.json({ job });
  } catch (err) {
    next(err);
  }
});

// Toggle enable/disable
router.post('/:id/toggle', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const job = await db.getOne<any>(
      'SELECT * FROM cron_jobs WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const updated = await updateCronJob(req.userId!, req.params.id, { enabled: !job.enabled });
    res.json({ job: updated });
  } catch (err) {
    next(err);
  }
});

// Run job immediately
router.post('/:id/run', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { runCronJobNow } = await import('../services/cronScheduler');
    const result = await runCronJobNow(req.userId!, req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Delete cron job
router.delete('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await deleteCronJob(req.userId!, req.params.id as string);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
