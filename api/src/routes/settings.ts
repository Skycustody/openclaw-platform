/**
 * Settings routes — user preferences and agent configuration.
 *
 * API key management has been replaced by OpenRouter integration.
 * Each user gets an OpenRouter API key (managed by services/nexos.ts) that provides
 * access to multiple AI models through OpenRouter's credit-based billing.
 */
import { Router, Response, NextFunction } from 'express';
import { AuthRequest, authenticate, requireActiveSubscription } from '../middleware/auth';
import db from '../lib/db';
import { UserSettings } from '../types';
import { getUserContainer, readContainerConfig, writeContainerConfig, restartContainer } from '../services/containerConfig';
import { sshExec } from '../services/ssh';
import { getNexosUsage } from '../services/nexos';
import { VALID_CATEGORY_KEYS, MODEL_MAP } from '../services/smartRouter';
import redis from '../lib/redis';

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

  return sections.join('\n');
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
    delete safeSettings.own_openai_key;
    delete safeSettings.own_anthropic_key;

    safeSettings.has_own_openrouter_key = !!settings.own_openrouter_key;
    safeSettings.own_openrouter_key_masked = settings.own_openrouter_key
      ? settings.own_openrouter_key.slice(0, 8) + '...' + settings.own_openrouter_key.slice(-4)
      : null;
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

// Get OpenRouter credit usage
router.get('/nexos-usage', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const usage = await getNexosUsage(req.userId!);
    res.json({ usage });
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

    syncSettingsToContainer(req.userId!).catch(() => {});
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Update per-task routing preferences
router.put('/routing-preferences', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { preferences } = req.body;
    if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) {
      return res.status(400).json({ error: 'preferences must be an object mapping category keys to model IDs' });
    }

    const validModelIds = new Set(Object.keys(MODEL_MAP));
    const cleaned: Record<string, string> = {};

    for (const [key, value] of Object.entries(preferences)) {
      if (!VALID_CATEGORY_KEYS.has(key)) {
        return res.status(400).json({ error: `Unknown task category: ${key}` });
      }
      if (typeof value !== 'string' || !value) continue;
      if (!validModelIds.has(value)) {
        return res.status(400).json({ error: `Invalid model ID for ${key}: ${value}` });
      }
      cleaned[key] = value;
    }

    await db.query(
      'UPDATE user_settings SET routing_preferences = $1 WHERE user_id = $2',
      [JSON.stringify(cleaned), req.userId]
    );

    // Invalidate cached routing decisions for this user
    const userKey = req.userId!.slice(0, 12);
    const pattern = `aiRoute7:${userKey}:*`;
    try {
      let cursor = '0';
      do {
        const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = next;
        if (keys.length > 0) await redis.del(...keys);
      } while (cursor !== '0');
    } catch { /* non-critical */ }

    res.json({ ok: true, preferences: cleaned });
  } catch (err) {
    next(err);
  }
});

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

    // Re-inject API keys with the user's own key
    try {
      const { injectApiKeys } = await import('../services/apiKeys');
      const { serverIp, containerName } = await getUserContainer(req.userId!);
      const user = await db.getOne<{ plan: string }>('SELECT plan FROM users WHERE id = $1', [req.userId]);
      await injectApiKeys(serverIp, req.userId!, containerName, (user?.plan || 'starter') as any);
      restartContainer(serverIp, containerName).catch(() => {});
    } catch {
      // Container not provisioned — key saved to DB for next provision
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Remove own OpenRouter key (revert to platform-managed key)
router.delete('/own-openrouter-key', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await db.query(
      'UPDATE user_settings SET own_openrouter_key = NULL WHERE user_id = $1',
      [req.userId]
    );

    // Re-inject platform key
    try {
      const { injectApiKeys } = await import('../services/apiKeys');
      const { serverIp, containerName } = await getUserContainer(req.userId!);
      const user = await db.getOne<{ plan: string }>('SELECT plan FROM users WHERE id = $1', [req.userId]);
      await injectApiKeys(serverIp, req.userId!, containerName, (user?.plan || 'starter') as any);
      restartContainer(serverIp, containerName).catch(() => {});
    } catch {
      // Container not provisioned
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
