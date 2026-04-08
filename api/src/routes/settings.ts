/**
 * Settings routes — user preferences and agent configuration.
 *
 * Users either bring their own OpenRouter key or use the platform's shared key.
 */
import { Router, Response, NextFunction } from 'express';
import { AuthRequest, authenticate, requireActiveSubscription } from '../middleware/auth';
import db from '../lib/db';
import { UserSettings } from '../types';
import { getUserContainer, requireRunningContainer, readContainerConfig, writeContainerConfig, restartContainer } from '../services/containerConfig';
import { sshExec } from '../services/ssh';
import { invalidateProxyCache } from './proxy';
import redis from '../lib/redis';
import {
  saveAnthropicSetupToken,
  startOpenAIOAuth,
  completeOpenAIOAuth,
  getProviderAuthStatus,
  disconnectProviderAuth,
} from '../services/providerAuth';

const INSTANCE_DIR = '/opt/openclaw/instances';
const UUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

/**
 * Build USER.md content from user settings.
 * OpenClaw injects USER.md into every system prompt automatically,
 * so the agent sees this context on every message.
 */
function buildUserMd(settings: UserSettings): string {
  const sections: string[] = ['# User Profile'];

  if (settings.agent_name) sections.push(`\nThe user's name is: ${settings.agent_name}`);
  if (settings.language) sections.push(`Preferred language: ${settings.language}`);
  if (settings.agent_tone) sections.push(`Communication style: ${settings.agent_tone}`);
  if (settings.response_length) sections.push(`Response length: ${settings.response_length}`);

  if (settings.custom_instructions) {
    sections.push(`\n## Instructions\n${settings.custom_instructions}`);
  }

  sections.push(`\nIMPORTANT: You are the user's AI assistant. The user's name above is who you are talking to — it is NOT your name. If asked your name, say you are their AI assistant.`);
  sections.push(`\n## Memory\nYou have persistent memory. Always save important facts, user preferences, project details, and key decisions to MEMORY.md. For daily notes and conversation context, use memory/YYYY-MM-DD.md. When you're unsure about something the user mentioned before, search your memory first.`);

  sections.push(`\n## Web Preview\nWhen you build websites or web apps, always start the dev server on port 8080 (use \`--port 8080\` or equivalent). The user can preview it live at the URL in the PREVIEW_URL environment variable. Tell the user this URL when you start a dev server.`);

  sections.push(`\n## AI Models\nYou are running on a platform with multiple AI models. The user may ask you to "switch to sonnet", "use GPT-4o", etc. You have a skill called "switch-model" that can change which AI model processes your responses. Available models: Claude Sonnet 4 (sonnet), Claude Opus 4 (opus), GPT-4o (gpt4o/gpt-4o), GPT-4.1 (gpt4.1), GPT-4.1 Mini (gpt4.1-mini), GPT-4.1 Nano (gpt4.1-nano), Gemini 2.5 Pro (gemini-pro), Gemini 2.5 Flash (gemini-flash), DeepSeek V3 (deepseek), DeepSeek R1 (deepseek-r1), Grok 3 (grok), GPT-5 Image (gpt-5-image, for image generation), or "auto" for smart automatic routing. When the user asks to switch models, use the switch-model skill.`);

  return sections.join('\n');
}

function buildMemoryMd(settings: UserSettings): string {
  const parts: string[] = ['# User Profile (from onboarding)'];
  if (settings.agent_name) parts.push(`- Name: ${settings.agent_name}`);
  if (settings.language) parts.push(`- Preferred language: ${settings.language}`);
  if (settings.agent_tone) parts.push(`- Communication style: ${settings.agent_tone}`);
  if (settings.response_length) parts.push(`- Response length: ${settings.response_length}`);
  if (settings.custom_instructions) parts.push(`- Custom instructions: ${settings.custom_instructions}`);
  parts.push('');
  return parts.join('\n');
}

async function syncSettingsToContainer(userId: string): Promise<void> {
  try {
    if (!UUID_RE.test(userId)) return;

    const settings = await db.getOne<UserSettings>(
      'SELECT * FROM user_settings WHERE user_id = $1',
      [userId]
    );
    if (!settings) return;

    const { serverIp } = await getUserContainer(userId);

    // Write USER.md — OpenClaw auto-injects this into every system prompt
    const userMd = buildUserMd(settings);
    const userMdB64 = Buffer.from(userMd).toString('base64');
    await sshExec(
      serverIp,
      `echo '${userMdB64}' | base64 -d > ${INSTANCE_DIR}/${userId}/USER.md`
    );

    // Write user profile to a dedicated memory file that the agent's memory
    // search can index. MEMORY.md itself is managed by the agent — we only seed
    // it during provisioning and don't overwrite agent-curated content here.
    const memMd = buildMemoryMd(settings);
    const memB64 = Buffer.from(memMd).toString('base64');
    await sshExec(serverIp, [
      `mkdir -p ${INSTANCE_DIR}/${userId}/workspace/memory`,
      `echo '${memB64}' | base64 -d > ${INSTANCE_DIR}/${userId}/workspace/memory/user-profile.md`,
    ].join(' && '));
  } catch {
    // Container not provisioned or not running — settings saved to DB only
  }
}

const router = Router();
router.use(authenticate);
router.use(requireActiveSubscription);

// Get all settings
router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const settings = await db.getOne<UserSettings>(
      'SELECT * FROM user_settings WHERE user_id = $1',
      [req.userId]
    );
    if (!settings) return res.json({ settings: {} });

    const safeSettings: any = { ...settings };

    const maskKey = (key: string | null): string | null =>
      key ? key.slice(0, 8) + '...' + key.slice(-4) : null;

    safeSettings.has_own_openrouter_key = !!settings.own_openrouter_key;
    safeSettings.own_openrouter_key_masked = maskKey(settings.own_openrouter_key);
    delete safeSettings.own_openrouter_key;

    if (typeof safeSettings.routing_preferences === 'string') {
      try { safeSettings.routing_preferences = JSON.parse(safeSettings.routing_preferences); } catch { safeSettings.routing_preferences = {}; }
    }
    if (!safeSettings.routing_preferences) safeSettings.routing_preferences = {};

    res.json({ settings: safeSettings });
  } catch (err) {
    next(err);
  }
});

// Update personality settings
router.put('/personality', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { agentName, agentTone, responseLength, language, customInstructions } = req.body;

    if (agentName !== undefined && (typeof agentName !== 'string' || agentName.length > 100)) {
      return res.status(400).json({ error: 'Agent name must be a string under 100 characters' });
    }
    if (agentTone !== undefined && (typeof agentTone !== 'string' || agentTone.length > 50)) {
      return res.status(400).json({ error: 'Invalid agent tone' });
    }
    if (responseLength !== undefined && (typeof responseLength !== 'string' || responseLength.length > 20)) {
      return res.status(400).json({ error: 'Invalid response length' });
    }
    if (language !== undefined && (typeof language !== 'string' || language.length > 50)) {
      return res.status(400).json({ error: 'Invalid language' });
    }
    if (customInstructions !== undefined && (typeof customInstructions !== 'string' || customInstructions.length > 5000)) {
      return res.status(400).json({ error: 'Custom instructions must be under 5000 characters' });
    }

    await db.query(
      `UPDATE user_settings
       SET agent_name = COALESCE($1, agent_name),
           agent_tone = COALESCE($2, agent_tone),
           response_length = COALESCE($3, response_length),
           language = COALESCE($4, language),
           custom_instructions = COALESCE($5, custom_instructions)
       WHERE user_id = $6`,
      [agentName, agentTone, responseLength, language, customInstructions, req.userId]
    );

    syncSettingsToContainer(req.userId!).catch(() => {});
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Update brain/router settings
router.put('/brain', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { brainMode, manualModel } = req.body;

    const prev = await db.getOne<{ brain_mode: string }>(
      'SELECT brain_mode FROM user_settings WHERE user_id = $1',
      [req.userId]
    ).catch(() => null);

    await db.query(
      `UPDATE user_settings
       SET brain_mode = COALESCE($1, brain_mode),
           manual_model = $2
       WHERE user_id = $3`,
      [brainMode, manualModel || null, req.userId]
    );

    if (prev?.brain_mode === 'auto' && brainMode === 'manual') {
      db.query(
        `INSERT INTO routing_decisions (user_id, message_preview, classification, model_selected, reason, tokens_saved)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [req.userId, '[mode switch]', JSON.stringify({ method: 'quality_signal', from: 'auto', to: 'manual' }), manualModel || 'unknown', 'User switched from auto to manual — possible routing dissatisfaction', 0]
      ).catch(() => {});
    }

    invalidateProxyCache(req.userId!);
    syncSettingsToContainer(req.userId!).catch(() => {});
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Update token protection settings — syncs to openclaw.json
router.put('/protection', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const {
      quietHoursEnabled,
      quietStart,
      quietEnd,
      maxTaskDuration,
      loopDetection,
      tokenBudgetSimple,
      tokenBudgetMedium,
      tokenBudgetComplex,
    } = req.body;

    await db.query(
      `UPDATE user_settings
       SET quiet_hours_enabled = COALESCE($1, quiet_hours_enabled),
           quiet_start = COALESCE($2, quiet_start),
           quiet_end = COALESCE($3, quiet_end),
           max_task_duration = COALESCE($4, max_task_duration),
           loop_detection = COALESCE($5, loop_detection),
           token_budget_simple = COALESCE($6, token_budget_simple),
           token_budget_medium = COALESCE($7, token_budget_medium),
           token_budget_complex = COALESCE($8, token_budget_complex)
       WHERE user_id = $9`,
      [
        quietHoursEnabled, quietStart, quietEnd, maxTaskDuration,
        loopDetection, tokenBudgetSimple, tokenBudgetMedium, tokenBudgetComplex,
        req.userId,
      ]
    );

    // Sync protection settings to the OpenClaw container
    try {
      const { serverIp, containerName } = await getUserContainer(req.userId!);
      const config = await readContainerConfig(serverIp, req.userId!);

      if (!config.protection) config.protection = {};

      // Token budgets per task complexity
      if (tokenBudgetSimple !== undefined) config.protection.maxTokensSimple = tokenBudgetSimple;
      if (tokenBudgetMedium !== undefined) config.protection.maxTokensMedium = tokenBudgetMedium;
      if (tokenBudgetComplex !== undefined) config.protection.maxTokensComplex = tokenBudgetComplex;

      // Quiet hours — agent won't start new tasks during these times
      config.protection.quietHours = {
        enabled: quietHoursEnabled ?? false,
        start: quietStart || '22:00',
        end: quietEnd || '07:00',
      };

      // Loop detection — stops agent if stuck in a loop
      config.protection.loopDetection = {
        enabled: loopDetection ?? true,
        maxMinutes: maxTaskDuration || 5,
      };

      // Max task duration in seconds
      if (maxTaskDuration !== undefined) {
        config.protection.maxTaskDurationSecs = maxTaskDuration;
      }

      await writeContainerConfig(serverIp, req.userId!, config);
      restartContainer(serverIp, containerName).catch(() => {});
    } catch {
      // Container not provisioned — settings saved to DB only
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Mark onboarding as completed (skip flow)
router.post('/onboarding/skip', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await db.query('UPDATE users SET onboarding_completed = true WHERE id = $1', [req.userId]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Save onboarding answers and push to agent
router.post('/onboarding', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { answers } = req.body;
    if (!answers) return res.status(400).json({ error: 'Missing answers' });

    const toneMap: Record<string, string> = {
      professional: 'professional',
      casual: 'casual',
      concise: 'professional',
      detailed: 'friendly',
    };

    const agentTone = toneMap[answers.communicationStyle] || 'balanced';
    const responseLength = answers.communicationStyle === 'concise' ? 'short' : answers.communicationStyle === 'detailed' ? 'long' : 'medium';

    const contextParts: string[] = [];
    if (answers.name) contextParts.push(`The user's name is ${answers.name}.`);
    if (answers.primaryUse) contextParts.push(`Primary use case: ${answers.primaryUse}.`);
    if (answers.industry) contextParts.push(`Industry: ${answers.industry}.`);
    if (answers.topTasks?.length) contextParts.push(`Priority tasks: ${answers.topTasks.join(', ')}.`);
    if (answers.additionalContext) contextParts.push(answers.additionalContext);

    const customInstructions = contextParts.join(' ');

    await db.query(
      `UPDATE user_settings
       SET agent_name = COALESCE($1, agent_name),
           agent_tone = $2,
           response_length = $3,
           custom_instructions = $4
       WHERE user_id = $5`,
      [answers.name || null, agentTone, responseLength, customInstructions, req.userId]
    );

    await db.query('UPDATE users SET onboarding_completed = true WHERE id = $1', [req.userId]);

    syncSettingsToContainer(req.userId!).catch(() => {});
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Update per-task routing preferences (legacy — smart router removed, kept for API compat)
router.put('/routing-preferences', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { preferences } = req.body;
    if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) {
      return res.status(400).json({ error: 'preferences must be an object mapping category keys to model IDs' });
    }

    const cleaned: Record<string, string> = {};
    for (const [key, value] of Object.entries(preferences)) {
      if (typeof value !== 'string' || !value) continue;
      cleaned[key] = value;
    }

    await db.query(
      'UPDATE user_settings SET routing_preferences = $1 WHERE user_id = $2',
      [JSON.stringify(cleaned), req.userId]
    );

    invalidateProxyCache(req.userId!);
    res.json({ ok: true, preferences: cleaned });
  } catch (err) {
    next(err);
  }
});

async function reinjectAndRestart(userId: string): Promise<void> {
  const { injectApiKeys } = await import('../services/apiKeys');
  const { serverIp, containerName } = await getUserContainer(userId);
  const user = await db.getOne<{ plan: string }>('SELECT plan FROM users WHERE id = $1', [userId]);
  await injectApiKeys(serverIp, userId, containerName, (user?.plan || 'starter') as any);
  restartContainer(serverIp, containerName).catch(() => {});
}

// Save own OpenRouter key (BYOK — unlimited AI, user pays OpenRouter directly)
router.put('/own-openrouter-key', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { key } = req.body;
    if (!key || typeof key !== 'string' || key.length < 10) {
      return res.status(400).json({ error: 'Invalid OpenRouter API key' });
    }
    await db.query(
      'UPDATE user_settings SET own_openrouter_key = $1 WHERE user_id = $2',
      [key.trim(), req.userId]
    );
    try { await reinjectAndRestart(req.userId!); } catch { /* container not provisioned */ }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Remove own OpenRouter key (revert to platform-managed key)
router.delete('/own-openrouter-key', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await db.query(
      'UPDATE user_settings SET own_openrouter_key = NULL WHERE user_id = $1',
      [req.userId]
    );
    try { await reinjectAndRestart(req.userId!); } catch { /* container not provisioned */ }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Subscription Auth: connect ChatGPT / Claude subscriptions ──

router.get('/provider-auth/status', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const status = await getProviderAuthStatus(req.userId!);
    res.json({ providers: status });
  } catch (err) { next(err); }
});

router.post('/provider-auth/anthropic/setup-token', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { token } = req.body;
    if (!token || typeof token !== 'string' || token.length < 10) {
      return res.status(400).json({ error: 'Invalid setup token' });
    }
    const result = await saveAnthropicSetupToken(req.userId!, token);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    res.json({ ok: true });
  } catch (err: any) {
    if (err.statusCode === 409) return res.status(409).json({ error: err.message });
    next(err);
  }
});

router.post('/provider-auth/openai/start', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { serverIp, containerName } = await requireRunningContainer(req.userId!);
    const result = await startOpenAIOAuth(req.userId!, serverIp, containerName);
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }
    res.json({ url: result.url });
  } catch (err: any) {
    if (err.statusCode === 409) return res.status(409).json({ error: err.message });
    next(err);
  }
});

router.post('/provider-auth/openai/complete', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { redirectUrl } = req.body;
    if (!redirectUrl || typeof redirectUrl !== 'string') {
      return res.status(400).json({ error: 'Missing redirect URL' });
    }
    const result = await completeOpenAIOAuth(req.userId!, redirectUrl);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.delete('/provider-auth/:provider', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const provider = req.params.provider as string;
    await disconnectProviderAuth(req.userId!, provider);
    res.json({ ok: true });
  } catch (err: any) {
    if (err.statusCode === 409) return res.status(409).json({ error: err.message });
    next(err);
  }
});

// ── Claude Code: install CLI + auth in container ──

router.get('/claude-code/status', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { serverIp, containerName } = await getUserContainer(req.userId!);
    // Check if claude CLI exists and is authenticated
    const check = await sshExec(serverIp,
      `docker exec ${containerName} sh -c 'claude --version 2>/dev/null && claude auth status 2>/dev/null || echo NOT_AUTHED'`,
      1, 15000
    ).catch(() => null);
    const output = check?.stdout || '';
    const hasVersion = /\d+\.\d+/.test(output.split('\n')[0] || '');
    const isAuthed = output.includes('"loggedIn":true') || output.includes('"loggedIn": true');
    res.json({
      installed: hasVersion,
      version: hasVersion ? output.split('\n')[0].trim() : null,
      authenticated: isAuthed,
    });
  } catch (err: any) {
    if (err.statusCode === 409) return res.json({ installed: false, version: null, authenticated: false });
    next(err);
  }
});

router.post('/claude-code/connect', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { token } = req.body || {};
    if (!token || typeof token !== 'string' || !token.startsWith('sk-ant-')) {
      return res.status(400).json({ error: 'Invalid setup token. Run "claude setup-token" in your terminal to get one.' });
    }

    const { serverIp, containerName } = await requireRunningContainer(req.userId!);

    // Install claude CLI if not present
    const versionCheck = await sshExec(serverIp,
      `docker exec ${containerName} claude --version 2>/dev/null`,
      1, 10000
    ).catch(() => null);

    if (!versionCheck || !/\d+\.\d+/.test(versionCheck.stdout)) {
      await sshExec(serverIp,
        `docker exec ${containerName} npm install -g @anthropic-ai/claude-code 2>&1`,
        3, 120000
      );
    }

    // Set the OAuth token as env var and write onboarding config
    // This authenticates the CLI without interactive login
    const tokenB64 = Buffer.from(token.trim()).toString('base64');
    await sshExec(serverIp, [
      // Write claude config to skip onboarding
      `docker exec ${containerName} sh -c 'mkdir -p /root/.claude && echo "{\\"hasCompletedOnboarding\\":true}" > /root/.claude.json'`,
      // Store token in container env by writing to a profile script
      `docker exec ${containerName} sh -c 'echo "export CLAUDE_CODE_OAUTH_TOKEN=\\"$(echo ${tokenB64} | base64 -d)\\"" > /root/.claude/.env'`,
    ].join(' && '));

    // Verify auth works by running a quick check
    const authCheck = await sshExec(serverIp,
      `docker exec -e CLAUDE_CODE_OAUTH_TOKEN=$(echo '${tokenB64}' | base64 -d) ${containerName} claude auth status 2>/dev/null`,
      1, 15000
    ).catch(() => null);

    const isAuthed = authCheck?.stdout?.includes('"loggedIn":true') || authCheck?.stdout?.includes('"loggedIn": true');

    // Store token in container's startup env so it persists across restarts
    const instanceDir = `/opt/openclaw/instances/${req.userId}`;
    await sshExec(serverIp,
      `echo '${tokenB64}' | base64 -d > ${instanceDir}/.claude-token && chmod 600 ${instanceDir}/.claude-token`
    );

    // Add CLAUDE_CODE_OAUTH_TOKEN to container env
    // Docker doesn't support adding env vars to running containers, so we write a wrapper
    await sshExec(serverIp, [
      `echo '#!/bin/sh' > ${instanceDir}/claude-wrapper.sh`,
      `echo 'export CLAUDE_CODE_OAUTH_TOKEN="$(cat /root/.openclaw/.claude-token 2>/dev/null)"' >> ${instanceDir}/claude-wrapper.sh`,
      `echo 'exec claude "$@"' >> ${instanceDir}/claude-wrapper.sh`,
      `chmod +x ${instanceDir}/claude-wrapper.sh`,
    ].join(' && '));

    // Mark as connected in auth-profiles
    const { saveProviderApiKey } = await import('../services/providerAuth');
    await saveProviderApiKey(req.userId!, 'claude-code', 'setup-token');

    res.json({ ok: true, authenticated: isAuthed });
  } catch (err: any) {
    if (err.statusCode === 409) return res.status(409).json({ error: err.message });
    next(err);
  }
});

router.post('/claude-code/disconnect', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { serverIp, containerName } = await getUserContainer(req.userId!);
    // Logout claude in container
    await sshExec(serverIp,
      `docker exec ${containerName} claude auth logout 2>/dev/null || true`,
      1, 10000
    ).catch(() => null);
    // Remove from auth-profiles
    await disconnectProviderAuth(req.userId!, 'claude-code');
    res.json({ ok: true });
  } catch (err: any) {
    if (err.statusCode === 409) return res.status(409).json({ error: err.message });
    next(err);
  }
});

// Save API key for any provider (writes to container auth-profiles.json)
router.post('/provider-auth/save-key', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { provider, key } = req.body;
    if (!provider || typeof provider !== 'string') {
      return res.status(400).json({ error: 'Provider is required' });
    }
    if (!key || typeof key !== 'string' || key.trim().length < 5) {
      return res.status(400).json({ error: 'Valid API key is required' });
    }
    const { saveProviderApiKey } = await import('../services/providerAuth');
    const result = await saveProviderApiKey(req.userId!, provider, key);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    res.json({ ok: true });
  } catch (err: any) {
    if (err.statusCode === 409) return res.status(409).json({ error: err.message });
    next(err);
  }
});

export default router;
