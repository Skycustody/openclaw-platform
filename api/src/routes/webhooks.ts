import { Router, Request, Response, NextFunction } from 'express';
import Stripe from 'stripe';
import { handleWebhook } from '../services/stripe';
import { internalAuth } from '../middleware/auth';
import { registerServer } from '../services/serverRegistry';
import { confirmWhatsAppConnected } from '../services/messaging';
import { touchActivity } from '../services/sleepWake';
import { wakeContainer } from '../services/sleepWake';

const router = Router();

// Stripe webhook — raw body required
router.post(
  '/stripe',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
      const sig = req.headers['stripe-signature'] as string;

      const event = stripe.webhooks.constructEvent(
        (req as any).rawBody || req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET!
      );

      await handleWebhook(event);
      res.json({ received: true });
    } catch (err: any) {
      console.error('Stripe webhook error:', err.message);
      res.status(400).json({ error: err.message });
    }
  }
);

// Server self-registration (called by post-install script)
router.post('/servers/register', internalAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ip, ram, hostname, hostingerId } = req.body;
    if (!ip || !ram) {
      return res.status(400).json({ error: 'IP and RAM required' });
    }

    const server = await registerServer(ip, ram, hostname, hostingerId);
    res.json({ server });
  } catch (err) {
    next(err);
  }
});

// Container message webhook (called by OpenClaw containers)
router.post('/container/message', internalAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, channel, role, content, model, tokens } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    const db = (await import('../lib/db')).default;

    // Log conversation
    await db.query(
      `INSERT INTO conversations (user_id, channel, role, content, model_used, tokens_used)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, channel || 'direct', role || 'user', content, model, tokens || 0]
    );

    // Log activity
    await db.query(
      `INSERT INTO activity_log (user_id, type, channel, summary, tokens_used, model_used)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, 'message', channel, (content || '').slice(0, 200), tokens || 0, model]
    );

    await touchActivity(userId);

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Container wake trigger (called when user sends a message to sleeping agent)
router.post('/container/wake', internalAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    await wakeContainer(userId);
    res.json({ status: 'active' });
  } catch (err) {
    next(err);
  }
});

// WhatsApp connected confirmation
router.post('/container/whatsapp-connected', internalAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.body;
    await confirmWhatsAppConnected(userId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
