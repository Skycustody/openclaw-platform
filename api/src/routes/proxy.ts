/**
 * Simple proxy — OpenAI-compatible endpoint that forwards requests to OpenRouter.
 *
 * Flow:
 *   Container → POST /proxy/v1/chat/completions → OpenRouter → stream back
 *
 * No smart routing, no model selection logic, no message compression.
 * Uses whatever model the request specifies, or falls back to claude-sonnet-4-6.
 *
 * Auth: Bearer token = the user's OpenRouter API key (sk-or-v1-xxx).
 */
import { Router, Request, Response } from 'express';
import https from 'https';
import { URL } from 'url';
import db from '../lib/db';
import { Plan } from '../types';
import { touchActivity } from '../services/sleepWake';

const router = Router();

const DEFAULT_MODEL = 'anthropic/claude-sonnet-4-6';
const OPENROUTER_COMPLETIONS = 'https://openrouter.ai/api/v1/chat/completions';

// Debounce touchActivity per user — at most once per 60s
const lastTouch = new Map<string, number>();
function touchIfNeeded(userId: string): void {
  const now = Date.now();
  const last = lastTouch.get(userId) || 0;
  if (now - last < 60_000) return;
  lastTouch.set(userId, now);
  touchActivity(userId).catch(() => {});
}

interface ProxyUser {
  id: string;
  plan: Plan;
  status: string;
  trial_ends_at?: Date | null;
}

const userCache = new Map<string, { user: ProxyUser; expires: number }>();
const CACHE_TTL_MS = 60_000;

/** Evict cached proxy user so the next request reads fresh settings from DB. */
export function invalidateProxyCache(userId: string): void {
  for (const [key, entry] of userCache) {
    if (entry.user.id === userId) {
      userCache.delete(key);
      break;
    }
  }
}

async function lookupUser(apiKey: string): Promise<ProxyUser | null> {
  const cached = userCache.get(apiKey);
  if (cached && cached.expires > Date.now()) return cached.user;

  const row = await db.getOne<{ id: string; plan: string; status: string; trial_ends_at: Date | null }>(
    `SELECT u.id, u.plan, u.status, u.trial_ends_at FROM users u
     WHERE u.nexos_api_key = $1
     LIMIT 1`,
    [apiKey]
  );
  if (!row) return null;

  const user: ProxyUser = {
    id: row.id,
    plan: row.plan as Plan,
    status: row.status,
    trial_ends_at: row.trial_ends_at,
  };

  userCache.set(apiKey, { user, expires: Date.now() + CACHE_TTL_MS });
  return user;
}

// ── Main chat completions proxy ──

router.post('/v1/chat/completions', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: { message: 'Missing API key', type: 'auth_error' } });
    }

    const apiKey = authHeader.slice(7);
    const user = await lookupUser(apiKey).catch(() => null);

    if (user) touchIfNeeded(user.id);

    const BLOCKED_STATUSES = ['cancelled', 'paused', 'trial_expired'];
    if (user && BLOCKED_STATUSES.includes(user.status)) {
      return res.status(402).json({
        error: {
          message: 'Subscription inactive. Please renew your subscription to continue.',
          type: 'billing_error',
          code: 'subscription_required',
        },
      });
    }

    // Trial users on platform key have 0 credits — block with upgrade prompt.
    const isInTrial = user?.trial_ends_at && new Date(user.trial_ends_at) > new Date();
    if (user && isInTrial) {
      return res.status(402).json({
        error: {
          message: 'Your free trial includes no AI credits. Add your own OpenRouter API key in Settings, or upgrade to a paid plan to start chatting.',
          type: 'billing_error',
          code: 'trial_no_credits',
        },
      });
    }

    const body = req.body;
    if (!body?.messages) {
      return res.status(400).json({ error: { message: 'messages field is required', type: 'invalid_request' } });
    }

    // Use whatever model the request specifies, or fall back to default
    const incomingModel = (body.model || '').toString().trim();
    if (!incomingModel || incomingModel === 'auto' || incomingModel === 'platform/auto') {
      body.model = DEFAULT_MODEL;
    }

    const selectedModel = body.model;

    // Image generation — OpenRouter requires modalities for image output
    if (selectedModel?.includes('gpt-5-image')) {
      body.modalities = ['image', 'text'];
    }

    const payload = JSON.stringify(body);
    const isStream = body.stream !== false;
    const url = new URL(OPENROUTER_COMPLETIONS);

    const proxyReq = https.request(
      {
        hostname: url.hostname,
        port: 443,
        path: url.pathname,
        method: 'POST',
        timeout: 120_000,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://valnaa.com',
          'X-Title': 'OpenClaw Platform',
        },
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 200, {
          'Content-Type': proxyRes.headers['content-type'] || 'application/json',
          'Cache-Control': 'no-cache',
          ...(isStream ? { 'Transfer-Encoding': 'chunked' } : {}),
          'X-Model-Selected': selectedModel,
        });

        proxyRes.on('error', (err) => {
          console.error(`[proxy] Upstream response error mid-stream: ${err.message}`);
          if (!res.writableEnded) {
            if (isStream) {
              res.write(`data: {"error":{"message":"Upstream connection lost","type":"proxy_error"}}\n\ndata: [DONE]\n\n`);
            }
            res.end();
          }
        });

        proxyRes.pipe(res);
      }
    );

    proxyReq.on('timeout', () => {
      console.error(`[proxy] OpenRouter request timed out after 120s for model ${selectedModel}`);
      proxyReq.destroy(new Error('Request timeout'));
    });

    proxyReq.on('error', (err) => {
      console.error('[proxy] OpenRouter request failed:', err.message);
      if (!res.headersSent) {
        res.status(502).json({ error: { message: 'Upstream error', type: 'proxy_error' } });
      } else if (!res.writableEnded) {
        if (isStream) {
          res.write(`data: {"error":{"message":"Connection to AI provider failed","type":"proxy_error"}}\n\ndata: [DONE]\n\n`);
        }
        res.end();
      }
    });

    req.on('close', () => {
      if (!proxyReq.destroyed) proxyReq.destroy();
    });

    proxyReq.write(payload);
    proxyReq.end();
  } catch (err) {
    console.error('[proxy] Handler error:', (err as Error).message);
    if (!res.headersSent) {
      res.status(500).json({ error: { message: 'Internal proxy error', type: 'server_error' } });
    }
  }
});

// ── Models list proxy ──

router.get('/v1/models', async (req: Request, res: Response) => {
  try {
    const url = new URL('https://openrouter.ai/api/v1/models');
    const proxyReq = https.request(
      {
        hostname: url.hostname,
        port: 443,
        path: url.pathname,
        method: 'GET',
        headers: {
          Authorization: req.headers.authorization || '',
        },
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 200, {
          'Content-Type': proxyRes.headers['content-type'] || 'application/json',
        });
        proxyRes.pipe(res);
      }
    );
    proxyReq.on('error', () => {
      if (!res.headersSent) res.status(502).json({ error: { message: 'Upstream error' } });
    });
    proxyReq.end();
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: { message: 'Internal error' } });
  }
});

// ── Embeddings proxy ──

router.post('/v1/embeddings', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: { message: 'Missing API key', type: 'auth_error' } });
    }

    const payload = JSON.stringify(req.body);
    const url = new URL('https://openrouter.ai/api/v1/embeddings');

    const proxyReq = https.request(
      {
        hostname: url.hostname,
        port: 443,
        path: url.pathname,
        method: 'POST',
        timeout: 30_000,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          Authorization: authHeader,
          'HTTP-Referer': 'https://valnaa.com',
          'X-Title': 'OpenClaw Platform',
        },
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 200, {
          'Content-Type': proxyRes.headers['content-type'] || 'application/json',
        });
        proxyRes.pipe(res);
      }
    );
    proxyReq.on('error', (err) => {
      console.error('[proxy] Embeddings request failed:', err.message);
      if (!res.headersSent) res.status(502).json({ error: { message: 'Upstream error' } });
    });
    proxyReq.on('timeout', () => proxyReq.destroy(new Error('Embeddings timeout')));
    proxyReq.write(payload);
    proxyReq.end();
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: { message: 'Internal error' } });
  }
});

export default router;
