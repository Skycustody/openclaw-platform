import { ChildProcess, spawn, execFile } from 'child_process';
import { EventEmitter } from 'events';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { IS_WIN, getOpenClawDir } from '../lib/platform';
import { classifyProcessError } from '../lib/errors';
import { logApp, logOpenclaw } from './logger';
import { findOpenClawBinary, findNemoClawBinary } from './installer';
import { startHealthPolling, stopHealthPolling, HealthStatus } from './health';
import { findAvailablePort, PortResult } from '../lib/ports';
import { loadRuntime, RuntimeType, isSandboxReady, waitForSandboxReady, ensurePortForward, stopPortForward, OPENCLAW_PORT, getActiveGatewayPort, readSandboxGatewayToken, clearSandboxTokenCache, clearSandboxNameCache, dockerBin, isIntelMac, isSidecarReady, setupOpenShellSidecar, ensureSidecarNetworking, ensureSandboxGatewayRunning, ensureSidecarBinaryHealthy } from '../lib/runtime';
import { freePort } from '../lib/ports';
import { startRelay, stopRelay } from '../lib/relay';

function checkPortReady(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}`, { timeout: 2000 }, (res) => {
      resolve(res.statusCode !== undefined);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

export type AgentState = 'stopped' | 'starting' | 'running' | 'stopping' | 'crashed' | 'installing';

export interface AgentStatus {
  state: AgentState;
  port: number | null;
  health: HealthStatus;
  pid: number | null;
  error: string | null;
  errorDetails: string | null;
  reused: boolean;
  gatewayToken: string | null;
  runtime: RuntimeType;
  bossRunning: boolean;
}

function readGatewayToken(): string | null {
  const pref = loadRuntime();
  if (pref?.runtime === 'nemoclaw') {
    return readSandboxGatewayToken();
  }
  try {
    const cfgPath = path.join(getOpenClawDir(), 'openclaw.json');
    const raw = fs.readFileSync(cfgPath, 'utf-8');
    const cfg = JSON.parse(raw);
    return cfg?.gateway?.auth?.token || null;
  } catch {
    return null;
  }
}

const MAX_RESTART_ATTEMPTS = 3;
const RESTART_BACKOFF_MS = [2000, 5000, 10000];
const STARTUP_TIMEOUT_MS = 30000;

const CLAUDE_PROXY_PORT = 3456;
const BOSS_CHECK_INTERVAL_CLI_MS = 15 * 60 * 1000; // 15 min default (free via Max)
const BOSS_CHECK_INTERVAL_API_MS = 30 * 60 * 1000; // 30 min default (paid per token)
const BOSS_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes max per check

interface BossConfig {
  enabled?: boolean;
  provider?: string;  // 'anthropic' | 'openai' | 'xai' | 'groq' | 'mistral' | 'claude-code'
  model?: string;     // e.g. 'gpt-4o', 'claude-sonnet-4-20250514', 'grok-3'
  intervalMinutes?: number;
  notify?: { telegram?: { chatId?: string } };
  lastCheckedAt?: string | null;
  /** Agent cron schedules — run agents as Claude Code instances */
  agents?: Record<string, { enabled: boolean; intervalMinutes: number; prompt?: string }>;
}

/** Read boss config from ~/.openclaw/boss.json */
function readBossConfig(): BossConfig {
  try {
    const cfgPath = path.join(os.homedir(), '.openclaw', 'boss.json');
    return JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
  } catch {
    return {};
  }
}

/** Read agent list from openclaw.json */
function readAgentList(): Array<{ id: string; name: string; workspace?: string }> {
  try {
    const cfgPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
    const config = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
    return config.agents?.list || [];
  } catch {
    return [];
  }
}

/** Find the `claude` CLI binary. Returns the path or null. */
function findClaudeBinary(): string | null {
  const { execSync } = require('child_process');
  try {
    const out = execSync('which claude', { encoding: 'utf-8', timeout: 5000, stdio: 'pipe' }).trim();
    if (out) return out;
  } catch { /* not in PATH */ }
  // Check common locations
  for (const dir of ['/usr/local/bin', path.join(os.homedir(), '.local', 'bin'), path.join(os.homedir(), '.npm-global', 'bin')]) {
    const bin = path.join(dir, 'claude');
    if (fs.existsSync(bin)) return bin;
  }
  // Check nvm versions
  try {
    const nvmBase = path.join(os.homedir(), '.nvm', 'versions', 'node');
    const versions = fs.readdirSync(nvmBase);
    for (const v of versions.sort().reverse()) {
      const bin = path.join(nvmBase, v, 'bin', 'claude');
      if (fs.existsSync(bin)) return bin;
    }
  } catch { /* nvm not installed */ }
  return null;
}

/** Find the Claude proxy — prefer SDK proxy, fall back to claude-max-api. */
function findClaudeProxyBinary(): { bin: string; args: string[] } | null {
  // Prefer SDK proxy (faster — no subprocess per request)
  const sdkProxy = path.join(os.homedir(), '.local', 'bin', 'claude-sdk-proxy.mjs');
  if (fs.existsSync(sdkProxy)) {
    return { bin: 'node', args: [sdkProxy] };
  }
  // Fall back to claude-max-api
  try {
    const nvmBase = path.join(os.homedir(), '.nvm', 'versions', 'node');
    const versions = fs.readdirSync(nvmBase);
    for (const v of versions.sort().reverse()) {
      const bin = path.join(nvmBase, v, 'bin', 'claude-max-api');
      if (fs.existsSync(bin)) return { bin, args: [] };
    }
  } catch { /* nvm not installed */ }
  for (const dir of ['/usr/local/bin', path.join(os.homedir(), '.local', 'bin')]) {
    const bin = path.join(dir, 'claude-max-api');
    if (fs.existsSync(bin)) return { bin, args: [] };
  }
  return null;
}

class OpenClawManager extends EventEmitter {
  private proc: ChildProcess | null = null;
  private claudeProxy: ChildProcess | null = null;
  private state: AgentState = 'stopped';
  private port: number | null = null;
  private health: HealthStatus = 'stopped';
  private restartCount = 0;
  private startupTimer: ReturnType<typeof setTimeout> | null = null;
  private readinessPoll: ReturnType<typeof setInterval> | null = null;
  private stderrBuffer = '';
  private reused = false;
  private lastError: string | null = null;
  private lastErrorDetails: string | null = null;
  private activeRuntime: RuntimeType = 'openclaw';
  private switchingRuntime = false;
  /** True when connected to a gateway we didn't start — don't modify config or clear tokens */
  private externalGateway = false;
  private pairingPoll: ReturnType<typeof setInterval> | null = null;
  private bossAgent: ChildProcess | null = null;
  private bossTimer: ReturnType<typeof setInterval> | null = null;
  /** Claude Code agent runners — keyed by agent ID */
  private agentRunners: Map<string, { proc: ChildProcess | null; timer: ReturnType<typeof setInterval> }> = new Map();

  /** True when connected to a user's pre-existing gateway — app should not modify their config */
  isExternal(): boolean { return this.externalGateway; }

  getStatus(): AgentStatus {
    const pref = loadRuntime();
    return {
      state: this.state,
      port: this.port,
      health: this.health,
      pid: this.proc?.pid ?? null,
      error: this.lastError,
      errorDetails: this.lastErrorDetails,
      reused: this.reused,
      gatewayToken: readGatewayToken(),
      runtime: pref?.runtime || 'openclaw',
      bossRunning: this.bossTimer !== null,
    };
  }

  async start(): Promise<void> {
    if (this.state === 'running' || this.state === 'starting') return;

    this.lastError = null;
    this.lastErrorDetails = null;
    this.reused = false;

    const pref = loadRuntime();
    const runtime = pref?.runtime || 'openclaw';
    this.activeRuntime = runtime;

    // ── Check if an OpenClaw gateway is already running ──
    if (runtime === 'openclaw') {
      const existing = await this.detectExistingGateway();
      if (existing) {
        this.port = existing.port;
        this.reused = true;
        this.externalGateway = true;
        logApp('info', `Found existing OpenClaw gateway on port ${existing.port} — connecting (read-only mode)`);
        this.onGatewayReady();
        return;
      }
      this.externalGateway = false;
    }

    if (runtime === 'nemoclaw') {
      if (this.switchingRuntime) {
        logApp('info', 'Post-switch: force-freeing gateway port before NemoClaw start');
        try { freePort(OPENCLAW_PORT); } catch { /* ok */ }
        this.switchingRuntime = false;
      }
      const nemoBin = findNemoClawBinary();
      if (!nemoBin) {
        this.setState('installing');
        this.lastError = 'NemoClaw is not installed. Installing...';
        this.emitStatus();
        return;
      }
      this.restartCount = 0;
      await this.connectToNemoClawSandbox();
      return;
    }

    // OpenClaw flow: allocate port and spawn gateway
    // After a runtime switch, the old runtime's gateway may still hold the
    // port. Force-free it so we don't "reuse" the wrong gateway.
    if (this.switchingRuntime) {
      logApp('info', 'Post-switch: force-freeing gateway port before OpenClaw start');
      try { freePort(OPENCLAW_PORT); } catch { /* ok */ }
      this.switchingRuntime = false;
    }

    let portResult: PortResult;
    try {
      portResult = await findAvailablePort();
    } catch (err: any) {
      this.setState('crashed');
      this.lastError = err.message;
      return;
    }

    this.port = portResult.port;

    if (portResult.reused) {
      // The gateway is already running but may have a stale token.
      // Stop it properly (handles launchd service) and spawn fresh.
      logApp('info', `Found existing gateway on port ${this.port} — restarting to apply current token`);
      const ocBin = findOpenClawBinary();
      if (ocBin) {
        try {
          const { execSync } = require('child_process');
          execSync(`"${ocBin}" gateway stop`, { timeout: 8000, stdio: 'pipe' });
          logApp('info', 'Stopped existing gateway via openclaw gateway stop');
        } catch { /* ok */ }
      }
      try { freePort(this.port); } catch { /* ok */ }
      await new Promise(r => setTimeout(r, 1000));
    }

    const bin = findOpenClawBinary();
    if (!bin) {
      this.setState('installing');
      this.lastError = 'OpenClaw is not installed. Installing...';
      this.emitStatus();
      return;
    }
    this.restartCount = 0;
    this.spawnProcess(bin);
  }

  /** Start the Claude Code proxy if installed, enabled, and not already running. */
  private startClaudeProxy(): void {
    if (this.claudeProxy) return;
    // Only start if user has enabled it
    const flagPath = path.join(os.homedir(), '.openclaw-desktop', 'claude-code-enabled');
    if (!fs.existsSync(flagPath)) return;
    const proxyInfo = findClaudeProxyBinary();
    if (!proxyInfo) return;
    try {
      const allArgs = [...proxyInfo.args, String(CLAUDE_PROXY_PORT)];
      this.claudeProxy = spawn(proxyInfo.bin, allArgs, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env },
        windowsHide: true,
      });
      this.claudeProxy.stdout?.on('data', (d: Buffer) => {
        const t = d.toString();
        if (t.includes('running at')) logApp('info', `Claude Code proxy running on port ${CLAUDE_PROXY_PORT}`);
      });
      this.claudeProxy.stderr?.on('data', () => { /* suppress */ });
      this.claudeProxy.on('close', () => { this.claudeProxy = null; });

      // Register as provider in OpenClaw config if not already
      this.registerClaudeCodeProvider();
    } catch (e: any) {
      logApp('warn', `Claude proxy failed to start: ${e.message}`);
    }
  }

  /** Register claude-code-local as a provider in openclaw.json. */
  private registerClaudeCodeProvider(): void {
    try {
      const cfgPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
      const config = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
      if (!config.models) config.models = {};
      if (!config.models.providers) config.models.providers = {};
      if (config.models.providers['claude-code-local']) return; // already registered

      config.models.mode = config.models.mode || 'merge';
      config.models.providers['claude-code-local'] = {
        baseUrl: `http://127.0.0.1:${CLAUDE_PROXY_PORT}/v1`,
        apiKey: 'not-needed',
        api: 'openai-completions',
        models: [
          { id: 'claude-opus-4', name: 'Claude Opus 4 (Local)', reasoning: true, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 200000, maxTokens: 8192 },
          { id: 'claude-sonnet-4', name: 'Claude Sonnet 4 (Local)', reasoning: true, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 200000, maxTokens: 8192 },
        ],
      };
      fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2));
      logApp('info', 'Registered claude-code-local provider in openclaw.json');
    } catch (e: any) {
      logApp('warn', `Failed to register Claude Code provider: ${e.message}`);
    }
  }

  private stopClaudeProxy(): void {
    if (this.claudeProxy) {
      this.claudeProxy.kill();
      this.claudeProxy = null;
      logApp('info', 'Claude Code proxy stopped');
    }
  }

  // ── Boss Agent (Claude Code or API-powered manager) ─────────────────────

  /**
   * Resolve how Boss should run. Reads optional `boss` config from openclaw.json
   * for user's model/provider/interval preferences, then picks the best mode:
   *
   * 1. **CLI mode** — `claude -p` (free via Max subscription)
   * 2. **API mode** — `node boss-agent.mjs` (paid per token, any provider)
   *
   * User can force a provider/model via openclaw.json:
   *   { "boss": { "provider": "openai", "model": "gpt-4o", "intervalMinutes": 20 } }
   *   { "boss": { "provider": "claude-code" } }  // force CLI mode
   *   { "boss": { "enabled": false } }            // disable Boss
   */
  private resolveBossMode(): {
    mode: 'cli'; bin: string; cwd: string; model: string | null; interval: number;
  } | {
    mode: 'api'; cwd: string; apiKey: string; envVar: string; provider: string; model: string | null; interval: number;
  } | null {
    const bossWorkspace = path.join(os.homedir(), '.openclaw', 'workspace-manager');
    const claudeMd = path.join(bossWorkspace, 'CLAUDE.md');
    if (!fs.existsSync(claudeMd)) return null;

    const cfg = readBossConfig();

    // Explicit disable
    if (cfg.enabled === false) return null;

    // All supported API providers and their env var names
    const providerEnvMap: Array<{ provider: string; envVar: string }> = [
      { provider: 'anthropic', envVar: 'ANTHROPIC_API_KEY' },
      { provider: 'openai', envVar: 'OPENAI_API_KEY' },
      { provider: 'xai', envVar: 'XAI_API_KEY' },
      { provider: 'groq', envVar: 'GROQ_API_KEY' },
      { provider: 'mistral', envVar: 'MISTRAL_API_KEY' },
    ];

    // Collect all available API keys
    const apiKeys: Record<string, string> = {};
    try {
      const authPath = path.join(os.homedir(), '.openclaw', 'agents', 'main', 'agent', 'auth-profiles.json');
      const authData = JSON.parse(fs.readFileSync(authPath, 'utf-8'));
      for (const [, profile] of Object.entries(authData.profiles || {})) {
        const p = profile as any;
        if (p.type === 'api_key' && p.key && p.provider) {
          apiKeys[p.provider] = p.key;
        }
      }
    } catch { /* no auth profiles */ }
    for (const { provider: prov, envVar } of providerEnvMap) {
      if (process.env[envVar] && !apiKeys[prov]) apiKeys[prov] = process.env[envVar]!;
    }

    // Check if Claude Code CLI is available
    const claudeCodeEnabled = path.join(os.homedir(), '.openclaw-desktop', 'claude-code-enabled');
    const hasCli = fs.existsSync(claudeCodeEnabled) && !!findClaudeBinary();
    const hasScript = fs.existsSync(path.join(os.homedir(), '.openclaw', 'agent-runner.mjs')) || fs.existsSync(path.join(bossWorkspace, 'boss-agent.mjs'));

    // ── If user explicitly configured a provider ──
    if (cfg.provider) {
      const userInterval = cfg.intervalMinutes ? cfg.intervalMinutes * 60_000 : null;

      // "claude-code" = force CLI mode
      if (cfg.provider === 'claude-code') {
        if (!hasCli) return null;
        return {
          mode: 'cli', bin: findClaudeBinary()!, cwd: bossWorkspace,
          model: cfg.model || null,
          interval: userInterval || BOSS_CHECK_INTERVAL_CLI_MS,
        };
      }

      // Specific API provider requested
      const match = providerEnvMap.find(p => p.provider === cfg.provider);
      if (match && apiKeys[cfg.provider] && hasScript) {
        return {
          mode: 'api', cwd: bossWorkspace, envVar: match.envVar,
          apiKey: apiKeys[cfg.provider], provider: cfg.provider,
          model: cfg.model || null,
          interval: userInterval || BOSS_CHECK_INTERVAL_API_MS,
        };
      }

      // Requested provider not available — log and fall through to auto-detect
      logApp('warn', `Boss config: provider "${cfg.provider}" requested but no API key found — auto-detecting`);
    }

    const userInterval = cfg.intervalMinutes ? cfg.intervalMinutes * 60_000 : null;

    // ── Auto-detect: prefer CLI (free), fall back to best API ──
    if (hasCli) {
      return {
        mode: 'cli', bin: findClaudeBinary()!, cwd: bossWorkspace,
        model: cfg.model || null,
        interval: userInterval || BOSS_CHECK_INTERVAL_CLI_MS,
      };
    }

    if (hasScript) {
      for (const { provider: prov, envVar } of providerEnvMap) {
        if (apiKeys[prov]) {
          return {
            mode: 'api', cwd: bossWorkspace, envVar,
            apiKey: apiKeys[prov], provider: prov,
            model: cfg.model || null,
            interval: userInterval || BOSS_CHECK_INTERVAL_API_MS,
          };
        }
      }
    }

    return null;
  }

  /**
   * Start the Boss agent — monitors all other agents, evaluates output,
   * manages mailboxes, and dispatches tasks.
   */
  private startBossAgent(): void {
    if (this.bossTimer) return;

    const bossMode = this.resolveBossMode();
    if (!bossMode) {
      logApp('info', 'Boss agent: no Claude CLI or API key found — skipping');
      return;
    }

    const modeLabel = bossMode.mode === 'cli' ? 'Claude Code CLI (free)' : `${bossMode.provider} API (paid)`;
    const modelLabel = bossMode.model || 'default';
    const intervalMin = bossMode.interval / 60_000;

    logApp('info', `Boss agent started — mode: ${modeLabel}, model: ${modelLabel}, interval: ${intervalMin}min`);

    // First check after 30 seconds (let gateway fully stabilize)
    setTimeout(() => this.runBossCheck(bossMode), 30_000);

    // Then on interval
    this.bossTimer = setInterval(() => this.runBossCheck(bossMode), bossMode.interval);
  }

  /** Collect all API keys from auth profiles + env for the boss-agent script. */
  private collectAllApiKeys(): Record<string, string> {
    const keys: Record<string, string> = {};
    const envMap: Record<string, string> = {
      anthropic: 'ANTHROPIC_API_KEY',
      openai: 'OPENAI_API_KEY',
      xai: 'XAI_API_KEY',
      groq: 'GROQ_API_KEY',
      mistral: 'MISTRAL_API_KEY',
    };
    // From auth profiles
    try {
      const authPath = path.join(os.homedir(), '.openclaw', 'agents', 'main', 'agent', 'auth-profiles.json');
      const authData = JSON.parse(fs.readFileSync(authPath, 'utf-8'));
      for (const [, profile] of Object.entries(authData.profiles || {})) {
        const p = profile as any;
        if (p.type === 'api_key' && p.key && p.provider && envMap[p.provider]) {
          keys[envMap[p.provider]] = p.key;
        }
      }
    } catch { /* no auth profiles */ }
    // From env (don't overwrite profile keys)
    for (const envVar of Object.values(envMap)) {
      if (process.env[envVar] && !keys[envVar]) keys[envVar] = process.env[envVar]!;
    }
    return keys;
  }

  /** Run a single Boss check — spawns either claude CLI or node script. */
  private runBossCheck(mode: ReturnType<OpenClawManager['resolveBossMode']> & {}): void {
    if (this.bossAgent) {
      logApp('info', 'Boss agent: previous check still running — skipping');
      return;
    }

    const prompt = [
      'You are Boss. Run your periodic operations check.',
      'Read CLAUDE.md for full instructions. Key steps:',
      '1. Read boss.json for lastCheckedAt — use it for diff detection',
      '2. Check your inbox, then audit all agent inboxes',
      '3. Only read files modified since lastCheckedAt (skip unchanged)',
      '4. Evaluate changes, grade agents, send mailbox messages',
      '5. Notify user via Telegram if anything notable (D/F grades, errors, milestones)',
      '6. Update HEARTBEAT.md (rotate: max 5 runs, archive older)',
      '7. Update lastCheckedAt in boss.json',
      'Be concise. Numbers first. Act, don\'t advise.',
    ].join('\n');

    logApp('info', `Boss agent: starting periodic check (${mode.mode} mode${mode.model ? ', model: ' + mode.model : ''})`);

    if (mode.mode === 'cli') {
      const args = ['-p', '--dangerously-skip-permissions'];
      if (mode.model) args.push('--model', mode.model);
      args.push(prompt);
      this.bossAgent = spawn(mode.bin, args, {
        cwd: mode.cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env },
        windowsHide: true,
      });
    } else {
      // API mode — pass ALL available API keys so Boss can use any provider
      const sharedScript = path.join(os.homedir(), '.openclaw', 'agent-runner.mjs');
      const scriptPath = fs.existsSync(sharedScript) ? sharedScript : path.join(mode.cwd, 'boss-agent.mjs');
      const allKeys = this.collectAllApiKeys();
      const env: Record<string, string> = { ...process.env as any, ...allKeys };
      // Override with the selected provider's key (in case of conflict)
      env[mode.envVar] = mode.apiKey;
      if (mode.model) env.BOSS_MODEL = mode.model;
      if (mode.provider) env.BOSS_PROVIDER = mode.provider;
      this.bossAgent = spawn('node', [scriptPath, prompt], {
        cwd: mode.cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        env,
        windowsHide: true,
      });
    }

    let stdout = '';
    let stderr = '';

    this.bossAgent.stdout?.on('data', (d: Buffer) => {
      stdout += d.toString();
    });
    this.bossAgent.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString();
    });

    this.bossAgent.on('close', (code) => {
      const lines = stdout.split('\n').filter(l => l.trim()).length;
      logApp('info', `Boss agent: check completed (exit: ${code}, output: ${lines} lines, mode: ${mode.mode})`);
      if (code !== 0 && stderr) {
        logApp('warn', `Boss agent stderr: ${stderr.slice(0, 500)}`);
      }
      // Update lastCheckedAt on successful completion
      if (code === 0) {
        try {
          const cfgPath = path.join(os.homedir(), '.openclaw', 'boss.json');
          const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
          cfg.lastCheckedAt = new Date().toISOString();
          fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
        } catch { /* ok */ }
      }
      this.bossAgent = null;
    });

    this.bossAgent.on('error', (err) => {
      logApp('warn', `Boss agent: spawn failed: ${err.message}`);
      this.bossAgent = null;
    });

    // Safety timeout — kill if Boss runs too long
    setTimeout(() => {
      if (this.bossAgent) {
        logApp('warn', 'Boss agent: timed out — killing');
        this.bossAgent.kill();
        this.bossAgent = null;
      }
    }, BOSS_TIMEOUT_MS);
  }

  private stopBossAgent(): void {
    if (this.bossTimer) {
      clearInterval(this.bossTimer);
      this.bossTimer = null;
    }
    if (this.bossAgent) {
      this.bossAgent.kill();
      this.bossAgent = null;
    }
    logApp('info', 'Boss agent stopped');
  }

  // ── Agent Runners (run any agent as Claude Code) ───────────────────────

  /**
   * Start full-power runners for agents configured in boss.json.
   * Uses Claude Code CLI if available, falls back to agent-runner.mjs (works on servers too).
   *
   * boss.json:
   *   { "agents": { "lead-gen": { "enabled": true, "intervalMinutes": 60 } } }
   */
  private startAgentRunners(): void {
    const cfg = readBossConfig();
    if (!cfg.agents) return;

    // Resolve execution mode: Claude CLI or agent-runner.mjs
    const claudeCodeEnabled = path.join(os.homedir(), '.openclaw-desktop', 'claude-code-enabled');
    const claudeBin = fs.existsSync(claudeCodeEnabled) ? findClaudeBinary() : null;
    const runnerScript = path.join(os.homedir(), '.openclaw', 'agent-runner.mjs');
    const hasRunnerScript = fs.existsSync(runnerScript);

    if (!claudeBin && !hasRunnerScript) {
      logApp('info', 'Agent runners: no claude CLI or agent-runner.mjs — skipping');
      return;
    }

    // Collect API keys for agent-runner.mjs mode
    const allKeys = !claudeBin ? this.collectAllApiKeys() : {};
    const runMode = claudeBin ? 'cli' : 'api';
    const agentList = readAgentList();

    for (const [agentId, agentCfg] of Object.entries(cfg.agents)) {
      if (!agentCfg.enabled) continue;
      if (this.agentRunners.has(agentId)) continue;

      const agentEntry = agentList.find(a => a.id === agentId);
      const workspace = agentEntry?.workspace || path.join(os.homedir(), '.openclaw', `workspace-${agentId}`);

      // Ensure CLAUDE.md exists (auto-create from SOUL.md)
      const claudeMd = path.join(workspace, 'CLAUDE.md');
      if (!fs.existsSync(claudeMd)) {
        const soulMd = path.join(workspace, 'SOUL.md');
        if (fs.existsSync(soulMd)) {
          fs.copyFileSync(soulMd, claudeMd);
        } else {
          logApp('warn', `Agent runner [${agentId}]: no CLAUDE.md or SOUL.md — skipping`);
          continue;
        }
      }

      const intervalMs = (agentCfg.intervalMinutes || 60) * 60_000;
      const runner = { proc: null as ChildProcess | null, timer: null as any };

      const runOnce = () => {
        if (runner.proc) {
          logApp('info', `Agent runner [${agentId}]: previous run still active — skipping`);
          return;
        }

        const prompt = agentCfg.prompt || [
          `You are ${agentEntry?.name || agentId}. Run your scheduled task.`,
          'Read CLAUDE.md for full instructions.',
          '1. Check your inbox at ~/.openclaw/mailbox/' + agentId + '/inbox/',
          '2. Process any messages, then do your primary work.',
          '3. Update HEARTBEAT.md when done.',
          'Be concise. Act, don\'t advise.',
        ].join('\n');

        logApp('info', `Agent runner [${agentId}]: starting (${runMode})`);

        if (claudeBin) {
          // Claude Code CLI — full power, free
          runner.proc = spawn(claudeBin, ['-p', '--dangerously-skip-permissions', prompt], {
            cwd: workspace,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env },
            windowsHide: true,
          });
        } else {
          // agent-runner.mjs — full power, any provider, works on servers
          runner.proc = spawn('node', [runnerScript, prompt], {
            cwd: workspace,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env as any, ...allKeys },
            windowsHide: true,
          });
        }

        let stdout = '';
        runner.proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
        runner.proc.stderr?.on('data', () => { /* suppress */ });

        runner.proc.on('close', (code) => {
          const lines = stdout.split('\n').filter(l => l.trim()).length;
          logApp('info', `Agent runner [${agentId}]: completed (exit: ${code}, ${lines} lines)`);
          runner.proc = null;
        });

        runner.proc.on('error', (err) => {
          logApp('warn', `Agent runner [${agentId}]: spawn failed: ${err.message}`);
          runner.proc = null;
        });

        // Safety timeout
        setTimeout(() => {
          if (runner.proc) {
            logApp('warn', `Agent runner [${agentId}]: timed out — killing`);
            runner.proc.kill();
            runner.proc = null;
          }
        }, BOSS_TIMEOUT_MS);
      };

      // First run after 60 seconds (stagger after Boss)
      setTimeout(runOnce, 60_000);
      runner.timer = setInterval(runOnce, intervalMs);
      this.agentRunners.set(agentId, runner);

      logApp('info', `Agent runner [${agentId}]: started — interval: ${agentCfg.intervalMinutes || 60}min`);
    }
  }

  private stopAgentRunners(): void {
    for (const [agentId, runner] of this.agentRunners) {
      if (runner.timer) clearInterval(runner.timer);
      if (runner.proc) runner.proc.kill();
      logApp('info', `Agent runner [${agentId}]: stopped`);
    }
    this.agentRunners.clear();
  }

  /**
   * Check if an OpenClaw gateway is already running via `openclaw gateway status --json`.
   * Returns {port, token} if a gateway is running, null otherwise.
   */
  private async detectExistingGateway(): Promise<{ port: number; token: string | null } | null> {
    const bin = findOpenClawBinary();
    if (!bin) return null;
    try {
      const { execSync } = require('child_process');
      const raw = execSync(`"${bin}" gateway status --json`, {
        encoding: 'utf-8',
        timeout: 8000,
        stdio: 'pipe',
      });
      const status = JSON.parse(raw);
      // Check for a running gateway — different CLI versions may use different field names
      const running = status.running === true || status.state === 'running' || status.status === 'running';
      if (running && status.port) {
        // Verify the port is actually responding
        const portUp = await checkPortReady(status.port);
        if (portUp) {
          return { port: status.port, token: status.token || null };
        }
      }
    } catch {
      // gateway status command failed — no existing gateway
    }
    return null;
  }

  private spawnProcess(bin: string): void {
    this.setState('starting');
    this.stderrBuffer = '';

    // Restore port from config if cleared (e.g. after stop() during auto-restart)
    if (this.port == null) {
      try {
        const cfgPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
        const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
        this.port = cfg.gateway?.port || OPENCLAW_PORT;
      } catch {
        this.port = OPENCLAW_PORT;
      }
    }

    // Start Claude Code proxy if available
    this.startClaudeProxy();

    logApp('info', `Starting OpenClaw: ${bin} gateway --port ${this.port}`);

    const args = ['gateway', '--port', String(this.port), '--bind', 'loopback', '--allow-unconfigured', 'run'];

    // Inject API keys as env vars so the gateway uses in-memory keys
    const envWithKeys = { ...process.env };
    try {
      const authPath = path.join(os.homedir(), '.openclaw', 'agents', 'main', 'agent', 'auth-profiles.json');
      const authData = JSON.parse(fs.readFileSync(authPath, 'utf-8'));
      const envMap: Record<string, string> = {
        openai: 'OPENAI_API_KEY',
        anthropic: 'ANTHROPIC_API_KEY',
        google: 'GOOGLE_API_KEY',
        xai: 'XAI_API_KEY',
        mistral: 'MISTRAL_API_KEY',
        groq: 'GROQ_API_KEY',
      };
      for (const [, profile] of Object.entries(authData.profiles || {})) {
        const p = profile as any;
        if (p.type === 'api_key' && p.key && envMap[p.provider]) {
          envWithKeys[envMap[p.provider]] = p.key;
        }
      }
      const injected = Object.keys(envMap).filter(k => envWithKeys[envMap[k]]);
      if (injected.length) logApp('info', `Injected API keys as env vars: ${injected.join(', ')}`);
    } catch { /* auth profiles may not exist yet */ }

    this.proc = spawn(bin, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: envWithKeys,
      shell: IS_WIN,
      windowsHide: true,
    });

    this.proc.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      logOpenclaw(text);
      if (this.state === 'starting' && (text.includes('listening') || text.includes('ready') || text.includes('[gateway]'))) {
        this.onGatewayReady();
      }
    });

    this.proc.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      this.stderrBuffer += text;
      logOpenclaw(text);
    });

    // Fallback: poll HTTP port in case stdout readiness message is missed
    this.readinessPoll = setInterval(async () => {
      if (this.state !== 'starting' || !this.port) return;
      if (await checkPortReady(this.port)) {
        this.clearReadinessPoll();
        this.onGatewayReady();
      }
    }, 500);

    this.proc.on('close', (code, signal) => {
      this.clearStartupTimer();
      this.clearReadinessPoll();
      stopHealthPolling();

      if (this.state === 'stopping') {
        logApp('info', 'OpenClaw stopped gracefully');
        this.setState('stopped');
        return;
      }

      const err = classifyProcessError(code, signal, this.stderrBuffer);
      logApp('error', err.userMessage, err.details);
      this.lastError = err.userMessage;
      this.lastErrorDetails = err.details;

      if (this.restartCount < MAX_RESTART_ATTEMPTS && err.recoverable) {
        const delay = RESTART_BACKOFF_MS[this.restartCount] || 10000;
        this.restartCount++;
        logApp('warn', `Auto-restart attempt ${this.restartCount}/${MAX_RESTART_ATTEMPTS} in ${delay}ms`);
        this.setState('starting');
        setTimeout(async () => {
          // If port is already responding (e.g. gateway from prior run), reuse it instead of spawning
          if (this.port && (await checkPortReady(this.port))) {
            logApp('info', `Reusing existing gateway on port ${this.port}`);
            this.reused = true;
            this.restartCount = 0;
            this.onGatewayReady();
            return;
          }
          const b = findOpenClawBinary();
          if (b) this.spawnProcess(b);
          else this.setState('crashed');
        }, delay);
      } else {
        this.setState('crashed');
      }
    });

    this.proc.on('error', (err) => {
      logApp('error', 'Failed to spawn OpenClaw process', err.message);
      this.lastError = 'Failed to start OpenClaw process.';
      this.lastErrorDetails = err.message;
      this.setState('crashed');
    });

    this.startupTimer = setTimeout(() => {
      if (this.state === 'starting') {
        logApp('warn', 'Startup timeout — OpenClaw did not become ready in time');
        this.lastError = 'OpenClaw took too long to start. Check the logs.';
        this.stop();
        this.setState('crashed');
      }
    }, STARTUP_TIMEOUT_MS);
  }

  /**
   * NemoClaw runs OpenClaw inside a Docker sandbox managed by OpenShell.
   * The OpenClaw gateway runs on port 18789 inside the sandbox, forwarded
   * to localhost via `openshell forward`.
   */
  private async connectToNemoClawSandbox(): Promise<void> {
    this.clearStartupTimer();
    this.clearReadinessPoll();
    this.setState('starting');
    clearSandboxNameCache();
    clearSandboxTokenCache();

    const { execSync } = require('child_process');

    // Stop any local OpenClaw gateway so it doesn't occupy port 18789.
    // Also unload the launchctl service (macOS) so it doesn't auto-restart.
    const ocBin = findOpenClawBinary();
    if (ocBin) {
      try {
        execSync(`${ocBin} gateway stop`, { timeout: 8000, stdio: 'pipe' });
        logApp('info', 'Stopped local OpenClaw gateway service');
      } catch { /* no service running — fine */ }
    }
    if (process.platform === 'darwin') {
      const plistPath = require('path').join(require('os').homedir(), 'Library', 'LaunchAgents', 'ai.openclaw.gateway.plist');
      try {
        require('fs').accessSync(plistPath);
        execSync(`launchctl unload "${plistPath}" 2>/dev/null`, { timeout: 5000, stdio: 'pipe' });
        logApp('info', 'Unloaded OpenClaw gateway launchctl service');
      } catch { /* plist doesn't exist or already unloaded */ }
    }

    logApp('info', 'Connecting to NemoClaw sandbox...');

    const GATEWAY_CONTAINER = 'openshell-cluster-nemoclaw';

    try {
      // 1. Ensure the gateway cluster container is running
      const dk = dockerBin();
      try {
        const state = execSync(
          `${dk} inspect ${GATEWAY_CONTAINER} --format "{{.State.Status}}"`,
          { encoding: 'utf-8', timeout: 8000, stdio: 'pipe' }
        ).trim();
        if (state !== 'running') {
          execSync(`${dk} start ${GATEWAY_CONTAINER}`, { timeout: 20000, stdio: 'pipe' });
          logApp('info', 'Started gateway container');
        }
      } catch {
        this.lastError = 'NemoClaw gateway container not found. Run setup again.';
        this.setState('crashed');
        return;
      }

      // 1b. On Intel Mac, ensure the openshell-cli sidecar is ready.
      //     A runtime switch may have left it stopped/removed/disconnected.
      if (isIntelMac()) {
        if (!isSidecarReady()) {
          logApp('info', 'Sidecar not ready — rebuilding before sandbox check');
          try {
            await setupOpenShellSidecar((msg) => logApp('info', `[sidecar-reconnect] ${msg}`));
          } catch (e: any) {
            logApp('warn', `Sidecar rebuild failed: ${e.message}`);
          }
        }
        try { ensureSidecarNetworking(); } catch { /* ok */ }
        ensureSidecarBinaryHealthy();
      }

      // 2. Wait for a Ready sandbox (setup may complete from sandboxes.json first)
      if (!isSandboxReady()) {
        logApp('info', 'Waiting for NemoClaw sandbox to become Ready (up to ~3 min)...');
        this.emitStatus();
      }
      const sandboxUp = isSandboxReady() || (await waitForSandboxReady(180_000, 2000));
      if (!sandboxUp) {
        this.lastError =
          'NemoClaw sandbox did not become ready in time. The cluster may still be starting — try Start again in a minute. ' +
          'If it keeps failing: Docker → confirm openshell-cluster-nemoclaw is running, then run `nemoclaw status` in Terminal, or run setup again.';
        this.setState('crashed');
        return;
      }

      // 3. Ensure the OpenClaw gateway is running inside the sandbox.
      //    After an interrupted onboard the sandbox may be Ready but the
      //    gateway process was never started. Detect and start it.
      try {
        ensureSandboxGatewayRunning();
      } catch (e: any) {
        logApp('warn', `ensureSandboxGatewayRunning: ${e?.message || e}`);
      }

      // 4. Free the gateway port if something stale is on it, then ensure port forward.
      //    On Intel Mac the sidecar owns the port via Docker port mapping —
      //    stopping it would destroy the forwarding mechanism we need.
      if (!(isIntelMac() && isSidecarReady())) {
        freePort(getActiveGatewayPort());
      }
      try {
        ensurePortForward();
      } catch (e: any) {
        logApp('warn', `ensurePortForward: ${e?.message || e}`);
      }

      // 5. Poll for the OpenClaw gateway on the active port
      this.port = getActiveGatewayPort();
      logApp('info', `Waiting for OpenClaw gateway on port ${this.port}...`);

      /** Sandbox / Docker can exceed 60s after sleep or heavy load */
      const SANDBOX_CONNECT_TIMEOUT = 120000;
      let pollAttempts = 0;

      const pollOnce = async () => {
        if (this.state !== 'starting' || !this.port) return;
        pollAttempts++;
        if (pollAttempts % 5 === 0) {
          try {
            ensurePortForward();
          } catch (e: any) {
            logApp('warn', `ensurePortForward (poll): ${e?.message || e}`);
          }
        }
        if (await checkPortReady(this.port)) {
          this.clearReadinessPoll();
          this.onGatewayReady();
        }
      };

      void pollOnce();
      this.readinessPoll = setInterval(() => {
        void pollOnce();
      }, 1500);

      this.startupTimer = setTimeout(() => {
        if (this.state === 'starting') {
          this.clearReadinessPoll();
          try {
            ensurePortForward();
          } catch (e: any) {
            logApp('warn', `ensurePortForward (timeout): ${e?.message || e}`);
          }
          logApp('warn', `OpenClaw gateway not responding on port ${this.port} after ${SANDBOX_CONNECT_TIMEOUT}ms`);
          this.lastError = 'OpenClaw gateway inside sandbox is not responding. The sandbox may still be starting up — try again in a moment.';
          this.setState('crashed');
        }
      }, SANDBOX_CONNECT_TIMEOUT);

      /** Failsafe: never stay "starting" forever if timers were lost */
      setTimeout(() => {
        if (this.state === 'starting') {
          logApp('error', 'NemoClaw startup watchdog — forcing crashed state');
          this.clearReadinessPoll();
          this.clearStartupTimer();
          this.lastError =
            'Still waiting for the gateway — Docker or the sandbox may be stuck. Try: restart Docker, then Stop/Start in Valnaa. Check logs in the Logs tab.';
          this.setState('crashed');
        }
      }, SANDBOX_CONNECT_TIMEOUT + 15000);
    } catch (err: any) {
      logApp('error', `connectToNemoClawSandbox: ${err?.message || err}`);
      this.lastError = err?.message || 'Failed to connect to NemoClaw sandbox.';
      this.clearReadinessPoll();
      this.clearStartupTimer();
      this.setState('crashed');
    }
  }

  private upgradeDeviceScopes(): void {
    // Ensure all paired devices have full admin scopes so CLI commands work
    const pairedPath = path.join(os.homedir(), '.openclaw', 'devices', 'paired.json');
    try {
      const devices = JSON.parse(fs.readFileSync(pairedPath, 'utf-8'));
      const fullScopes = ['operator.admin', 'operator.approvals', 'operator.pairing', 'operator.read', 'operator.write'];
      let updated = false;
      for (const [, dev] of Object.entries(devices) as any) {
        if (!dev.scopes || !fullScopes.every((s: string) => dev.scopes.includes(s))) {
          dev.scopes = fullScopes;
          dev.approvedScopes = fullScopes;
          updated = true;
        }
      }
      if (updated) {
        fs.writeFileSync(pairedPath, JSON.stringify(devices, null, 2));
        logApp('info', 'Upgraded device scopes to full admin');
      }
    } catch { /* no paired devices yet */ }
  }

  private startPairingPoller(): void {
    this.stopPairingPoller();
    // Check for pending pairing requests every 10 seconds
    this.pairingPoll = setInterval(() => this.autoApprovePairings(), 10_000);
    // Also run once immediately after gateway is ready (with short delay)
    setTimeout(() => this.autoApprovePairings(), 3_000);
  }

  private stopPairingPoller(): void {
    if (this.pairingPoll) { clearInterval(this.pairingPoll); this.pairingPoll = null; }
  }

  private async autoApprovePairings(): Promise<void> {
    const bin = findOpenClawBinary();
    if (!bin) return;

    // Read configured channels from openclaw.json
    const cfgPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
    let channels: string[] = [];
    try {
      const config = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
      channels = Object.keys(config.channels || {});
    } catch { return; }

    for (const channel of channels) {
      try {
        const json = await new Promise<string>((resolve, reject) => {
          execFile(bin, ['pairing', 'list', channel, '--json'], { timeout: 10_000 }, (err, stdout) => {
            if (err) return reject(err);
            resolve(stdout);
          });
        });
        const data = JSON.parse(json);
        const requests = data.requests || [];
        for (const req of requests) {
          if (!req.code) continue;
          const name = [req.meta?.firstName, req.meta?.lastName].filter(Boolean).join(' ') || req.id;
          logApp('info', `Auto-approving ${channel} pairing: ${name} (${req.code})`);
          await new Promise<void>((resolve) => {
            execFile(bin, ['pairing', 'approve', channel, req.code, '--notify'], { timeout: 10_000 }, (err) => {
              if (err) logApp('warn', `Pairing approve failed: ${err.message}`);
              else logApp('info', `Approved ${channel} pairing for ${name}`);
              resolve();
            });
          });
        }
      } catch { /* channel might not support pairing */ }
    }
  }

  private onGatewayReady(): void {
    this.clearStartupTimer();
    this.clearReadinessPoll();
    this.restartCount = 0;
    this.setState('running');
    this.startHealthCheck();
    this.startPairingPoller();
    // Only modify device scopes for gateways we manage
    if (!this.externalGateway) this.upgradeDeviceScopes();

    // Start browser relay so the Chrome extension can connect
    const relayPort = (this.port || OPENCLAW_PORT) + 3;
    startRelay(relayPort);

    // Start Boss agent (Claude Code manager instance)
    this.startBossAgent();

    // Start Claude Code runners for configured agents
    this.startAgentRunners();

    logApp('info', `OpenClaw gateway ready on port ${this.port}`);
  }

  private startHealthCheck(): void {
    startHealthPolling(
      this.port!,
      (status) => {
        this.health = status;
        this.emitStatus();
      },
      () => {
        logApp('warn', 'OpenClaw unhealthy for too long — restarting');
        this.stop();
        this.start();
      },
    );
  }

  async stop(): Promise<void> {
    this.clearStartupTimer();
    this.clearReadinessPoll();
    stopHealthPolling();
    stopRelay();
    this.stopPairingPoller();
    this.stopClaudeProxy();
    this.stopBossAgent();
    this.stopAgentRunners();

    // Don't kill an external gateway — we didn't start it
    if (this.externalGateway) {
      logApp('info', 'External gateway — disconnecting without stopping');
      this.setState('stopped');
      this.port = null;
      this.externalGateway = false;
      this.emitStatus();
      return;
    }

    const wasNemoClaw = this.activeRuntime === 'nemoclaw';
    const newPref = loadRuntime();
    this.switchingRuntime = (newPref?.runtime || 'openclaw') !== this.activeRuntime;

    if (this.proc && !this.proc.killed) {
      this.setState('stopping');
      logApp('info', `Stopping OpenClaw (PID ${this.proc.pid})`);

      this.proc.kill('SIGTERM');

      await new Promise<void>((resolve) => {
        const forceKill = setTimeout(() => {
          if (this.proc && !this.proc.killed) {
            logApp('warn', 'Force-killing OpenClaw (SIGKILL)');
            this.proc.kill('SIGKILL');
          }
          resolve();
        }, 5000);

        this.proc!.once('close', () => {
          clearTimeout(forceKill);
          resolve();
        });
      });

      this.proc = null;
    }

    if (wasNemoClaw) {
      logApp('info', 'Tearing down NemoClaw port forwards');
      try { stopPortForward(); } catch { /* ok */ }
    }

    // When switching runtimes, free the gateway port so the new runtime
    // doesn't accidentally reuse the old runtime's gateway process.
    if (this.switchingRuntime) {
      const portToFree = this.port || OPENCLAW_PORT;
      logApp('info', `Runtime switch — freeing port ${portToFree}`);
      try { freePort(portToFree); } catch { /* ok */ }
      clearSandboxTokenCache();
      clearSandboxNameCache();
    }

    this.port = null;
    this.setState('stopped');
  }

  async restart(): Promise<void> {
    await this.stop();
    this.restartCount = 0;
    await this.start();
  }

  /** Called after installer finishes — start the process with the new binary. */
  async onInstallComplete(binPath: string): Promise<void> {
    this.port = this.port || 18789;
    this.restartCount = 0;
    this.spawnProcess(binPath);
  }

  private setState(s: AgentState): void {
    this.state = s;
    this.emitStatus();
  }

  private emitStatus(): void {
    this.emit('status', this.getStatus());
  }

  private clearStartupTimer(): void {
    if (this.startupTimer) {
      clearTimeout(this.startupTimer);
      this.startupTimer = null;
    }
  }

  private clearReadinessPoll(): void {
    if (this.readinessPoll) {
      clearInterval(this.readinessPoll);
      this.readinessPoll = null;
    }
  }
}

export const manager = new OpenClawManager();
