import { app, BrowserWindow, ipcMain, Tray, Menu, shell, nativeImage, dialog } from 'electron';
import path from 'path';
import os from 'os';
import { autoUpdater } from 'electron-updater';
import * as pty from 'node-pty';
import { manager, AgentStatus } from './openclaw/manager';
import { installOpenClaw, findOpenClawBinary, isNodeInstalled, getInstallScriptCommand, findNemoClawBinary, getNemoClawInstallScriptCommand, getNemoClawSetupScriptCommand } from './openclaw/installer';
import { readRecentLogs, getLogFilePath, logApp, closeStreams } from './openclaw/logger';
import { loadSession, saveSession, clearSession, checkSubscription, parseDeepLinkToken, parseDeepLinkEmail } from './lib/session';
import { loadRuntime, saveRuntime, clearRuntime, isNemoClawSupported, isDockerInstalled, isDockerRunning, canInstallDocker, getDockerInstallCommand, launchDockerDesktop, nemoClawNeedsSetup, getNemoClawSandboxStatus, RuntimeType } from './lib/runtime';

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

type PtyTask = 'install' | 'onboard' | 'install-nemoclaw' | 'setup-nemoclaw' | 'install-docker';

function spawnPtyTask(task: PtyTask): void {
  if (onboardPty) return;

  let command: string;
  const shellName = process.platform === 'win32' ? 'powershell.exe' : (process.env.SHELL || '/bin/zsh');

  if (task === 'install') {
    const hasNode = isNodeInstalled();
    if (!hasNode) {
      logApp('info', 'Node.js not found — using official install script (handles Node + OpenClaw)');
      command = getInstallScriptCommand();
    } else {
      const prefix = path.join(os.homedir(), '.local');
      logApp('info', 'Node.js found but OpenClaw missing — installing via npm');
      command = `npm install -g openclaw@latest --prefix ${prefix}`;
    }
  } else if (task === 'install-nemoclaw') {
    logApp('info', 'Installing NemoClaw via official script (includes install + setup wizard)');
    command = getNemoClawInstallScriptCommand();
  } else if (task === 'setup-nemoclaw') {
    logApp('info', 'Running NemoClaw setup (sandbox creation + inference config)');
    command = getNemoClawSetupScriptCommand();
  } else if (task === 'install-docker') {
    logApp('info', 'Installing Docker via platform package manager');
    command = getDockerInstallCommand();
  } else {
    const bin = findOpenClawBinary();
    if (!bin) {
      logApp('error', 'Cannot run onboard — OpenClaw binary not found');
      return;
    }
    command = `${bin} onboard`;
  }

  logApp('info', `PTY task "${task}": ${command}`);

  onboardPty = pty.spawn(shellName, ['-c', command], {
    name: 'xterm-256color',
    cols: 100,
    rows: 30,
    cwd: os.homedir(),
    env: { ...process.env, TERM: 'xterm-256color', FORCE_COLOR: '1' } as Record<string, string>,
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

  // PTY IPC
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

  const runtime = runtimePref.runtime;

  if (runtime === 'nemoclaw') {
    // NemoClaw flow: check prereqs → check binary → check sandbox → start
    if (!isDockerInstalled()) {
      logApp('warn', 'Docker not installed — cannot run NemoClaw');
      const canInstall = canInstallDocker();
      mainWindow?.webContents.send('app:show-nemoclaw-prereq', {
        error: 'Docker is required for NemoClaw but was not found.',
        hint: canInstall ? 'Click Install Docker to install it automatically.' : 'Install Docker Desktop from docker.com, then restart Valnaa.',
        dockerNotInstalled: true,
        dockerNotRunning: false,
        canInstallDocker: canInstall,
      });
      return;
    }

    if (!isDockerRunning()) {
      logApp('warn', 'Docker not running — cannot start NemoClaw sandbox');
      mainWindow?.webContents.send('app:show-nemoclaw-prereq', {
        error: 'Docker is installed but not running.',
        hint: 'Click Start Docker to launch it, then Try Again.',
        dockerNotInstalled: false,
        dockerNotRunning: true,
        canInstallDocker: false,
      });
      return;
    }

    const nemoBin = findNemoClawBinary();
    if (!nemoBin) {
      logApp('info', 'NemoClaw not found — showing install terminal');
      mainWindow?.webContents.send('app:show-onboard');
      return;
    }

    if (nemoClawNeedsSetup()) {
      logApp('info', 'NemoClaw sandbox not configured — showing setup terminal');
      mainWindow?.webContents.send('app:show-onboard');
      return;
    }

    logApp('info', 'Auto-starting NemoClaw...');
    await manager.start();
  } else {
    // OpenClaw flow
    const bin = findOpenClawBinary();
    if (!bin) {
      logApp('info', 'OpenClaw not found — showing install terminal');
      mainWindow?.webContents.send('app:show-onboard');
      return;
    }

    if (needsSetup()) {
      logApp('info', 'Setup not complete — showing onboard terminal');
      mainWindow?.webContents.send('app:show-onboard');
      return;
    }

    logApp('info', 'Auto-starting OpenClaw...');
    await manager.start();
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

  // Wait for renderer to signal ready (module scripts can load after did-finish-load)
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
