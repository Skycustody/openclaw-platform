import crypto from 'crypto';
import { Router, Request, Response, NextFunction } from 'express';
import Stripe from 'stripe';
import { handleWebhook } from '../services/stripe';
import { internalAuth } from '../middleware/auth';
import { registerServer } from '../services/serverRegistry';
import { confirmWhatsAppConnected } from '../services/messaging';
import { touchActivity } from '../services/sleepWake';
import { wakeContainer } from '../services/sleepWake';

const router = Router();

/**
 * Verify that a container webhook request is authorized for the given userId.
 * Accepts either:
 *   - x-container-secret header = HMAC(INTERNAL_SECRET, userId)  (per-container token)
 *   - x-internal-secret header = INTERNAL_SECRET                  (legacy, server-to-server only)
 */
function verifyContainerAuth(req: Request, userId: string): boolean {
  const internalSecret = process.env.INTERNAL_SECRET;
  if (!internalSecret) return false;

  // Prefer per-container secret (new containers use this)
  const containerSecret = req.headers['x-container-secret'] as string;
  if (containerSecret) {
    const expected = crypto.createHmac('sha256', internalSecret).update(userId).digest('hex');
    if (containerSecret.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(containerSecret), Buffer.from(expected));
  }

  // Fall back to global INTERNAL_SECRET (for server-registration and legacy containers)
  const globalSecret = req.headers['x-internal-secret'] as string;
  if (globalSecret) {
    if (globalSecret.length !== internalSecret.length) return false;
    return crypto.timingSafeEqual(Buffer.from(globalSecret), Buffer.from(internalSecret));
  }

  return false;
}

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

// Server self-registration (called by cloud-init on new workers)
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
router.post('/container/message', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, channel, role, content, model, tokens } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    if (!verifyContainerAuth(req, userId)) {
      return res.status(401).json({ error: 'Invalid container authentication' });
    }

    const db = (await import('../lib/db')).default;

    await db.query(
      `INSERT INTO conversations (user_id, channel, role, content, model_used, tokens_used)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, channel || 'direct', role || 'user', content, model, tokens || 0]
    );

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

// Container wake trigger
router.post('/container/wake', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    if (!verifyContainerAuth(req, userId)) {
      return res.status(401).json({ error: 'Invalid container authentication' });
    }

    await wakeContainer(userId);
    res.json({ status: 'active' });
  } catch (err) {
    next(err);
  }
});

// WhatsApp connected confirmation
router.post('/container/whatsapp-connected', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    if (!verifyContainerAuth(req, userId)) {
      return res.status(401).json({ error: 'Invalid container authentication' });
    }

    await confirmWhatsAppConnected(userId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
