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
import { invalidateProxyCache } from './proxy';

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
      const secret = process.env.STRIPE_WEBHOOK_SECRET;

      if (!secret) {
        console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET is not set');
        return res.status(500).json({ error: 'Webhook secret not configured' });
      }
      if (!sig) {
        console.error('[stripe-webhook] No stripe-signature header');
        return res.status(400).json({ error: 'Missing stripe-signature header' });
      }

      const body = (req as any).rawBody;
      if (!body) {
        console.error('[stripe-webhook] rawBody is missing — express.json verify callback did not fire');
        return res.status(400).json({ error: 'Raw body not captured' });
      }
      console.log(`[stripe-webhook] sig=${sig.substring(0, 20)}... secret=${secret.substring(0, 10)}... bodyLen=${body.length}`);

      const event = stripe.webhooks.constructEvent(body, sig, secret);

      console.log(`[stripe-webhook] Verified event: ${event.type} (${event.id})`);
      await handleWebhook(event);
      res.json({ received: true });
    } catch (err: any) {
      console.error(`[stripe-webhook] ERROR: ${err.message}`);
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
      `INSERT INTO activity_log (user_id, type, channel, summary, status, tokens_used, model_used)
       VALUES ($1, $2, $3, $4, 'completed', $5, $6)`,
      [userId, 'message', channel, (content || '').slice(0, 200), tokens || 0, model]
    ).catch(() => {});

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

// Model switch — agent calls this to change its own AI model
const MODEL_ALIASES: Record<string, string> = {
  auto: 'auto',
  sonnet: 'anthropic/claude-sonnet-4',
  'claude-sonnet': 'anthropic/claude-sonnet-4',
  'claude-sonnet-4': 'anthropic/claude-sonnet-4',
  opus: 'anthropic/claude-opus-4',
  'claude-opus': 'anthropic/claude-opus-4',
  'claude-opus-4': 'anthropic/claude-opus-4',
  haiku: 'anthropic/claude-3.5-haiku',
  'claude-haiku': 'anthropic/claude-3.5-haiku',
  'gpt-4o': 'openai/gpt-4o',
  gpt4o: 'openai/gpt-4o',
  'gpt-4o-mini': 'openai/gpt-4o-mini',
  'gpt4o-mini': 'openai/gpt-4o-mini',
  'gpt-4.1': 'openai/gpt-4.1',
  'gpt4.1': 'openai/gpt-4.1',
  'gpt-4.1-mini': 'openai/gpt-4.1-mini',
  'gpt4.1-mini': 'openai/gpt-4.1-mini',
  'gpt-4.1-nano': 'openai/gpt-4.1-nano',
  'gpt4.1-nano': 'openai/gpt-4.1-nano',
  'o3-mini': 'openai/o3-mini',
  o3: 'openai/o3-mini',
  'gemini-pro': 'google/gemini-2.5-pro',
  'gemini-2.5-pro': 'google/gemini-2.5-pro',
  'gemini-flash': 'google/gemini-2.5-flash',
  'gemini-2.5-flash': 'google/gemini-2.5-flash',
  gemini: 'google/gemini-2.5-flash',
  deepseek: 'deepseek/deepseek-chat-v3-0324',
  'deepseek-v3': 'deepseek/deepseek-chat-v3-0324',
  'deepseek-r1': 'deepseek/deepseek-r1',
  grok: 'x-ai/grok-3-beta',
  'grok-3': 'x-ai/grok-3-beta',
  'grok-mini': 'x-ai/grok-3-mini-beta',
  mistral: 'mistralai/mistral-large-2',
  llama: 'meta-llama/llama-4-maverick',
  qwen: 'qwen/qwen-2.5-coder-32b-instruct',
};

router.post('/container/switch-model', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, model } = req.body;
    if (!userId || !model) return res.status(400).json({ error: 'userId and model required' });

    if (!verifyContainerAuth(req, userId)) {
      return res.status(401).json({ error: 'Invalid container authentication' });
    }

    const db = (await import('../lib/db')).default;

    const normalized = model.trim().toLowerCase();
    const resolvedModel = MODEL_ALIASES[normalized] || normalized;

    if (resolvedModel === 'auto') {
      await db.query(
        `UPDATE user_settings SET brain_mode = 'auto', manual_model = NULL WHERE user_id = $1`,
        [userId]
      );
      invalidateProxyCache(userId);
      return res.json({ ok: true, model: 'auto', mode: 'auto', message: 'Switched to smart auto-routing. I will pick the best model for each task.' });
    }

    await db.query(
      `UPDATE user_settings SET brain_mode = 'manual', manual_model = $1 WHERE user_id = $2`,
      [resolvedModel, userId]
    );
    invalidateProxyCache(userId);

    res.json({ ok: true, model: resolvedModel, mode: 'manual', message: `Switched to ${resolvedModel}. All responses will now use this model.` });
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
