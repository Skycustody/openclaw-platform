/**
 * Smart model routing proxy — OpenAI-compatible endpoint that sits between
 * OpenClaw containers and OpenRouter.
 *
 * Flow:
 *   Container → POST /proxy/v1/chat/completions → AI router picks model → OpenRouter → stream back
 *
 * Routing priority:
 *   1. Direct model selection (user chose a specific model via /model command)
 *   2. Manual override (user settings brain_mode=manual)
 *   3. AI router: cheap Gemini Flash reads the message, sees all available models, picks the best one
 *   4. Heuristic fallback: keyword matching if AI router call fails
 *
 * Auth: Bearer token = the user's OpenRouter API key (sk-or-v1-xxx).
 * We look up the user by their nexos_api_key to determine their plan tier.
 */
import { Router, Request, Response } from 'express';
import https from 'https';
import { URL } from 'url';
import db from '../lib/db';
import { Plan } from '../types';
import { classifyTaskHeuristic } from '../services/heuristicClassifier';
import { selectModel, pickModelWithAI } from '../services/smartRouter';

const router = Router();

const OPENROUTER_COMPLETIONS = 'https://openrouter.ai/api/v1/chat/completions';

interface ProxyUser {
  id: string;
  plan: Plan;
  brain_mode?: string;
  manual_model?: string | null;
}

const userCache = new Map<string, { user: ProxyUser; expires: number }>();
const CACHE_TTL_MS = 60_000;

async function lookupUser(apiKey: string): Promise<ProxyUser | null> {
  const cached = userCache.get(apiKey);
  if (cached && cached.expires > Date.now()) return cached.user;

  const row = await db.getOne<{ id: string; plan: string }>(
    `SELECT u.id, u.plan FROM users u
     WHERE u.nexos_api_key = $1
     LIMIT 1`,
    [apiKey]
  );
  if (!row) return null;

  const settings = await db.getOne<{ brain_mode: string; manual_model: string | null }>(
    'SELECT brain_mode, manual_model FROM user_settings WHERE user_id = $1',
    [row.id]
  ).catch(() => null);

  const user: ProxyUser = {
    id: row.id,
    plan: row.plan as Plan,
    brain_mode: settings?.brain_mode || 'auto',
    manual_model: settings?.manual_model || null,
  };

  userCache.set(apiKey, { user, expires: Date.now() + CACHE_TTL_MS });
  return user;
}

function extractLastUserMessage(messages: any[]): string {
  if (!Array.isArray(messages)) return '';
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === 'user') {
      if (typeof m.content === 'string') return m.content;
      if (Array.isArray(m.content)) {
        return m.content
          .filter((p: any) => p.type === 'text')
          .map((p: any) => p.text)
          .join(' ');
      }
    }
  }
  return '';
}

function hasImageContent(messages: any[]): boolean {
  if (!Array.isArray(messages)) return false;
  for (const m of messages) {
    if (Array.isArray(m.content)) {
      if (m.content.some((p: any) => p.type === 'image_url' || p.type === 'image')) return true;
    }
  }
  return false;
}

function hasToolCallsInHistory(messages: any[]): boolean {
  if (!Array.isArray(messages)) return false;
  return messages.some(
    (m: any) => m.role === 'tool' || (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length > 0)
  );
}

router.post('/v1/chat/completions', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: { message: 'Missing API key', type: 'auth_error' } });
  }

  const apiKey = authHeader.slice(7);
  const user = await lookupUser(apiKey).catch(() => null);

  const body = req.body;
  if (!body?.messages) {
    return res.status(400).json({ error: { message: 'messages field is required', type: 'invalid_request' } });
  }

  const incomingModel = (body.model || '').toString().trim();
  const isAutoRouting = !incomingModel || incomingModel === 'auto' || incomingModel === 'platform/auto';

  let selectedModel: string;
  let routingReason: string;
  let routingMethod = 'direct';

  if (!isAutoRouting) {
    selectedModel = incomingModel;
    routingReason = `Direct model selection: ${incomingModel}`;
  } else if (user && user.brain_mode === 'manual' && user.manual_model) {
    selectedModel = user.manual_model;
    routingReason = 'Manual model override (user settings)';
  } else {
    const lastMessage = extractLastUserMessage(body.messages);
    const hasImage = hasImageContent(body.messages);
    const hasToolHistory = hasToolCallsInHistory(body.messages);
    const requestHasTools = Array.isArray(body.tools) && body.tools.length > 0;

    const aiPick = await pickModelWithAI(
      lastMessage,
      hasImage,
      hasToolHistory || requestHasTools,
    );

    if (aiPick) {
      selectedModel = aiPick.model;
      routingReason = `AI router: ${aiPick.reason}`;
      routingMethod = 'ai';
    } else {
      const classification = classifyTaskHeuristic(lastMessage, hasImage);

      if ((hasToolHistory || requestHasTools) && !classification.needsAgentic) {
        classification.needsAgentic = true;
        classification.complexity = 'complex';
        classification.needsInternet = true;
      }

      const plan = user?.plan || 'starter';
      const decision = selectModel(classification, plan);
      selectedModel = decision.model;
      routingReason = `Heuristic fallback: ${decision.reason}`;
      routingMethod = 'heuristic';
    }

    if (user) {
      db.query(
        `INSERT INTO routing_decisions (user_id, message_preview, classification, model_selected, reason, tokens_saved)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [user.id, lastMessage.slice(0, 200), JSON.stringify({ method: routingMethod }), selectedModel, routingReason, 0]
      ).catch(() => {});
    }
  }

  body.model = selectedModel;

  const payload = JSON.stringify(body);
  const isStream = body.stream !== false;
  const url = new URL(OPENROUTER_COMPLETIONS);

  const proxyReq = https.request(
    {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://valnaa.com',
        'X-Title': 'OpenClaw Platform',
      },
    },
    (proxyRes) => {
      // HTTP headers must be ASCII-safe; strip non-ASCII from reason string
      const safeReason = routingReason.slice(0, 100).replace(/[^\x20-\x7E]/g, '-');
      res.writeHead(proxyRes.statusCode || 200, {
        'Content-Type': proxyRes.headers['content-type'] || 'application/json',
        'Cache-Control': 'no-cache',
        ...(isStream ? { 'Transfer-Encoding': 'chunked' } : {}),
        'X-Model-Selected': selectedModel,
        'X-Routing-Reason': safeReason,
      });
      proxyRes.pipe(res);
    }
  );

  proxyReq.on('error', (err) => {
    console.error('[proxy] OpenRouter request failed:', err.message);
    if (!res.headersSent) {
      res.status(502).json({ error: { message: 'Upstream error', type: 'proxy_error' } });
    }
  });

  req.on('close', () => proxyReq.destroy());
  proxyReq.write(payload);
  proxyReq.end();
});

router.get('/v1/models', async (req: Request, res: Response) => {
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
});

export default router;
