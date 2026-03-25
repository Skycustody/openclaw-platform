/**
 * DEPRECATED — This route bypasses the OpenClaw container.
 *
 * The platform is an OpenClaw SaaS. All user AI interactions must go through
 * the user's OpenClaw container, not a custom pipeline on the control plane.
 *
 * Chat: Use the OpenClaw Control UI (embedded iframe on the dashboard home page).
 * Cron: Uses sendContainerMessage() to run tasks inside the container.
 *
 * This route is kept only to return a clear deprecation error if anything
 * still tries to call it.
 */
import { Router, Response } from 'express';
import { AuthRequest, authenticate } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.post('/run', (_req: AuthRequest, res: Response) => {
  res.status(410).json({
    error: 'This endpoint is deprecated. Chat with your agent on the dashboard home page — messages go through your OpenClaw container.',
    code: 'DEPRECATED',
  });
});

export default router;
