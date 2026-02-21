import { Router, Request, Response } from 'express';
import https from 'https';
import { URL } from 'url';
import db from '../lib/db';
import { checkBalance, trackUsage } from '../services/tokenTracker';
import { classifyTask, RETAIL_PRICES } from '../services/smartRouter';
import { getUserOwnKey } from './settings';
import { rateLimitProxy } from '../middleware/rateLimit';

const router = Router();
router.use(rateLimitProxy);

const OPENAI_ORIGIN = 'https://api.openai.com';
const ANTHROPIC_ORIGIN = 'https://api.anthropic.com';

const MIN_TOKENS_REQUIRED = 100;
const DEFAULT_ESTIMATE_TOKENS = 500;

const MODEL_COST_PER_1K: Record<string, number> = {
  'gpt-4o-mini': 0.5,
  'gpt-4o': 5,
  'gpt-4o-search-preview': 0.8,
  'gpt-4.1-mini': 0.5,
  'gpt-4.1': 5,
  'claude-3-5-haiku': 0.25,
  'claude-3-5-sonnet': 3,
  'claude-sonnet-4-6': 3,
  'claude-opus-4-6': 15,
};

/**
 * Extract the proxy key from the request.
 * OpenAI SDK sends: Authorization: Bearer val_sk_xxx
 * Anthropic SDK sends: x-api-key: val_sk_xxx
 *
 * SECURITY: Every request MUST have a valid val_sk_ proxy key.
 * Even users with their own API keys still authenticate via proxy key.
 * We never allow raw sk-* keys to bypass authentication.
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

interface ValidatedUser {
  userId: string;
  balance: number;
  status: string;
  plan: string;
}

/**
 * Validate a proxy key and return user info including balance and status.
 * Cached for 30s to reduce DB load.
 */
const userCache = new Map<string, { data: ValidatedUser; expiresAt: number }>();
const CACHE_TTL_MS = 30_000;

async function validateAndCheckUser(key: string): Promise<ValidatedUser | null> {
  const cached = userCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const row = await db.getOne<{
    id: string;
    status: string;
    plan: string;
  }>(
    'SELECT id, status, plan FROM users WHERE api_proxy_key = $1',
    [key]
  );

  if (!row) {
    userCache.delete(key);
    return null;
  }

  const balance = await checkBalance(row.id);

  const data: ValidatedUser = {
    userId: row.id,
    balance,
    status: row.status,
    plan: row.plan,
  };

  userCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
  return data;
}

/** Invalidate cache after usage deduction so next request sees updated balance */
function invalidateUserCache(key: string): void {
  userCache.delete(key);
}

/**
 * Extract model name from the request body (if it's a chat/completion call).
 */
function extractModel(body: any): string | null {
  if (!body || typeof body !== 'object') return null;
  return body.model || null;
}

/**
 * Extract the user's message content from the request body for classification.
 * Works with both OpenAI (messages[].content) and Anthropic (messages[].content) formats.
 */
function extractUserMessage(body: any): string | null {
  if (!body || typeof body !== 'object') return null;
  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) return null;
  // Get the last user message
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      const content = messages[i].content;
      if (typeof content === 'string') return content;
      if (Array.isArray(content)) {
        const textPart = content.find((p: any) => p.type === 'text');
        return textPart?.text || null;
      }
    }
  }
  return null;
}

/**
 * Estimate the max_tokens for this request to give a rough cost check.
 */
function extractMaxTokens(body: any): number {
  if (!body || typeof body !== 'object') return DEFAULT_ESTIMATE_TOKENS;
  return body.max_tokens || body.max_completion_tokens || DEFAULT_ESTIMATE_TOKENS;
}

/**
 * Run pre-flight checks: subscription status, token balance, cost estimate.
 * Returns an error response object if blocked, or null if OK.
 */
async function preFlightCheck(
  user: ValidatedUser,
  body: any,
  provider: string
): Promise<{ status: number; body: Record<string, any> } | null> {

  // 1. Check subscription status
  if (user.status === 'cancelled') {
    return {
      status: 403,
      body: {
        error: {
          message: 'Your subscription has been cancelled. Please resubscribe to continue using AI features.',
          type: 'subscription_cancelled',
          code: 'SUBSCRIPTION_CANCELLED',
        },
      },
    };
  }

  if (user.status === 'paused') {
    return {
      status: 402,
      body: {
        error: {
          message: 'Your agent is paused because you ran out of tokens. Please purchase more tokens to continue.',
          type: 'insufficient_tokens',
          code: 'OUT_OF_TOKENS',
          balance: user.balance,
        },
      },
    };
  }

  if (!['active', 'sleeping', 'provisioning', 'grace_period'].includes(user.status)) {
    return {
      status: 403,
      body: {
        error: {
          message: 'Your account is not in an active state. Please contact support.',
          type: 'account_inactive',
          code: 'ACCOUNT_INACTIVE',
        },
      },
    };
  }

  // 2. Check minimum token balance
  if (user.balance < MIN_TOKENS_REQUIRED) {
    return {
      status: 402,
      body: {
        error: {
          message: `You only have ${user.balance.toLocaleString()} tokens remaining. You need at least ${MIN_TOKENS_REQUIRED} tokens to make AI requests. Please purchase more tokens.`,
          type: 'insufficient_tokens',
          code: 'INSUFFICIENT_TOKENS',
          balance: user.balance,
          minimum_required: MIN_TOKENS_REQUIRED,
        },
      },
    };
  }

  // 3. Cost estimate — use the smart router's small LLM to classify the task
  //    and estimate tokens, then check against the user's balance
  const model = extractModel(body);
  const maxTokens = extractMaxTokens(body);

  // Extract the user's message content for classification
  const userMessage = extractUserMessage(body);

  if (userMessage && userMessage.length > 10) {
    try {
      const classification = await classifyTask(userMessage, false);
      const estimatedTokens = classification.estimatedTokens || maxTokens;

      // Use retail prices if available for the model, otherwise fall back to cost map
      const retailRate = model && RETAIL_PRICES[model]
        ? RETAIL_PRICES[model] / 1_000_000
        : (model && MODEL_COST_PER_1K[model] ? MODEL_COST_PER_1K[model] / 1000 : 0);

      if (retailRate > 0) {
        const estimatedCost = Math.ceil(estimatedTokens * retailRate * 1000);
        if (estimatedCost > user.balance) {
          return {
            status: 402,
            body: {
              error: {
                message: `This ${classification.complexity} task is estimated to use ~${estimatedCost.toLocaleString()} tokens (model: ${model || 'auto'}, ~${estimatedTokens.toLocaleString()} tokens), but you only have ${user.balance.toLocaleString()} tokens. Try a simpler prompt, use a cheaper model, or purchase more tokens.`,
                type: 'insufficient_tokens',
                code: 'ESTIMATED_COST_TOO_HIGH',
                balance: user.balance,
                estimated_cost: estimatedCost,
                complexity: classification.complexity,
                model,
              },
            },
          };
        }
      }
    } catch {
      // Classification failed — fall back to simple max_tokens check
    }
  }

  // Fallback: simple max_tokens * model cost check when classification isn't available
  if (model && MODEL_COST_PER_1K[model]) {
    const costPer1K = MODEL_COST_PER_1K[model];
    const estimatedCost = Math.ceil(maxTokens * costPer1K);
    if (estimatedCost > user.balance) {
      return {
        status: 402,
        body: {
          error: {
            message: `This request may use up to ~${estimatedCost.toLocaleString()} tokens (model: ${model}, max_tokens: ${maxTokens}), but you only have ${user.balance.toLocaleString()} tokens. Please reduce max_tokens, use a cheaper model, or purchase more tokens.`,
            type: 'insufficient_tokens',
            code: 'ESTIMATED_COST_TOO_HIGH',
            balance: user.balance,
            estimated_cost: estimatedCost,
            model,
          },
        },
      };
    }
  }

  return null;
}

/**
 * Forward a request to an upstream AI provider, streaming the response back.
 * Counts response bytes/tokens and deducts from the user's balance after completion.
 */
function forwardRequest(
  req: Request,
  res: Response,
  targetOrigin: string,
  realApiKey: string,
  provider: 'openai' | 'anthropic',
  userId: string,
  proxyKey: string
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

  const model = extractModel(req.body) || `${provider}-unknown`;
  const isCompletionEndpoint = upstreamPath.includes('/chat/completions') ||
    upstreamPath.includes('/messages') ||
    upstreamPath.includes('/completions');

  const upstream = https.request(options, (upstreamRes) => {
    res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);

    if (!isCompletionEndpoint || (upstreamRes.statusCode && upstreamRes.statusCode >= 400)) {
      upstreamRes.pipe(res);
      return;
    }

    // Collect response to extract usage info
    const chunks: Buffer[] = [];
    upstreamRes.on('data', (chunk) => {
      chunks.push(chunk);
      res.write(chunk);
    });

    upstreamRes.on('end', () => {
      res.end();

      // Parse usage from response and deduct tokens
      const responseText = Buffer.concat(chunks).toString('utf8');
      const tokensUsed = extractTokenUsage(responseText, provider);

      if (tokensUsed > 0 && userId !== 'self-key') {
        trackUsage(userId, model, tokensUsed).catch((err) =>
          console.error(`[proxy] Token tracking failed for ${userId}:`, err.message)
        );
        invalidateUserCache(proxyKey);
      }
    });

    upstreamRes.on('error', () => res.end());
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

/**
 * Extract token usage from the AI provider response.
 * Works for both streaming (SSE) and non-streaming responses.
 */
function extractTokenUsage(responseText: string, provider: string): number {
  try {
    // Non-streaming: look for usage object in JSON response
    if (responseText.startsWith('{')) {
      const json = JSON.parse(responseText);
      if (json.usage?.total_tokens) return json.usage.total_tokens;
      if (json.usage?.input_tokens && json.usage?.output_tokens) {
        return json.usage.input_tokens + json.usage.output_tokens;
      }
    }

    // Streaming (SSE): scan for usage in the final data chunks
    // OpenAI includes usage in the last `data: {...}` chunk when stream_options.include_usage is set
    // Anthropic includes it in message_delta or message_stop events
    const lines = responseText.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;

      try {
        const chunk = JSON.parse(line.slice(6));

        // OpenAI streaming usage
        if (chunk.usage?.total_tokens) return chunk.usage.total_tokens;
        if (chunk.usage?.prompt_tokens && chunk.usage?.completion_tokens) {
          return chunk.usage.prompt_tokens + chunk.usage.completion_tokens;
        }

        // Anthropic streaming usage
        if (chunk.type === 'message_delta' && chunk.usage?.output_tokens) {
          // Anthropic sends input_tokens in message_start, output in message_delta
          // Scan backwards for message_start to get input tokens
          let inputTokens = 0;
          for (let j = 0; j < lines.length; j++) {
            if (!lines[j].startsWith('data: ')) continue;
            try {
              const startChunk = JSON.parse(lines[j].slice(6));
              if (startChunk.type === 'message_start' && startChunk.message?.usage?.input_tokens) {
                inputTokens = startChunk.message.usage.input_tokens;
                break;
              }
            } catch {}
          }
          return inputTokens + chunk.usage.output_tokens;
        }
      } catch {}
    }
  } catch {}

  // Fallback: estimate based on response size (~4 chars per token)
  // Only apply a small fallback so we don't over-charge
  if (responseText.length > 100) {
    return Math.ceil(responseText.length / 4);
  }

  return 0;
}

// ── OpenAI proxy: /proxy/openai/* ──

router.all('/openai/*', async (req: Request, res: Response) => {
  // SECURITY: Always require a valid proxy key for authentication
  const proxyKey = extractProxyKey(req);
  if (!proxyKey) {
    return res.status(401).json({ error: { message: 'Missing or invalid API key', code: 'INVALID_KEY' } });
  }

  const user = await validateAndCheckUser(proxyKey);
  if (!user) {
    return res.status(403).json({ error: { message: 'Invalid or inactive API key', code: 'INVALID_KEY' } });
  }

  // Check if user has their own OpenAI key stored — if so, use it (no token deduction)
  const ownKey = await getUserOwnKey(user.userId, 'openai');
  if (ownKey) {
    return forwardRequest(req, res, OPENAI_ORIGIN, ownKey, 'openai', 'self-key', 'self');
  }

  // Platform key — full token checks apply
  const realKey = process.env.OPENAI_API_KEY;
  if (!realKey) {
    return res.status(503).json({ error: { message: 'OpenAI provider not configured', code: 'PROVIDER_NOT_CONFIGURED' } });
  }

  const blocked = await preFlightCheck(user, req.body, 'openai');
  if (blocked) {
    return res.status(blocked.status).json(blocked.body);
  }

  forwardRequest(req, res, OPENAI_ORIGIN, realKey, 'openai', user.userId, proxyKey);
});

// ── Anthropic proxy: /proxy/anthropic/* ──

router.all('/anthropic/*', async (req: Request, res: Response) => {
  // SECURITY: Always require a valid proxy key for authentication
  const proxyKey = extractProxyKey(req);
  if (!proxyKey) {
    return res.status(401).json({ error: { message: 'Missing or invalid API key', code: 'INVALID_KEY' } });
  }

  const user = await validateAndCheckUser(proxyKey);
  if (!user) {
    return res.status(403).json({ error: { message: 'Invalid or inactive API key', code: 'INVALID_KEY' } });
  }

  // Check if user has their own Anthropic key stored — if so, use it (no token deduction)
  const ownKey = await getUserOwnKey(user.userId, 'anthropic');
  if (ownKey) {
    return forwardRequest(req, res, ANTHROPIC_ORIGIN, ownKey, 'anthropic', 'self-key', 'self');
  }

  // Platform key — full token checks apply
  const realKey = process.env.ANTHROPIC_API_KEY;
  if (!realKey) {
    return res.status(503).json({ error: { message: 'Anthropic provider not configured', code: 'PROVIDER_NOT_CONFIGURED' } });
  }

  const blocked = await preFlightCheck(user, req.body, 'anthropic');
  if (blocked) {
    return res.status(blocked.status).json(blocked.body);
  }

  forwardRequest(req, res, ANTHROPIC_ORIGIN, realKey, 'anthropic', user.userId, proxyKey);
});

export default router;
