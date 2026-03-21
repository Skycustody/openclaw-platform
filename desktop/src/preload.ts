import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('openclaw', {
  getStatus: () => ipcRenderer.invoke('agent:status'),
  start: () => ipcRenderer.invoke('agent:start'),
  stop: () => ipcRenderer.invoke('agent:stop'),
  restart: () => ipcRenderer.invoke('agent:restart'),
  getLogs: () => ipcRenderer.invoke('agent:logs'),
  getLogPath: () => ipcRenderer.invoke('agent:log-path'),
  openLogFile: () => ipcRenderer.invoke('agent:open-log-file'),
  getVersion: () => ipcRenderer.invoke('app:version'),
  signalReady: () => ipcRenderer.send('app:renderer-ready'),

  needsSetup: () => ipcRenderer.invoke('setup:needs-setup'),
  openExternal: (url: string) => ipcRenderer.invoke('app:open-external', url),
  /** Path, token, ports for manual Chrome setup (in-app card). */
  getChromeExtensionInfo: () => ipcRenderer.invoke('browser:get-chrome-extension-info'),
  revealChromeExtensionFolder: () => ipcRenderer.invoke('browser:reveal-extension-folder'),
  openChromeExtensionsPage: () => ipcRenderer.invoke('browser:open-chrome-extensions'),
  copyExtensionPath: () => ipcRenderer.invoke('browser:copy-extension-path'),
  copyGatewayToken: () => ipcRenderer.invoke('browser:copy-gateway-token'),
  saveChromeExtensionZip: () => ipcRenderer.invoke('browser:save-chrome-extension-zip'),
  copyChromeExtensionToDownloads: () => ipcRenderer.invoke('browser:copy-chrome-extension-to-downloads'),
  terminalSpawn: () => ipcRenderer.invoke('terminal:spawn'),
  terminalInput: (data: string) => ipcRenderer.send('terminal:input', data),
  terminalResize: (cols: number, rows: number) => ipcRenderer.send('terminal:resize', cols, rows),
  terminalKill: () => ipcRenderer.invoke('terminal:kill'),
  onTerminalData: (cb: (data: string) => void) => {
    const handler = (_: any, data: string) => cb(data);
    ipcRenderer.on('terminal:data', handler);
    return () => ipcRenderer.removeListener('terminal:data', handler);
  },
  onTerminalExit: (cb: (code: number) => void) => {
    const handler = (_: any, code: number) => cb(code);
    ipcRenderer.on('terminal:exit', handler);
    return () => ipcRenderer.removeListener('terminal:exit', handler);
  },

  // Auth
  getSession: () => ipcRenderer.invoke('auth:get-session'),
  startAuth: () => ipcRenderer.invoke('auth:start'),
  checkSubscription: () => ipcRenderer.invoke('auth:check-subscription'),
  logout: () => ipcRenderer.invoke('auth:logout'),
  openPricing: () => ipcRenderer.invoke('auth:open-pricing'),

  // Runtime
  getRuntime: () => ipcRenderer.invoke('runtime:get'),
  setRuntime: (runtime: string) => ipcRenderer.invoke('runtime:set', runtime),
  clearRuntime: () => ipcRenderer.invoke('runtime:clear'),
  retryAutoStart: () => ipcRenderer.invoke('app:retry-autostart'),

  // Data management
  getDataPaths: () => ipcRenderer.invoke('data:get-paths'),
  openDataFolder: (which: string) => ipcRenderer.invoke('data:open-folder', which),
  deleteAgentData: () => ipcRenderer.invoke('data:delete-agent'),

  onShowRuntimePicker: (cb: () => void) => {
    const handler = () => cb();
    ipcRenderer.on('app:show-runtime-picker', handler);
    return () => ipcRenderer.removeListener('app:show-runtime-picker', handler);
  },

  onShowNemoClawPrereq: (cb: (info: any) => void) => {
    const handler = (_: any, info: any) => cb(info);
    ipcRenderer.on('app:show-nemoclaw-prereq', handler);
    return () => ipcRenderer.removeListener('app:show-nemoclaw-prereq', handler);
  },

  onAuthResult: (cb: (result: any) => void) => {
    const handler = (_: any, result: any) => cb(result);
    ipcRenderer.on('app:auth-result', handler);
    return () => ipcRenderer.removeListener('app:auth-result', handler);
  },

  onShowAuth: (cb: () => void) => {
    const handler = () => cb();
    ipcRenderer.on('app:show-auth', handler);
    return () => ipcRenderer.removeListener('app:show-auth', handler);
  },

  onShowSubscribe: (cb: (info: any) => void) => {
    const handler = (_: any, info: any) => cb(info);
    ipcRenderer.on('app:show-subscribe', handler);
    return () => ipcRenderer.removeListener('app:show-subscribe', handler);
  },

  launchDocker: () => ipcRenderer.invoke('app:launch-docker'),
  openExternalSetupTask: (task: string) => ipcRenderer.invoke('setup:open-external-task', task),

  onShowSetup: (cb: (steps: any[]) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, steps: any[]) => cb(steps);
    ipcRenderer.on('app:show-setup', handler);
    return () => ipcRenderer.removeListener('app:show-setup', handler);
  },

  onSetupSteps: (cb: (steps: any[]) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, steps: any[]) => cb(steps);
    ipcRenderer.on('app:setup-steps', handler);
    return () => ipcRenderer.removeListener('app:setup-steps', handler);
  },

  // Inference API key
  submitApiKey: (provider: string, key: string) => ipcRenderer.invoke('setup:submit-api-key', provider, key),
  onShowApiKeyForm: (cb: (providers: any[]) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, providers: any[]) => cb(providers);
    ipcRenderer.on('app:show-api-key-form', handler);
    return () => ipcRenderer.removeListener('app:show-api-key-form', handler);
  },


  onStatus: (cb: (status: any) => void) => {
    const handler = (_: any, status: any) => cb(status);
    ipcRenderer.on('agent:status-update', handler);
    return () => ipcRenderer.removeListener('agent:status-update', handler);
  },

  onInstallProgress: (cb: (progress: any) => void) => {
    const handler = (_: any, progress: any) => cb(progress);
    ipcRenderer.on('agent:install-progress', handler);
    return () => ipcRenderer.removeListener('agent:install-progress', handler);
  },
});
