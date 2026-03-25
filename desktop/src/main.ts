import { app, BrowserWindow, ipcMain, Tray, Menu, shell, nativeImage, dialog, safeStorage, clipboard } from 'electron';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { spawn } from 'child_process';
import * as pty from 'node-pty';
import { autoUpdater } from 'electron-updater';
import { manager, AgentStatus } from './openclaw/manager';
import { installOpenClaw, findOpenClawBinary, isNodeInstalled, getInstallScriptCommand, findNemoClawBinary, getNemoClawInstallScriptCommand, getNemoClawSetupScriptCommand } from './openclaw/installer';
import { readRecentLogs, getLogFilePath, getAppLogPath, logApp, closeStreams } from './openclaw/logger';
import { loadSession, saveSession, clearSession, checkSubscription, fetchDesktopGatewayToken, startDesktopTrial, getStripePortalUrl, getDesktopCheckoutUrl, parseDeepLinkToken, parseDeepLinkEmail, isOfflineGraceValid, markLocalTrialClaimed, isLocalTrialClaimed } from './lib/session';
import { loadRuntime, saveRuntime, clearRuntime, isNemoClawSupported, isDockerInstalled, isDockerRunning, canInstallDocker, getDockerInstallCommand, launchDockerDesktop, RuntimeType, isIntelMac, isOpenShellInstalled, isSidecarReady, setupOpenShellSidecar, ensureSidecarNetworking, isOnboardComplete, isGatewayDeployed, getNemoClawOnboardCommand, ensurePortForward, OPENCLAW_PORT, EXTENSION_RELAY_PORT, readSandboxGatewayToken, readSandboxGatewayTokenFresh, getCachedSandboxToken, readHostOpenclawGatewayToken, writeHostOpenclawGatewayToken, clearHostOpenclawGatewayToken, writeSandboxGatewayToken, clearSandboxGatewayToken, getSandboxShellCommand, isSandboxReady, applySandboxSettings, findNemoClawPackageRoot, getDockerInfoError, ensureWslReady, isWslHealthy, hasUsableWslDistro, isDockerWslMountHealthy, repairDockerWslMount, getNemoClawSandboxName, getOpenShellTermCommand, clearSandboxNameCache } from './lib/runtime';
import { getAppDataDir, getOpenClawDir, getLogsDir } from './lib/platform';
import {
  getChromeExtensionDir,
  ensureChromeExtensionFiles,
  chromeExtensionIsReady,
  openChromeExtensionsPage,
  BROWSER_DOCS_URL,
  zipChromeExtensionDirectory,
  copyChromeExtensionTree,
  CHROME_EXTENSION_USER_FOLDER_NAME,
  CHROME_EXTENSION_ZIP_NAME,
} from './lib/browserSetup';

const PROTOCOL = 'valnaa';

// Electron launched from Finder inherits a minimal PATH that may not include
// Docker, Homebrew, or user-installed binaries. Patch once at startup so every
// child_process.execSync call finds them without per-call PATH hacks.
(function patchProcessPath() {
  const sep = process.platform === 'win32' ? ';' : ':';
  const extra: string[] = [];
  const dirs = [
    path.join(os.homedir(), '.local', 'bin'),
    '/usr/local/bin',
    '/opt/homebrew/bin',
    '/Applications/Docker.app/Contents/Resources/bin',
  ];
  const current = process.env.PATH || '';
  for (const d of dirs) {
    if (!current.includes(d)) extra.push(d);
  }
  if (extra.length) {
    process.env.PATH = extra.join(sep) + sep + current;
  }
})();

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
}

/** In dev, Electron’s default bundle name is “Electron”; align menu bar / About with shipped app. */
if (!app.isPackaged) {
  app.setName('Valnaa');
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

function redactPtyLog(s: string): string {
  return s
    .replace(/--token\s+[^\s']+/g, '--token <redacted>')
    .replace(/--token\s+'[^']*'/g, "--token '<redacted>'");
}
let pendingDeepLink: string | null = null;
let setupRunning = false;
let currentGatewayToken: string | null = null;

// ════════════════════════════════════
//  Setup Step Types
// ════════════════════════════════════
interface SetupStep {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'error';
  detail?: string;
}

function buildSetupSteps(runtime: RuntimeType): SetupStep[] {
  if (runtime === 'nemoclaw') {
    const isWin = process.platform === 'win32';
    const steps: SetupStep[] = [];
    if (isWin) {
      const wslOk = isWslHealthy() && hasUsableWslDistro();
      steps.push({ id: 'wsl-setup', label: 'Set up WSL', status: wslOk ? 'done' : 'pending' });
    }
    steps.push(
      { id: 'docker-install', label: 'Install Docker Desktop', status: isDockerInstalled() ? 'done' : 'pending' },
      { id: 'docker-start', label: 'Start Docker', status: isDockerRunning() ? 'done' : 'pending' },
    );
    if (isIntelMac()) {
      steps.push({ id: 'openshell-sidecar', label: 'Install OpenShell (Intel Mac)', status: isSidecarReady() ? 'done' : 'pending' });
    }
    const onboardDone = isOnboardComplete();
    const hasApiKey = !!loadPersistedApiKey();
    steps.push(
      { id: 'collect-api-key', label: 'Add NVIDIA API key', status: (hasApiKey || onboardDone) ? 'done' : 'pending' },
      { id: 'nemoclaw-install', label: 'Install NemoClaw', status: findNemoClawBinary() ? 'done' : 'pending' },
      { id: 'nemoclaw-onboard', label: 'Set up NemoClaw', status: onboardDone ? 'done' : 'pending' },
      { id: 'start', label: 'Start agent', status: 'pending' },
    );
    return steps;
  } else {
    return [
      { id: 'openclaw-install', label: 'Install OpenClaw', status: findOpenClawBinary() ? 'done' : 'pending' },
      { id: 'openclaw-setup', label: 'Configure agent', status: !needsSetup() ? 'done' : 'pending' },
      { id: 'start', label: 'Start agent', status: 'pending' },
    ];
  }
}

function sendSteps(steps: SetupStep[]): void {
  mainWindow?.webContents.send('app:setup-steps', JSON.parse(JSON.stringify(steps)));
}

type SetupShellTask = 'install' | 'onboard' | 'install-nemoclaw' | 'setup-nemoclaw' | 'install-docker';

function getTaskCommand(task: SetupShellTask): string | null {
  if (task === 'install') {
    const hasNode = isNodeInstalled();
    if (!hasNode) {
      return getInstallScriptCommand();
    } else {
      const prefix = path.join(os.homedir(), '.local');
      return `npm install -g openclaw@latest --prefix ${prefix}`;
    }
  } else if (task === 'install-nemoclaw') {
    return getNemoClawInstallScriptCommand();
  } else if (task === 'setup-nemoclaw') {
    return getNemoClawSetupScriptCommand();
  } else if (task === 'install-docker') {
    return getDockerInstallCommand();
  } else {
    const bin = findOpenClawBinary();
    return bin ? `${bin} onboard` : null;
  }
}

/** Single-quote escaping for POSIX shell strings inside '...'. */
function shEscapeSq(s: string): string {
  return s.replace(/'/g, `'\\''`);
}

function taskRunsInExternalTerminal(_task: SetupShellTask): boolean {
  return false;
}

// ════════════════════════════════════
//  In-App Setup PTY (runs install/setup commands inside the app)
// ════════════════════════════════════
let setupPtyProc: pty.IPty | null = null;

function killSetupPty(): void {
  if (setupPtyProc) {
    try { setupPtyProc.kill(); } catch { /* ok */ }
    setupPtyProc = null;
  }
}

/** Cached terminal dimensions from the last setup fit. */
let setupTermSize = { cols: 80, rows: 24 };

function runCommandInSetupPty(command: string, extraEnv?: Record<string, string>): Promise<number> {
  return new Promise((resolve) => {
    killSetupPty();

    const isWin = process.platform === 'win32';
    const sep = isWin ? ';' : ':';
    const localBin = path.join(os.homedir(), '.local', 'bin');
    const envPath = process.env.PATH || '';
    let fullPath = envPath.includes(localBin) ? envPath : `${localBin}${sep}${envPath}`;
    if (!isWin) {
      const brewBin = process.arch === 'arm64' ? '/opt/homebrew/bin' : '/usr/local/bin';
      if (!fullPath.includes(brewBin)) fullPath = `${brewBin}:${fullPath}`;
    }

    let shellName: string;
    let shellArgs: string[];
    const wslBashMatch = isWin ? command.match(/^wsl\s+bash\s+-c\s+"(.+)"$/) : null;
    if (wslBashMatch) {
      let inner = wslBashMatch[1];
      if (extraEnv && Object.keys(extraEnv).length > 0) {
        const exports = Object.entries(extraEnv)
          .map(([k, v]) => `export ${k}='${v.replace(/'/g, "'\\''")}'`)
          .join(' && ');
        inner = `${exports} && ${inner}`;
      }
      shellName = 'wsl.exe';
      shellArgs = ['bash', '-c', inner];
    } else if (isWin && command.startsWith('wsl ')) {
      shellName = 'wsl.exe';
      shellArgs = command.slice(4).trim().split(/\s+/);
    } else if (isWin) {
      shellName = 'cmd.exe';
      shellArgs = ['/c', command];
    } else {
      shellName = process.env.SHELL || '/bin/zsh';
      shellArgs = ['-c', command];
    }

    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      PATH: fullPath,
      TERM: 'xterm-256color',
      FORCE_COLOR: '1',
      ...(extraEnv || {}),
    };

    // Tell the renderer to prepare the terminal FIRST, so fit()
    // can report real dimensions before the PTY spawns.
    mainWindow?.webContents.send('setup:terminal-start');

    // Small delay to let the renderer fit the terminal and send back real dims.
    setTimeout(() => {
      const { cols, rows } = setupTermSize;

      setupPtyProc = pty.spawn(shellName, shellArgs, {
        name: 'xterm-256color',
        cols,
        rows,
        cwd: os.homedir(),
        env,
      });

      setupPtyProc.onData((data: string) => {
        mainWindow?.webContents.send('setup:terminal-data', data);
      });

      setupPtyProc.onExit(({ exitCode }) => {
        mainWindow?.webContents.send('setup:terminal-exit', exitCode ?? 1);
        setupPtyProc = null;
        resolve(exitCode ?? 1);
      });

      logApp('info', `Setup PTY spawned for command (shell=${shellName}, ${cols}x${rows})`);
    }, 150);
  });
}

// ════════════════════════════════════
//  In-App PTY Terminal (multi-session)
// ════════════════════════════════════
const ptyMap = new Map<string, pty.IPty>();
let nextSessionId = 1;
let subscriptionCheckTimer: ReturnType<typeof setInterval> | null = null;
const RECHECK_INTERVAL_MS = 2 * 60 * 60 * 1000; // re-verify every 2 hours

function spawnPty(sessionId: string, mode: 'local' | 'sandbox' | 'wsl' = 'local'): pty.IPty {
  const isWin = process.platform === 'win32';
  const sep = isWin ? ';' : ':';
  const localBin = path.join(os.homedir(), '.local', 'bin');
  const envPath = process.env.PATH || '';
  const patchedPath = envPath.includes(localBin) ? envPath : `${localBin}${sep}${envPath}`;
  const env = { ...process.env, PATH: patchedPath, TERM: 'xterm-256color' } as Record<string, string>;

  let shellName: string;
  let shellArgs: string[];

  if (mode === 'sandbox') {
    const cmd = getSandboxShellCommand();
    if (cmd) {
      shellName = cmd.shell;
      shellArgs = cmd.args;
      logApp('info', `Spawning sandbox PTY [${sessionId}]: ${shellName} ${shellArgs.join(' ')}`);
    } else {
      logApp('warn', `Sandbox shell not available for [${sessionId}], falling back to local`);
      shellName = isWin ? 'powershell.exe' : (process.env.SHELL || '/bin/zsh');
      shellArgs = isWin ? [] : ['-l'];
    }
  } else if (mode === 'wsl' && isWin) {
    shellName = 'wsl.exe';
    shellArgs = ['bash', '-l'];
  } else {
    shellName = isWin ? 'powershell.exe' : (process.env.SHELL || '/bin/zsh');
    shellArgs = isWin ? [] : ['-l'];
  }

  logApp('info', `Spawning PTY [${sessionId}]: ${shellName} ${shellArgs.join(' ')}`);

  let ptyProc: pty.IPty;
  try {
    ptyProc = pty.spawn(shellName, shellArgs, {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: os.homedir(),
      env,
    });
  } catch (err: any) {
    logApp('error', `Failed to spawn PTY [${sessionId}]: ${err?.message || err}`);
    throw err;
  }

  ptyProc.onData((data: string) => {
    mainWindow?.webContents.send('terminal:data', sessionId, data);
  });

  ptyProc.onExit(({ exitCode, signal }) => {
    logApp('info', `PTY [${sessionId}] exited (code=${exitCode}, signal=${signal})`);
    mainWindow?.webContents.send('terminal:exit', sessionId, exitCode);
    ptyMap.delete(sessionId);
  });

  ptyMap.set(sessionId, ptyProc);
  return ptyProc;
}

function killAllPtys(): void {
  for (const [id, p] of ptyMap) {
    try { p.kill(); } catch { /* ok */ }
  }
  ptyMap.clear();
}

function openUserTerminalWithCommand(shellCommand: string, fileLabel: string): void {
  const localBin = path.join(os.homedir(), '.local', 'bin');
  const pathExport = `export PATH='${shEscapeSq(localBin)}':$PATH`;

  if (process.platform === 'darwin') {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'valnaa-setup-'));
    const scriptPath = path.join(dir, `${fileLabel.replace(/[^a-z0-9-]/gi, '-')}.command`);
    const body = `#!/bin/bash
set +e
${pathExport}
cd "$HOME" || exit 1
${shellCommand}
code=$?
echo ""
if [ $code -ne 0 ]; then echo "Exit code: $code"; fi
read -p "Press Enter to close…"
exit $code
`;
    fs.writeFileSync(scriptPath, body, 'utf8');
    fs.chmodSync(scriptPath, 0o755);
    spawn('open', [scriptPath], { detached: true, stdio: 'ignore' }).unref();
    logApp('info', `Opened Terminal for setup (${fileLabel})`);
  } else if (process.platform === 'win32') {
    const wrapped = `set "PATH=%USERPROFILE%\\.local\\bin;%PATH%" && ${shellCommand}`;
    spawn('cmd.exe', ['/c', 'start', 'cmd', '/k', wrapped], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    logApp('info', `Opened cmd for setup (${fileLabel})`);
  } else {
    const inner = `${pathExport}; cd $HOME || exit 1; ${shellCommand}; echo; read -p 'Press Enter to close…'`;
    spawn('x-terminal-emulator', ['-e', 'bash', '-lic', inner], { detached: true, stdio: 'ignore' }).unref();
    logApp('info', `Opened x-terminal-emulator for setup (${fileLabel})`);
  }
}

async function waitUntil(pred: () => boolean, timeoutMs: number, timeoutMsg: string): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (pred()) return;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(timeoutMsg);
}

async function waitForExternalTask(task: SetupShellTask): Promise<void> {
  const longWait = 1_800_000;
  if (task === 'install-docker') {
    await waitUntil(() => isDockerInstalled(), 600_000, 'Docker install timed out. Finish in Terminal, then tap Retry in Valnaa.');
    return;
  }
  if (task === 'install-nemoclaw') {
    await waitUntil(() => !!findNemoClawBinary(), longWait, 'NemoClaw install timed out. Finish in Terminal, then tap Retry in Valnaa.');
    return;
  }
  if (task === 'setup-nemoclaw') {
    await waitUntil(() => isOnboardComplete(), longWait, 'NemoClaw setup timed out. Finish onboarding in Terminal, then tap Retry in Valnaa.');
    return;
  }
  if (task === 'onboard') {
    await waitUntil(() => !needsSetup(), longWait, 'OpenClaw setup timed out. Finish onboarding in Terminal, then tap Retry in Valnaa.');
  }
}

function nemoclawOnboardShellBlock(): string {
  const saved = loadPersistedApiKey();
  const isWin = process.platform === 'win32';

  if (isWin) {
    const parts: string[] = [
      'source "$HOME/.nvm/nvm.sh" 2>/dev/null',
    ];
    if (saved?.key) parts.push(`export NVIDIA_API_KEY='${shEscapeSq(saved.key)}'`);
    parts.push('$HOME/.local/bin/nemoclaw onboard');
    return `wsl bash -c "${parts.join(' && ')}"`;
  }

  const keyLine = saved?.key ? `export NVIDIA_API_KEY='${shEscapeSq(saved.key)}'\n` : '';
  return `${keyLine}${getNemoClawOnboardCommand()}`;
}

/**
 * If the gateway is already deployed, skip the full `nemoclaw onboard` (which
 * destroys the gateway) and just create a sandbox directly. This avoids the
 * 30-minute image re-import on every retry (Intel Mac).
 * Returns true if the sandbox was created, false if we should fall back to
 * full onboard.
 */
async function tryDirectSandboxCreation(): Promise<boolean> {
  if (!isGatewayDeployed()) return false;
  if (isSandboxReady()) return true;

  const nemoRoot = findNemoClawPackageRoot();
  if (!nemoRoot) {
    logApp('warn', 'Cannot find NemoClaw package root — falling back to full onboard');
    return false;
  }

  let sourceDir = path.join(os.homedir(), '.nemoclaw', 'source');
  if (!fs.existsSync(path.join(sourceDir, 'Dockerfile'))) {
    sourceDir = nemoRoot;
  }
  if (!fs.existsSync(path.join(sourceDir, 'Dockerfile'))) {
    logApp('warn', 'NemoClaw source directory missing — falling back to full onboard');
    return false;
  }

  // Ensure socat forwarder for port 8080 (gateway API) inside sidecar.
  // Without it, openshell inside the sidecar can't reach the gateway at 127.0.0.1:8080.
  if (isIntelMac()) {
    try {
      const { execSync: exec } = require('child_process');
      ensureSidecarNetworking();
      const listening = exec('docker exec openshell-cli sh -c "ss -tln | grep :8080 || true"', { timeout: 5000, stdio: 'pipe' }).toString();
      if (!listening.includes(':8080')) {
        exec('docker exec -d openshell-cli socat TCP-LISTEN:8080,fork,reuseaddr TCP:host.docker.internal:8080', { timeout: 5000, stdio: 'pipe' });
      }
    } catch (e: any) { logApp('warn', `Socat 8080 setup failed: ${e.message}`); }
  }

  const saved = loadPersistedApiKey();
  const keyExport = saved?.key ? `export NVIDIA_API_KEY='${shEscapeSq(saved.key)}'` : '';
  const pathPrefix = isIntelMac() ? `export PATH="$HOME/.local/bin:$PATH"` : '';

  // Must use the real macOS temp dir ($TMPDIR = /var/folders/...) not /tmp,
  // because the sidecar mounts $TMPDIR but not /tmp.
  // Policy path must also be inside the build dir (not source dir) because
  // the sidecar can only see $TMPDIR, not ~/.nemoclaw/source/.
  const hostTmp = os.tmpdir().replace(/\/+$/, '');
  const script = [
    pathPrefix,
    keyExport,
    `cd "${sourceDir}"`,
    `BUILD_DIR=$(mktemp -d "${hostTmp}/nemoclaw-build-XXXXXX")`,
    `cp Dockerfile "$BUILD_DIR/"`,
    `cp -r nemoclaw "$BUILD_DIR/"`,
    `cp -r nemoclaw-blueprint "$BUILD_DIR/"`,
    `cp -r scripts "$BUILD_DIR/"`,
    `rm -rf "$BUILD_DIR/nemoclaw/node_modules"`,
    `SANDBOX_NAME=$(cat "$HOME/.nemoclaw/sandboxes.json" 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('defaultSandbox') or list(d.get('sandboxes',{}).keys())[0])" 2>/dev/null || echo "valnaa")`,
    `echo "Creating sandbox $SANDBOX_NAME (this may take several minutes)..."`,
    `openshell sandbox create --from "$BUILD_DIR/Dockerfile" --name "$SANDBOX_NAME" --policy "$BUILD_DIR/nemoclaw-blueprint/policies/openclaw-sandbox.yaml" -- env CHAT_UI_URL='http://127.0.0.1:18789' ${saved?.key ? `NVIDIA_API_KEY='${shEscapeSq(saved.key)}'` : ''} nemoclaw-start 2>&1`,
    `EXIT_CODE=$?`,
    `rm -rf "$BUILD_DIR"`,
    `exit $EXIT_CODE`,
  ].filter(Boolean).join('\n');

  logApp('info', 'Gateway already deployed — creating sandbox directly (skipping full onboard)');
  const exitCode = await runCommandInSetupPty(script);
  logApp('info', `Direct sandbox creation exited with code ${exitCode}`);

  if (isSandboxReady() || isOnboardComplete()) return true;

  if (exitCode === 0) {
    try {
      await waitUntil(() => isSandboxReady(), 60_000, '');
      return true;
    } catch { /* fall through */ }
  }

  logApp('warn', 'Direct sandbox creation did not produce a Ready sandbox');
  return false;
}

async function runNemoClawOnboardExternal(): Promise<void> {
  logApp('info', 'Running NemoClaw onboard in-app');
  const cmd = nemoclawOnboardShellBlock();
  const exitCode = await runCommandInSetupPty(cmd);
  logApp('info', `NemoClaw onboard PTY exited with code ${exitCode}`);

  // Onboard may have created a sandbox with a new name — drop the stale cache
  // so getSandboxName() re-reads sandboxes.json with whatever the user chose.
  clearSandboxNameCache();

  if (isOnboardComplete()) return;

  if (exitCode !== 0) {
    throw new Error(`NemoClaw onboard failed (exit code ${exitCode}). Check the output above, then tap Retry.`);
  }

  // Exit code 0 but not detected yet — poll briefly, then do a live sandbox
  // check. On Intel Mac, node-pty can mis-report exit codes after SIGKILL.
  try {
    await waitUntil(() => isOnboardComplete(), 15_000, '');
    return;
  } catch {
    // isOnboardComplete's fallback already checks openshell sandbox list.
    // If that also failed, the sandbox truly doesn't exist.
    if (isOnboardComplete()) return;
    throw new Error('NemoClaw onboard appeared to succeed but no sandbox was found. Tap Retry to try again.');
  }
}

async function runSetupShellTaskAsync(task: SetupShellTask, extraEnv?: Record<string, string>): Promise<void> {
  const command = getTaskCommand(task);
  if (!command) {
    throw new Error(`Cannot determine command for task "${task}"`);
  }

  const needsPty = task === 'install-docker' || task === 'install-nemoclaw' || task === 'setup-nemoclaw' || task === 'onboard';

  if (needsPty) {
    logApp('info', `In-app PTY setup "${task}": ${redactPtyLog(command)}`);
    const exitCode = await runCommandInSetupPty(command, extraEnv);
    logApp('info', `Setup PTY "${task}" exited with code ${exitCode}`);

    const checks: Record<string, { pred: () => boolean; label: string }> = {
      'install-docker': { pred: () => isDockerInstalled(), label: 'Docker install' },
      'install-nemoclaw': { pred: () => !!findNemoClawBinary(), label: 'NemoClaw install' },
      'setup-nemoclaw': { pred: () => isOnboardComplete(), label: 'NemoClaw setup' },
      'onboard': { pred: () => !needsSetup(), label: 'OpenClaw setup' },
    };
    const check = checks[task];
    if (check) {
      if (check.pred()) return;
      if (exitCode !== 0) {
        throw new Error(`${check.label} failed (exit code ${exitCode}). Check the output above, then tap Retry.`);
      }
      await waitUntil(check.pred, 30_000, `${check.label} finished but was not detected. Tap Retry.`);
    }
    return;
  }

  const isWin = process.platform === 'win32';
  const shellName = isWin ? 'cmd.exe' : '/bin/zsh';
  const sep = isWin ? ';' : ':';
  const localBin = path.join(os.homedir(), '.local', 'bin');
  const envPath = process.env.PATH || '';
  const patchedPath = envPath.includes(localBin) ? envPath : `${localBin}${sep}${envPath}`;
  logApp('info', `Headless setup "${task}" via ${shellName}`);

  await new Promise<void>((resolve, reject) => {
    const shellArgs = isWin ? ['/c', command] : ['-c', command];
    const child = spawn(shellName, shellArgs, {
      cwd: os.homedir(),
      env: { ...process.env, FORCE_COLOR: '1', PATH: patchedPath } as NodeJS.ProcessEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const onChunk = (d: Buffer, level: 'info' | 'warn') => {
      const t = d.toString().trimEnd();
      if (t) logApp(level, `[setup:${task}] ${redactPtyLog(t).slice(0, 2000)}`);
    };
    child.stdout?.on('data', (d) => onChunk(d, 'info'));
    child.stderr?.on('data', (d) => onChunk(d, 'warn'));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${task} failed (exit code ${code})`));
    });
  });
}

// ════════════════════════════════════
//  Docker Polling Helpers
// ════════════════════════════════════
function waitForDocker(timeoutMs = process.platform === 'win32' ? 300000 : 120000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (isDockerRunning()) { resolve(); return; }
    const start = Date.now();
    let fatalChecked = false;
    const poll = setInterval(() => {
      if (isDockerRunning()) {
        clearInterval(poll);
        resolve();
        return;
      }
      const elapsed = Date.now() - start;
      if (!fatalChecked && elapsed > 30000) {
        fatalChecked = true;
        const errMsg = getDockerInfoError();
        if (/unable to start/i.test(errMsg)) {
          clearInterval(poll);
          reject(new Error(
            `Docker Desktop is unable to start. ` +
            `If this persists: open Docker from the Start menu and wait until it says running; or uninstall Docker Desktop in Windows Settings \u2192 Apps, then use Install Docker in Valnaa (or winget install Docker.DockerDesktop) and try again.`
          ));
          return;
        }
      }
      if (elapsed > timeoutMs) {
        clearInterval(poll);
        const errMsg = getDockerInfoError();
        const detail = errMsg ? ` ${errMsg.replace(/^.*ERROR:\s*/i, '').slice(0, 300).trim()}` : '';
        const mins = Math.round(timeoutMs / 60000);
        reject(new Error(
          `Docker Desktop did not become ready in time.${detail} ` +
          `If this persists: open Docker from the Start menu and wait until it says running; or uninstall Docker Desktop in Windows Settings \u2192 Apps, then use Install Docker in Valnaa (or winget install Docker.DockerDesktop) and try again.`
        ));
      }
    }, 3000);
  });
}

function waitForDockerInstalled(timeoutMs = 300000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (isDockerInstalled()) { resolve(); return; }
    const start = Date.now();
    const poll = setInterval(() => {
      if (isDockerInstalled()) {
        clearInterval(poll);
        resolve();
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(poll);
        reject(new Error('Docker installation timed out'));
      }
    }, 5000);
  });
}

// ════════════════════════════════════
//  Inference API-Key Helpers
// ════════════════════════════════════
let apiKeyResolver: ((val: { provider: string; key: string }) => void) | null = null;

function waitForApiKeySubmission(timeoutMs = 600_000): Promise<{ provider: string; key: string }> {
  return new Promise((resolve, reject) => {
    apiKeyResolver = resolve;
    setTimeout(() => {
      if (apiKeyResolver === resolve) {
        apiKeyResolver = null;
        reject(new Error('API key entry timed out (10 min). Tap Retry to try again.'));
      }
    }, timeoutMs);
  });
}

const API_KEY_FILE = path.join(getAppDataDir(), 'inference-key.enc');

function persistApiKey(provider: string, apiKey: string): void {
  const fs = require('fs');
  const dir = path.dirname(API_KEY_FILE);
  fs.mkdirSync(dir, { recursive: true });
  const payload = JSON.stringify({ provider, key: apiKey });
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(payload);
    fs.writeFileSync(API_KEY_FILE, encrypted);
  } else {
    fs.writeFileSync(API_KEY_FILE, payload);
  }
}

function loadPersistedApiKey(): { provider: string; key: string } | null {
  const fs = require('fs');
  try {
    const buf = fs.readFileSync(API_KEY_FILE);
    let payload: string;
    if (safeStorage.isEncryptionAvailable()) {
      payload = safeStorage.decryptString(buf);
    } else {
      payload = buf.toString('utf-8');
    }
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

/**
 * Write the server-issued gateway token to the appropriate config file
 * before starting the agent. This ensures the gateway uses a token that
 * was gated by a valid subscription check.
 */
function applyGatewayToken(): void {
  if (!currentGatewayToken) {
    logApp('warn', 'No gateway token available — agent will use its own token');
    return;
  }
  const pref = loadRuntime();
  if (pref?.runtime === 'nemoclaw') {
    try {
      writeSandboxGatewayToken(currentGatewayToken);
    } catch (err: any) {
      logApp('warn', `Could not write sandbox gateway token: ${err.message}`);
    }
  } else {
    writeHostOpenclawGatewayToken(currentGatewayToken);
  }
}

/** Clear gateway token from config so the agent can't be accessed without the app. */
function clearGatewayToken(): void {
  const pref = loadRuntime();
  if (pref?.runtime === 'nemoclaw') {
    try { clearSandboxGatewayToken(); } catch { /* sandbox may not be running */ }
  } else {
    clearHostOpenclawGatewayToken();
  }
  currentGatewayToken = null;
}

// ════════════════════════════════════
//  Setup Flow Orchestrator
// ════════════════════════════════════
async function runSetupFlow(runtime: RuntimeType): Promise<void> {
  if (setupRunning) {
    logApp('info', 'Retry requested — killing active setup PTY');
    killSetupPty();
    apiKeyResolver = null;
    setupRunning = false;
  }
  setupRunning = true;

  try {
    const steps = buildSetupSteps(runtime);
    const pendingSteps = steps.filter(s => s.status !== 'done');
    if (pendingSteps.length === 1 && pendingSteps[0].id === 'start') {
      logApp('info', `All prerequisites met — starting ${runtime}`);
      steps[steps.length - 1].status = 'running';
      sendSteps(steps);
      applyGatewayToken();
      await manager.start();
      steps[steps.length - 1].status = 'done';
      sendSteps(steps);
      return;
    }

    mainWindow?.webContents.send('app:show-setup', steps);

    for (const step of steps) {
      if (step.status === 'done') continue;

      step.status = 'running';
      sendSteps(steps);

      try {
        switch (step.id) {
          case 'wsl-setup': {
            if (isWslHealthy() && hasUsableWslDistro()) break;
            const wslOk = await ensureWslReady((msg) => {
              step.detail = msg;
              sendSteps(steps);
            });
            if (!wslOk) {
              throw new Error(
                'WSL setup failed. Please run "wsl --update" in an elevated PowerShell, then tap Retry.',
              );
            }
            // After WSL fix, Docker Desktop may need a restart
            if (isDockerRunning()) {
              step.detail = 'Restarting Docker Desktop after WSL update...';
              sendSteps(steps);
              try {
                const { execSync: exec } = require('child_process');
                exec('powershell -Command "Get-Process -Name \'Docker Desktop\', \'com.docker.backend\', \'com.docker.proxy\' -ErrorAction SilentlyContinue | Stop-Process -Force"', { stdio: 'pipe', timeout: 15000, windowsHide: true });
                await new Promise(r => setTimeout(r, 5000));
                launchDockerDesktop();
              } catch { /* best effort */ }
            }
            break;
          }
          case 'docker-install': {
            if (isDockerInstalled()) break;
            if (canInstallDocker()) {
              await runSetupShellTaskAsync('install-docker');
            } else {
              shell.openExternal('https://www.docker.com/products/docker-desktop/');
              step.detail = 'Install Docker from the page that opened...';
              sendSteps(steps);
              await waitForDockerInstalled();
            }
            break;
          }
          case 'docker-start': {
            if (isDockerRunning()) {
              // Docker is running — but on Windows, check the WSL mount is healthy
              if (process.platform === 'win32' && !isDockerWslMountHealthy()) {
                logApp('info', 'Docker running but WSL mount is broken — repairing');
                step.detail = 'Repairing Docker WSL integration...';
                sendSteps(steps);
                const repaired = await repairDockerWslMount((msg) => {
                  step.detail = msg;
                  sendSteps(steps);
                });
                if (!repaired) throw new Error('Docker WSL mount repair failed. Try restarting your PC.');
                logApp('info', 'Docker WSL mount repaired');
              }
              break;
            }
            const launched = launchDockerDesktop();
            logApp('info', `Docker Desktop launch: ${launched ? 'ok' : 'not found'}`);
            step.detail = 'Waiting for Docker to be ready...';
            sendSteps(steps);
            try {
              await waitForDocker();
            } catch (dockerErr: any) {
              // On Windows, Docker often fails because WSL is broken/outdated.
              // Auto-fix WSL and retry once before giving up.
              if (process.platform === 'win32' && (!isWslHealthy() || !hasUsableWslDistro())) {
                logApp('info', 'Docker failed to start — attempting WSL auto-fix');
                step.detail = 'Docker failed — fixing WSL...';
                sendSteps(steps);
                const fixed = await ensureWslReady((msg) => {
                  step.detail = msg;
                  sendSteps(steps);
                });
                if (fixed) {
                  step.detail = 'Restarting Docker Desktop...';
                  sendSteps(steps);
                  try {
                    const { execSync: exec } = require('child_process');
                    exec('powershell -Command "Get-Process -Name \'Docker Desktop\', \'com.docker.backend\', \'com.docker.proxy\' -ErrorAction SilentlyContinue | Stop-Process -Force"', { stdio: 'pipe', timeout: 15000, windowsHide: true });
                  } catch { /* ok */ }
                  await new Promise(r => setTimeout(r, 5000));
                  launchDockerDesktop();
                  step.detail = 'Waiting for Docker to start after WSL fix...';
                  sendSteps(steps);
                  await waitForDocker();
                  break;
                }
              }
              throw dockerErr;
            }
            // After a fresh Docker start on Windows, verify the WSL mount
            if (process.platform === 'win32' && !isDockerWslMountHealthy()) {
              logApp('info', 'Docker started but WSL mount is broken — repairing');
              step.detail = 'Repairing Docker WSL integration...';
              sendSteps(steps);
              const repaired = await repairDockerWslMount((msg) => {
                step.detail = msg;
                sendSteps(steps);
              });
              if (!repaired) throw new Error('Docker WSL mount repair failed. Try restarting your PC.');
              logApp('info', 'Docker WSL mount repaired after fresh start');
            }
            break;
          }
          case 'openshell-sidecar': {
            if (isSidecarReady()) break;
            step.detail = 'Setting up OpenShell via Docker...';
            sendSteps(steps);
            await setupOpenShellSidecar((msg) => {
              step.detail = msg;
              sendSteps(steps);
            });
            break;
          }
          case 'collect-api-key': {
            if (isOnboardComplete()) break;
            if (loadPersistedApiKey()) {
              logApp('info', 'NVIDIA API key already saved — skipping prompt');
              break;
            }
            step.detail = 'Waiting for API key...';
            sendSteps(steps);
            await new Promise(r => setTimeout(r, 300));
            mainWindow?.webContents.send('app:show-api-key-form', {
              providers: [
                { id: 'nvidia', name: 'NVIDIA NIM', keyUrl: 'https://build.nvidia.com/' },
              ],
              sectionTitle: 'Add your NVIDIA API key',
              sectionSubtitle:
                'NemoClaw requires a valid NVIDIA key to create the secure sandbox and run inference. ' +
                'OpenAI and other providers are optional — add them later in the sandbox if you want them.',
            });
            const { provider, key } = await waitForApiKeySubmission();
            persistApiKey(provider, key);
            break;
          }
          case 'nemoclaw-install': {
            if (findNemoClawBinary()) break;
            if (isIntelMac()) {
              ensureSidecarNetworking();
            }
            // Pass the API key as an env var so the broken raw-mode secret
            // prompt is skipped, but keep everything else interactive so
            // the user can pick their provider and model in the terminal.
            const saved = loadPersistedApiKey();
            const installEnv: Record<string, string> = {};
            if (saved?.key) {
              installEnv.NVIDIA_API_KEY = saved.key;
            }
            await runSetupShellTaskAsync('install-nemoclaw', installEnv);
            break;
          }
          case 'nemoclaw-onboard': {
            if (isOnboardComplete()) break;

            step.detail = 'Running NemoClaw setup (this may take several minutes)...';
            sendSteps(steps);

            // Always run full nemoclaw onboard so the user gets to choose
            // their sandbox name, model, and provider interactively.

            // Full onboard path: recreate sidecar WITHOUT port mappings so
            // onboard can bind 18789 for its own gateway.
            if (isIntelMac()) {
              try {
                const { execSync: exec } = require('child_process');
                logApp('info', 'Recreating openshell-cli without port mappings for onboard');
                for (let attempt = 0; attempt < 3; attempt++) {
                  try { exec('docker rm -f openshell-cli 2>/dev/null', { stdio: 'pipe', timeout: 15000 }); break; } catch {
                    try { exec('docker stop openshell-cli 2>/dev/null && docker rm openshell-cli 2>/dev/null', { stdio: 'pipe', timeout: 15000 }); break; } catch { /* retry */ }
                  }
                }
                await new Promise(r => setTimeout(r, 1500));
                const configDir = path.join(os.homedir(), '.config', 'openshell');
                const openshellBin = path.join(os.homedir(), '.local', 'lib', 'openshell', 'openshell-linux');
                const tmpDir = os.tmpdir().replace(/\/+$/, '');
                const tmpMount = tmpDir ? `-v "${tmpDir}:${tmpDir}"` : '';
                const pkg = findNemoClawPackageRoot();
                const resolvedPkg = pkg ? fs.realpathSync(pkg) : null;
                const sourceMount = resolvedPkg ? `-v "${resolvedPkg}:${resolvedPkg}:ro"` : '';
                const symlinkMount = (pkg && resolvedPkg && resolvedPkg !== pkg)
                  ? `-v "${resolvedPkg}:${pkg}:ro"` : '';
                exec(
                  `docker create --name openshell-cli --init ` +
                  `-v /var/run/docker.sock:/var/run/docker.sock ` +
                  `-v "${configDir}:/root/.config/openshell" ` +
                  `-v "${openshellBin}:/usr/local/bin/openshell:ro" ` +
                  `${tmpMount} ${sourceMount} ${symlinkMount} ` +
                  `--add-host "host.docker.internal:host-gateway" ` +
                  `alpine:latest sleep infinity`,
                  { timeout: 15000, stdio: 'pipe' }
                );
                exec('docker start openshell-cli', { timeout: 10000, stdio: 'pipe' });
                exec('docker exec openshell-cli apk add --no-cache socat openssh-client 2>/dev/null', { timeout: 60000, stdio: 'pipe' });
                try {
                  exec('docker exec -d openshell-cli socat TCP-LISTEN:8080,fork,reuseaddr TCP:host.docker.internal:8080', { timeout: 5000, stdio: 'pipe' });
                } catch { /* ok if socat not needed yet */ }
                logApp('info', 'Sidecar recreated without port mappings (with source + pkg mounts)');
              } catch (e: any) { logApp('warn', `Sidecar rebuild (no-ports) failed: ${e.message}`); }
            }

            let onboardFailed = false;
            try {
              await runNemoClawOnboardExternal();
            } catch (e: any) {
              onboardFailed = true;
              logApp('warn', `Onboard threw: ${e.message}`);
            }
            // ALWAYS rebuild sidecar with full port mappings, even on failure.
            if (isIntelMac()) {
              try {
                logApp('info', 'Re-creating openshell-cli sidecar after onboard');
                await setupOpenShellSidecar((msg) => { logApp('info', `[sidecar-rebuild] ${msg}`); });
                ensureSidecarNetworking();
              } catch (e: any) { logApp('warn', `Sidecar rebuild failed: ${e.message}`); }
            }
            if (onboardFailed && !isOnboardComplete()) {
              throw new Error('NemoClaw onboard did not complete. Tap Retry to try again.');
            }
            break;
          }
          case 'openclaw-install': {
            if (findOpenClawBinary()) break;
            await runSetupShellTaskAsync('install');
            break;
          }
          case 'openclaw-setup': {
            if (!needsSetup()) break;
            await runSetupShellTaskAsync('onboard');
            break;
          }
          case 'start': {
            applyGatewayToken();
            await manager.start();
            break;
          }
        }

        step.status = 'done';
        sendSteps(steps);
      } catch (err: any) {
        logApp('error', `Setup step "${step.id}" failed:`, err.message);
        step.status = 'error';
        step.detail = err.message;
        sendSteps(steps);
        return;
      }
    }
  } finally {
    setupRunning = false;
  }
}

// ════════════════════════════════════
//  Helpers
// ════════════════════════════════════
function needsSetup(): boolean {
  const fs = require('fs');
  const authPath = path.join(os.homedir(), '.openclaw', 'agents', 'main', 'agent', 'auth-profiles.json');
  try {
    const raw = fs.readFileSync(authPath, 'utf-8');
    const auth = JSON.parse(raw);
    return !auth.profiles || Object.keys(auth.profiles).length === 0;
  } catch {
    return true;
  }
}

function handleDeepLink(url: string): void {
  logApp('info', `Deep link received: ${url.substring(0, 60)}...`);
  const token = parseDeepLinkToken(url);
  const email = parseDeepLinkEmail(url);

  if (!token) {
    logApp('warn', 'Deep link had no valid token');
    return;
  }

  saveSession(token, email || '');

  mainWindow?.show();
  mainWindow?.focus();
  mainWindow?.webContents.send('app:auth-result', { success: true, email: email || '' });

  autoStart();
}

/** Standard app menu for Windows when the menu bar is hidden (in-window menubar triggers these submenus). */
function getWindowsApplicationMenuTemplate(): Electron.MenuItemConstructorOptions[] {
  return [
    {
      label: 'File',
      submenu: [{ role: 'quit', label: 'Exit' }],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'delete' },
        { type: 'separator' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'close' }],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Learn more',
          click: () => { void shell.openExternal('https://valnaa.com'); },
        },
      ],
    },
  ];
}

function createWindow(): void {
  const windowIconPath = path.join(__dirname, '..', 'assets', 'icon.png');
  let windowIcon: Electron.NativeImage | undefined;
  try {
    const ni = nativeImage.createFromPath(windowIconPath);
    if (!ni.isEmpty()) windowIcon = ni;
  } catch { /* optional */ }

  const isWin32 = process.platform === 'win32';
  const isDarwin = process.platform === 'darwin';

  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 800,
    minHeight: 500,
    title: isWin32 ? '' : 'Valnaa',
    backgroundColor: '#000000',
    titleBarStyle: isDarwin ? 'hiddenInset' : isWin32 ? 'hidden' : 'hiddenInset',
    ...(isWin32
      ? {
          titleBarOverlay: {
            color: '#111111',
            symbolColor: 'rgba(255,255,255,0.88)',
            height: 32,
          },
        }
      : {}),
    ...(windowIcon ? { icon: windowIcon } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'), {
    query: { platform: process.platform },
  });

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  if (process.platform === 'darwin') {
    const broadcastMacFullscreen = () => {
      if (!mainWindow?.isDestroyed()) {
        mainWindow?.webContents.send('app:mac-fullscreen', mainWindow.isFullScreen());
      }
    };
    mainWindow.on('enter-full-screen', broadcastMacFullscreen);
    mainWindow.on('leave-full-screen', broadcastMacFullscreen);
  }

  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    logApp('error', `Renderer crashed: ${details.reason}`, JSON.stringify(details));
    mainWindow?.reload();
  });

}

function createTray(): void {
  if (tray) {
    try {
      tray.removeAllListeners();
      tray.destroy();
    } catch { /* already destroyed */ }
    tray = null;
  }

  const iconPath =
    process.platform === 'darwin'
      ? path.join(__dirname, '..', 'assets', 'iconTemplate.png')
      : path.join(__dirname, '..', 'assets', 'icon.png');
  let icon: Electron.NativeImage;
  try {
    icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) throw new Error('empty');
    if (process.platform === 'darwin') {
      icon.setTemplateImage(true);
    }
  } catch {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip('Valnaa');
  updateTrayMenu();

  tray.on('click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

function updateTrayMenu(): void {
  if (!tray) return;
  const status = manager.getStatus();
  const isRunning = status.state === 'running';
  const session = loadSession();

  const menu = Menu.buildFromTemplate([
    { label: `Valnaa — ${status.state}`, enabled: false },
    { type: 'separator' },
    { label: 'Open Window', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { type: 'separator' },
    { label: 'Start Agent', enabled: !isRunning, click: () => { if (needsSetupFlow()) autoStart(); else manager.start(); } },
    { label: 'Stop Agent', enabled: isRunning, click: () => manager.stop() },
    { label: 'Restart Agent', enabled: isRunning, click: () => manager.restart() },
    { type: 'separator' },
    { label: 'View Logs', click: () => shell.openPath(getLogFilePath()) },
    { type: 'separator' },
    ...(session ? [
      { label: `Signed in as ${session.email}`, enabled: false } as Electron.MenuItemConstructorOptions,
      { label: 'Sign Out', click: () => { clearSession(); mainWindow?.webContents.send('app:show-auth'); } } as Electron.MenuItemConstructorOptions,
      { type: 'separator' as const } as Electron.MenuItemConstructorOptions,
    ] : []),
    { label: 'Quit', click: () => { isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
}

/** Ensure extension files exist on disk before download / copy to Downloads. */
function prepareChromeExtensionExport(): { ok: true } | { ok: false; error: string } {
  const status = manager.getStatus();
  if (status.state === 'running' && status.port) {
    try {
      ensurePortForward();
    } catch (err: any) {
      logApp('warn', `ensurePortForward: ${err?.message || err}`);
    }
    const ensured = ensureChromeExtensionFiles();
    if (!ensured.ok) {
      return { ok: false, error: ensured.error || 'Could not prepare extension files.' };
    }
  }
  if (!chromeExtensionIsReady()) {
    return {
      ok: false,
      error:
        'Extension files are missing. Start your agent, tap “Refresh path & token”, then try again.',
    };
  }
  return { ok: true };
}

function needsSetupFlow(): boolean {
  const rt = loadRuntime();
  if (!rt) return true;
  if (rt.runtime === 'nemoclaw') {
    return !isDockerInstalled() || !isDockerRunning() || !findNemoClawBinary() || !isOnboardComplete();
  }
  return !findOpenClawBinary() || needsSetup();
}

function setupIPC(): void {
  ipcMain.handle('agent:status', () => manager.getStatus());
  ipcMain.handle('agent:start', () => {
    if (needsSetupFlow()) return autoStart();
    return manager.start();
  });
  ipcMain.handle('agent:stop', () => manager.stop());
  ipcMain.handle('agent:restart', () => manager.restart());
  ipcMain.handle('agent:logs', () => readRecentLogs());
  ipcMain.handle('agent:log-path', () => getLogFilePath());
  ipcMain.handle('agent:open-log-file', () => shell.openPath(getLogFilePath()));
  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('app:get-mac-fullscreen', () =>
    process.platform === 'darwin' && !!mainWindow && !mainWindow.isDestroyed() && mainWindow.isFullScreen(),
  );
  ipcMain.handle(
    'app:popup-win-submenu',
    (event, index: number, anchor: { x: number; y: number }) => {
      if (process.platform !== 'win32') return;
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win || win.isDestroyed()) return;
      const menu = Menu.getApplicationMenu();
      if (!menu || index < 0 || index >= menu.items.length) return;
      const top = menu.items[index];
      if (!top?.submenu) return;
      const b = win.getContentBounds();
      top.submenu.popup({
        window: win,
        x: Math.round(b.x + anchor.x),
        y: Math.round(b.y + anchor.y),
      });
    },
  );
  ipcMain.handle('terminal:spawn', (_e, opts?: { sandbox?: boolean; wsl?: boolean }) => {
    const pref = loadRuntime();
    const isNemo = pref?.runtime === 'nemoclaw';

    let mode: 'local' | 'sandbox' | 'wsl' = 'local';
    if (opts?.wsl && process.platform === 'win32') {
      mode = 'wsl';
    } else if (opts?.sandbox === true || (opts?.sandbox == null && !opts?.wsl && isNemo)) {
      mode = isNemo && isSandboxReady() ? 'sandbox' : 'local';
    }

    const prefix = mode === 'sandbox' ? 'sandbox' : mode === 'wsl' ? 'wsl' : 'term';
    const sessionId = `${prefix}-${nextSessionId++}`;
    spawnPty(sessionId, mode);
    return { sessionId, sandbox: mode === 'sandbox', wsl: mode === 'wsl' };
  });

  ipcMain.on('terminal:input', (_e, sessionId: string, data: string) => {
    ptyMap.get(sessionId)?.write(data);
  });

  ipcMain.on('setup:terminal-input', (_e, data: string) => {
    setupPtyProc?.write(data);
  });

  ipcMain.on('setup:terminal-resize', (_e, cols: number, rows: number) => {
    if (cols > 0 && rows > 0) {
      setupTermSize = { cols, rows };
      if (setupPtyProc) {
        try { setupPtyProc.resize(cols, rows); } catch { /* ok */ }
      }
    }
  });

  // ── OpenShell TUI PTY ──
  let openshellPty: pty.IPty | null = null;

  function killOpenshellPty(): void {
    if (openshellPty) {
      try { openshellPty.kill(); } catch { /* ok */ }
      openshellPty = null;
    }
  }

  ipcMain.handle('openshell:spawn', (_e, size?: { cols: number; rows: number }) => {
    killOpenshellPty();
    const pref = loadRuntime();
    if (pref?.runtime !== 'nemoclaw') return { ok: false, error: 'Not using NemoClaw runtime' };

    const cmd = getOpenShellTermCommand();
    const isWin = process.platform === 'win32';
    const localBin = path.join(os.homedir(), '.local', 'bin');
    const sep = isWin ? ';' : ':';
    const envPath = process.env.PATH || '';
    const patchedPath = envPath.includes(localBin) ? envPath : `${localBin}${sep}${envPath}`;

    const cols = size?.cols && size.cols > 0 ? size.cols : 80;
    const rows = size?.rows && size.rows > 0 ? size.rows : 24;

    try {
      openshellPty = pty.spawn(cmd.shell, cmd.args, {
        name: 'xterm-256color',
        cols,
        rows,
        cwd: os.homedir(),
        env: { ...process.env, PATH: patchedPath, TERM: 'xterm-256color' } as Record<string, string>,
      });
    } catch (err: any) {
      logApp('error', `Failed to spawn openshell term: ${err.message}`);
      return { ok: false, error: err.message };
    }

    openshellPty.onData((data: string) => {
      mainWindow?.webContents.send('openshell:data', data);
    });

    openshellPty.onExit(({ exitCode }) => {
      mainWindow?.webContents.send('openshell:exit', exitCode ?? 1);
      openshellPty = null;
    });

    logApp('info', `OpenShell TUI PTY spawned (${cols}x${rows})`);
    return { ok: true };
  });

  ipcMain.on('openshell:input', (_e, data: string) => {
    openshellPty?.write(data);
  });

  ipcMain.on('openshell:resize', (_e, cols: number, rows: number) => {
    if (openshellPty && cols > 0 && rows > 0) {
      try { openshellPty.resize(cols, rows); } catch { /* ok */ }
    }
  });

  ipcMain.handle('openshell:kill', () => {
    killOpenshellPty();
  });

  ipcMain.on('terminal:resize', (_e, sessionId: string, cols: number, rows: number) => {
    const p = ptyMap.get(sessionId);
    if (p && cols > 0 && rows > 0) {
      try { p.resize(cols, rows); } catch { /* ok */ }
    }
  });

  ipcMain.handle('terminal:kill', (_e, sessionId: string) => {
    const p = ptyMap.get(sessionId);
    if (p) {
      try { p.kill(); } catch { /* ok */ }
      ptyMap.delete(sessionId);
    }
    return { ok: true };
  });

  ipcMain.handle('setup:needs-setup', () => needsSetup());

  /** Folder path, token, ports — for the in-app “Chrome extension” card (user sets up Chrome manually). */
  ipcMain.handle('browser:get-chrome-extension-info', async () => {
    const status = manager.getStatus();
    const extDir = getChromeExtensionDir();
    const pref = loadRuntime();
    const extensionReady = chromeExtensionIsReady();

    // Return fast with cached/local data; heavy sandbox I/O runs in background.
    let gatewayToken: string | null = status.gatewayToken || null;
    if (!gatewayToken) {
      gatewayToken = pref?.runtime === 'nemoclaw'
        ? getCachedSandboxToken()       // never blocks — null until background fills it
        : readHostOpenclawGatewayToken();
    }
    if (gatewayToken) gatewayToken = gatewayToken.trim();

    const result = {
      ok: true,
      extensionPath: extDir,
      extensionReady,
      gatewayToken,
      gatewayPort: OPENCLAW_PORT,
      relayPort: EXTENSION_RELAY_PORT,
      agentRunning: status.state === 'running' && !!status.port,
      docsUrl: BROWSER_DOCS_URL,
      ensureWarning: undefined as string | undefined,
      downloadsFolderName: CHROME_EXTENSION_USER_FOLDER_NAME,
      zipFileName: CHROME_EXTENSION_ZIP_NAME,
    };

    // Defer slow sandbox I/O so the IPC response goes back first and UI renders.
    if (status.state === 'running' && status.port) {
      setTimeout(() => {
        try { ensurePortForward(); } catch (err: any) {
          logApp('warn', `ensurePortForward skipped: ${err?.message || err}`);
        }
        try { ensureChromeExtensionFiles(); } catch (err: any) {
          logApp('warn', `ensureChromeExtensionFiles skipped: ${err?.message || err}`);
        }
        const updates: Record<string, any> = {};
        if (pref?.runtime === 'nemoclaw') {
          try {
            const freshToken = readSandboxGatewayTokenFresh();
            if (freshToken) updates.gatewayToken = freshToken.trim();
          } catch { /* ok */ }
        }
        updates.extensionReady = chromeExtensionIsReady();
        mainWindow?.webContents.send('browser:deferred-update', updates);
      }, 100);
    }

    return result;
  });

  ipcMain.handle('browser:reveal-extension-folder', () => {
    const extDir = getChromeExtensionDir();
    shell.showItemInFolder(extDir);
    return { ok: true };
  });

  ipcMain.handle('browser:open-chrome-extensions', () => {
    openChromeExtensionsPage(shell);
    return { ok: true };
  });

  ipcMain.handle('browser:copy-extension-path', () => {
    const extDir = getChromeExtensionDir();
    clipboard.writeText(extDir);
    return { ok: true };
  });

  /** Copy gateway token — tries cached first, falls back to fast local read. */
  ipcMain.handle('browser:copy-gateway-token', async () => {
    const status = manager.getStatus();
    const pref = loadRuntime();
    let token = status.gatewayToken ?? null;
    if (!token) {
      token = pref?.runtime === 'nemoclaw'
        ? (getCachedSandboxToken() || readSandboxGatewayToken())
        : readHostOpenclawGatewayToken();
    }
    if (!token) {
      return {
        ok: false,
        error: 'No gateway token yet. Start your agent, or open ~/.openclaw/openclaw.json after a run.',
      };
    }
    clipboard.writeText(token.trim());
    return { ok: true };
  });

  ipcMain.handle('browser:save-chrome-extension-zip', async () => {
    const prep = prepareChromeExtensionExport();
    if (!prep.ok) {
      return { ok: false, error: prep.error };
    }
    const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
    const defaultPath = path.join(app.getPath('downloads'), CHROME_EXTENSION_ZIP_NAME);
    const saveOpts = {
      title: 'Save browser extension',
      defaultPath,
      filters: [{ name: 'Zip archive', extensions: ['zip'] }],
    };
    const { canceled, filePath } = win
      ? await dialog.showSaveDialog(win, saveOpts)
      : await dialog.showSaveDialog(saveOpts);
    if (canceled || !filePath) {
      return { ok: false, cancelled: true };
    }
    try {
      zipChromeExtensionDirectory(getChromeExtensionDir(), filePath);
      shell.showItemInFolder(filePath);
      return { ok: true, path: filePath };
    } catch (e: any) {
      return { ok: false, error: e?.message || String(e) };
    }
  });

  ipcMain.handle('browser:copy-chrome-extension-to-downloads', () => {
    const prep = prepareChromeExtensionExport();
    if (!prep.ok) {
      return { ok: false, error: prep.error };
    }
    const dest = path.join(app.getPath('downloads'), CHROME_EXTENSION_USER_FOLDER_NAME);
    try {
      copyChromeExtensionTree(getChromeExtensionDir(), dest);
      shell.showItemInFolder(dest);
      return { ok: true, path: dest };
    } catch (e: any) {
      return { ok: false, error: e?.message || String(e) };
    }
  });

  ipcMain.handle('app:open-external', (_e, url: string) => {
    const trimmed = url.trim();
    if (trimmed.toLowerCase().startsWith('mailto:')) {
      try {
        const rest = trimmed.slice(7).split('?')[0].toLowerCase();
        if (rest && rest.endsWith('@valnaa.com')) {
          void shell.openExternal(trimmed);
          return;
        }
      } catch { /* fall through */ }
      logApp('warn', 'open-external blocked (mailto not allowlisted)', trimmed.substring(0, 80));
      return;
    }

    const allowedPrefixes = [
      'https://valnaa.com',
      'https://www.valnaa.com',
      'https://api.valnaa.com',
      'https://www.docker.com',
      'https://docker.com',
      'https://desktop.docker.com',
      'https://docs.nvidia.com',
      'https://nvidia.com',
      'https://github.com/NVIDIA',
      'https://platform.openai.com',
      'https://console.anthropic.com',
      'https://build.nvidia.com',
      'https://t.me',
      'https://discord.com',
      'https://docs.openclaw.ai',
    ];
    let ok = allowedPrefixes.some((prefix) => trimmed.startsWith(prefix));
    if (!ok) {
      try {
        const u = new URL(url);
        if (u.protocol === 'https:' && (u.hostname === 'stripe.com' || u.hostname.endsWith('.stripe.com'))) {
          ok = true;
        }
      } catch {
        /* invalid URL */
      }
    }
    if (ok) {
      void shell.openExternal(trimmed);
    } else {
      logApp('warn', 'open-external blocked (not allowlisted)', trimmed.substring(0, 80));
    }
  });

  // Auth IPC
  ipcMain.handle('auth:get-session', () => {
    const session = loadSession();
    if (!session) return null;
    return { email: session.email };
  });

  ipcMain.handle('auth:start', () => {
    shell.openExternal('https://valnaa.com/auth/login?desktop=1');
  });

  ipcMain.handle('auth:check-subscription', async () => {
    const session = loadSession();
    if (!session) return { ok: false, reason: 'no-session' };
    try {
      const result = await checkSubscription(session.token);
      return {
        ok: result.ok,
        status: result.status,
        plan: result.plan,
        email: result.email,
        desktopSubscription: result.desktopSubscription,
        desktopTrialActive: result.desktopTrialActive,
        hasDesktopPaid: result.hasDesktopPaid,
        hasStripe: result.hasStripe,
      };
    } catch (err: any) {
      if (err.message === 'unauthorized') {
        clearSession();
        return { ok: false, reason: 'unauthorized' };
      }
      return { ok: false, reason: 'network-error' };
    }
  });

  ipcMain.handle('auth:logout', () => {
    clearSession();
    manager.stop();
    mainWindow?.webContents.send('app:show-auth');
    updateTrayMenu();
  });

  ipcMain.handle('auth:open-pricing', () => {
    shell.openExternal('https://valnaa.com/desktop');
  });

  ipcMain.handle('auth:start-desktop-trial', async () => {
    const session = loadSession();
    if (!session?.token) return { ok: false, error: 'Not signed in' };
    if (isLocalTrialClaimed()) return { ok: false, error: 'A free trial has already been used on this computer' };
    const result = await startDesktopTrial(session.token);
    if (result.ok) markLocalTrialClaimed();
    return result;
  });

  ipcMain.handle('auth:get-stripe-portal', async () => {
    const session = loadSession();
    if (!session?.token) return null;
    return getStripePortalUrl(session.token);
  });

  ipcMain.handle('auth:get-desktop-checkout', async () => {
    const session = loadSession();
    if (!session?.token) return null;
    return getDesktopCheckoutUrl(session.token);
  });

  ipcMain.handle('data:get-paths', () => {
    return {
      configDir: getOpenClawDir(),
      appDataDir: getAppDataDir(),
      logsDir: getLogsDir(),
    };
  });

  ipcMain.handle('data:open-folder', (_e, which: string) => {
    if (which === 'config') shell.openPath(getOpenClawDir());
    else if (which === 'appdata') shell.openPath(getAppDataDir());
    else if (which === 'logs') shell.openPath(getLogsDir());
  });

  ipcMain.handle('data:delete-agent', async () => {
    logApp('info', 'User requested agent data deletion');
    await manager.stop();
    const configDir = getOpenClawDir();
    const appDataDir = getAppDataDir();
    const fs = await import('fs');
    try {
      if (fs.existsSync(configDir)) {
        fs.rmSync(configDir, { recursive: true, force: true });
        logApp('info', `Deleted config dir: ${configDir}`);
      }
    } catch (err: any) {
      logApp('error', `Failed to delete config dir: ${err.message}`);
    }
    clearRuntime();
    logApp('info', 'Agent data deleted — runtime cleared');
    return { ok: true };
  });

  /** OpenAI / Anthropic in addition to NVIDIA (NemoClaw) or local OpenClaw config. */
  ipcMain.handle(
    'settings:set-optional-model-keys',
    async (_e, body: { openai?: string; anthropic?: string }) => {
      const openai = typeof body?.openai === 'string' ? body.openai.trim() : '';
      const anthropic = typeof body?.anthropic === 'string' ? body.anthropic.trim() : '';
      const apiKeys: Record<string, string> = {};
      if (openai) apiKeys.OPENAI_API_KEY = openai;
      if (anthropic) apiKeys.ANTHROPIC_API_KEY = anthropic;
      if (Object.keys(apiKeys).length === 0) {
        return { ok: false, error: 'Paste at least one API key.' };
      }
      try {
        const pref = loadRuntime();
        if (pref?.runtime !== 'nemoclaw') {
          return {
            ok: false,
            error: 'Optional model keys are only available when NemoClaw is selected. For OpenClaw, use Terminal → openclaw onboard or edit ~/.openclaw/openclaw.json.',
          };
        }
        applySandboxSettings({ apiKeys });
        return { ok: true };
      } catch (err: any) {
        logApp('warn', `settings:set-optional-model-keys: ${err.message}`);
        const msg = err.message || 'Could not save keys.';
        const friendly =
          /cannot read sandbox config/i.test(msg)
            ? 'Could not read sandbox config. Start the agent and ensure NemoClaw is ready, then try again.'
            : msg;
        return { ok: false, error: friendly };
      }
    },
  );

  // Runtime selection IPC — cache Docker probe results (they spawn child
  // processes with multi-second timeouts and block the main thread).
  let _runtimeCache: { ts: number; data: any } | null = null;
  const RUNTIME_CACHE_MS = 15_000;

  ipcMain.handle('runtime:get', () => {
    const pref = loadRuntime();
    const now = Date.now();
    if (_runtimeCache && now - _runtimeCache.ts < RUNTIME_CACHE_MS && _runtimeCache.data._rt === (pref?.runtime || null)) {
      return _runtimeCache.data;
    }
    const data = {
      _rt: pref?.runtime || null,
      runtime: pref?.runtime || null,
      nemoClawSupported: isNemoClawSupported(),
      dockerInstalled: isDockerInstalled(),
      dockerRunning: isDockerRunning(),
      canInstallDocker: canInstallDocker(),
    };
    _runtimeCache = { ts: now, data };
    return data;
  });

  ipcMain.handle('runtime:invalidate-cache', () => { _runtimeCache = null; });
  ipcMain.handle('runtime:sandbox-name', () => {
    const pref = loadRuntime();
    if (pref?.runtime !== 'nemoclaw') return null;
    return getNemoClawSandboxName();
  });

  ipcMain.handle('app:launch-docker', () => launchDockerDesktop());

  /** Open a real system terminal with a setup command (Docker, OpenClaw, NemoClaw). */
  ipcMain.handle('setup:open-external-task', (_e, task: string) => {
    const allowed: SetupShellTask[] = ['install-docker', 'install-nemoclaw', 'setup-nemoclaw', 'onboard', 'install'];
    if (!allowed.includes(task as SetupShellTask)) {
      return { ok: false, error: 'Unknown task' };
    }
    const t = task as SetupShellTask;
    const cmd = getTaskCommand(t);
    if (!cmd) {
      return { ok: false, error: 'No command for this task' };
    }
    openUserTerminalWithCommand(cmd, t);
    if (t === 'install-docker') {
      launchDockerDesktop();
      setTimeout(() => autoStart(), 4000);
    } else {
      setTimeout(() => autoStart(), 1500);
    }
    return { ok: true };
  });

  ipcMain.handle('runtime:set', async (_e, runtime: RuntimeType) => {
    if (runtime !== 'openclaw' && runtime !== 'nemoclaw') return;
    saveRuntime(runtime);
    _runtimeCache = null;
    logApp('info', `Runtime selected: ${runtime} — stopping current agent first`);
    await manager.stop();
    await autoStart();
  });

  ipcMain.handle('runtime:clear', () => {
    clearRuntime();
    _runtimeCache = null;
    logApp('info', 'Runtime cleared by user');
  });

  ipcMain.handle('app:retry-autostart', () => {
    autoStart();
  });

  ipcMain.handle('setup:submit-api-key', (_e, provider: string, key: string) => {
    if (apiKeyResolver) {
      apiKeyResolver({ provider, key });
      apiKeyResolver = null;
    }
  });

  manager.on('status', (status: AgentStatus) => {
    mainWindow?.webContents.send('agent:status-update', status);
    updateTrayMenu();
  });
}

function startSubscriptionRecheck(session: { token: string; email: string }): void {
  if (subscriptionCheckTimer) clearInterval(subscriptionCheckTimer);

  subscriptionCheckTimer = setInterval(async () => {
    try {
      const sub = await Promise.race([
        checkSubscription(session.token),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('subscription_timeout')), 15000)
        ),
      ]);
      if (!sub.ok) {
        logApp('info', `Periodic check: subscription no longer valid (${sub.status}) — stopping agent and clearing token`);
        await manager.stop();
        clearGatewayToken();
        const trialOk = sub.status !== 'trial_expired' && !isLocalTrialClaimed();
        mainWindow?.webContents.send('app:show-subscribe', { email: session.email, status: sub.status, plan: sub.plan, trialEligible: trialOk });
        if (subscriptionCheckTimer) clearInterval(subscriptionCheckTimer);
      } else {
        // Rotate gateway token on each successful recheck
        try {
          const newToken = await fetchDesktopGatewayToken(session.token);
          currentGatewayToken = newToken;
          applyGatewayToken();
          logApp('info', 'Rotated gateway token on periodic recheck');
        } catch { /* non-fatal — keep current token */ }
      }
    } catch (err: any) {
      if (err.message === 'unauthorized') {
        logApp('info', 'Periodic check: token expired — stopping agent and clearing token');
        clearSession();
        await manager.stop();
        clearGatewayToken();
        mainWindow?.webContents.send('app:show-auth');
        if (subscriptionCheckTimer) clearInterval(subscriptionCheckTimer);
        return;
      }
      if (!isOfflineGraceValid()) {
        logApp('info', 'Periodic check: offline and grace expired — stopping agent and clearing token');
        await manager.stop();
        clearGatewayToken();
        mainWindow?.webContents.send('app:show-subscribe', { email: session.email, status: 'offline_expired', plan: '', trialEligible: false });
        if (subscriptionCheckTimer) clearInterval(subscriptionCheckTimer);
      }
    }
  }, RECHECK_INTERVAL_MS);
}

async function autoStart(): Promise<void> {
  // 1. Check auth
  const session = loadSession();
  if (!session) {
    logApp('info', 'No session — showing auth screen');
    mainWindow?.webContents.send('app:show-auth');
    return;
  }

  // 2. Check subscription (with timeout so we never hang)
  try {
    const sub = await Promise.race([
      checkSubscription(session.token),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('subscription_timeout')), 15000)
      ),
    ]);
    if (!sub.ok) {
      logApp('info', `Subscription not active (status: ${sub.status}) — showing subscribe screen`);
      const trialOk = sub.status !== 'trial_expired' && !isLocalTrialClaimed();
      mainWindow?.webContents.send('app:show-subscribe', { email: session.email, status: sub.status, plan: sub.plan, trialEligible: trialOk });
      return;
    }
    logApp('info', `Subscription valid (${sub.plan}/${sub.status})`);
  } catch (err: any) {
    if (err.message === 'unauthorized') {
      logApp('info', 'Token expired/invalid — showing auth screen');
      clearSession();
      mainWindow?.webContents.send('app:show-auth');
      return;
    }
    if (err.message === 'subscription_timeout' || err.message?.includes('timeout')) {
      if (isOfflineGraceValid()) {
        logApp('warn', 'Subscription check timed out — within 24h grace, allowing local use');
      } else {
        logApp('info', 'Subscription check timed out and offline grace expired — must reconnect');
        mainWindow?.webContents.send('app:show-subscribe', { email: session.email, status: 'offline_expired', plan: '', trialEligible: false });
        return;
      }
    } else {
      if (isOfflineGraceValid()) {
        logApp('warn', 'Could not check subscription (offline?) — within 24h grace, allowing local use');
      } else {
        logApp('info', 'Could not check subscription and offline grace expired — must reconnect');
        mainWindow?.webContents.send('app:show-subscribe', { email: session.email, status: 'offline_expired', plan: '', trialEligible: false });
        return;
      }
    }
  }

  // 2b. Fetch gateway token from server (subscription-gated)
  try {
    currentGatewayToken = await fetchDesktopGatewayToken(session.token);
    logApp('info', 'Fetched desktop gateway token from API');
  } catch (err: any) {
    if (isOfflineGraceValid() && currentGatewayToken) {
      logApp('warn', `Could not fetch gateway token (offline?) — reusing cached token`);
    } else if (isOfflineGraceValid()) {
      logApp('warn', 'Could not fetch gateway token (offline?) — proceeding within grace period');
    } else {
      logApp('warn', `Failed to fetch gateway token: ${err.message}`);
    }
  }

  // 2c. Start periodic subscription re-check
  startSubscriptionRecheck(session);

  // 3. Check runtime selection
  const runtimePref = loadRuntime();
  if (!runtimePref) {
    logApp('info', 'No runtime selected — showing runtime picker');
    mainWindow?.webContents.send('app:show-runtime-picker');
    return;
  }

  // 4. Run environment setup and start agent
  logApp('info', `Runtime: ${runtimePref.runtime} — entering setup flow`);
  try {
    await runSetupFlow(runtimePref.runtime);
  } catch (err: any) {
    logApp('error', `runSetupFlow threw: ${err.message}\n${err.stack}`);
  }
}

function setupAutoUpdater(): void {
  let updateDownloaded = false;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    logApp('info', `Update available: v${info.version}`);
    mainWindow?.webContents.send('app:update-available', { version: info.version, canAutoInstall: false });
  });

  autoUpdater.on('update-downloaded', (info) => {
    updateDownloaded = true;
    logApp('info', `Update downloaded: v${info.version} — will install on quit`);
    mainWindow?.webContents.send('app:update-available', { version: info.version, canAutoInstall: true });
  });

  autoUpdater.on('error', (err) => {
    logApp('warn', 'Auto-updater error (non-fatal)', err.message);
    // electron-updater failed (common on unsigned macOS DMGs) — fall back to GitHub check
    checkGitHubForUpdate();
  });

  ipcMain.handle('app:install-update', () => {
    if (updateDownloaded) {
      autoUpdater.quitAndInstall(false, true);
    } else {
      shell.openExternal('https://valnaa.com/desktop');
    }
  });

  autoUpdater.checkForUpdatesAndNotify().catch(() => {
    checkGitHubForUpdate();
  });

  // Re-check every 4 hours
  setInterval(() => {
    autoUpdater.checkForUpdatesAndNotify().catch(() => checkGitHubForUpdate());
  }, 4 * 60 * 60 * 1000);
}

function checkGitHubForUpdate(): void {
  const https = require('https');
  const currentVersion = app.getVersion();

  const options = {
    hostname: 'api.github.com',
    path: '/repos/Skycustody/valnaa-desktop/releases/latest',
    headers: { 'User-Agent': `Valnaa/${currentVersion}` },
    timeout: 10000,
  };

  const req = https.get(options, (res: any) => {
    let body = '';
    res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    res.on('end', () => {
      try {
        const release = JSON.parse(body);
        const latestTag = (release.tag_name || '').replace(/^v/, '');
        if (latestTag && isNewerVersion(currentVersion, latestTag)) {
          logApp('info', `GitHub reports newer version: v${latestTag} (current: v${currentVersion})`);
          mainWindow?.webContents.send('app:update-available', { version: latestTag, canAutoInstall: false });
        }
      } catch { /* ignore parse errors */ }
    });
  });
  req.on('error', () => {});
  req.on('timeout', () => { req.destroy(); });
}

function isNewerVersion(current: string, latest: string): boolean {
  const c = current.split('.').map(Number);
  const l = latest.split('.').map(Number);
  for (let i = 0; i < Math.max(c.length, l.length); i++) {
    const cv = c[i] || 0;
    const lv = l[i] || 0;
    if (lv > cv) return true;
    if (lv < cv) return false;
  }
  return false;
}

// Register protocol for deep links (dev mode)
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient(PROTOCOL);
}

// macOS: deep link via open-url event
app.on('open-url', (event, url) => {
  event.preventDefault();
  if (mainWindow) {
    handleDeepLink(url);
  } else {
    pendingDeepLink = url;
  }
});

// Windows/Linux: deep link arrives as argv in second-instance
app.on('second-instance', (_event, argv) => {
  const deepLink = argv.find(arg => arg.startsWith(`${PROTOCOL}://`));
  if (deepLink) {
    handleDeepLink(deepLink);
  }
  mainWindow?.show();
  mainWindow?.focus();
});

app.on('web-contents-created', (_e, contents) => {
  contents.on('context-menu', (_ev, params) => {
    const menu = Menu.buildFromTemplate([
      { role: 'cut', enabled: params.editFlags.canCut },
      { role: 'copy', enabled: params.editFlags.canCopy },
      { role: 'paste', enabled: params.editFlags.canPaste },
      { role: 'selectAll', enabled: params.editFlags.canSelectAll },
    ]);
    menu.popup();
  });
});

app.whenReady().then(async () => {
  logApp('info', `Valnaa v${app.getVersion()} starting`);
  logApp('info', `Diagnostics log: ${getAppLogPath()}`);

  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { role: 'appMenu' },
      { role: 'editMenu' },
      { role: 'windowMenu' },
    ]));
    try {
      const dockIconPath = path.join(__dirname, '..', 'assets', 'icon.png');
      const dockImg = nativeImage.createFromPath(dockIconPath);
      if (!dockImg.isEmpty()) app.dock.setIcon(dockImg);
    } catch { /* optional */ }
  }

  createWindow();

  if (process.platform === 'win32' && mainWindow) {
    Menu.setApplicationMenu(Menu.buildFromTemplate(getWindowsApplicationMenuTemplate()));
    mainWindow.setMenuBarVisibility(false);
  }
  createTray();
  setupIPC();
  setupAutoUpdater();

  const runAutoStart = () => {
    if (pendingDeepLink) {
      handleDeepLink(pendingDeepLink);
      pendingDeepLink = null;
    } else {
      autoStart();
    }
  };

  ipcMain.once('app:renderer-ready', runAutoStart);

  app.on('activate', () => {
    mainWindow?.show();
  });
});

app.on('before-quit', async () => {
  isQuitting = true;
  logApp('info', 'App quitting — stopping agent and clearing gateway token');
  if (subscriptionCheckTimer) { clearInterval(subscriptionCheckTimer); subscriptionCheckTimer = null; }
  killAllPtys();
  await manager.stop();
  clearGatewayToken();
  closeStreams();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    isQuitting = true;
    app.quit();
  }
});

process.on('uncaughtException', (err) => {
  logApp('error', 'Uncaught exception in main process', err.stack || err.message);
  dialog.showErrorBox('Valnaa Error', `An unexpected error occurred:\n\n${err.message}\n\nCheck logs for details.`);
});

process.on('unhandledRejection', (reason: any) => {
  logApp('error', 'Unhandled rejection in main process', String(reason?.stack || reason));
});
