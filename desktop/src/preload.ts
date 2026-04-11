import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('openclaw', {
  getStatus: () => ipcRenderer.invoke('agent:status'),
  start: () => ipcRenderer.invoke('agent:start'),
  stop: () => ipcRenderer.invoke('agent:stop'),
  restart: () => ipcRenderer.invoke('agent:restart'),
  getLogs: () => ipcRenderer.invoke('agent:logs'),
  getLogPath: () => ipcRenderer.invoke('agent:log-path'),
  openLogFile: () => ipcRenderer.invoke('agent:open-log-file'),
  getActivityLog: () => ipcRenderer.invoke('agent:activity-log'),
  getExecAsk: () => ipcRenderer.invoke('settings:get-exec-ask'),
  setExecAsk: (mode: string) => ipcRenderer.invoke('settings:set-exec-ask', mode),
  claudeCodeStatus: () => ipcRenderer.invoke('settings:claude-code-status'),
  claudeCodeConnect: () => ipcRenderer.invoke('settings:claude-code-connect'),
  claudeCodeAuth: () => ipcRenderer.invoke('settings:claude-code-auth'),
  claudeCodeDisconnect: () => ipcRenderer.invoke('settings:claude-code-disconnect'),
  getClaudeThinking: () => ipcRenderer.invoke('settings:get-claude-thinking'),
  setClaudeThinking: (level: string) => ipcRenderer.invoke('settings:set-claude-thinking', level),
  getVersion: () => ipcRenderer.invoke('app:version'),
  /** Windows: open native app submenu from in-window menubar (client coords). */
  popupWinMenubarSubmenu: (index: number, x: number, y: number) =>
    ipcRenderer.invoke('app:popup-win-submenu', index, { x, y }),
  getMacFullscreen: () => ipcRenderer.invoke('app:get-mac-fullscreen'),
  onMacFullscreenChange: (cb: (fullScreen: boolean) => void) => {
    const handler = (_: Electron.IpcRendererEvent, fs: boolean) => cb(!!fs);
    ipcRenderer.on('app:mac-fullscreen', handler);
    return () => ipcRenderer.removeListener('app:mac-fullscreen', handler);
  },
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
  onBrowserDeferredUpdate: (cb: (updates: any) => void) => {
    const handler = (_: any, updates: any) => cb(updates);
    ipcRenderer.on('browser:deferred-update', handler);
    return () => ipcRenderer.removeListener('browser:deferred-update', handler);
  },
  // OpenShell TUI
  openshellSpawn: (size?: { cols: number; rows: number }) => ipcRenderer.invoke('openshell:spawn', size),
  openshellInput: (data: string) => ipcRenderer.send('openshell:input', data),
  openshellResize: (cols: number, rows: number) => ipcRenderer.send('openshell:resize', cols, rows),
  openshellKill: () => ipcRenderer.invoke('openshell:kill'),
  onOpenshellData: (cb: (data: string) => void) => {
    const handler = (_: any, data: string) => cb(data);
    ipcRenderer.on('openshell:data', handler);
    return () => ipcRenderer.removeListener('openshell:data', handler);
  },
  onOpenshellExit: (cb: (code: number) => void) => {
    const handler = (_: any, code: number) => cb(code);
    ipcRenderer.on('openshell:exit', handler);
    return () => ipcRenderer.removeListener('openshell:exit', handler);
  },

  terminalSpawn: (opts?: { sandbox?: boolean; wsl?: boolean }) => ipcRenderer.invoke('terminal:spawn', opts),
  terminalInput: (sessionId: string, data: string) => ipcRenderer.send('terminal:input', sessionId, data),
  terminalResize: (sessionId: string, cols: number, rows: number) => ipcRenderer.send('terminal:resize', sessionId, cols, rows),
  terminalKill: (sessionId: string) => ipcRenderer.invoke('terminal:kill', sessionId),
  onTerminalData: (cb: (sessionId: string, data: string) => void) => {
    const handler = (_: any, sessionId: string, data: string) => cb(sessionId, data);
    ipcRenderer.on('terminal:data', handler);
    return () => ipcRenderer.removeListener('terminal:data', handler);
  },
  onTerminalExit: (cb: (sessionId: string, code: number) => void) => {
    const handler = (_: any, sessionId: string, code: number) => cb(sessionId, code);
    ipcRenderer.on('terminal:exit', handler);
    return () => ipcRenderer.removeListener('terminal:exit', handler);
  },

  // Auth
  getSession: () => ipcRenderer.invoke('auth:get-session'),
  startAuth: () => ipcRenderer.invoke('auth:start'),
  checkSubscription: () => ipcRenderer.invoke('auth:check-subscription'),
  logout: () => ipcRenderer.invoke('auth:logout'),
  openPricing: () => ipcRenderer.invoke('auth:open-pricing'),
  startDesktopTrial: () => ipcRenderer.invoke('auth:start-desktop-trial'),
  getStripePortal: () => ipcRenderer.invoke('auth:get-stripe-portal'),
  getDesktopCheckout: () => ipcRenderer.invoke('auth:get-desktop-checkout'),

  // Runtime
  getRuntime: () => ipcRenderer.invoke('runtime:get'),
  setRuntime: (runtime: string) => ipcRenderer.invoke('runtime:set', runtime),
  clearRuntime: () => ipcRenderer.invoke('runtime:clear'),
  getSandboxName: () => ipcRenderer.invoke('runtime:sandbox-name'),
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

  // Setup in-app terminal
  setupTerminalInput: (data: string) => ipcRenderer.send('setup:terminal-input', data),
  setupTerminalResize: (cols: number, rows: number) => ipcRenderer.send('setup:terminal-resize', cols, rows),
  onSetupTerminalStart: (cb: () => void) => {
    const handler = () => cb();
    ipcRenderer.on('setup:terminal-start', handler);
    return () => ipcRenderer.removeListener('setup:terminal-start', handler);
  },
  onSetupTerminalData: (cb: (data: string) => void) => {
    const handler = (_: any, data: string) => cb(data);
    ipcRenderer.on('setup:terminal-data', handler);
    return () => ipcRenderer.removeListener('setup:terminal-data', handler);
  },
  onSetupTerminalExit: (cb: (code: number) => void) => {
    const handler = (_: any, code: number) => cb(code);
    ipcRenderer.on('setup:terminal-exit', handler);
    return () => ipcRenderer.removeListener('setup:terminal-exit', handler);
  },

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

  // Builder chat (agent creator LLM)
  builderChatSend: (message: string, systemPrompt: string, sessionKey?: string) => ipcRenderer.invoke('builder:chat-send', message, systemPrompt, sessionKey),
  onBuilderChatChunk: (cb: (chunk: string) => void) => {
    const handler = (_: any, chunk: string) => cb(chunk);
    ipcRenderer.on('builder:chat-chunk', handler);
    return () => ipcRenderer.removeListener('builder:chat-chunk', handler);
  },
  onBuilderChatDone: (cb: (fullText: string) => void) => {
    const handler = (_: any, fullText: string) => cb(fullText);
    ipcRenderer.on('builder:chat-done', handler);
    return () => ipcRenderer.removeListener('builder:chat-done', handler);
  },
  onBuilderChatError: (cb: (error: string) => void) => {
    const handler = (_: any, error: string) => cb(error);
    ipcRenderer.on('builder:chat-error', handler);
    return () => ipcRenderer.removeListener('builder:chat-error', handler);
  },

  // Inference API key
  submitApiKey: (provider: string, key: string) => ipcRenderer.invoke('setup:submit-api-key', provider, key),
  setOptionalModelKeys: (body: { openai?: string; anthropic?: string; activeProvider?: string; activeModel?: string }) =>
    ipcRenderer.invoke('settings:set-optional-model-keys', body),
  getInferenceInfo: () => ipcRenderer.invoke('settings:get-inference-info'),
  ocGetModelStatus: () => ipcRenderer.invoke('settings:oc-model-status'),
  ocSetModel: (model: string) => ipcRenderer.invoke('settings:oc-set-model', model),
  ocSetAgentModel: (agentId: string, model: string) => ipcRenderer.invoke('settings:oc-set-agent-model', agentId, model),
  ocSaveApiKey: (provider: string, key: string) => ipcRenderer.invoke('settings:oc-save-api-key', provider, key),
  ocRunOAuth: (provider: string) => ipcRenderer.invoke('settings:oc-run-oauth', provider),
  ocGetAgents: () => ipcRenderer.invoke('settings:oc-get-agents'),
  ocSetDefaultAgent: (agentId: string) => ipcRenderer.invoke('settings:oc-set-default-agent', agentId),
  ocAddChannel: (agentId: string, channel: string, token: string) => ipcRenderer.invoke('settings:oc-add-channel', agentId, channel, token),
  ocAddChannelNoToken: (agentId: string, channel: string) => ipcRenderer.invoke('settings:oc-add-channel-no-token', agentId, channel),
  ocRemoveChannel: (agentId: string, channel: string) => ipcRenderer.invoke('settings:oc-remove-channel', agentId, channel),
  onShowApiKeyForm: (
    cb: (payload: { providers: any[]; sectionTitle?: string; sectionSubtitle?: string } | any[]) => void,
  ) => {
    const handler = (_e: Electron.IpcRendererEvent, payload: any[] | Record<string, unknown>) => {
      if (Array.isArray(payload)) {
        cb({ providers: payload });
      } else {
        cb(payload as { providers: any[]; sectionTitle?: string; sectionSubtitle?: string });
      }
    };
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

  // Agents
  agentsList: () => ipcRenderer.invoke('agents:list'),
  agentsCatalog: () => ipcRenderer.invoke('agents:catalog'),
  agentsInstall: (id: string, soul: string, name: string) => ipcRenderer.invoke('agents:install', id, soul, name),
  agentsDelete: (id: string) => ipcRenderer.invoke('agents:delete', id),
  agentKill: (id: string) => ipcRenderer.invoke('agents:kill', id),
  agentGetEnv: (id: string) => ipcRenderer.invoke('agents:get-env', id),
  agentSaveEnv: (id: string, env: Record<string, string>) => ipcRenderer.invoke('agents:save-env', id, env),
  agentHealth: (id: string) => ipcRenderer.invoke('agents:health', id),

  // Hub & Approvals
  getPendingApprovals: () => ipcRenderer.invoke('hub:pending-approvals'),
  respondToApproval: (requestId: string, decision: string, reason?: string) =>
    ipcRenderer.invoke('hub:respond-approval', requestId, decision, reason),
  getHubStatus: () => ipcRenderer.invoke('hub:status'),
  onHubEvent: (cb: (event: any) => void) => {
    const handler = (_: any, event: any) => cb(event);
    ipcRenderer.on('hub:event', handler);
    return () => ipcRenderer.removeListener('hub:event', handler);
  },

  showConfirm: (message: string) => ipcRenderer.invoke('dialog:confirm', message),

  // Error reporting
  sendErrorReport: (report: { stepId: string; errorMessage: string; logs: string }) =>
    ipcRenderer.invoke('app:send-error-report', report),

  // Update
  onUpdateAvailable: (cb: (info: { version: string; canAutoInstall: boolean }) => void) => {
    const handler = (_: any, info: { version: string; canAutoInstall: boolean }) => cb(info);
    ipcRenderer.on('app:update-available', handler);
    return () => ipcRenderer.removeListener('app:update-available', handler);
  },
  installUpdate: () => ipcRenderer.invoke('app:install-update'),

});
