/**
 * Webhook endpoints — receive callbacks from Stripe, worker servers, and containers.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ ARCHITECTURE DECISIONS — DO NOT CHANGE WITHOUT UNDERSTANDING           │
 * │                                                                        │
 * │ 1. CONTAINER AUTH (verifyContainerAuth):                               │
 * │    - Container webhooks (/container/*) verify the caller matches the   │
 * │      userId they claim using HMAC(INTERNAL_SECRET, userId).            │
 * │    - This prevents container A from sending webhooks as user B.        │
 * │    - Legacy containers may still send x-internal-secret (global        │
 * │      secret). This is accepted but should be migrated.                 │
 * │                                                                        │
 * │ 2. SERVER REGISTRATION (/servers/register):                            │
 * │    - Uses internalAuth (global INTERNAL_SECRET) because worker servers │
 * │      are not bound to a userId. Only cloud-init scripts call this.     │
 * │                                                                        │
 * │ 3. STRIPE WEBHOOK:                                                     │
 * │    - Uses Stripe's signature verification (constructEvent), NOT our    │
 * │      internal auth. Requires raw body (express.raw middleware in       │
 * │      index.ts). The HTTPS redirect in index.ts MUST skip /webhooks/*  │
 * │      or POST bodies are lost during 301 redirect.                     │
 * └─────────────────────────────────────────────────────────────────────────┘
 */
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

  const containerSecret = req.headers['x-container-secret'] as string;
  if (!containerSecret) return false;

  const expected = crypto.createHmac('sha256', internalSecret).update(userId).digest('hex');
  if (containerSecret.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(containerSecret), Buffer.from(expected));
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
