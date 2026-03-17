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

  // Auth
  getSession: () => ipcRenderer.invoke('auth:get-session'),
  startAuth: () => ipcRenderer.invoke('auth:start'),
  checkSubscription: () => ipcRenderer.invoke('auth:check-subscription'),
  logout: () => ipcRenderer.invoke('auth:logout'),
  openPricing: () => ipcRenderer.invoke('auth:open-pricing'),

  // Runtime
  getRuntime: () => ipcRenderer.invoke('runtime:get'),
  setRuntime: (runtime: string) => ipcRenderer.invoke('runtime:set', runtime),
  retryAutoStart: () => ipcRenderer.invoke('app:retry-autostart'),

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

  // PTY
  startOnboard: () => ipcRenderer.invoke('pty:start-onboard'),
  startDockerInstall: () => ipcRenderer.invoke('pty:start-docker-install'),
  launchDocker: () => ipcRenderer.invoke('app:launch-docker'),
  sendPtyInput: (data: string) => ipcRenderer.send('pty:input', data),
  resizePty: (cols: number, rows: number) => ipcRenderer.send('pty:resize', cols, rows),

  onPtyData: (cb: (data: string) => void) => {
    const handler = (_: any, data: string) => cb(data);
    ipcRenderer.on('pty:data', handler);
    return () => ipcRenderer.removeListener('pty:data', handler);
  },

  onPtyExit: (cb: (code: number) => void) => {
    const handler = (_: any, code: number) => cb(code);
    ipcRenderer.on('pty:exit', handler);
    return () => ipcRenderer.removeListener('pty:exit', handler);
  },

  onShowOnboard: (cb: () => void) => {
    const handler = () => cb();
    ipcRenderer.on('app:show-onboard', handler);
    return () => ipcRenderer.removeListener('app:show-onboard', handler);
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
