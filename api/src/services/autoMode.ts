import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import db from '../lib/db';
import { checkBalance, trackUsage } from './tokenTracker';
import { classifyTask, selectModel } from './smartRouter';
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
const PLANNER_MODEL = 'gpt-4o-mini';

/**
 * Decompose a user task into a plan of sub-steps using a small, cheap model.
 * Returns a list of steps the agent should execute.
 */
async function planTask(
  task: string,
  agentName: string,
  customInstructions: string | null
): Promise<{ steps: string[]; reasoning: string }> {
  const systemPrompt = `You are a task planner for an AI agent${agentName ? ` named ${agentName}` : ''}.
${customInstructions ? `Agent instructions: ${customInstructions}\n` : ''}
Given a user task, break it down into 1-5 concrete sub-steps.
Each step should be a single, focused action.
For simple tasks (greetings, questions, quick requests), use just 1 step.
For complex tasks (research, multi-part analysis, comparisons), use 2-5 steps.

Return JSON only: { "steps": ["step1", "step2", ...], "reasoning": "why this plan" }`;

  const res = await openai.chat.completions.create({
    model: PLANNER_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: task },
    ],
    max_tokens: 500,
    response_format: { type: 'json_object' },
    temperature: 0,
  });

  const plannerTokens = res.usage?.total_tokens || 100;
  const content = res.choices[0].message.content || '{}';

  try {
    const plan = JSON.parse(content);
    return {
      steps: Array.isArray(plan.steps) ? plan.steps.slice(0, MAX_STEPS) : [task],
      reasoning: plan.reasoning || 'Direct execution',
    };
  } catch {
    return { steps: [task], reasoning: 'Direct execution (plan parse failed)' };
  }
}

/**
 * Execute a single step using the appropriate model.
 * The smart router picks the best model based on the step content.
 */
async function executeStep(
  step: string,
  context: string,
  userPlan: Plan,
  brainMode: string,
  manualModel: string | null,
  agentName: string,
  customInstructions: string | null
): Promise<{ result: string; model: string; reason: string; tokensUsed: number }> {

  // Classify and route
  const classification = await classifyTask(step, false);
  const routing = brainMode === 'manual' && manualModel
    ? selectModel(classification, userPlan, manualModel)
    : selectModel(classification, userPlan);

  const model = routing.model;

  const systemPrompt = `You are ${agentName || 'an AI assistant'}.${customInstructions ? '\n' + customInstructions : ''}
You are completing a step in a larger task. Be thorough but concise.
Previous context from earlier steps:
${context || '(none yet)'}`;

  let result = '';
  let tokensUsed = 0;

  // Use the appropriate SDK based on the model
  if (model.startsWith('claude')) {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const res = await anthropic.messages.create({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: step }],
    });

    result = res.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('\n');
    tokensUsed = (res.usage?.input_tokens || 0) + (res.usage?.output_tokens || 0);
  } else {
    const res = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: step },
      ],
      max_tokens: 4096,
    });

    result = res.choices[0].message.content || '';
    tokensUsed = res.usage?.total_tokens || 0;
  }

  return { result, model, reason: routing.reason, tokensUsed };
}

/**
 * Run a task in auto mode. Decomposes, routes, executes multi-step, tracks tokens.
 *
 * onStep callback is called after each step for real-time streaming to the frontend.
 */
export async function runAutoMode(
  userId: string,
  task: string,
  onStep?: (step: AutoModeStep, totalTokensSoFar: number, balance: number) => void
): Promise<AutoModeResult> {
  const taskId = `auto_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Load user settings
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
      taskId,
      status: 'error',
      steps: [],
      totalTokens: 0,
      finalAnswer: '',
      error: 'Your account is not active. Please check your subscription.',
    };
  }

  const agentName = settings?.agent_name || 'AI Assistant';
  const customInstructions = settings?.custom_instructions || null;
  const brainMode = settings?.brain_mode || 'auto';
  const manualModel = settings?.manual_model || null;

  // Check initial balance
  let balance = await checkBalance(userId);
  if (balance < 100) {
    return {
      taskId,
      status: 'error',
      steps: [],
      totalTokens: 0,
      finalAnswer: '',
      error: `You only have ${balance} tokens. You need at least 100 tokens to run a task.`,
    };
  }

  const steps: AutoModeStep[] = [];
  let totalTokens = 0;
  let context = '';

  try {
    // Step 0: Plan the task (cheap, uses gpt-4o-mini)
    const plan = await planTask(task, agentName, customInstructions);
    const plannerTokens = 150; // approximate planner cost
    totalTokens += plannerTokens;
    await trackUsage(userId, PLANNER_MODEL, plannerTokens, taskId);
    balance = await checkBalance(userId);

    const planStep: AutoModeStep = {
      step: 0,
      action: `Planning: ${plan.steps.length} step(s) — ${plan.reasoning}`,
      model: PLANNER_MODEL,
      reasoning: plan.reasoning,
      result: plan.steps.map((s, i) => `${i + 1}. ${s}`).join('\n'),
      tokensUsed: plannerTokens,
    };
    steps.push(planStep);
    onStep?.(planStep, totalTokens, balance);

    // Execute each step
    for (let i = 0; i < plan.steps.length; i++) {
      const stepDesc = plan.steps[i];

      // Pre-flight: check balance before each step
      balance = await checkBalance(userId);
      if (balance < 100) {
        const stopStep: AutoModeStep = {
          step: i + 1,
          action: stepDesc,
          model: 'none',
          reasoning: 'Stopped — insufficient tokens',
          result: `You ran out of tokens (${balance} remaining). Purchase more to continue.`,
          tokensUsed: 0,
        };
        steps.push(stopStep);
        onStep?.(stopStep, totalTokens, balance);

        return {
          taskId,
          status: 'stopped',
          steps,
          totalTokens,
          finalAnswer: context || 'Task stopped due to insufficient tokens.',
          error: `Ran out of tokens at step ${i + 1}/${plan.steps.length}.`,
        };
      }

      // Execute the step
      const result = await executeStep(
        stepDesc,
        context,
        user.plan,
        brainMode,
        manualModel,
        agentName,
        customInstructions
      );

      // Track usage
      await trackUsage(userId, result.model, result.tokensUsed, taskId);
      totalTokens += result.tokensUsed;
      balance = await checkBalance(userId);

      // Build context for next step
      context += `\n\n--- Step ${i + 1}: ${stepDesc} ---\n${result.result}`;

      const execStep: AutoModeStep = {
        step: i + 1,
        action: stepDesc,
        model: result.model,
        reasoning: result.reason,
        result: result.result,
        tokensUsed: result.tokensUsed,
      };
      steps.push(execStep);
      onStep?.(execStep, totalTokens, balance);
    }

    // If there were multiple steps, generate a final synthesis
    let finalAnswer = '';
    if (plan.steps.length > 1) {
      try {
        const synthRes = await openai.chat.completions.create({
          model: PLANNER_MODEL,
          messages: [
            {
              role: 'system',
              content: `You are ${agentName}. Synthesize the results from multiple steps into a clear final answer. Be concise.`,
            },
            {
              role: 'user',
              content: `Original task: ${task}\n\nResults:\n${context}`,
            },
          ],
          max_tokens: 1000,
        });

        finalAnswer = synthRes.choices[0].message.content || '';
        const synthTokens = synthRes.usage?.total_tokens || 200;
        await trackUsage(userId, PLANNER_MODEL, synthTokens, taskId);
        totalTokens += synthTokens;
      } catch {
        finalAnswer = steps[steps.length - 1]?.result || '';
      }
    } else {
      finalAnswer = steps[steps.length - 1]?.result || '';
    }

    // Log the task
    await db.query(
      `INSERT INTO activity_log (user_id, type, channel, summary, tokens_used, model_used)
       VALUES ($1, 'auto_task', 'dashboard', $2, $3, $4)`,
      [userId, task.slice(0, 200), totalTokens, 'auto']
    ).catch(() => {});

    return {
      taskId,
      status: 'completed',
      steps,
      totalTokens,
      finalAnswer,
    };
  } catch (err: any) {
    return {
      taskId,
      status: 'error',
      steps,
      totalTokens,
      finalAnswer: '',
      error: err.message || 'An unexpected error occurred.',
    };
  }
}
