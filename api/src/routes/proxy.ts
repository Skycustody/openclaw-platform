import { Router, Request, Response } from 'express';
import https from 'https';
import { URL } from 'url';
import db from '../lib/db';

const router = Router();

const OPENAI_ORIGIN = 'https://api.openai.com';
const ANTHROPIC_ORIGIN = 'https://api.anthropic.com';

/**
 * Extract the proxy key from the request.
 * OpenAI SDK sends: Authorization: Bearer val_sk_xxx
 * Anthropic SDK sends: x-api-key: val_sk_xxx
 */
function extractProxyKey(req: Request): string | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    const key = auth.slice(7).trim();
    if (key.startsWith('val_sk_')) return key;
  }

  const xApiKey = req.headers['x-api-key'];
  if (typeof xApiKey === 'string' && xApiKey.startsWith('val_sk_')) {
    return xApiKey;
  }

  return null;
}

/**
 * Validate a proxy key against the database. Returns user ID or null.
 * Uses a simple in-memory cache (60s TTL) to avoid a DB hit on every AI call.
 */
const keyCache = new Map<string, { userId: string; expiresAt: number }>();
const CACHE_TTL_MS = 60_000;

async function validateProxyKey(key: string): Promise<string | null> {
  const cached = keyCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.userId;
  }

  const row = await db.getOne<{ id: string }>(
    'SELECT id FROM users WHERE api_proxy_key = $1 AND status IN ($2, $3, $4)',
    [key, 'active', 'sleeping', 'provisioning']
  );

  if (!row) {
    keyCache.delete(key);
    return null;
  }

  keyCache.set(key, { userId: row.id, expiresAt: Date.now() + CACHE_TTL_MS });
  return row.id;
}

/**
 * Forward a request to an upstream AI provider, streaming the response back.
 */
function forwardRequest(
  req: Request,
  res: Response,
  targetOrigin: string,
  realApiKey: string,
  provider: 'openai' | 'anthropic'
): void {
  const pathPrefix = provider === 'openai' ? '/proxy/openai' : '/proxy/anthropic';
  const upstreamPath = req.originalUrl.replace(pathPrefix, '');

  const targetUrl = new URL(upstreamPath, targetOrigin);

  const headers: Record<string, string> = {};

  if (req.headers['content-type']) {
    headers['content-type'] = req.headers['content-type'] as string;
  }
  if (req.headers['accept']) {
    headers['accept'] = req.headers['accept'] as string;
  }

  if (provider === 'openai') {
    headers['authorization'] = `Bearer ${realApiKey}`;
  } else {
    headers['x-api-key'] = realApiKey;
    if (req.headers['anthropic-version']) {
      headers['anthropic-version'] = req.headers['anthropic-version'] as string;
    }
    if (req.headers['anthropic-beta']) {
      headers['anthropic-beta'] = req.headers['anthropic-beta'] as string;
    }
  }

  const body = req.method !== 'GET' && req.body
    ? (typeof req.body === 'string' ? req.body : JSON.stringify(req.body))
    : undefined;

  const options = {
    hostname: targetUrl.hostname,
    port: 443,
    path: targetUrl.pathname + targetUrl.search,
    method: req.method,
    headers: {
      ...headers,
      ...(body ? { 'content-length': Buffer.byteLength(body).toString() } : {}),
    },
  };

  const upstream = https.request(options, (upstreamRes) => {
    res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
    upstreamRes.pipe(res);
  });

  upstream.on('error', (err) => {
    console.error(`[proxy] Upstream error (${provider}):`, err.message);
    if (!res.headersSent) {
      res.status(502).json({ error: `Upstream ${provider} request failed` });
    }
  });

  if (body) {
    upstream.write(body);
  }
  upstream.end();
}

// ── OpenAI proxy: /proxy/openai/* ──

router.all('/openai/*', async (req: Request, res: Response) => {
  const proxyKey = extractProxyKey(req);
  if (!proxyKey) {
    return res.status(401).json({ error: 'Missing or invalid proxy key' });
  }

  const realKey = process.env.OPENAI_API_KEY;
  if (!realKey) {
    return res.status(503).json({ error: 'OpenAI provider not configured' });
  }

  const userId = await validateProxyKey(proxyKey);
  if (!userId) {
    return res.status(403).json({ error: 'Invalid or inactive proxy key' });
  }

  forwardRequest(req, res, OPENAI_ORIGIN, realKey, 'openai');
});

// ── Anthropic proxy: /proxy/anthropic/* ──

router.all('/anthropic/*', async (req: Request, res: Response) => {
  const proxyKey = extractProxyKey(req);
  if (!proxyKey) {
    return res.status(401).json({ error: 'Missing or invalid proxy key' });
  }

  const realKey = process.env.ANTHROPIC_API_KEY;
  if (!realKey) {
    return res.status(503).json({ error: 'Anthropic provider not configured' });
  }

  const userId = await validateProxyKey(proxyKey);
  if (!userId) {
    return res.status(403).json({ error: 'Invalid or inactive proxy key' });
  }

  forwardRequest(req, res, ANTHROPIC_ORIGIN, realKey, 'anthropic');
});

export default router;
