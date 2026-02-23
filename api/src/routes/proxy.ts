/**
 * Smart model routing proxy — OpenAI-compatible endpoint that sits between
 * OpenClaw containers and OpenRouter.
 *
 * Flow:
 *   Container → POST /proxy/v1/chat/completions → AI router picks model → OpenRouter → stream back
 *
 * Routing chain (cascading):
 *   1. Direct model selection (user chose a specific model via /model command)
 *   2. Manual override (user settings brain_mode=manual)
 *   3. AI router (Gemini 2.5 Flash) reads message + conversation context + model catalog → picks best model
 *   4. AI router fallback (GPT-4o-mini) — if Gemini is down
 *   5. Safe default (Claude Sonnet 4) — if both routers fail
 *
 * Auth: Bearer token = the user's OpenRouter API key (sk-or-v1-xxx).
 * We look up the user by their nexos_api_key to determine their plan tier.
 */
import { Router, Request, Response } from 'express';
import https from 'https';
import { URL } from 'url';
import db from '../lib/db';
import { Plan } from '../types';
import { pickModelWithAI, RouterContext, getCachedUserSkills, MODEL_MAP } from '../services/smartRouter';

const router = Router();

const OPENROUTER_COMPLETIONS = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * Smart conversation compression — reduces token usage without losing context.
 *
 * Rules:
 * 1. System messages → NEVER touch (personality, instructions)
 * 2. User messages → NEVER touch (the actual requests)
 * 3. Recent messages (last 8) → NEVER touch (current task context)
 * 4. Tool results → smart trim: keep head + tail (errors are at the bottom)
 * 5. Old assistant text → keep first meaningful paragraph
 * 6. Tool call args → summarize long arguments
 * 7. Always tell the model what was removed so it doesn't hallucinate
 */
function compressMessages(messages: any[]): any[] {
  if (!Array.isArray(messages) || messages.length <= 10) return messages;

  // Find the boundary: keep the last 8 messages fully intact
  const keepFullFrom = messages.length - 8;

  return messages.map((m, i) => {
    if (i >= keepFullFrom) return m;
    if (m.role === 'system') return m;
    if (m.role === 'user') return m;

    if (m.role === 'tool') {
      return { ...m, content: smartTrimToolResult(typeof m.content === 'string' ? m.content : '') };
    }

    if (m.role === 'assistant') {
      const trimmed = { ...m };
      if (typeof trimmed.content === 'string' && trimmed.content.length > 1200) {
        trimmed.content = smartTrimAssistant(trimmed.content);
      }
      if (Array.isArray(trimmed.tool_calls)) {
        trimmed.tool_calls = trimmed.tool_calls.map(smartTrimToolCall);
      }
      return trimmed;
    }

    return m;
  });
}

function smartTrimToolResult(content: string): string {
  if (content.length <= 1200) return content;

  const lines = content.split('\n');

  // Browser snapshots: very large, mostly DOM structure
  if (content.includes('ref=') && content.includes('[') && lines.length > 30) {
    const headLines = lines.slice(0, 8);
    const tailLines = lines.slice(-8);
    const droppedCount = lines.length - 16;
    return [
      ...headLines,
      `\n[... ${droppedCount} lines of page structure omitted — page had ${lines.length} elements ...]`,
      ...tailLines,
    ].join('\n');
  }

  // Command output: errors and results usually at the end
  if (content.includes('$') || content.includes('exit code') || content.includes('Error') || content.includes('>>>')) {
    const head = lines.slice(0, 5).join('\n');
    const tail = lines.slice(-12).join('\n');
    const droppedChars = content.length - head.length - tail.length;
    return `${head}\n[... ${droppedChars} chars of output omitted ...]\n${tail}`;
  }

  // JSON / API responses: keep structure
  const trimmedContent = content.trim();
  if (trimmedContent.startsWith('{') || trimmedContent.startsWith('[')) {
    const head = content.slice(0, 500);
    const tail = content.slice(-300);
    return `${head}\n[... ${content.length - 800} chars omitted ...]\n${tail}`;
  }

  // File contents / general text: head + tail
  const head = content.slice(0, 400);
  const tail = content.slice(-400);
  return `${head}\n[... ${content.length - 800} chars omitted — full content was ${content.length} chars ...]\n${tail}`;
}

function smartTrimAssistant(content: string): string {
  // Keep first meaningful paragraph + note what was trimmed
  const paragraphs = content.split('\n\n');
  if (paragraphs.length <= 2) {
    return content.slice(0, 800) + `\n[... response continued for ${content.length - 800} more chars ...]`;
  }

  const kept = paragraphs.slice(0, 2).join('\n\n');
  const droppedCount = paragraphs.length - 2;
  return kept + `\n[... ${droppedCount} more paragraphs omitted ...]`;
}

function smartTrimToolCall(tc: any): any {
  if (!tc?.function?.arguments || typeof tc.function.arguments !== 'string') return tc;
  const args = tc.function.arguments;
  if (args.length <= 500) return tc;

  // Keep the tool name and summarize long args (e.g., large code blocks passed to write_file)
  try {
    const parsed = JSON.parse(args);
    const summary: Record<string, any> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string' && (value as string).length > 200) {
        summary[key] = (value as string).slice(0, 150) + `... [${(value as string).length} chars total]`;
      } else {
        summary[key] = value;
      }
    }
    return { ...tc, function: { ...tc.function, arguments: JSON.stringify(summary) } };
  } catch {
    return { ...tc, function: { ...tc.function, arguments: args.slice(0, 400) + '... [trimmed]' } };
  }
}

/**
 * Get appropriate max_tokens for a model based on its cost tier.
 * Caps output to save cost — doesn't affect quality since most useful
 * responses are well under these limits.
 */
function getMaxTokens(model: string, requestedMax?: number): number {
  const info = MODEL_MAP[model];
  const cost = info?.costPer1MTokens ?? 1.0;

  let cap: number;
  if (cost >= 10.0) cap = 4096;
  else if (cost >= 3.0) cap = 6144;
  else cap = 16384;

  if (requestedMax && requestedMax > 0) return Math.min(requestedMax, cap);
  return cap;
}

interface ProxyUser {
  id: string;
  plan: Plan;
  brain_mode?: string;
  manual_model?: string | null;
  routing_preferences?: Record<string, string>;
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

  const settings = await db.getOne<{ brain_mode: string; manual_model: string | null; routing_preferences: any }>(
    'SELECT brain_mode, manual_model, routing_preferences FROM user_settings WHERE user_id = $1',
    [row.id]
  ).catch(() => null);

  let prefs: Record<string, string> = {};
  if (settings?.routing_preferences) {
    try {
      prefs = typeof settings.routing_preferences === 'string'
        ? JSON.parse(settings.routing_preferences)
        : settings.routing_preferences;
    } catch { /* invalid JSON */ }
  }

  const user: ProxyUser = {
    id: row.id,
    plan: row.plan as Plan,
    brain_mode: settings?.brain_mode || 'auto',
    manual_model: settings?.manual_model || null,
    routing_preferences: prefs,
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

function extractConversationContext(messages: any[]): RouterContext {
  if (!Array.isArray(messages)) return { messageCount: 0, toolCallCount: 0 };

  let toolCallCount = 0;
  let lastAssistantSnippet: string | undefined;
  const recentToolNames: string[] = [];
  const toolNameSet = new Set<string>();

  for (const m of messages) {
    if (m.role === 'assistant' && Array.isArray(m.tool_calls)) {
      toolCallCount += m.tool_calls.length;
      for (const tc of m.tool_calls) {
        const name = tc?.function?.name;
        if (name && !toolNameSet.has(name)) {
          toolNameSet.add(name);
          recentToolNames.push(name);
        }
      }
    }
    if (m.role === 'assistant' && typeof m.content === 'string' && m.content.trim()) {
      lastAssistantSnippet = m.content.trim().slice(0, 200);
    }
  }

  // previousUserMessage should be the second-to-last user message (not the current one)
  // The current message is extracted separately by extractLastUserMessage
  // So we need to find the one before it
  let prevUserMsg: string | undefined;
  let foundLast = false;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === 'user') {
      const text = typeof m.content === 'string' ? m.content
        : Array.isArray(m.content) ? m.content.filter((p: any) => p.type === 'text').map((p: any) => p.text).join(' ')
        : '';
      if (!text.trim()) continue;
      if (!foundLast) { foundLast = true; continue; }
      prevUserMsg = text.trim().slice(0, 200);
      break;
    }
  }

  // Build a task summary from recent tool names
  let taskSummary: string | undefined;
  const toolNames = recentToolNames.slice(-15);
  const hasBrowser = toolNames.some(t => /browser|navigate|click|snapshot|fill|type/i.test(t));
  const hasExec = toolNames.some(t => /exec|shell|command/i.test(t));
  const hasCode = toolNames.some(t => /write|edit|read_file|create_file/i.test(t));
  const hasSearch = toolNames.some(t => /search|web_fetch|web_search/i.test(t));
  const hasMemory = toolNames.some(t => /memory|remember|recall/i.test(t));

  if (hasBrowser) taskSummary = 'browser automation / web interaction';
  else if (hasCode && hasExec) taskSummary = 'coding and running commands';
  else if (hasCode) taskSummary = 'reading/writing code or files';
  else if (hasExec) taskSummary = 'running shell commands';
  else if (hasSearch) taskSummary = 'web research';
  else if (hasMemory) taskSummary = 'memory operations';
  else if (toolCallCount > 0) taskSummary = 'tool-assisted task';

  return {
    messageCount: messages.length,
    toolCallCount,
    lastAssistantSnippet,
    recentToolNames: toolNames.length > 0 ? toolNames.slice(-10) : undefined,
    previousUserMessage: prevUserMsg,
    taskSummary,
  };
}

router.post('/v1/chat/completions', async (req: Request, res: Response) => {
  try {
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
    let routerUsed = 'direct';

    if (!isAutoRouting) {
      selectedModel = incomingModel;
      routingReason = `Direct: ${incomingModel}`;
    } else if (user && user.brain_mode === 'manual' && user.manual_model) {
      selectedModel = user.manual_model;
      routingReason = 'Manual override';
      routerUsed = 'manual';
    } else {
      const lastMessage = extractLastUserMessage(body.messages);
      const hasImage = hasImageContent(body.messages);
      const hasToolHistory = hasToolCallsInHistory(body.messages);
      const ctx = extractConversationContext(body.messages);

      const userPrefs = user?.routing_preferences && Object.keys(user.routing_preferences).length > 0
        ? user.routing_preferences : undefined;
      const skills = user ? await getCachedUserSkills(user.id) : [];
      const installedSkills = skills.length > 0 ? skills : undefined;

      const aiPick = await pickModelWithAI(
        lastMessage,
        hasImage,
        hasToolHistory,
        ctx,
        apiKey,
        userPrefs,
        installedSkills,
        user?.id,
      );

      selectedModel = aiPick.model;
      routingReason = aiPick.reason;
      routerUsed = aiPick.routerUsed;

      if (user) {
        db.query(
          `INSERT INTO routing_decisions (user_id, message_preview, classification, model_selected, reason, tokens_saved)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [user.id, lastMessage.slice(0, 200), JSON.stringify({ method: 'ai', routerUsed, depth: ctx.messageCount, toolCalls: ctx.toolCallCount }), selectedModel, routingReason, 0]
        ).catch(() => {});
      }
    }

    body.model = selectedModel;

    const modelCost = MODEL_MAP[selectedModel]?.costPer1MTokens ?? 1.0;
    if (modelCost >= 0.50) {
      body.messages = compressMessages(body.messages);
    }

    if (modelCost >= 3.0) {
      body.max_tokens = getMaxTokens(selectedModel, body.max_tokens);
      body.transforms = ['middle-out'];
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
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://valnaa.com',
          'X-Title': 'OpenClaw Platform',
        },
      },
      (proxyRes) => {
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
  } catch (err) {
    console.error('[proxy] Handler error:', (err as Error).message);
    if (!res.headersSent) {
      res.status(500).json({ error: { message: 'Internal proxy error', type: 'server_error' } });
    }
  }
});

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

export default router;
