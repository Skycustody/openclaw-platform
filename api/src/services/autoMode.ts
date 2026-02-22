/**
 * DEPRECATED — DO NOT USE FOR NEW FEATURES.
 *
 * This service calls OpenAI/Anthropic directly, bypassing the OpenClaw container.
 * It violates the platform architecture (see AGENTS.md).
 *
 * All user AI interactions must go through the user's OpenClaw container.
 * Cron jobs use sendContainerMessage() from containerConfig.ts.
 * Chat uses the Control UI iframe on the dashboard home page.
 *
 * This file is kept only for reference during the migration period.
 * It should be deleted once all references are removed.
 */
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import db from '../lib/db';
import { checkBalance, trackUsage } from './tokenTracker';
import { classifyTask, selectModel, MODEL_MAP } from './smartRouter';
import { getUserOwnKey } from '../routes/settings';
import { UserSettings, Plan } from '../types';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface AutoModeStep {
  step: number;
  action: string;
  model: string;
  reasoning: string;
  result: string;
  tokensUsed: number;
}

interface AutoModeResult {
  taskId: string;
  status: 'completed' | 'stopped' | 'error';
  steps: AutoModeStep[];
  totalTokens: number;
  finalAnswer: string;
  error?: string;
}

const MAX_STEPS = 10;
const FAST_MODEL = 'gpt-4o-mini';
const MID_MODEL = 'claude-sonnet-4-6';

// ── Opus-Quality Pipeline ──
// Instead of sending everything to Opus ($15/1M tokens), we use a
// multi-agent pipeline that achieves comparable quality at ~80% less cost:
//
//   1. CLASSIFY (gpt-4o-mini ~$0.15/1M) — understand task complexity
//   2. DRAFT   (claude-sonnet ~$3/1M)   — generate thorough first response
//   3. CRITIQUE (gpt-4o-mini ~$0.15/1M) — find gaps, errors, weak reasoning
//   4. REFINE  (claude-sonnet ~$3/1M)   — fix critique, polish to Opus level
//
// Simple tasks skip critique/refine and just use one fast model.
// Only truly complex deep-analysis tasks escalate to Opus.
//
// Cost comparison for a typical 2K-token task:
//   Opus direct:  ~$30 per 1M tokens
//   Our pipeline:  ~$6 per 1M tokens  (80% savings, ~90% quality)

/**
 * Call a model and return the response + token count.
 * If the user has their own key for the provider, use it.
 */
async function callModel(
  model: string,
  system: string,
  prompt: string,
  maxTokens = 4096,
  ownKeys?: { openai?: string | null; anthropic?: string | null }
): Promise<{ text: string; tokens: number; usedOwnKey: boolean }> {
  if (model.startsWith('claude')) {
    const apiKey = ownKeys?.anthropic || process.env.ANTHROPIC_API_KEY;
    const anthropic = new Anthropic({ apiKey });
    const res = await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = res.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('\n');
    return {
      text,
      tokens: (res.usage?.input_tokens || 0) + (res.usage?.output_tokens || 0),
      usedOwnKey: !!ownKeys?.anthropic,
    };
  }

  const apiKey = ownKeys?.openai || process.env.OPENAI_API_KEY;
  const client = new OpenAI({ apiKey });
  const res = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: prompt },
    ],
    max_tokens: maxTokens,
    temperature: model === FAST_MODEL ? 0 : 0.3,
  });
  return {
    text: res.choices[0].message.content || '',
    tokens: res.usage?.total_tokens || 0,
    usedOwnKey: !!ownKeys?.openai,
  };
}

/**
 * Plan a complex task into sub-steps using the fast model.
 */
async function planTask(
  task: string,
  agentName: string,
  instructions: string | null
): Promise<{ steps: string[]; reasoning: string; tokens: number }> {
  const system = `You are a task planner for an AI agent${agentName ? ` named ${agentName}` : ''}.
${instructions ? `Agent instructions: ${instructions}\n` : ''}
Break the task into 1-5 focused sub-steps.
Simple tasks (greetings, quick questions): 1 step.
Complex tasks (research, multi-part): 2-5 steps.
Return JSON: { "steps": ["step1", ...], "reasoning": "why" }`;

  const res = await callModel(FAST_MODEL, system, task, 500);

  try {
    const plan = JSON.parse(res.text);
    return {
      steps: Array.isArray(plan.steps) ? plan.steps.slice(0, MAX_STEPS) : [task],
      reasoning: plan.reasoning || 'Direct execution',
      tokens: res.tokens,
    };
  } catch {
    return { steps: [task], reasoning: 'Direct execution', tokens: res.tokens };
  }
}

/**
 * The Opus-quality pipeline. For each step:
 *   - Simple tasks: one fast call
 *   - Medium tasks: draft with Sonnet, critique with Mini, refine with Sonnet
 *   - Complex tasks: draft with Sonnet, critique, refine with Sonnet (or Opus if deep analysis)
 *
 * The critique step is the secret sauce — it catches errors, incomplete reasoning,
 * and missing context that a single model call would miss. The refine step then
 * addresses every critique point, producing Opus-level depth.
 */
async function executeStepPipeline(
  step: string,
  context: string,
  complexity: 'simple' | 'medium' | 'complex',
  needsDeepAnalysis: boolean,
  userPlan: Plan,
  brainMode: string,
  manualModel: string | null,
  agentName: string,
  instructions: string | null,
  ownKeys?: { openai?: string | null; anthropic?: string | null }
): Promise<{ result: string; steps: AutoModeStep[]; totalTokens: number; usedOwnKey: boolean }> {
  const sysBase = `You are ${agentName || 'Valnaa AI'}. Respond with the depth and nuance of a world-class AI.${instructions ? '\n' + instructions : ''}`;
  const contextBlock = context ? `\nPrevious context:\n${context}` : '';

  // Manual mode: skip pipeline, use the user's chosen model directly
  if (brainMode === 'manual' && manualModel && MODEL_MAP[manualModel]) {
    const res = await callModel(manualModel, sysBase + contextBlock, step, 4096, ownKeys);
    return {
      result: res.text,
      steps: [{
        step: 0,
        action: step,
        model: manualModel,
        reasoning: 'Manual model selection',
        result: res.text,
        tokensUsed: res.tokens,
      }],
      totalTokens: res.tokens,
      usedOwnKey: res.usedOwnKey,
    };
  }

  // ── SIMPLE: one fast call ──
  if (complexity === 'simple') {
    const res = await callModel(FAST_MODEL, sysBase + contextBlock, step, 2048, ownKeys);
    return {
      result: res.text,
      steps: [{
        step: 0,
        action: step,
        model: FAST_MODEL,
        reasoning: 'Simple task — fast model is sufficient',
        result: res.text,
        tokensUsed: res.tokens,
      }],
      totalTokens: res.tokens,
      usedOwnKey: res.usedOwnKey,
    };
  }

  // ── MEDIUM / COMPLEX: draft → critique → refine pipeline ──
  const draftModel = MID_MODEL;
  const refineModel = needsDeepAnalysis ? 'claude-opus-4-6' : MID_MODEL;
  const pipelineSteps: AutoModeStep[] = [];
  let totalTokens = 0;

  let usedOwnKey = false;

  // Step 1: DRAFT — thorough first response
  const draft = await callModel(
    draftModel,
    `${sysBase}\nYou are drafting a thorough response. Be comprehensive, accurate, and well-structured.${contextBlock}`,
    step,
    4096,
    ownKeys
  );
  usedOwnKey = draft.usedOwnKey;
  totalTokens += draft.tokens;
  pipelineSteps.push({
    step: 0,
    action: 'Drafting response',
    model: draftModel,
    reasoning: 'Writing thorough first draft with Sonnet',
    result: draft.text.slice(0, 300) + (draft.text.length > 300 ? '...' : ''),
    tokensUsed: draft.tokens,
  });

  // Step 2: CRITIQUE — fast model finds gaps and errors
  const critiquePrompt = `Review this AI response for quality. Be harsh but constructive.

TASK: ${step}

RESPONSE:
${draft.text}

Find:
1. Factual errors or unsupported claims
2. Missing important points or perspectives
3. Weak reasoning or logic gaps
4. Unclear explanations
5. Incomplete answers

Return a numbered list of specific improvements needed. If the response is already excellent, say "NO_IMPROVEMENTS_NEEDED".`;

  const critique = await callModel(FAST_MODEL, 'You are a critical reviewer. Be specific and thorough.', critiquePrompt, 1000, ownKeys);
  totalTokens += critique.tokens;
  pipelineSteps.push({
    step: 0,
    action: 'Quality review',
    model: FAST_MODEL,
    reasoning: 'Fast critique to find gaps and errors',
    result: critique.text.slice(0, 200) + (critique.text.length > 200 ? '...' : ''),
    tokensUsed: critique.tokens,
  });

  // If critique says no improvements needed, return the draft
  if (critique.text.includes('NO_IMPROVEMENTS_NEEDED')) {
    return { result: draft.text, steps: pipelineSteps, totalTokens, usedOwnKey };
  }

  // Step 3: REFINE — address every critique point
  const refinePrompt = `You wrote this initial response:

${draft.text}

A reviewer found these issues:

${critique.text}

Rewrite the response from scratch, addressing EVERY critique point. The final version should be:
- More accurate and thorough
- Better structured and clearer
- Complete with no gaps
- Written at the highest quality level

Respond with ONLY the improved response (no meta-commentary about changes).`;

  const refined = await callModel(
    refineModel,
    `${sysBase}\nYou are polishing a response to the highest quality standard.${contextBlock}`,
    refinePrompt,
    4096,
    ownKeys
  );
  totalTokens += refined.tokens;
  pipelineSteps.push({
    step: 0,
    action: needsDeepAnalysis ? 'Deep refinement (Opus)' : 'Refining response',
    model: refineModel,
    reasoning: needsDeepAnalysis
      ? 'Complex analysis — Opus for final polish'
      : 'Sonnet refinement addressing all critique points',
    result: refined.text.slice(0, 300) + (refined.text.length > 300 ? '...' : ''),
    tokensUsed: refined.tokens,
  });

  return { result: refined.text, steps: pipelineSteps, totalTokens, usedOwnKey };
}

/**
 * Run a task in auto mode with the Opus-quality pipeline.
 */
export async function runAutoMode(
  userId: string,
  task: string,
  onStep?: (step: AutoModeStep, totalTokensSoFar: number, balance: number) => void
): Promise<AutoModeResult> {
  const taskId = `auto_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const settings = await db.getOne<UserSettings>(
    'SELECT * FROM user_settings WHERE user_id = $1',
    [userId]
  );
  const user = await db.getOne<{ plan: Plan; status: string }>(
    'SELECT plan, status FROM users WHERE id = $1',
    [userId]
  );

  if (!user || !['active', 'sleeping', 'provisioning', 'grace_period'].includes(user.status)) {
    return {
      taskId, status: 'error', steps: [], totalTokens: 0, finalAnswer: '',
      error: 'Your account is not active. Please check your subscription.',
    };
  }

  const agentName = settings?.agent_name || 'Valnaa AI';
  const instructions = settings?.custom_instructions || null;
  const brainMode = settings?.brain_mode || 'auto';
  const manualModel = settings?.manual_model || null;

  // Load user's own keys (if any)
  const [ownOpenai, ownAnthropic] = await Promise.all([
    getUserOwnKey(userId, 'openai'),
    getUserOwnKey(userId, 'anthropic'),
  ]);
  const ownKeys = { openai: ownOpenai, anthropic: ownAnthropic };
  const hasOwnKeys = !!ownOpenai || !!ownAnthropic;

  let balance = await checkBalance(userId);
  // Skip balance check if user has their own keys
  if (balance < 100 && !hasOwnKeys) {
    return {
      taskId, status: 'error', steps: [], totalTokens: 0, finalAnswer: '',
      error: `You only have ${balance} tokens. You need at least 100 to run a task.`,
    };
  }

  const allSteps: AutoModeStep[] = [];
  let totalTokens = 0;
  let context = '';

  try {
    // ── Step 0: Classify task complexity ──
    const classification = await classifyTask(task, false);
    const classifyTokens = 100;
    totalTokens += classifyTokens;
    if (!hasOwnKeys) {
      await trackUsage(userId, FAST_MODEL, classifyTokens, taskId);
      balance = await checkBalance(userId);
    }

    const classifyStep: AutoModeStep = {
      step: 0,
      action: `Analyzing: ${classification.complexity} task${classification.needsDeepAnalysis ? ' (deep analysis)' : ''}`,
      model: FAST_MODEL,
      reasoning: `Complexity: ${classification.complexity}, Internet: ${classification.needsInternet}, Code: ${classification.needsCode}`,
      result: `Estimated ~${classification.estimatedTokens} tokens`,
      tokensUsed: classifyTokens,
    };
    allSteps.push(classifyStep);
    onStep?.(classifyStep, totalTokens, balance);

    // ── Plan (only for complex tasks) ──
    let taskSteps: string[];
    if (classification.complexity === 'complex') {
      const plan = await planTask(task, agentName, instructions);
      totalTokens += plan.tokens;
      if (!hasOwnKeys) {
        await trackUsage(userId, FAST_MODEL, plan.tokens, taskId);
        balance = await checkBalance(userId);
      }

      taskSteps = plan.steps;
      const planStep: AutoModeStep = {
        step: 0,
        action: `Planning: ${plan.steps.length} step(s)`,
        model: FAST_MODEL,
        reasoning: plan.reasoning,
        result: plan.steps.map((s, i) => `${i + 1}. ${s}`).join('\n'),
        tokensUsed: plan.tokens,
      };
      allSteps.push(planStep);
      onStep?.(planStep, totalTokens, balance);
    } else {
      taskSteps = [task];
    }

    // ── Execute each step through the quality pipeline ──
    for (let i = 0; i < taskSteps.length; i++) {
      if (!hasOwnKeys) balance = await checkBalance(userId);
      if (balance < 100 && !hasOwnKeys) {
        const stopStep: AutoModeStep = {
          step: i + 1, action: taskSteps[i], model: 'none',
          reasoning: 'Stopped — insufficient tokens',
          result: `Ran out of tokens (${balance} remaining). Purchase more to continue.`,
          tokensUsed: 0,
        };
        allSteps.push(stopStep);
        onStep?.(stopStep, totalTokens, balance);
        return {
          taskId, status: 'stopped', steps: allSteps, totalTokens,
          finalAnswer: context || 'Task stopped due to insufficient tokens.',
          error: `Ran out of tokens at step ${i + 1}/${taskSteps.length}.`,
        };
      }

      // Run the draft→critique→refine pipeline
      const pipeline = await executeStepPipeline(
        taskSteps[i], context, classification.complexity,
        classification.needsDeepAnalysis, user.plan,
        brainMode, manualModel, agentName, instructions, ownKeys
      );

      // Track all pipeline sub-steps (skip if user used their own key)
      if (!pipeline.usedOwnKey) {
        for (const ps of pipeline.steps) {
          await trackUsage(userId, ps.model, ps.tokensUsed, taskId);
        }
      }
      totalTokens += pipeline.totalTokens;
      if (!hasOwnKeys) balance = await checkBalance(userId);

      context += `\n\n--- Step ${i + 1}: ${taskSteps[i]} ---\n${pipeline.result}`;

      // Report pipeline steps to frontend
      for (let j = 0; j < pipeline.steps.length; j++) {
        const ps = { ...pipeline.steps[j], step: i + 1 };
        allSteps.push(ps);
        onStep?.(ps, totalTokens, balance);
      }
    }

    // ── Synthesize if multi-step ──
    let finalAnswer = '';
    if (taskSteps.length > 1) {
      try {
        const synth = await callModel(
          FAST_MODEL,
          `You are ${agentName}. Synthesize results into one clear, polished answer.`,
          `Original task: ${task}\n\nResults:\n${context}`,
          1500,
          ownKeys
        );
        finalAnswer = synth.text;
        if (!synth.usedOwnKey) {
          await trackUsage(userId, FAST_MODEL, synth.tokens, taskId);
        }
        totalTokens += synth.tokens;
      } catch {
        finalAnswer = allSteps[allSteps.length - 1]?.result || '';
      }
    } else {
      // For single-step tasks, the pipeline result is the final answer
      const lastPipelineStep = allSteps[allSteps.length - 1];
      // Find the full result (pipeline steps have truncated results for the UI)
      finalAnswer = context.split('---\n').pop() || lastPipelineStep?.result || '';
    }

    await db.query(
      `INSERT INTO activity_log (user_id, type, channel, summary, tokens_used, model_used)
       VALUES ($1, 'auto_task', 'dashboard', $2, $3, $4)`,
      [userId, task.slice(0, 200), totalTokens, 'auto-pipeline']
    ).catch(() => {});

    return { taskId, status: 'completed', steps: allSteps, totalTokens, finalAnswer };
  } catch (err: any) {
    return {
      taskId, status: 'error', steps: allSteps, totalTokens, finalAnswer: '',
      error: err.message || 'An unexpected error occurred.',
    };
  }
}
