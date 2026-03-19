import { app, BrowserWindow, ipcMain, Tray, Menu, shell, nativeImage, dialog, safeStorage } from 'electron';
import path from 'path';
import os from 'os';
import { autoUpdater } from 'electron-updater';
import * as pty from 'node-pty';
import { manager, AgentStatus } from './openclaw/manager';
import { installOpenClaw, findOpenClawBinary, isNodeInstalled, getInstallScriptCommand, findNemoClawBinary, getNemoClawInstallScriptCommand, getNemoClawSetupScriptCommand } from './openclaw/installer';
import { readRecentLogs, getLogFilePath, logApp, closeStreams } from './openclaw/logger';
import { loadSession, saveSession, clearSession, checkSubscription, parseDeepLinkToken, parseDeepLinkEmail } from './lib/session';
import { loadRuntime, saveRuntime, clearRuntime, isNemoClawSupported, isDockerInstalled, isDockerRunning, canInstallDocker, getDockerInstallCommand, launchDockerDesktop, RuntimeType, isIntelMac, isOpenShellInstalled, isSidecarReady, setupOpenShellSidecar, ensureSidecarNetworking, isOnboardComplete, getNemoClawOnboardCommand, applySandboxSettings, readSandboxConfig } from './lib/runtime';
import { getAppDataDir } from './lib/platform';

const PROTOCOL = 'valnaa';
const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let onboardPty: pty.IPty | null = null;
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
    const settingsDone = isNemoClawSettingsDone();
    steps.push(
      { id: 'nemoclaw-install', label: 'Install NemoClaw', status: findNemoClawBinary() ? 'done' : 'pending' },
      { id: 'collect-api-key', label: 'Configure API key', status: (onboardDone || loadPersistedApiKey() !== null) ? 'done' : 'pending' },
      { id: 'nemoclaw-onboard', label: 'Set up NemoClaw', status: onboardDone ? 'done' : 'pending' },
      { id: 'nemoclaw-settings', label: 'Configure your agent', status: settingsDone ? 'done' : 'pending' },
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

// ════════════════════════════════════
//  Promisified PTY
// ════════════════════════════════════
function getTaskCommand(task: PtyTask): string | null {
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

function spawnPtyTaskAsync(task: PtyTask): Promise<void> {
  return new Promise((resolve, reject) => {
    if (onboardPty) {
      reject(new Error('Another setup task is still running'));
      return;
    }

    const command = getTaskCommand(task);
    if (!command) {
      reject(new Error(`Cannot determine command for task "${task}"`));
      return;
    }

    const shellName = process.platform === 'win32' ? 'powershell.exe' : '/bin/zsh';
    logApp('info', `PTY async "${task}": ${command} (shell: ${shellName})`);

    const localBin = path.join(os.homedir(), '.local', 'bin');
    const envPath = process.env.PATH || '';
    const patchedPath = envPath.includes(localBin) ? envPath : `${localBin}:${envPath}`;

    onboardPty = pty.spawn(shellName, ['-c', command], {
      name: 'xterm-256color',
      cols: 100,
      rows: 30,
      cwd: os.homedir(),
      env: { ...process.env, TERM: 'xterm-256color', FORCE_COLOR: '1', PATH: patchedPath } as Record<string, string>,
    });

    logApp('info', `PTY spawned (PID ${onboardPty.pid}) for task "${task}"`);

    onboardPty.onData((data: string) => {
      mainWindow?.webContents.send('pty:data', data);
    });

    onboardPty.onExit(({ exitCode }) => {
      logApp('info', `PTY task "${task}" exited with code ${exitCode}`);
      onboardPty = null;
      mainWindow?.webContents.send('pty:exit', exitCode);
      if (exitCode === 0) resolve();
      else reject(new Error(`${task} failed (exit code ${exitCode})`));
    });
  });
}

/**
 * Run `nemoclaw onboard` in a PTY with automatic prompt responses.
 * Handles: gateway deploy, sandbox creation, inference config, port forward, registry.
 * The NVIDIA_API_KEY is passed via environment so onboard can configure inference.
 */
function spawnNemoClawOnboardAsync(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (onboardPty) {
      reject(new Error('Another setup task is still running'));
      return;
    }

    const savedKey = loadPersistedApiKey();
    const command = getNemoClawOnboardCommand();
    const shellName = process.platform === 'win32' ? 'powershell.exe' : '/bin/zsh';
    logApp('info', `PTY nemoclaw-onboard: ${command}`);

    const localBin = path.join(os.homedir(), '.local', 'bin');
    const envPath = process.env.PATH || '';
    const patchedPath = envPath.includes(localBin) ? envPath : `${localBin}:${envPath}`;

    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      TERM: 'xterm-256color',
      FORCE_COLOR: '1',
      PATH: patchedPath,
    };
    if (savedKey?.key) env.NVIDIA_API_KEY = savedKey.key;

    onboardPty = pty.spawn(shellName, ['-c', command], {
      name: 'xterm-256color',
      cols: 100,
      rows: 30,
      cwd: os.homedir(),
      env,
    });

    logApp('info', `PTY spawned (PID ${onboardPty.pid}) for nemoclaw-onboard`);

    const autoResponses = [
      { pattern: /sandbox name/i, response: 'nemoclaw\n', sent: false },
      { pattern: /choose \[/i, response: '\n', sent: false },
      { pattern: /apply suggested presets/i, response: 'Y\n', sent: false },
      { pattern: /recreate\?/i, response: 'y\n', sent: false },
    ];
    let lineBuffer = '';

    onboardPty.onData((data: string) => {
      mainWindow?.webContents.send('pty:data', data);

      // Strip ANSI escape sequences for log readability
      const clean = data.replace(/\x1B\[[0-9;]*[A-Za-z]/g, '').trim();
      if (clean) logApp('info', `[onboard-pty] ${clean.substring(0, 200)}`);

      lineBuffer += data;
      if (lineBuffer.length > 500) lineBuffer = lineBuffer.slice(-500);

      for (const ar of autoResponses) {
        if (!ar.sent && ar.pattern.test(lineBuffer)) {
          ar.sent = true;
          logApp('info', `Auto-responding to onboard prompt: ${ar.pattern}`);
          setTimeout(() => onboardPty?.write(ar.response), 300);
          lineBuffer = '';
          break;
        }
      }
    });

    onboardPty.onExit(({ exitCode }) => {
      logApp('info', `PTY nemoclaw-onboard exited with code ${exitCode}`);
      onboardPty = null;
      mainWindow?.webContents.send('pty:exit', exitCode);
      if (exitCode === 0) resolve();
      else reject(new Error(`nemoclaw onboard failed (exit code ${exitCode})`));
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
//  NemoClaw Settings (post-onboard)
// ════════════════════════════════════
const NEMOCLAW_SETTINGS_FLAG = path.join(getAppDataDir(), 'nemoclaw-settings-done');

function isNemoClawSettingsDone(): boolean {
  const fs = require('fs');
  try { fs.accessSync(NEMOCLAW_SETTINGS_FLAG); return true; } catch { return false; }
}

function markNemoClawSettingsDone(): void {
  const fs = require('fs');
  const dir = path.dirname(NEMOCLAW_SETTINGS_FLAG);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(NEMOCLAW_SETTINGS_FLAG, new Date().toISOString());
}

let nemoSettingsResolver: ((settings: any) => void) | null = null;

function waitForNemoClawSettings(): Promise<any> {
  return new Promise((resolve) => {
    nemoSettingsResolver = resolve;
  });
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
              await spawnPtyTaskAsync('install-docker');
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
            await spawnPtyTaskAsync('install-nemoclaw');
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
            await spawnNemoClawOnboardAsync();
            break;
          }
          case 'nemoclaw-settings': {
            if (isNemoClawSettingsDone()) break;
            step.detail = 'Configure your agent...';
            sendSteps(steps);
            // Start the gateway first so user can test while configuring
            await manager.start();
            await new Promise(r => setTimeout(r, 500));

            const existingConfig = readSandboxConfig();
            mainWindow?.webContents.send('app:show-nemoclaw-settings', {
              hasNvidia: !!existingConfig?.models?.providers?.nvidia,
              hasOpenAI: !!existingConfig?.models?.providers?.openai,
              hasAnthropic: !!existingConfig?.models?.providers?.anthropic,
              agentName: existingConfig?.agents?.defaults?.name || '',
              channels: existingConfig?.channels || {},
            });
            const userSettings = await waitForNemoClawSettings();
            try {
              applySandboxSettings(userSettings);
              step.detail = 'Applying settings...';
              sendSteps(steps);
              // Wait for gateway to reload config
              await new Promise(r => setTimeout(r, 3000));
            } catch (err: any) {
              logApp('warn', `Failed to apply sandbox settings: ${err.message}`);
            }
            markNemoClawSettingsDone();
            break;
          }
          case 'openclaw-install': {
            if (findOpenClawBinary()) break;
            await spawnPtyTaskAsync('install');
            break;
          }
          case 'openclaw-setup': {
            if (!needsSetup()) break;
            await spawnPtyTaskAsync('onboard');
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

// Legacy spawnPtyTask kept for IPC pty:start-onboard handler
type PtyTask = 'install' | 'onboard' | 'install-nemoclaw' | 'setup-nemoclaw' | 'install-docker';

function spawnPtyTask(task: PtyTask): void {
  if (onboardPty) return;

  const command = getTaskCommand(task);
  if (!command) {
    logApp('error', `Cannot determine command for task "${task}"`);
    return;
  }

  const shellName = process.platform === 'win32' ? 'powershell.exe' : '/bin/zsh';
  logApp('info', `PTY task "${task}": ${command}`);

  const localBin = path.join(os.homedir(), '.local', 'bin');
  const envPath = process.env.PATH || '';
  const patchedPath = envPath.includes(localBin) ? envPath : `${localBin}:${envPath}`;

  onboardPty = pty.spawn(shellName, ['-c', command], {
    name: 'xterm-256color',
    cols: 100,
    rows: 30,
    cwd: os.homedir(),
    env: { ...process.env, TERM: 'xterm-256color', FORCE_COLOR: '1', PATH: patchedPath } as Record<string, string>,
  });

  logApp('info', `PTY spawned (PID ${onboardPty.pid}) for task "${task}"`);

  onboardPty.onData((data: string) => {
    mainWindow?.webContents.send('pty:data', data);
  });

  onboardPty.onExit(({ exitCode }) => {
    logApp('info', `PTY task "${task}" exited with code ${exitCode}`);
    onboardPty = null;
    mainWindow?.webContents.send('pty:exit', exitCode);

    if (exitCode === 0) {
      if (task === 'install-docker') {
        launchDockerDesktop();
        setTimeout(() => autoStart(), 4000);
      } else {
        setTimeout(() => autoStart(), 500);
      }
    }
  });
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

  ipcMain.handle('setup:needs-setup', () => needsSetup());

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

  ipcMain.handle('pty:start-docker-install', () => {
    if (onboardPty) return;
    spawnPtyTask('install-docker');
  });

  ipcMain.handle('app:launch-docker', () => launchDockerDesktop());

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

  ipcMain.handle('setup:submit-nemoclaw-settings', (_e, settings: any) => {
    if (nemoSettingsResolver) {
      nemoSettingsResolver(settings);
      nemoSettingsResolver = null;
    }
  });

  // PTY IPC (legacy fallback)
  ipcMain.handle('pty:start-onboard', () => {
    if (onboardPty) return;
    const pref = loadRuntime();
    const runtime = pref?.runtime || 'openclaw';

    if (runtime === 'nemoclaw') {
      const nemoBin = findNemoClawBinary();
      if (!nemoBin) {
        spawnPtyTask('install-nemoclaw');
      } else {
        spawnPtyTask('setup-nemoclaw');
      }
    } else {
      const bin = findOpenClawBinary();
      if (!bin) {
        spawnPtyTask('install');
      } else {
        spawnPtyTask('onboard');
      }
    }
  });

  ipcMain.on('pty:input', (_e, data: string) => {
    onboardPty?.write(data);
  });

  ipcMain.on('pty:resize', (_e, cols: number, rows: number) => {
    try { onboardPty?.resize(cols, rows); } catch {}
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

app.whenReady().then(() => {
  logApp('info', `Valnaa v${app.getVersion()} starting`);

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
  if (onboardPty) { try { onboardPty.kill(); } catch {} }
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
