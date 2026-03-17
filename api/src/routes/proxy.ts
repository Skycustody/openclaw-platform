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
import { touchActivity } from '../services/sleepWake';

const router = Router();

// Debounce touchActivity per user — at most once per 60s to avoid DB spam
const lastTouch = new Map<string, number>();
function touchIfNeeded(userId: string): void {
  const now = Date.now();
  const last = lastTouch.get(userId) || 0;
  if (now - last < 60_000) return;
  lastTouch.set(userId, now);
  touchActivity(userId).catch(() => {});
}

// Deduplicate activity log — collapse multi-step tasks into one entry
const recentActivity = new Map<string, { summary: string; ts: number; id?: string }>();
const ACTIVITY_DEDUP_MS = 120_000;

// Per-user routing cache — reuse model during tool loops to skip router overhead
const lastRouting = new Map<string, { model: string; reason: string; routerUsed: string; ts: number }>();
const ROUTING_REUSE_MS = 180_000;

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
function isBrowserSession(messages: any[]): boolean {
  for (let i = messages.length - 1; i >= Math.max(0, messages.length - 12); i--) {
    const m = messages[i];
    if (m.role === 'assistant' && Array.isArray(m.tool_calls)) {
      if (m.tool_calls.some((tc: any) => /browser|navigate|click|snapshot|fill|type|scroll/i.test(tc?.function?.name || ''))) return true;
    }
    if (m.role === 'tool' && typeof m.content === 'string' && m.content.includes('ref=') && m.content.includes('[')) return true;
  }
  return false;
}

function compressMessages(messages: any[]): any[] {
  if (!Array.isArray(messages) || messages.length <= 10) return messages;

  // Detect tool-calling loop: if the last message is a tool result or assistant
  // with tool_calls, the agent is mid-task. Skip compression entirely so the
  // cached prefix stays identical between consecutive calls → cache hits.
  const last = messages[messages.length - 1];
  const inToolLoop = last?.role === 'tool' ||
    (last?.role === 'assistant' && Array.isArray(last?.tool_calls) && last.tool_calls.length > 0);

  if (inToolLoop) return messages;

  // New user message = new task boundary. Compress old messages now.
  const isBrowser = isBrowserSession(messages);

  let lastUserIdx = messages.length;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') { lastUserIdx = i; break; }
  }

  const deepTrimBefore = isBrowser ? Math.max(0, lastUserIdx - 10) : -1;

  return messages.map((m, i) => {
    if (i >= lastUserIdx) return m;
    if (m.role === 'system') return m;
    if (m.role === 'user') return m;

    if (m.role === 'tool') {
      const content = typeof m.content === 'string' ? m.content : '';
      if (isBrowser && i < deepTrimBefore) {
        return { ...m, content: collapseBrowserSnapshot(content) };
      }
      return { ...m, content: smartTrimToolResult(content) };
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

function collapseBrowserSnapshot(content: string): string {
  if (content.length < 200) return content;
  const isBrowserDom = content.includes('ref=') && content.includes('[');
  if (!isBrowserDom) return smartTrimToolResult(content);
  const lines = content.split('\n');
  const titleMatch = content.match(/title[=:]\s*["']?([^"'\n]{1,80})/i);
  const title = titleMatch ? titleMatch[1].trim() : 'unknown page';
  return `[Old page snapshot: "${title}", ${lines.length} elements — content omitted, see recent snapshots for current state]`;
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
 * Add Anthropic prompt caching breakpoints to messages.
 * Only applies to anthropic/* models. Uses up to 4 breakpoints (Anthropic max).
 *
 * Strategy: place breakpoints at STABLE positions that don't move between
 * consecutive API calls within the same tool loop. During agentic execution,
 * the agent makes many back-to-back calls adding tool_call + tool_result each
 * time. A sliding breakpoint (e.g., length-4) invalidates the cache every call.
 *
 * Stable breakpoints:
 *   1. System message — never changes
 *   2. Last user message — stable throughout the entire tool loop
 *   3. Midpoint of pre-user history — stable for long conversations
 *
 * OpenRouter passes cache_control through to Anthropic's API.
 * Cache TTL = 5 min, min ~1024 tokens per cached prefix.
 */
function addPromptCaching(messages: any[], model: string): any[] {
  if (!model.startsWith('anthropic/')) return messages;
  if (!Array.isArray(messages) || messages.length < 3) return messages;

  const result = messages.map((m: any) => ({ ...m }));

  // Breakpoint 1: System message (never changes between turns)
  const sysIdx = result.findIndex((m: any) => m.role === 'system');
  if (sysIdx !== -1) {
    markCacheControl(result, sysIdx);
  }

  // Find the last user message — this is STABLE during a tool loop.
  // The agent adds tool_call+tool_result pairs after it, but no new user messages.
  let lastUserIdx = -1;
  for (let i = result.length - 1; i >= 0; i--) {
    if (result[i].role === 'user') { lastUserIdx = i; break; }
  }

  // Breakpoint 2: Last user message (stable during entire tool-calling sequence)
  if (lastUserIdx > sysIdx + 1) {
    markCacheControl(result, lastUserIdx);
  }

  // Breakpoint 3: Midpoint of history before last user message (for long conversations)
  if (lastUserIdx > sysIdx + 8) {
    const midIdx = sysIdx + 1 + Math.floor((lastUserIdx - sysIdx - 1) / 2);
    if (midIdx > sysIdx + 1 && midIdx < lastUserIdx) {
      markCacheControl(result, midIdx);
    }
  }

  return result;
}

function markCacheControl(messages: any[], idx: number): void {
  const msg = messages[idx];
  if (typeof msg.content === 'string' && msg.content.length > 0) {
    messages[idx] = {
      ...msg,
      content: [{
        type: 'text',
        text: msg.content,
        cache_control: { type: 'ephemeral' },
      }],
    };
  } else if (Array.isArray(msg.content) && msg.content.length > 0) {
    const parts = msg.content.map((p: any) => ({ ...p }));
    parts[parts.length - 1] = {
      ...parts[parts.length - 1],
      cache_control: { type: 'ephemeral' },
    };
    messages[idx] = { ...msg, content: parts };
  }
}

function getMaxTokens(model: string, requestedMax?: number, browserMode?: boolean): number {
  const info = MODEL_MAP[model];
  const cost = info?.costPer1MTokens ?? 1.0;

  let cap: number;
  if (browserMode && cost >= 3.0) cap = 2048;
  else if (cost >= 10.0) cap = 4096;
  else if (cost >= 3.0) cap = 6144;
  else cap = 16384;

  if (requestedMax && requestedMax > 0) return Math.min(requestedMax, cap);
  return cap;
}

interface ProxyUser {
  id: string;
  plan: Plan;
  status: string;
  trial_ends_at?: Date | null;
  brain_mode?: string;
  manual_model?: string | null;
  routing_preferences?: Record<string, string>;
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
    status: row.status,
    trial_ends_at: row.trial_ends_at,
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

const GUARDRAIL_MARKER = '⚙ PLATFORM RULES';
const GUARDRAIL_TEXT = `${GUARDRAIL_MARKER} (auto-injected, always follow):
1. NEVER send localhost or 127.0.0.1 links to the user. They are on a different computer. Always use PREVIEW_URL.
2. If a tool fails, do NOT retry it more than once. Tell the user it's unavailable and suggest an alternative.
3. NEVER ask the user to run commands, check terminals, edit files, or do anything technical. You do it.
4. Do NOT combine "Okay" text with tool calls — text won't be delivered until tools finish. Either just work silently or use openclaw message send for immediate status.
5. When something fails, say so plainly. Never pretend it worked or silently try a different approach.`;

function detectFailedTools(messages: any[]): string[] {
  const failedTools = new Set<string>();
  const toolCallMap = new Map<string, string>();

  for (const m of messages) {
    if (m.role === 'assistant' && Array.isArray(m.tool_calls)) {
      for (const tc of m.tool_calls) {
        if (tc.id && tc.function?.name) toolCallMap.set(tc.id, tc.function.name);
      }
    }
    if (m.role === 'tool' && m.tool_call_id && typeof m.content === 'string') {
      const content = m.content.toLowerCase();
      if (content.includes('error') || content.includes('failed') || content.includes('timed out')
          || content.includes('unavailable') || content.includes('not found')
          || content.includes('cannot') || content.includes('node required')) {
        const name = toolCallMap.get(m.tool_call_id);
        if (name) failedTools.add(name);
      }
    }
  }
  return [...failedTools];
}

function injectGuardrails(messages: any[]): void {
  if (!Array.isArray(messages)) return;

  // Remove any previously injected guardrail to avoid accumulation
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'system' && typeof messages[i].content === 'string'
        && messages[i].content.includes(GUARDRAIL_MARKER)) {
      messages.splice(i, 1);
    }
  }

  // Detect tools that have already failed in this conversation
  const failed = detectFailedTools(messages);
  let text = GUARDRAIL_TEXT;
  if (failed.length > 0) {
    text += `\n6. BROKEN TOOLS IN THIS SESSION: ${failed.join(', ')} — these have already failed. Do NOT use them again. Use alternatives or tell the user they're unavailable.`;
  }

  // Find the last system message index, insert guardrail right after it
  let insertIdx = 0;
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role === 'system') insertIdx = i + 1;
    else break;
  }

  messages.splice(insertIdx, 0, { role: 'system', content: text });
}

function hasToolCallsInHistory(messages: any[]): boolean {
  if (!Array.isArray(messages)) return false;
  return messages.some(
    (m: any) => m.role === 'tool' || (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length > 0)
  );
}

// ── Rich activity extraction from conversation messages ──

const TOOL_CATEGORY: Record<string, string> = {
  // Shell & execution
  bash: 'task', Bash: 'task', Shell: 'task', shell: 'task', execute: 'task',
  // File operations
  Read: 'task', Write: 'task', Edit: 'task', read_file: 'task', write_file: 'task',
  edit_file: 'task', create_file: 'task', Glob: 'task', Grep: 'task',
  StrReplace: 'task', str_replace: 'task',
  // Browser & web
  'browser-use': 'browsing', BrowserUse: 'browsing', browser_use: 'browsing',
  navigate: 'browsing', click: 'browsing', snapshot: 'browsing', fill: 'browsing',
  web_search: 'browsing', web_fetch: 'browsing', WebSearch: 'browsing', WebFetch: 'browsing',
  deep_scrape: 'browsing', firecrawl: 'browsing',
  // Email
  'smtp-send': 'email', send_email: 'email', smtp_send: 'email',
};

function categorizeToolsToType(toolNames: string[]): string {
  if (toolNames.length === 0) return 'message';
  const cats = toolNames.map(n => TOOL_CATEGORY[n] || 'task');
  if (cats.includes('browsing')) return 'browsing';
  if (cats.includes('email')) return 'email';
  return 'task';
}

interface ToolAction {
  name: string;
  summary: string;
}

function describeToolCall(name: string, argsRaw: string | undefined): string {
  let args: any = {};
  try { args = JSON.parse(argsRaw || '{}'); } catch {}
  switch (name) {
    case 'bash': case 'Bash': case 'Shell': case 'shell': case 'execute':
      return `Running: ${(args.command || args.cmd || '').slice(0, 120)}`;
    case 'Read': case 'read_file':
      return `Reading: ${(args.path || args.file || '').slice(0, 120)}`;
    case 'Write': case 'write_file': case 'create_file':
      return `Writing: ${(args.path || args.file || '').slice(0, 120)}`;
    case 'Edit': case 'edit_file': case 'StrReplace': case 'str_replace':
      return `Editing: ${(args.path || args.file || '').slice(0, 120)}`;
    case 'web_search': case 'WebSearch':
      return `Searching: ${(args.query || args.search_term || '').slice(0, 120)}`;
    case 'web_fetch': case 'WebFetch':
      return `Fetching: ${(args.url || '').slice(0, 120)}`;
    case 'browser-use': case 'BrowserUse': case 'browser_use':
      return `Browser: ${(args.action || args.url || name).slice(0, 120)}`;
    case 'navigate': case 'click': case 'fill': case 'snapshot':
      return `Browser ${name}: ${(args.url || args.selector || '').slice(0, 80)}`;
    case 'smtp-send': case 'send_email': case 'smtp_send':
      return `Emailing: ${(args.to || args.recipient || '').slice(0, 80)}`;
    case 'Glob': case 'Grep':
      return `Searching files: ${(args.pattern || args.glob_pattern || '').slice(0, 80)}`;
    default:
      return `Tool: ${name}`;
  }
}

function extractRecentToolActions(messages: any[]): ToolAction[] {
  const actions: ToolAction[] = [];
  const toolCallMap = new Map<string, { name: string; args: string }>();

  for (let i = messages.length - 1; i >= Math.max(0, messages.length - 20); i--) {
    const m = messages[i];
    if (m.role === 'assistant' && Array.isArray(m.tool_calls)) {
      for (const tc of m.tool_calls) {
        if (tc.id && tc.function?.name) {
          toolCallMap.set(tc.id, { name: tc.function.name, args: tc.function.arguments || '' });
        }
      }
    }
  }

  for (const [, tc] of toolCallMap) {
    actions.push({ name: tc.name, summary: describeToolCall(tc.name, tc.args) });
  }
  return actions;
}

function buildActivitySummary(
  userMessage: string,
  taskSummary: string | undefined,
  toolActions: ToolAction[],
): string {
  if (toolActions.length > 0) {
    const last = toolActions[toolActions.length - 1];
    return last.summary;
  }
  if (taskSummary) {
    return taskSummary.charAt(0).toUpperCase() + taskSummary.slice(1);
  }
  return userMessage.slice(0, 200);
}

function buildActivityDetails(
  userMessage: string,
  taskSummary: string | undefined,
  toolActions: ToolAction[],
  routerUsed: string,
  stepCount: number,
): Record<string, any> {
  return {
    userRequest: userMessage.slice(0, 300),
    taskSummary: taskSummary || null,
    router: routerUsed,
    stepCount,
    tools: toolActions.slice(-10).map(a => ({ name: a.name, action: a.summary })),
    lastAction: toolActions.length > 0 ? toolActions[toolActions.length - 1].summary : null,
  };
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

  // Detect repeated messages — user asked same thing before
  const currentMsg = extractLastUserMessage(messages);
  const currentNorm = currentMsg.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  const prevNorm = (prevUserMsg || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  const repeatedMessage = !!(currentNorm && prevNorm && (
    currentNorm === prevNorm ||
    (currentNorm.length > 15 && prevNorm.includes(currentNorm)) ||
    (prevNorm.length > 15 && currentNorm.includes(prevNorm))
  ));

  // Detect frustration — explicit signals the user is unhappy with previous result
  const FRUSTRATION_RE = /\b(i (already|just) (said|told|asked)|again|not what i (asked|wanted|meant)|wrong|doesn'?t work|still not|try again|you('re| are) not (listening|understanding)|i said|that'?s not (right|correct|it)|same (thing|error|problem)|broken|useless|please (actually|just)|why (can'?t|won'?t|isn'?t|doesn'?t)|wtf|ffs|smh|ugh)\b/i;
  const frustrated = FRUSTRATION_RE.test(currentMsg) || repeatedMessage;

  return {
    messageCount: messages.length,
    toolCallCount,
    lastAssistantSnippet,
    recentToolNames: toolNames.length > 0 ? toolNames.slice(-10) : undefined,
    previousUserMessage: prevUserMsg,
    taskSummary,
    frustrated,
    repeatedMessage,
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

    if (user) touchIfNeeded(user.id);

    const BLOCKED_STATUSES = ['cancelled', 'paused', 'pending'];
    if (user && BLOCKED_STATUSES.includes(user.status)) {
      return res.status(402).json({
        error: {
          message: 'Subscription inactive. Please renew your subscription to continue.',
          type: 'billing_error',
          code: 'subscription_required',
        },
      });
    }
    // Trial users have 0 credits — block AI calls with upgrade prompt
    const isInTrial = user?.trial_ends_at && new Date(user.trial_ends_at) > new Date();
    if (user && isInTrial) {
      return res.status(402).json({
        error: {
          message: 'Your free trial has no AI credits. Upgrade to start chatting.',
          type: 'billing_error',
          code: 'trial_no_credits',
        },
      });
    }

    const body = req.body;
    if (!body?.messages) {
      return res.status(400).json({ error: { message: 'messages field is required', type: 'invalid_request' } });
    }

    const incomingModel = (body.model || '').toString().trim();
    const isAutoRouting = !incomingModel || incomingModel === 'auto' || incomingModel === 'platform/auto';
    const lastMessage = extractLastUserMessage(body.messages);
    const ctx = extractConversationContext(body.messages);

    let selectedModel: string;
    let routingReason: string;
    let routerUsed = 'direct';

    if (!isAutoRouting) {
      selectedModel = incomingModel;
      routingReason = `Direct: ${incomingModel}`;
      // Sync to dashboard: if agent switched model via chat, update user_settings
      if (user && incomingModel !== user.manual_model) {
        db.query(
          `INSERT INTO user_settings (user_id, brain_mode, manual_model)
           VALUES ($1, 'manual', $2)
           ON CONFLICT (user_id) DO UPDATE SET brain_mode = 'manual', manual_model = $2`,
          [user.id, incomingModel]
        ).catch(() => {});
        user.manual_model = incomingModel;
        user.brain_mode = 'manual';
      }
    } else if (user && user.brain_mode === 'manual' && user.manual_model) {
      selectedModel = user.manual_model;
      routingReason = 'Manual override';
      routerUsed = 'manual';
    } else {
      // If user was on manual but container switched back to auto, sync to dashboard
      if (user && user.brain_mode === 'manual') {
        db.query(
          `INSERT INTO user_settings (user_id, brain_mode, manual_model)
           VALUES ($1, 'auto', NULL)
           ON CONFLICT (user_id) DO UPDATE SET brain_mode = 'auto', manual_model = NULL`,
          [user.id]
        ).catch(() => {});
        user.brain_mode = 'auto';
        user.manual_model = null;
      }

      // Tool-loop fast path: if the last message is a tool result, the agent is
      // mid-task. Reuse the previous routing decision instead of calling the
      // router again — saves ~0.7s per tool-loop call.
      const msgs = body.messages;
      const lastMsg = Array.isArray(msgs) && msgs.length > 0 ? msgs[msgs.length - 1] : null;
      const inToolLoop = lastMsg?.role === 'tool' ||
        (lastMsg?.role === 'assistant' && Array.isArray(lastMsg?.tool_calls) && lastMsg.tool_calls.length > 0);

      const cachedRoute = user ? lastRouting.get(user.id) : null;

      if (inToolLoop && cachedRoute && (Date.now() - cachedRoute.ts) < ROUTING_REUSE_MS) {
        selectedModel = cachedRoute.model;
        routingReason = cachedRoute.reason + ' (reused)';
        routerUsed = cachedRoute.routerUsed;
      } else {
        const hasImage = hasImageContent(body.messages);
        const hasToolHistory = hasToolCallsInHistory(body.messages);

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
          lastRouting.set(user.id, { model: selectedModel, reason: routingReason, routerUsed, ts: Date.now() });
          db.query(
            `INSERT INTO routing_decisions (user_id, message_preview, classification, model_selected, reason, tokens_saved)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [user.id, lastMessage.slice(0, 200), JSON.stringify({ method: 'ai', routerUsed, depth: ctx.messageCount, toolCalls: ctx.toolCallCount }), selectedModel, routingReason, 0]
          ).catch(() => {});
        }
      }
    }

    body.model = selectedModel;

    // Image generation — OpenRouter requires modalities for image output
    if (selectedModel?.includes('gpt-5-image')) {
      body.modalities = ['image', 'text'];
    }

    // ── Inject guardrails ──
    // Short, high-priority rules injected as the last system message so the
    // model sees them right before responding. USER.md rules get lost in long
    // conversations; this ensures critical constraints are always visible.
    injectGuardrails(body.messages);

    const modelCost = MODEL_MAP[selectedModel]?.costPer1MTokens ?? 1.0;
    const browserMode = isBrowserSession(body.messages);
    if (modelCost >= 0.50) {
      body.messages = compressMessages(body.messages);
    }

    // Anthropic prompt caching — 90% discount on repeated context
    body.messages = addPromptCaching(body.messages, selectedModel);

    if (modelCost >= 3.0) {
      body.max_tokens = getMaxTokens(selectedModel, body.max_tokens, browserMode);
      body.transforms = ['middle-out'];
    }

    // ── Rich activity logging ──
    // Extract tool actions from the conversation to show what the agent is actually doing
    const toolActions = extractRecentToolActions(body.messages);
    const toolNames = toolActions.map(a => a.name);
    const actType = categorizeToolsToType(toolNames);
    const actSummary = buildActivitySummary(lastMessage, ctx.taskSummary, toolActions);

    let activityId: string | undefined;
    let isNewTask = false;
    if (user) {
      const key = user.id;
      const now = Date.now();
      const recent = recentActivity.get(key);
      const stepCount = ctx.toolCallCount;

      // Deduplicate: same user within the time window = same activity entry
      if (recent && (now - recent.ts) < ACTIVITY_DEDUP_MS && recent.id) {
        activityId = recent.id;
        recent.ts = now;
        const details = buildActivityDetails(
          recent.summary, ctx.taskSummary, toolActions, routerUsed, stepCount,
        );
        db.query(
          `UPDATE activity_log
           SET model_used = $1, type = $2, summary = $3,
               details = $4::jsonb, status = 'in_progress', created_at = NOW()
           WHERE id = $5`,
          [selectedModel, actType, actSummary, JSON.stringify(details), recent.id]
        ).catch((e) => console.warn('[activity] update failed:', e.message));
      } else {
        const details = buildActivityDetails(
          lastMessage, ctx.taskSummary, toolActions, routerUsed, stepCount,
        );
        db.query(
          `INSERT INTO activity_log (user_id, type, channel, summary, status, model_used, details)
           VALUES ($1, $2, $3, $4, 'in_progress', $5, $6::jsonb)
           RETURNING id`,
          [user.id, actType, ctx.taskSummary ? 'auto' : 'direct', actSummary, selectedModel, JSON.stringify(details)]
        ).then(r => {
          const id = r.rows[0]?.id;
          activityId = id;
          isNewTask = true;
          recentActivity.set(key, { summary: lastMessage.slice(0, 200), ts: now, id });
        }).catch((e) => console.warn('[activity] insert failed:', e.message));
      }
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
        const safeReason = routingReason.slice(0, 100).replace(/[^\x20-\x7E]/g, '-');
        res.writeHead(proxyRes.statusCode || 200, {
          'Content-Type': proxyRes.headers['content-type'] || 'application/json',
          'Cache-Control': 'no-cache',
          ...(isStream ? { 'Transfer-Encoding': 'chunked' } : {}),
          'X-Model-Selected': selectedModel,
          'X-Routing-Reason': safeReason,
        });

        // Lightweight SSE parser — detect tool calls and capture assistant text
        const responseToolNames: string[] = [];
        const responseTextParts: string[] = [];
        let sseBuf = '';
        let responseHasToolCalls = false;

        if (isStream) {
          proxyRes.on('data', (chunk: Buffer) => {
            sseBuf += chunk.toString();
            const lines = sseBuf.split('\n');
            sseBuf = lines.pop() || '';
            for (const line of lines) {
              if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
              try {
                const d = JSON.parse(line.slice(6));
                const delta = d.choices?.[0]?.delta;
                if (delta?.tool_calls) {
                  responseHasToolCalls = true;
                  for (const t of delta.tool_calls) {
                    if (t.function?.name) responseToolNames.push(t.function.name);
                  }
                }
                if (delta?.content) responseTextParts.push(delta.content);
              } catch {}
            }
          });
        }

        proxyRes.on('error', (err) => {
          console.error(`[proxy] Upstream response error mid-stream: ${err.message}`);
          if (!res.writableEnded) {
            if (isStream) {
              res.write(`data: {"error":{"message":"Upstream connection lost","type":"proxy_error"}}\n\ndata: [DONE]\n\n`);
            }
            res.end();
          }
          if (user) {
            const id = activityId || recentActivity.get(user.id)?.id;
            if (id) {
              db.query(
                `UPDATE activity_log SET status = 'failed', details = $1::jsonb WHERE id = $2`,
                [JSON.stringify({ error: 'Upstream error' }), id]
              ).catch(() => {});
            }
          }
        });

        proxyRes.on('end', () => {
          if (!user || !proxyRes.statusCode) return;
          const id = activityId || recentActivity.get(user.id)?.id;
          if (!id) return;

          const httpOk = proxyRes.statusCode < 400;
          const status = !httpOk ? 'failed' : responseHasToolCalls ? 'in_progress' : 'completed';

          const respType = responseToolNames.length > 0
            ? categorizeToolsToType(responseToolNames) : undefined;

          const updates: string[] = ['status = $1', 'model_used = $2', 'created_at = NOW()'];
          const params: any[] = [status, selectedModel];
          let idx = 3;

          if (respType) {
            updates.push(`type = $${idx}`);
            params.push(respType);
            idx++;
          }

          params.push(id);
          db.query(
            `UPDATE activity_log SET ${updates.join(', ')} WHERE id = $${idx}`,
            params
          ).catch(() => {});

          // ── Log to conversations table ──
          // Log user message only on new tasks (not every tool loop step).
          // Log assistant response only on the final reply (no more tool calls).
          if (httpOk) {
            const channel = ctx.taskSummary ? 'auto' : 'direct';
            if (isNewTask && lastMessage.trim()) {
              db.query(
                `INSERT INTO conversations (user_id, channel, role, content, model_used)
                 VALUES ($1, $2, 'user', $3, $4)`,
                [user.id, channel, lastMessage.slice(0, 10000), selectedModel]
              ).catch(() => {});
            }
            if (!responseHasToolCalls) {
              const responseText = responseTextParts.join('').trim();
              if (responseText) {
                db.query(
                  `INSERT INTO conversations (user_id, channel, role, content, model_used)
                   VALUES ($1, $2, 'assistant', $3, $4)`,
                  [user.id, channel, responseText.slice(0, 10000), selectedModel]
                ).catch(() => {});
              }
            }
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

// Embeddings proxy — forward to OpenRouter so memory_search works
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
