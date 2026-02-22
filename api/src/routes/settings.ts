import { Router, Response, NextFunction } from 'express';
import { AuthRequest, authenticate, requireActiveSubscription } from '../middleware/auth';
import crypto from 'crypto';
import db from '../lib/db';
import { UserSettings } from '../types';
import { getUserContainer, readContainerConfig, writeContainerConfig, restartContainer } from '../services/containerConfig';

if (!process.env.ENCRYPTION_KEY) {
  throw new Error('ENCRYPTION_KEY environment variable is required. Generate with: openssl rand -hex 32');
}

const ENC_KEY = process.env.ENCRYPTION_KEY;
const ENC_ALGO = 'aes-256-gcm';

function encrypt(text: string): string {
  const key = crypto.scryptSync(ENC_KEY, crypto.randomBytes(16).toString('hex'), 32);
  const iv = crypto.randomBytes(16);
  const salt = crypto.randomBytes(16);
  const derivedKey = crypto.scryptSync(ENC_KEY, salt, 32);
  const cipher = crypto.createCipheriv(ENC_ALGO, derivedKey, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return salt.toString('hex') + ':' + iv.toString('hex') + ':' + authTag + ':' + encrypted;
}

function decrypt(data: string): string {
  const parts = data.split(':');
  if (parts.length === 2) {
    const legacyKey = crypto.scryptSync(ENC_KEY, 'salt', 32);
    const iv = Buffer.from(parts[0], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', legacyKey, iv);
    let decrypted = decipher.update(parts[1], 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
  const [saltHex, ivHex, authTagHex, encrypted] = parts;
  const derivedKey = crypto.scryptSync(ENC_KEY, Buffer.from(saltHex, 'hex'), 32);
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv(ENC_ALGO, derivedKey, iv);
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function maskKey(key: string): string {
  if (key.length < 10) return '****';
  return key.slice(0, 7) + '...' + key.slice(-4);
}

async function syncSettingsToContainer(userId: string): Promise<void> {
  try {
    const settings = await db.getOne<UserSettings>(
      'SELECT * FROM user_settings WHERE user_id = $1',
      [userId]
    );
    if (!settings) return;

    const { serverIp, containerName } = await getUserContainer(userId);
    const config = await readContainerConfig(serverIp, userId);

    if (!config.personality) config.personality = {};
    if (settings.agent_name) config.personality.name = settings.agent_name;
    if (settings.agent_tone) config.personality.tone = settings.agent_tone;
    if (settings.response_length) config.personality.responseLength = settings.response_length;
    if (settings.language) config.personality.language = settings.language;
    if (settings.custom_instructions) config.personality.instructions = settings.custom_instructions;

    if (settings.brain_mode || settings.manual_model) {
      if (!config.models) config.models = {};
      if (settings.brain_mode === 'manual' && settings.manual_model) {
        config.models.defaultModel = settings.manual_model;
        config.models.autoRoute = false;
      } else {
        config.models.autoRoute = true;
        delete config.models.defaultModel;
      }
    }

    await writeContainerConfig(serverIp, userId, config);
    restartContainer(serverIp, containerName).catch(() => {});
  } catch {
    // Container not provisioned or not running — settings saved to DB only
  }
}

const router = Router();
router.use(authenticate);
router.use(requireActiveSubscription);

// Get all settings — own API keys are returned masked
router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const settings = await db.getOne<UserSettings>(
      'SELECT * FROM user_settings WHERE user_id = $1',
      [req.userId]
    );
    if (!settings) return res.json({ settings: {} });

    const safeSettings: any = { ...settings };
    // Never return raw keys, only masked versions
    safeSettings.has_own_openai_key = !!settings.own_openai_key;
    safeSettings.own_openai_key_masked = settings.own_openai_key
      ? maskKey(decrypt(settings.own_openai_key))
      : null;
    safeSettings.has_own_anthropic_key = !!settings.own_anthropic_key;
    safeSettings.own_anthropic_key_masked = settings.own_anthropic_key
      ? maskKey(decrypt(settings.own_anthropic_key))
      : null;
    delete safeSettings.own_openai_key;
    delete safeSettings.own_anthropic_key;

    res.json({ settings: safeSettings });
  } catch (err) {
    next(err);
  }
});

// Update personality settings
router.put('/personality', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { agentName, agentTone, responseLength, language, customInstructions } = req.body;

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

    await db.query(
      `UPDATE user_settings
       SET brain_mode = COALESCE($1, brain_mode),
           manual_model = $2
       WHERE user_id = $3`,
      [brainMode, manualModel || null, req.userId]
    );

    syncSettingsToContainer(req.userId!).catch(() => {});
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Update token protection settings
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

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Save user's own API keys (encrypted at rest)
router.put('/own-keys', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { openaiKey, anthropicKey } = req.body;

    // Validate key format before saving
    if (openaiKey !== undefined) {
      if (openaiKey && !openaiKey.startsWith('sk-')) {
        return res.status(400).json({ error: 'Invalid OpenAI key format. Keys start with sk-' });
      }
      const encrypted = openaiKey ? encrypt(openaiKey) : null;
      await db.query(
        'UPDATE user_settings SET own_openai_key = $1 WHERE user_id = $2',
        [encrypted, req.userId]
      );
    }

    if (anthropicKey !== undefined) {
      if (anthropicKey && !anthropicKey.startsWith('sk-ant-')) {
        return res.status(400).json({ error: 'Invalid Anthropic key format. Keys start with sk-ant-' });
      }
      const encrypted = anthropicKey ? encrypt(anthropicKey) : null;
      await db.query(
        'UPDATE user_settings SET own_anthropic_key = $1 WHERE user_id = $2',
        [encrypted, req.userId]
      );
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Delete a specific own API key
router.delete('/own-keys/:provider', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { provider } = req.params;
    if (provider === 'openai') {
      await db.query('UPDATE user_settings SET own_openai_key = NULL WHERE user_id = $1', [req.userId]);
    } else if (provider === 'anthropic') {
      await db.query('UPDATE user_settings SET own_anthropic_key = NULL WHERE user_id = $1', [req.userId]);
    } else {
      return res.status(400).json({ error: 'Invalid provider. Use openai or anthropic.' });
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

// Internal-only: get decrypted own key for proxy (not exposed via auth middleware externally)
export async function getUserOwnKey(userId: string, provider: 'openai' | 'anthropic'): Promise<string | null> {
  const col = provider === 'openai' ? 'own_openai_key' : 'own_anthropic_key';
  const row = await db.getOne<{ key: string | null }>(
    `SELECT ${col} as key FROM user_settings WHERE user_id = $1`,
    [userId]
  );
  if (!row?.key) return null;
  try {
    return decrypt(row.key);
  } catch {
    return null;
  }
}

export default router;
