import { Router, Response, NextFunction } from 'express';
import { AuthRequest, authenticate, requireActiveSubscription } from '../middleware/auth';
import {
  createCronJob,
  updateCronJob,
  deleteCronJob,
  getUserCronJobs,
} from '../services/cronScheduler';

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
