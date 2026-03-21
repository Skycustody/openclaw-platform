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
import { loadSession, saveSession, clearSession, checkSubscription, parseDeepLinkToken, parseDeepLinkEmail } from './lib/session';
import { loadRuntime, saveRuntime, clearRuntime, isNemoClawSupported, isDockerInstalled, isDockerRunning, canInstallDocker, getDockerInstallCommand, launchDockerDesktop, RuntimeType, isIntelMac, isOpenShellInstalled, isSidecarReady, setupOpenShellSidecar, ensureSidecarNetworking, isOnboardComplete, getNemoClawOnboardCommand, ensurePortForward, OPENCLAW_PORT, EXTENSION_RELAY_PORT, readSandboxGatewayTokenFresh, readHostOpenclawGatewayToken } from './lib/runtime';
import { getAppDataDir } from './lib/platform';
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
const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
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
    const steps: SetupStep[] = [
      { id: 'docker-install', label: 'Install Docker Desktop', status: isDockerInstalled() ? 'done' : 'pending' },
      { id: 'docker-start', label: 'Start Docker', status: isDockerRunning() ? 'done' : 'pending' },
    ];
    if (isIntelMac()) {
      steps.push({ id: 'openshell-sidecar', label: 'Install OpenShell (Intel Mac)', status: isSidecarReady() ? 'done' : 'pending' });
    }
    const onboardDone = isOnboardComplete();
    steps.push(
      { id: 'nemoclaw-install', label: 'Install NemoClaw', status: findNemoClawBinary() ? 'done' : 'pending' },
      { id: 'collect-api-key', label: 'Configure API key', status: (onboardDone || loadPersistedApiKey() !== null) ? 'done' : 'pending' },
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

function taskRunsInExternalTerminal(task: SetupShellTask): boolean {
  return task === 'install-docker' || task === 'install-nemoclaw' || task === 'setup-nemoclaw' || task === 'onboard';
}

// ════════════════════════════════════
//  In-App PTY Terminal
// ════════════════════════════════════
let activePty: pty.IPty | null = null;

function spawnPty(): pty.IPty {
  if (activePty) {
    try { activePty.kill(); } catch { /* ok */ }
    activePty = null;
  }

  const pref = loadRuntime();
  const runtime: RuntimeType = pref?.runtime || 'openclaw';
  const shellName = process.platform === 'win32' ? 'powershell.exe' : (process.env.SHELL || '/bin/zsh');
  const shellArgs = ['-l'];
  const localBin = path.join(os.homedir(), '.local', 'bin');
  const envPath = process.env.PATH || '';
  const patchedPath = envPath.includes(localBin) ? envPath : `${localBin}:${envPath}`;

  logApp('info', `Spawning PTY: ${shellName} ${shellArgs.join(' ')} (runtime: ${runtime})`);

  const ptyProc = pty.spawn(shellName, shellArgs, {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: os.homedir(),
    env: { ...process.env, PATH: patchedPath, TERM: 'xterm-256color' } as Record<string, string>,
  });

  ptyProc.onData((data: string) => {
    mainWindow?.webContents.send('terminal:data', data);
  });

  ptyProc.onExit(({ exitCode, signal }) => {
    logApp('info', `PTY exited (code=${exitCode}, signal=${signal})`);
    mainWindow?.webContents.send('terminal:exit', exitCode);
    if (activePty === ptyProc) activePty = null;
  });

  activePty = ptyProc;
  return ptyProc;
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
  const keyLine = saved?.key ? `export NVIDIA_API_KEY='${shEscapeSq(saved.key)}'\n` : '';
  return `${keyLine}${getNemoClawOnboardCommand()}`;
}

async function runNemoClawOnboardExternal(): Promise<void> {
  logApp('info', 'Opening Terminal for NemoClaw onboard');
  openUserTerminalWithCommand(nemoclawOnboardShellBlock(), 'nemoclaw-onboard');
  await waitForExternalTask('setup-nemoclaw');
}

async function runSetupShellTaskAsync(task: SetupShellTask): Promise<void> {
  const command = getTaskCommand(task);
  if (!command) {
    throw new Error(`Cannot determine command for task "${task}"`);
  }

  if (taskRunsInExternalTerminal(task)) {
    logApp('info', `External setup "${task}": ${redactPtyLog(command)}`);
    openUserTerminalWithCommand(command, task);
    await waitForExternalTask(task);
    return;
  }

  const shellName = process.platform === 'win32' ? 'powershell.exe' : '/bin/zsh';
  const localBin = path.join(os.homedir(), '.local', 'bin');
  const envPath = process.env.PATH || '';
  const patchedPath = envPath.includes(localBin) ? envPath : `${localBin}:${envPath}`;
  logApp('info', `Headless setup "${task}" via ${shellName}`);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(shellName, ['-c', command], {
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
function waitForDocker(timeoutMs = 120000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (isDockerRunning()) { resolve(); return; }
    const start = Date.now();
    const poll = setInterval(() => {
      if (isDockerRunning()) {
        clearInterval(poll);
        resolve();
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(poll);
        reject(new Error('Docker did not start within 2 minutes'));
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

function waitForApiKeySubmission(): Promise<{ provider: string; key: string }> {
  return new Promise((resolve) => {
    apiKeyResolver = resolve;
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

// ════════════════════════════════════
//  Setup Flow Orchestrator
// ════════════════════════════════════
async function runSetupFlow(runtime: RuntimeType): Promise<void> {
  if (setupRunning) return;
  setupRunning = true;

  try {
    const steps = buildSetupSteps(runtime);
    const pendingSteps = steps.filter(s => s.status !== 'done');
    if (pendingSteps.length === 1 && pendingSteps[0].id === 'start') {
      logApp('info', `All prerequisites met — starting ${runtime}`);
      steps[steps.length - 1].status = 'running';
      sendSteps(steps);
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
            if (isDockerRunning()) break;
            launchDockerDesktop();
            step.detail = 'Waiting for Docker to be ready...';
            sendSteps(steps);
            await waitForDocker();
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
          case 'nemoclaw-install': {
            if (findNemoClawBinary()) break;
            if (isIntelMac()) {
              ensureSidecarNetworking();
            }
            await runSetupShellTaskAsync('install-nemoclaw');
            break;
          }
          case 'collect-api-key': {
            if (loadPersistedApiKey() || isOnboardComplete()) break;
            step.detail = 'Waiting for API key...';
            sendSteps(steps);
            await new Promise(r => setTimeout(r, 300));
            mainWindow?.webContents.send('app:show-api-key-form', [
              { id: 'openai',    name: 'OpenAI',    keyUrl: 'https://platform.openai.com/api-keys' },
              { id: 'anthropic', name: 'Anthropic',  keyUrl: 'https://console.anthropic.com/settings/keys' },
              { id: 'nvidia',    name: 'NVIDIA NIM', keyUrl: 'https://build.nvidia.com/nim' },
            ]);
            const { provider, key } = await waitForApiKeySubmission();
            persistApiKey(provider, key);
            break;
          }
          case 'nemoclaw-onboard': {
            if (isOnboardComplete()) break;
            if (isIntelMac()) ensureSidecarNetworking();
            step.detail = 'Running NemoClaw setup (this may take several minutes)...';
            sendSteps(steps);
            await runNemoClawOnboardExternal();
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

  saveSession(token, email || 'user@valnaa.com');

  mainWindow?.show();
  mainWindow?.focus();
  mainWindow?.webContents.send('app:auth-result', { success: true, email: email || 'user@valnaa.com' });

  autoStart();
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 800,
    minHeight: 500,
    title: 'Valnaa',
    backgroundColor: '#000000',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    logApp('error', `Renderer crashed: ${details.reason}`, JSON.stringify(details));
    mainWindow?.reload();
  });
}

function createTray(): void {
  const iconPath = path.join(__dirname, '..', 'assets', 'iconTemplate.png');
  let icon: Electron.NativeImage;
  try {
    icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) throw new Error('empty');
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
    { label: 'Start Agent', enabled: !isRunning, click: () => manager.start() },
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

function setupIPC(): void {
  ipcMain.handle('agent:status', () => manager.getStatus());
  ipcMain.handle('agent:start', () => manager.start());
  ipcMain.handle('agent:stop', () => manager.stop());
  ipcMain.handle('agent:restart', () => manager.restart());
  ipcMain.handle('agent:logs', () => readRecentLogs());
  ipcMain.handle('agent:log-path', () => getLogFilePath());
  ipcMain.handle('agent:open-log-file', () => shell.openPath(getLogFilePath()));
  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('terminal:spawn', () => {
    const pref = loadRuntime();
    const runtime: RuntimeType = pref?.runtime || 'openclaw';
    spawnPty();
    return { ok: true, runtime };
  });

  ipcMain.on('terminal:input', (_e, data: string) => {
    activePty?.write(data);
  });

  ipcMain.on('terminal:resize', (_e, cols: number, rows: number) => {
    if (activePty && cols > 0 && rows > 0) {
      try { activePty.resize(cols, rows); } catch { /* ok */ }
    }
  });

  ipcMain.handle('terminal:kill', () => {
    if (activePty) {
      try { activePty.kill(); } catch { /* ok */ }
      activePty = null;
    }
    return { ok: true };
  });

  ipcMain.handle('setup:needs-setup', () => needsSetup());

  /** Folder path, token, ports — for the in-app “Chrome extension” card (user sets up Chrome manually). */
  ipcMain.handle('browser:get-chrome-extension-info', async () => {
    const status = manager.getStatus();
    const extDir = getChromeExtensionDir();
    const pref = loadRuntime();

    let ensureWarning: string | undefined;
    if (status.state === 'running' && status.port) {
      try {
        ensurePortForward();
      } catch (err: any) {
        logApp('warn', `ensurePortForward skipped: ${err?.message || err}`);
      }
      const ensured = ensureChromeExtensionFiles();
      if (!ensured.ok) {
        ensureWarning = ensured.error;
      }
    }

    const extensionReady = chromeExtensionIsReady();

    let gatewayToken: string | null = null;
    if (pref?.runtime === 'nemoclaw') {
      gatewayToken = readSandboxGatewayTokenFresh();
    } else {
      gatewayToken = readHostOpenclawGatewayToken();
    }
    if (!gatewayToken && status.gatewayToken) {
      gatewayToken = status.gatewayToken;
    }
    if (gatewayToken) {
      gatewayToken = gatewayToken.trim();
    }

    return {
      ok: true,
      extensionPath: extDir,
      extensionReady,
      gatewayToken,
      gatewayPort: OPENCLAW_PORT,
      relayPort: EXTENSION_RELAY_PORT,
      agentRunning: status.state === 'running' && !!status.port,
      docsUrl: BROWSER_DOCS_URL,
      ensureWarning,
      downloadsFolderName: CHROME_EXTENSION_USER_FOLDER_NAME,
      zipFileName: CHROME_EXTENSION_ZIP_NAME,
    };
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

  /** Copy gateway token (works best while the agent is running / sandbox is up). */
  ipcMain.handle('browser:copy-gateway-token', async () => {
    const status = manager.getStatus();
    const pref = loadRuntime();
    let token =
      pref?.runtime === 'nemoclaw' ? readSandboxGatewayTokenFresh() : readHostOpenclawGatewayToken();
    if (!token) token = status.gatewayToken ?? null;
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
      title: 'Save OpenClaw browser extension',
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
    const allowed = [
      'https://valnaa.com',
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
    if (allowed.some(prefix => url.startsWith(prefix))) {
      shell.openExternal(url);
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
      return { ok: result.ok, status: result.status, plan: result.plan };
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
    shell.openExternal('https://valnaa.com/pricing');
  });

  // Runtime selection IPC
  ipcMain.handle('runtime:get', () => {
    const pref = loadRuntime();
    return {
      runtime: pref?.runtime || null,
      nemoClawSupported: isNemoClawSupported(),
      dockerInstalled: isDockerInstalled(),
      dockerRunning: isDockerRunning(),
      canInstallDocker: canInstallDocker(),
    };
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

  ipcMain.handle('runtime:set', (_e, runtime: RuntimeType) => {
    if (runtime !== 'openclaw' && runtime !== 'nemoclaw') return;
    saveRuntime(runtime);
    logApp('info', `Runtime selected: ${runtime}`);
    autoStart();
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
      mainWindow?.webContents.send('app:show-subscribe', { email: session.email, status: sub.status, plan: sub.plan });
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
    if (err.message === 'subscription_timeout') {
      logApp('warn', 'Subscription check timed out — allowing local use');
    } else {
      logApp('warn', 'Could not check subscription (offline?) — allowing local use');
    }
  }

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
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    logApp('info', `Update available: v${info.version}`);
    mainWindow?.webContents.send('app:update-available', info.version);
  });

  autoUpdater.on('update-downloaded', (info) => {
    logApp('info', `Update downloaded: v${info.version} — will install on quit`);
    mainWindow?.webContents.send('app:update-downloaded', info.version);
  });

  autoUpdater.on('error', (err) => {
    logApp('warn', 'Auto-updater error (non-fatal)', err.message);
  });

  autoUpdater.checkForUpdatesAndNotify().catch(() => {});
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

app.whenReady().then(async () => {
  logApp('info', `Valnaa v${app.getVersion()} starting`);
  logApp('info', `Diagnostics log: ${getAppLogPath()}`);

  createWindow();
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
  logApp('info', 'App quitting — stopping OpenClaw');
  if (activePty) {
    try { activePty.kill(); } catch { /* ok */ }
    activePty = null;
  }
  await manager.stop();
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
