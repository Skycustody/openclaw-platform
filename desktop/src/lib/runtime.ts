import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync, spawnSync } from 'child_process';
import { getAppDataDir, IS_WIN, IS_MAC, getOpenClawDir } from './platform';
import { logApp } from '../openclaw/logger';
import { findAvailablePortPairSync } from './ports';

export type RuntimeType = 'openclaw' | 'nemoclaw';

export interface RuntimePreference {
  runtime: RuntimeType;
  savedAt: number;
}

const CONFIG_PATH = path.join(getAppDataDir(), 'runtime.json');

export function isIntelMac(): boolean {
  return IS_MAC && os.arch() === 'x64';
}

export function loadRuntime(): RuntimePreference | null {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const data = JSON.parse(raw);
    if (data.runtime === 'openclaw' || data.runtime === 'nemoclaw') {
      return data as RuntimePreference;
    }
  } catch { /* no config yet */ }
  return null;
}

export function saveRuntime(runtime: RuntimeType): void {
  const dir = path.dirname(CONFIG_PATH);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify({ runtime, savedAt: Date.now() } satisfies RuntimePreference));
}

export function clearRuntime(): void {
  try { fs.unlinkSync(CONFIG_PATH); } catch { /* ok */ }
}

export function isNemoClawSupported(): boolean {
  return true;
}

// ════════════════════════════════════
// OpenShell Docker Sidecar (Intel Mac)
// ════════════════════════════════════

const OPENSHELL_SIDECAR = 'openshell-cli';
const OPENSHELL_BIN_DIR = path.join(os.homedir(), '.local', 'lib', 'openshell');
const OPENSHELL_BIN = path.join(OPENSHELL_BIN_DIR, 'openshell-linux');
const OPENSHELL_WRAPPER = path.join(os.homedir(), '.local', 'bin', 'openshell');
const OPENSHELL_CONFIG_DIR = path.join(os.homedir(), '.config', 'openshell');

function execSyncSafe(cmd: string, timeoutMs = 30000): string {
  const { execSync } = require('child_process');
  const safeCmd = IS_WIN ? cmd.replace(/ 2>\/dev\/null/g, ' 2>NUL') : cmd;
  return execSync(safeCmd, { encoding: 'utf-8', timeout: timeoutMs, stdio: 'pipe', windowsHide: true }).trim();
}

export function isOpenShellInstalled(): boolean {
  try {
    const result = execSyncSafe('openshell --version 2>/dev/null', 10000);
    return result.includes('openshell');
  } catch {
    return false;
  }
}

export function isOpenShellSidecarRunning(): boolean {
  try {
    const result = execSyncSafe(`${dockerBin()} inspect ${OPENSHELL_SIDECAR} --format "{{.State.Running}}" 2>/dev/null`, 10000);
    return result === 'true';
  } catch {
    return false;
  }
}

function sidecarHasPort(port: number): boolean {
  try {
    const out = execSyncSafe(`${dockerBin()} port ${OPENSHELL_SIDECAR} ${port} 2>/dev/null`, 5000);
    return out.includes(String(port));
  } catch {
    return false;
  }
}

function sidecarHasPidHost(): boolean {
  try {
    const out = execSyncSafe(`${dockerBin()} inspect ${OPENSHELL_SIDECAR} --format "{{.HostConfig.PidMode}}" 2>/dev/null`, 5000);
    return out === 'host';
  } catch {
    return false;
  }
}

function sidecarHasInit(): boolean {
  try {
    const out = execSyncSafe(`${dockerBin()} inspect ${OPENSHELL_SIDECAR} --format "{{.HostConfig.Init}}" 2>/dev/null`, 5000);
    return out === 'true';
  } catch {
    return false;
  }
}

/**
 * Check if the sidecar is fully configured:
 * - openshell binary works
 * - Container is running
 * - Port 18789 is published
 * - NOT using --pid host (causes false port conflicts)
 */
function sidecarHasNemoClawBlueprint(): boolean {
  // The blueprint/policies live under ~/.nemoclaw/source (git-cloned by nemoclaw),
  // NOT under the npm package root.
  const sourceDir = path.join(os.homedir(), '.nemoclaw', 'source');
  const policyPath = path.join(sourceDir, 'nemoclaw-blueprint', 'policies', 'openclaw-sandbox.yaml');
  if (!fs.existsSync(policyPath)) return false;
  try {
    execSyncSafe(`${dockerBin()} exec ${OPENSHELL_SIDECAR} test -f "${policyPath}"`, 5000);
    return true;
  } catch {
    return false;
  }
}

export function isSidecarReady(): boolean {
  if (!isOpenShellInstalled()) return false;
  if (!isOpenShellSidecarRunning()) return false;
  if (!sidecarHasPort(_activeGatewayPort)) return false;
  if (!sidecarHasPort(_activeRelayPort)) return false;
  if (sidecarHasPidHost()) return false;
  if (!sidecarHasInit()) return false;
  if (findNemoClawPackageRoot() && !sidecarHasNemoClawBlueprint()) return false;
  return true;
}

export async function setupOpenShellSidecar(onProgress?: (msg: string) => void): Promise<void> {
  const { execSync } = require('child_process');
  const dk = dockerBin();
  const report = (msg: string) => { logApp('info', `[openshell-sidecar] ${msg}`); onProgress?.(msg); };

  if (!isIntelMac()) {
    report('Not Intel Mac — skipping sidecar setup');
    return;
  }

  // 1. Download Linux x86_64 openshell binary
  if (!fs.existsSync(OPENSHELL_BIN)) {
    report('Downloading OpenShell binary...');
    fs.mkdirSync(OPENSHELL_BIN_DIR, { recursive: true });
    execSync(
      `curl -LsSf https://github.com/NVIDIA/OpenShell/releases/download/v0.0.10/openshell-x86_64-unknown-linux-musl.tar.gz | tar xz -C "${OPENSHELL_BIN_DIR}/" && mv "${OPENSHELL_BIN_DIR}/openshell" "${OPENSHELL_BIN}"`,
      { timeout: 60000, stdio: 'pipe', windowsHide: true }
    );
    fs.chmodSync(OPENSHELL_BIN, 0o755);
    report('Binary downloaded');
  }

  // 2. Create config dir
  fs.mkdirSync(OPENSHELL_CONFIG_DIR, { recursive: true });

  // 3. Create/ensure the sidecar container.
  //    - Publish gateway + relay ports so openshell forward is reachable from the host.
  //    - NO --pid host: it causes openshell forward to see k3s pod ports as
  //      "in use" (false positive from the host PID namespace), blocking the
  //      port forward. openshell uses the Docker socket, not host PIDs.

  // Resolve available host ports (tries to free defaults, falls back to alternatives).
  const ports = findAvailablePortPairSync(true);
  setActivePorts(ports.gateway, ports.relay);

  const needsRecreate = !isOpenShellSidecarRunning()
    || !sidecarHasPort(_activeGatewayPort)
    || !sidecarHasPort(_activeRelayPort)
    || sidecarHasPidHost()
    || !sidecarHasInit();
  if (needsRecreate) {
    report('Setting up Docker sidecar...');
    for (let attempt = 0; attempt < 3; attempt++) {
      try { execSync(`${dk} rm -f ${OPENSHELL_SIDECAR} 2>/dev/null`, { stdio: 'pipe', windowsHide: true, timeout: 15000 }); break; } catch {
        try { execSync(`${dk} stop ${OPENSHELL_SIDECAR} 2>/dev/null && ${dk} rm ${OPENSHELL_SIDECAR} 2>/dev/null`, { stdio: 'pipe', windowsHide: true, timeout: 15000 }); break; } catch { /* retry */ }
      }
    }

    // Mount the host temp dir so openshell can read build contexts created
    // by nemoclaw onboard. /var/folders is in Docker Desktop's default shares.
    const tmpDir = os.tmpdir().replace(/\/+$/, '');
    const tmpMount = tmpDir ? `-v "${tmpDir}:${tmpDir}"` : '';
    const nemoClawPkgRoot = findNemoClawPackageRoot();
    const resolvedPkg = nemoClawPkgRoot ? fs.realpathSync(nemoClawPkgRoot) : null;
    const sourceMount = resolvedPkg ? `-v "${resolvedPkg}:${resolvedPkg}:ro"` : '';
    const symlinkMount = (nemoClawPkgRoot && resolvedPkg && resolvedPkg !== nemoClawPkgRoot)
      ? `-v "${resolvedPkg}:${nemoClawPkgRoot}:ro"` : '';
    const nemoClawDataDir = path.join(os.homedir(), '.nemoclaw');
    fs.mkdirSync(nemoClawDataDir, { recursive: true });
    const nemoClawMount = `-v "${nemoClawDataDir}:${nemoClawDataDir}"`;

    if (ports.gateway !== OPENCLAW_PORT || ports.relay !== EXTENSION_RELAY_PORT) {
      report(`Default ports busy; using ${ports.gateway}/${ports.relay}`);
    }

    execSync(
      `${dk} create --name ${OPENSHELL_SIDECAR} --init ` +
      `-v /var/run/docker.sock:/var/run/docker.sock ` +
      `-v "${OPENSHELL_CONFIG_DIR}:/root/.config/openshell" ` +
      `-v "${OPENSHELL_BIN}:/usr/local/bin/openshell:ro" ` +
      `${tmpMount} ${sourceMount} ${symlinkMount} ${nemoClawMount} ` +
      `--add-host "host.docker.internal:host-gateway" ` +
      `-p ${_activeGatewayPort}:${OPENCLAW_PORT} ` +
      `-p ${_activeRelayPort}:${EXTENSION_RELAY_PORT} ` +
      `alpine:latest sleep infinity`,
      { timeout: 30000, stdio: 'pipe', windowsHide: true }
    );
    execSync(`${dk} start ${OPENSHELL_SIDECAR}`, { timeout: 10000, stdio: 'pipe', windowsHide: true });

    report('Installing networking tools...');
    execSync(`${dk} exec ${OPENSHELL_SIDECAR} apk add --no-cache socat openssh-client`, { timeout: 60000, stdio: 'pipe', windowsHide: true });

    report('Sidecar ready');
  }

  // NemoClaw source + package root are bind-mounted (ro), so no copy needed.

  // 4. Start socat forwarder (port 8080 inside sidecar → host gateway)
  try {
    const listening = execSyncSafe(`${dk} exec ${OPENSHELL_SIDECAR} sh -c "ss -tln | grep :8080 || true"`, 5000);
    if (!listening.includes(':8080')) {
      execSync(`${dk} exec -d ${OPENSHELL_SIDECAR} socat TCP-LISTEN:8080,fork,reuseaddr TCP:host.docker.internal:8080`, { timeout: 5000, stdio: 'pipe', windowsHide: true });
    }
  } catch { /* socat may already be running */ }

  // 5. Create wrapper script at ~/.local/bin/openshell
  //    The wrapper itself resolves docker at runtime via the patched PATH.
  const wrapperDir = path.dirname(OPENSHELL_WRAPPER);
  fs.mkdirSync(wrapperDir, { recursive: true });
  const resolvedDockerForWrapper = findDockerBin() || 'docker';
  const wrapperScript = [
    '#!/bin/sh',
    `DOCKER="${resolvedDockerForWrapper}"`,
    `if ! "$DOCKER" inspect ${OPENSHELL_SIDECAR} --format "{{.State.Running}}" 2>/dev/null | grep -q true; then`,
    `  "$DOCKER" start ${OPENSHELL_SIDECAR} >/dev/null 2>&1`,
    'fi',
    'DOCKER_FLAGS="-i"',
    'if [ -t 0 ]; then DOCKER_FLAGS="-it"; fi',
    `exec "$DOCKER" exec $DOCKER_FLAGS ${OPENSHELL_SIDECAR} /usr/local/bin/openshell "$@"`,
    '',
  ].join('\n');
  fs.writeFileSync(OPENSHELL_WRAPPER, wrapperScript, { mode: 0o755 });

  // Verify
  try {
    const ver = execSyncSafe(`"${OPENSHELL_WRAPPER}" --version`, 15000);
    report(`OpenShell ready: ${ver}`);
  } catch (err: any) {
    throw new Error(`OpenShell sidecar verification failed: ${err.message}`);
  }
}

export function ensureSidecarNetworking(): void {
  if (!isIntelMac() || !isOpenShellSidecarRunning()) return;
  const { execSync } = require('child_process');
  const dk = dockerBin();
  try {
    execSync(`${dk} network connect openshell-cluster-nemoclaw ${OPENSHELL_SIDECAR} 2>/dev/null`, { stdio: 'pipe', windowsHide: true, timeout: 5000 });
  } catch { /* already connected or network doesn't exist yet */ }

  try {
    const listening = execSyncSafe(`${dk} exec ${OPENSHELL_SIDECAR} sh -c "ss -tln | grep :8080 || true"`, 5000);
    if (!listening.includes(':8080')) {
      execSync(`${dk} exec -d ${OPENSHELL_SIDECAR} socat TCP-LISTEN:8080,fork,reuseaddr TCP:host.docker.internal:8080`, { timeout: 5000, stdio: 'pipe', windowsHide: true });
    }
  } catch { /* ok */ }
}

// ════════════════════════════════════
// Inference Provider Configuration
// ════════════════════════════════════

export type InferenceProvider = 'openai' | 'anthropic' | 'nvidia';

const PROVIDER_CONFIG: Record<InferenceProvider, { credentialKey: string; defaultModel: string }> = {
  openai:    { credentialKey: 'OPENAI_API_KEY',    defaultModel: 'gpt-4o' },
  anthropic: { credentialKey: 'ANTHROPIC_API_KEY',  defaultModel: 'claude-sonnet-4-20250514' },
  nvidia:    { credentialKey: 'NVIDIA_API_KEY',     defaultModel: 'nvidia/llama-3.1-nemotron-ultra-253b-v1' },
};

function openshellExec(args: string, timeoutMs = 30000): string {
  if (isIntelMac() && isOpenShellSidecarRunning()) {
    return execSyncSafe(`${dockerBin()} exec ${OPENSHELL_SIDECAR} /usr/local/bin/openshell ${args}`, timeoutMs);
  }
  if (IS_WIN) {
    return execSyncSafe(`wsl openshell ${args}`, timeoutMs);
  }
  return execSyncSafe(`openshell ${args}`, timeoutMs);
}

const GATEWAY_NAME = 'nemoclaw';

let openshellSandboxExecCached: string | null = null;

/**
 * OpenShell CLI subcommand to exec into the sandbox (`openshell <this> <sandbox> --gateway … -- cmd`).
 * Newer builds use `ssh-proxy` instead of `ssh`. Probed once per process unless
 * `OPENSHELL_SANDBOX_EXEC` is set (use `ssh` for legacy CLIs).
 */
export function getOpenshellSandboxExec(): string {
  if (openshellSandboxExecCached !== null) {
    return openshellSandboxExecCached;
  }
  const env = process.env.OPENSHELL_SANDBOX_EXEC?.trim();
  if (env) {
    openshellSandboxExecCached = env;
    logApp('info', `OpenShell sandbox exec (OPENSHELL_SANDBOX_EXEC): ${env}`);
    return env;
  }
  if (IS_WIN) {
    const r = spawnSync('wsl', ['openshell', 'ssh'], {
      encoding: 'utf8',
      timeout: 8000,
      maxBuffer: 64 * 1024,
      stdio: 'pipe',
      windowsHide: true,
    });
    if ((r.error as { code?: string } | undefined)?.code === 'ENOENT') {
      openshellSandboxExecCached = 'ssh';
      logApp('warn', 'WSL not available; defaulting to ssh for sandbox exec');
      return openshellSandboxExecCached;
    }
    const out = `${r.stdout || ''}${r.stderr || ''}`;
    if (/unrecognized subcommand.*ssh/i.test(out) && /ssh-proxy/i.test(out)) {
      openshellSandboxExecCached = 'ssh-proxy';
    } else {
      openshellSandboxExecCached = 'ssh';
    }
    logApp('info', `OpenShell sandbox exec (WSL, detected): ${openshellSandboxExecCached}`);
    return openshellSandboxExecCached;
  }
  const r = spawnSync('openshell', ['ssh'], {
    encoding: 'utf8',
    timeout: 8000,
    maxBuffer: 64 * 1024,
  });
  if ((r.error as { code?: string } | undefined)?.code === 'ENOENT') {
    openshellSandboxExecCached = 'ssh-proxy';
    logApp('warn', 'openshell not on PATH; assuming ssh-proxy for sandbox exec');
    return openshellSandboxExecCached;
  }
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  if (/unrecognized subcommand.*ssh/i.test(out) && /ssh-proxy/i.test(out)) {
    openshellSandboxExecCached = 'ssh-proxy';
  } else {
    openshellSandboxExecCached = 'ssh';
  }
  logApp('info', `OpenShell sandbox exec (detected): ${openshellSandboxExecCached}`);
  return openshellSandboxExecCached;
}

const GATEWAY_CLUSTER_CONTAINER = `openshell-cluster-${GATEWAY_NAME}`;

export function isGatewayClusterContainerRunning(): boolean {
  try {
    const out = execSyncSafe(
      `${dockerBin()} inspect ${GATEWAY_CLUSTER_CONTAINER} --format "{{.State.Running}}" 2>/dev/null`,
      8000,
    );
    return out === 'true';
  } catch {
    return false;
  }
}

export function isGatewayDeployed(): boolean {
  try {
    const out = openshellExec(`gateway info --gateway ${GATEWAY_NAME}`, 5000);
    return /endpoint/i.test(out);
  } catch {
    return false;
  }
}

export function isInferenceConfigured(): boolean {
  if (!isGatewayDeployed()) return false;
  try {
    ensureSidecarNetworking();
    const out = openshellExec(`inference get --gateway ${GATEWAY_NAME}`, 15000);
    const gwSection = out.split(/system inference/i)[0] || out;
    if (/no active gateway|no inference/i.test(gwSection)) return false;
    return /provider:/i.test(gwSection);
  } catch {
    return false;
  }
}

export function configureInferenceProvider(provider: InferenceProvider, apiKey: string): void {
  const cfg = PROVIDER_CONFIG[provider];
  if (!cfg) throw new Error(`Unknown provider: ${provider}`);

  logApp('info', `Configuring inference provider: ${provider} (gateway: ${GATEWAY_NAME})`);

  ensureSidecarNetworking();

  try { openshellExec(`provider delete ${provider} --gateway ${GATEWAY_NAME}`, 10000); } catch { /* ok */ }

  openshellExec(
    `provider create --name ${provider} --type ${provider} --credential ${cfg.credentialKey}=${apiKey} --gateway ${GATEWAY_NAME}`,
    30000,
  );

  openshellExec(
    `inference set --provider ${provider} --model ${cfg.defaultModel} --gateway ${GATEWAY_NAME} --no-verify`,
    15000,
  );

  logApp('info', `Inference configured: ${provider} / ${cfg.defaultModel}`);
}

// ════════════════════════════════════
// NemoClaw Sandbox Checks
// ════════════════════════════════════

const OPENCLAW_PORT = 18789;
/** Extension relay port (gateway + 3) for Chrome extension to connect. */
const EXTENSION_RELAY_PORT = 18792;

/**
 * Active port state — may differ from defaults when the default ports are busy.
 * All sidecar, port forward, and manager code should use getActiveGatewayPort() / getActiveRelayPort().
 */
let _activeGatewayPort = OPENCLAW_PORT;
let _activeRelayPort = EXTENSION_RELAY_PORT;

export function getActiveGatewayPort(): number { return _activeGatewayPort; }
export function getActiveRelayPort(): number { return _activeRelayPort; }

export function setActivePorts(gateway: number, relay: number): void {
  if (gateway !== _activeGatewayPort || relay !== _activeRelayPort) {
    logApp('info', `Active ports changed: gateway ${_activeGatewayPort}→${gateway}, relay ${_activeRelayPort}→${relay}`);
  }
  _activeGatewayPort = gateway;
  _activeRelayPort = relay;
}

/** Managed child processes for WSL port forwards (Windows only). */
const wslForwardChildren: any[] = [];

/**
 * Resolve the sandbox name from ~/.nemoclaw/sandboxes.json (defaultSandbox or first key).
 * If the registry is missing, try `openshell sandbox list` to discover a live sandbox.
 * Only falls back to a generic name as a last resort.
 */
function resolveSandboxName(): string {
  try {
    let data: any;
    if (IS_WIN) {
      const raw = execSyncSafe('wsl bash -c "cat ~/.nemoclaw/sandboxes.json 2>/dev/null"', 5000);
      data = JSON.parse(raw);
    } else {
      const registryPath = path.join(os.homedir(), '.nemoclaw', 'sandboxes.json');
      data = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
    }
    if (data.defaultSandbox && data.sandboxes?.[data.defaultSandbox]) {
      return data.defaultSandbox;
    }
    const names = Object.keys(data.sandboxes || {});
    if (names.length > 0) return names[0];
  } catch { /* file not yet created */ }

  try {
    const listOut = execSyncSafe('openshell sandbox list 2>/dev/null', 8000);
    const discovered = autoRegisterLiveSandbox(listOut);
    if (discovered) return discovered;
  } catch { /* openshell not available yet */ }

  return 'default';
}

let _resolvedSandboxName: string | null = null;

function getSandboxName(): string {
  if (!_resolvedSandboxName) {
    _resolvedSandboxName = resolveSandboxName();
    logApp('info', `Resolved sandbox name: ${_resolvedSandboxName}`);
  }
  return _resolvedSandboxName;
}

/** Resolved NemoClaw sandbox id for openshell ssh-proxy / PTY spawns. */
export function getNemoClawSandboxName(): string {
  return getSandboxName();
}

/** Force re-read of sandbox name (e.g. after onboard completes). */
export function clearSandboxNameCache(): void {
  _resolvedSandboxName = null;
}

/**
 * Returns { shell, args } for spawning an interactive PTY session inside
 * the NemoClaw sandbox.  On Intel Mac, goes through the Docker sidecar
 * (docker exec … ssh openshell-<sandbox>).  On ARM Mac, uses
 * `openshell ssh-proxy <sandbox> --gateway nemoclaw`.
 */
export function getSandboxShellCommand(): { shell: string; args: string[] } | null {
  const sandbox = getSandboxName();
  if (isIntelMac() && isOpenShellSidecarRunning()) {
    return {
      shell: 'docker',
      args: [
        'exec', '-it', OPENSHELL_SIDECAR,
        'ssh',
        '-o', 'StrictHostKeyChecking=no',
        '-o', 'UserKnownHostsFile=/dev/null',
        '-o', 'LogLevel=ERROR',
        '-t',
        `openshell-${sandbox}`,
      ],
    };
  }
  if (IS_WIN) {
    // node-pty joins args into a single command line; wsl passes them to ssh.
    // Use "bash -c '...'" so the ProxyCommand value with spaces is preserved.
    const proxy = `openshell ssh-proxy --gateway-name ${GATEWAY_NAME} --name ${sandbox}`;
    return {
      shell: 'wsl.exe',
      args: [
        'ssh', '-t',
        '-o', `ProxyCommand=${proxy}`,
        '-o', 'StrictHostKeyChecking=no',
        '-o', 'UserKnownHostsFile=/dev/null',
        '-o', 'LogLevel=ERROR',
        `sandbox@openshell-${sandbox}`,
      ],
    };
  }
  const oshBin = fs.existsSync(path.join(os.homedir(), '.local', 'bin', 'openshell'))
    ? path.join(os.homedir(), '.local', 'bin', 'openshell')
    : 'openshell';
  const proxy = `${oshBin} ssh-proxy --gateway-name ${GATEWAY_NAME} --name ${sandbox}`;
  return {
    shell: 'ssh',
    args: ['-t', '-o', `ProxyCommand=${proxy}`, '-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=/dev/null', '-o', 'LogLevel=ERROR', `sandbox@openshell-${sandbox}`],
  };
}

/**
 * After onboard, check if the "policies" step failed and apply the selected
 * presets directly via `openshell policy set`. NemoClaw's onboard tries to
 * apply policy presets in step [7/7], but if the sandbox wasn't ready yet it
 * exits with an error — leaving npm/pypi/etc blocked by the firewall.
 *
 * This reads the baseline policy + preset YAMLs from the NemoClaw source tree,
 * merges them, and applies the combined policy to the running sandbox.
 */
export function applyFailedPolicyPresets(): boolean {
  try {
    const sessionPath = IS_WIN
      ? null
      : path.join(os.homedir(), '.nemoclaw', 'onboard-session.json');
    if (!sessionPath || !fs.existsSync(sessionPath)) return false;

    const session = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
    const presets: string[] = session.policyPresets || [];
    if (presets.length === 0) return false;

    const policiesStep = session.steps?.policies;
    if (policiesStep?.status === 'complete') {
      logApp('info', 'Policy presets already applied (session shows complete)');
      return true;
    }

    const sourceDir = path.join(os.homedir(), '.nemoclaw', 'source');
    const baselinePath = path.join(sourceDir, 'nemoclaw-blueprint', 'policies', 'openclaw-sandbox.yaml');
    if (!fs.existsSync(baselinePath)) {
      logApp('warn', `Cannot apply policy presets — baseline not found: ${baselinePath}`);
      return false;
    }

    let merged = fs.readFileSync(baselinePath, 'utf-8');
    const presetsDir = path.join(sourceDir, 'nemoclaw-blueprint', 'policies', 'presets');

    for (const preset of presets) {
      const presetPath = path.join(presetsDir, `${preset}.yaml`);
      if (!fs.existsSync(presetPath)) {
        logApp('warn', `Policy preset file not found, skipping: ${presetPath}`);
        continue;
      }
      const raw = fs.readFileSync(presetPath, 'utf-8');
      const lines = raw.split('\n');
      const npIdx = lines.findIndex(l => /^network_policies:\s*$/.test(l));
      if (npIdx < 0) {
        logApp('warn', `No network_policies section in preset ${preset}, skipping`);
        continue;
      }
      // Everything after the `network_policies:` header belongs to the preset's policies
      const policyLines = lines.slice(npIdx + 1);
      merged += '\n' + policyLines.join('\n');
      logApp('info', `Merged policy preset: ${preset}`);
    }

    // Use the sandbox name from the onboard session — it may differ from
    // the defaultSandbox in sandboxes.json (e.g. old "cd" vs new "df").
    const sandboxName = session.sandboxName || getSandboxName();
    logApp('info', `Applying policy presets to sandbox: ${sandboxName}`);
    const tmpPolicy = path.join(os.tmpdir(), `nemoclaw-merged-policy-${Date.now()}.yaml`);
    fs.writeFileSync(tmpPolicy, merged, 'utf-8');

    try {
      let policyPathForCli = tmpPolicy;

      // On Intel Mac the openshell CLI runs inside the Docker sidecar;
      // the host's /tmp is not mounted. Copy the file in and reference
      // the container-internal path.
      if (isIntelMac() && isOpenShellSidecarRunning()) {
        const containerPath = '/tmp/merged-policy.yaml';
        execSyncSafe(`${dockerBin()} cp "${tmpPolicy}" ${OPENSHELL_SIDECAR}:${containerPath}`, 10000);
        policyPathForCli = containerPath;
      }

      const out = openshellExec(
        `policy set --gateway ${GATEWAY_NAME} --policy ${policyPathForCli} ${sandboxName} --wait --timeout 30`,
        60000,
      );
      logApp('info', `Policy presets applied successfully: ${out.trim()}`);

      // Mark the session as having completed policies so we don't retry
      try {
        session.steps.policies = { status: 'complete', completedAt: new Date().toISOString(), error: null };
        session.lastCompletedStep = 'policies';
        session.status = 'complete';
        delete session.failure;
        fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2), 'utf-8');
      } catch { /* non-fatal */ }

      // Sync defaultSandbox so the rest of the app uses the right one
      if (session.sandboxName) {
        try {
          const regPath = path.join(os.homedir(), '.nemoclaw', 'sandboxes.json');
          const reg = JSON.parse(fs.readFileSync(regPath, 'utf-8'));
          if (reg.defaultSandbox !== session.sandboxName && reg.sandboxes?.[session.sandboxName]) {
            reg.defaultSandbox = session.sandboxName;
            fs.writeFileSync(regPath, JSON.stringify(reg, null, 2), 'utf-8');
            clearSandboxNameCache();
            logApp('info', `Updated defaultSandbox to "${session.sandboxName}"`);
          }
        } catch { /* non-fatal */ }
      }

      return true;
    } catch (e: any) {
      logApp('warn', `openshell policy set failed: ${e.message}`);
      return false;
    } finally {
      try { fs.unlinkSync(tmpPolicy); } catch { /* ok */ }
    }
  } catch (e: any) {
    logApp('warn', `applyFailedPolicyPresets error: ${e.message}`);
    return false;
  }
}

/** Check if a sandbox exists and is Ready inside the openshell gateway. */
export function isSandboxReady(): boolean {
  try {
    const out = openshellExec(`sandbox list --gateway ${GATEWAY_NAME}`, 10000);
    return /ready/i.test(out) && !/no sandboxes/i.test(out);
  } catch {
    return false;
  }
}

/**
 * Poll until `isSandboxReady()` is true or timeout.
 * `isOnboardComplete()` can be true from `sandboxes.json` alone while the
 * cluster is still booting; the agent must not fail immediately on Start.
 */
export async function waitForSandboxReady(timeoutMs = 180_000, intervalMs = 2000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (isIntelMac()) {
        ensureSidecarNetworking();
      }
    } catch {
      /* ok */
    }
    if (isSandboxReady()) {
      return true;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

/**
 * Check if `nemoclaw onboard` has been completed:
 * - Gateway deployed
 * - Cluster container running
 * - At least one sandbox registered in ~/.nemoclaw/sandboxes.json
 *   OR a live sandbox visible via `openshell sandbox list` as Ready
 *
 * Note: sandboxes.json can be populated before the sandbox reaches Ready in
 * the cluster; `waitForSandboxReady` / `isSandboxReady` gate actually starting
 * the agent.
 */
export function isOnboardComplete(): boolean {
  if (!isGatewayDeployed()) return false;

  // The k3d cluster container must actually be running; after a Docker restart
  // the container disappears even though gateway metadata and sandboxes.json
  // still exist on disk, causing the app to skip re-onboard.
  if (!isGatewayClusterContainerRunning()) return false;

  try {
    if (IS_WIN) {
      // On Windows, sandboxes.json lives inside WSL — read it via wsl
      const wslData = execSyncSafe('wsl bash -c "cat ~/.nemoclaw/sandboxes.json 2>/dev/null"', 5000);
      const data = JSON.parse(wslData);
      if (Object.keys(data.sandboxes || {}).length > 0) return true;
    } else {
      const registryPath = path.join(os.homedir(), '.nemoclaw', 'sandboxes.json');
      const data = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
      if (Object.keys(data.sandboxes || {}).length > 0) return true;
    }
  } catch { /* fall through to live check */ }

  // Fallback: check for a live sandbox even if the registry file is missing
  // (can happen if onboard was interrupted after sandbox creation but before registration)
  try {
    const out = openshellExec(`sandbox list --gateway ${GATEWAY_NAME}`, 10000);
    if (/ready/i.test(out) && !/no sandboxes/i.test(out)) {
      const sandboxName = autoRegisterLiveSandbox(out);
      if (sandboxName) {
        logApp('info', `Auto-registered live sandbox "${sandboxName}" into sandboxes.json`);
      }
      return true;
    }
  } catch { /* not reachable or no sandbox */ }

  return false;
}

/**
 * Parse the first sandbox name from `openshell sandbox list` output and
 * write it to ~/.nemoclaw/sandboxes.json so subsequent checks are fast.
 */
function autoRegisterLiveSandbox(listOutput: string): string | null {
  try {
    const lines = listOutput.split(/\r?\n/).map(l => l.replace(/\x1b\[[0-9;]*m/g, '').trim()).filter(Boolean);
    for (const line of lines) {
      const cols = line.split(/\s+/);
      if (cols.length >= 2 && cols.includes('Ready') && !cols.includes('NotReady') && cols[0] !== 'NAME') {
        const name = cols[0];
        const obj = { sandboxes: { [name]: { name, createdAt: new Date().toISOString(), model: null, gpuEnabled: false } }, defaultSandbox: name };
        if (IS_WIN) {
          const b64 = Buffer.from(JSON.stringify(obj, null, 2)).toString('base64');
          execSyncSafe(`wsl bash -c "mkdir -p ~/.nemoclaw && echo '${b64}' | base64 -d > ~/.nemoclaw/sandboxes.json"`, 5000);
        } else {
          const registryPath = path.join(os.homedir(), '.nemoclaw', 'sandboxes.json');
          const dir = path.dirname(registryPath);
          fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
          fs.writeFileSync(registryPath, JSON.stringify(obj, null, 2), { mode: 0o600 });
        }
        return name;
      }
    }
  } catch (err: any) {
    logApp('warn', `autoRegisterLiveSandbox failed: ${err.message}`);
  }
  return null;
}

let cachedSandboxToken: string | null = null;
let sandboxTokenLastFailAt = 0;
const SANDBOX_TOKEN_FAIL_COOLDOWN_MS = 30000;

const SANDBOX_CONFIG_PATH = '/sandbox/.openclaw/openclaw.json';

/** Match what the OpenClaw gateway + browser relay expect (trim, strip stray quotes). */
function normalizeGatewayToken(value: unknown): string | null {
  if (value == null) return null;
  let s = typeof value === 'string' ? value.trim() : String(value).trim();
  if (!s) return null;
  if (
    (s.startsWith('"') && s.endsWith('"') && s.length >= 2) ||
    (s.startsWith("'") && s.endsWith("'") && s.length >= 2)
  ) {
    s = s.slice(1, -1).trim();
  }
  return s || null;
}

/**
 * Read the gateway auth token from the NemoClaw sandbox's openclaw.json.
 * Uses the same SSH path as all other sandbox ops so Intel sidecar & ARM stay consistent.
 * Falls back to `openclaw config get gateway.auth.token` (authoritative for some CLI versions).
 */
export function readSandboxGatewayToken(): string | null {
  if (cachedSandboxToken) return cachedSandboxToken;
  if (Date.now() - sandboxTokenLastFailAt < SANDBOX_TOKEN_FAIL_COOLDOWN_MS) return null;

  try {
    const raw = sandboxSSH(`cat ${SANDBOX_CONFIG_PATH}`);
    const cfg = JSON.parse(raw);
    let token = normalizeGatewayToken(cfg?.gateway?.auth?.token);

    if (!token) {
      try {
        const cliRaw = sandboxSSH('openclaw config get gateway.auth.token', 20000);
        const lines = cliRaw
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l.length > 0);
        token = normalizeGatewayToken(lines[lines.length - 1] ?? cliRaw.trim());
      } catch {
        /* optional fallback */
      }
    }

    cachedSandboxToken = token;
    sandboxTokenLastFailAt = 0;
  } catch (err: any) {
      sandboxTokenLastFailAt = Date.now();
      logApp('warn', `Failed to read sandbox gateway token: ${err.message}`);
      return null;
    }

  if (cachedSandboxToken) {
    logApp('info', 'Read sandbox gateway token successfully');
  }
  return cachedSandboxToken;
}

/** Clear cache and re-read from the sandbox (e.g. Connect Chrome must match live gateway). */
export function readSandboxGatewayTokenFresh(): string | null {
  clearSandboxTokenCache();
  return readSandboxGatewayToken();
}

/** Return the cached sandbox token without any I/O — never blocks. */
export function getCachedSandboxToken(): string | null {
  return cachedSandboxToken;
}

/** Clear the cached sandbox token (call on reconnect/restart). */
export function clearSandboxTokenCache(): void {
  cachedSandboxToken = null;
  sandboxTokenLastFailAt = 0;
}

/** Local OpenClaw (~/.openclaw) gateway token — fresh read, no cache. */
export function readHostOpenclawGatewayToken(): string | null {
  try {
    const p = path.join(getOpenClawDir(), 'openclaw.json');
    const raw = fs.readFileSync(p, 'utf-8');
    const cfg = JSON.parse(raw);
    return normalizeGatewayToken(cfg?.gateway?.auth?.token);
  } catch {
    return null;
  }
}

/** Write a gateway auth token into the local OpenClaw config (~/.openclaw/openclaw.json). */
export function writeHostOpenclawGatewayToken(token: string): void {
  const dir = getOpenClawDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, 'openclaw.json');
  let cfg: Record<string, any> = {};
  try { cfg = JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { /* start fresh */ }
  if (!cfg.gateway) cfg.gateway = {};
  if (!cfg.gateway.auth) cfg.gateway.auth = {};
  cfg.gateway.auth.token = token;
  fs.writeFileSync(p, JSON.stringify(cfg, null, 2), 'utf-8');
  logApp('info', 'Wrote gateway token to host openclaw.json');
}

/** Remove the gateway auth token from the local OpenClaw config. */
export function clearHostOpenclawGatewayToken(): void {
  try {
    const p = path.join(getOpenClawDir(), 'openclaw.json');
    const raw = fs.readFileSync(p, 'utf-8');
    const cfg = JSON.parse(raw);
    if (cfg?.gateway?.auth?.token) {
      delete cfg.gateway.auth.token;
      fs.writeFileSync(p, JSON.stringify(cfg, null, 2), 'utf-8');
      logApp('info', 'Cleared gateway token from host openclaw.json');
    }
  } catch { /* config doesn't exist or isn't readable — nothing to clear */ }
}

/** Write a gateway auth token into the NemoClaw sandbox config and reload. */
export function writeSandboxGatewayToken(token: string): void {
  const config = readSandboxConfig();
  if (!config) throw new Error('Cannot read sandbox config to write gateway token');
  if (!config.gateway) config.gateway = {};
  if (!config.gateway.auth) config.gateway.auth = {};
  config.gateway.auth.token = token;
  writeSandboxConfig(config);
  clearSandboxTokenCache();
  cachedSandboxToken = token;
  restartSandboxGateway();
  logApp('info', 'Wrote gateway token to sandbox and restarted gateway');
}

/** Remove the gateway auth token from the NemoClaw sandbox config and reload. */
export function clearSandboxGatewayToken(): void {
  try {
    const config = readSandboxConfig();
    if (!config) return;
    if (config?.gateway?.auth?.token) {
      delete config.gateway.auth.token;
      writeSandboxConfig(config);
      clearSandboxTokenCache();
      restartSandboxGateway();
      logApp('info', 'Cleared gateway token from sandbox and restarted gateway');
    }
  } catch (err: any) {
    logApp('warn', `Failed to clear sandbox gateway token: ${err.message}`);
  }
}

function sandboxSSH(cmd: string, timeoutMs = 10000): string {
  if (isIntelMac() && isOpenShellSidecarRunning()) {
    return execSyncSafe(
      `docker exec ${OPENSHELL_SIDECAR} ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR ` +
      `openshell-${getSandboxName()} "${cmd.replace(/"/g, '\\"')}"`,
      timeoutMs,
    );
  }
  const name = getSandboxName();
  const proxy = IS_WIN
    ? `openshell ssh-proxy --gateway-name ${GATEWAY_NAME} --name ${name}`
    : `${path.join(os.homedir(), '.local', 'bin', 'openshell')} ssh-proxy --gateway-name ${GATEWAY_NAME} --name ${name}`;
  const prefix = IS_WIN ? 'wsl ' : '';
  const escaped = cmd.replace(/"/g, '\\"');
  return execSyncSafe(
    `${prefix}ssh -o "ProxyCommand=${proxy}" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR sandbox@openshell-${name} "${escaped}"`,
    timeoutMs,
  );
}

export function readSandboxConfig(): Record<string, any> | null {
  try {
    const raw = sandboxSSH(`cat ${SANDBOX_CONFIG_PATH}`);
    return JSON.parse(raw);
  } catch (err: any) {
    logApp('warn', `Failed to read sandbox config: ${err.message}`);
    return null;
  }
}

export function writeSandboxConfig(config: Record<string, any>): void {
  const { execSync } = require('child_process');
  const json = JSON.stringify(config, null, 2);
  const b64 = Buffer.from(json).toString('base64');

  if (isIntelMac() && isOpenShellSidecarRunning()) {
    execSync(
      `docker exec ${OPENSHELL_SIDECAR} ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR ` +
      `openshell-${getSandboxName()} "echo '${b64}' | base64 -d > ${SANDBOX_CONFIG_PATH}"`,
      { stdio: 'pipe', windowsHide: true, timeout: 10000 },
    );
  } else {
    sandboxSSH(`sh -c 'echo ${b64} | base64 -d > ${SANDBOX_CONFIG_PATH}'`, 10000);
  }
  logApp('info', 'Wrote sandbox openclaw.json');
}

/**
 * Restart the OpenClaw gateway inside the sandbox.
 * The gateway runs as PID 1 via `openclaw gateway`, so we send SIGHUP
 * which triggers a config reload. If that fails, kill the process and
 * let the container's init restart it.
 */
export function restartSandboxGateway(): void {
  try {
    sandboxSSH('kill -HUP 1', 5000);
    logApp('info', 'Sent SIGHUP to sandbox gateway (config reload)');
  } catch {
    try {
      sandboxSSH('kill 1', 5000);
      logApp('info', 'Killed sandbox gateway PID 1 for restart');
    } catch (err: any) {
      logApp('warn', `Failed to restart sandbox gateway: ${err.message}`);
    }
  }
  cachedSandboxToken = null;
}

const SANDBOX_BROWSER_PARENT = '/sandbox/.openclaw/browser';
const SANDBOX_CHROME_EXT = '/sandbox/.openclaw/browser/chrome-extension';

function openshellInvokerForShell(): string {
  if (IS_WIN) return 'wsl openshell';
  const w = path.join(os.homedir(), '.local', 'bin', 'openshell');
  if (fs.existsSync(w)) return `"${w}"`;
  return 'openshell';
}

/** Shell + args for spawning `openshell term --gateway nemoclaw` in a PTY. */
export function getOpenShellTermCommand(): { shell: string; args: string[] } {
  if (IS_WIN) {
    return { shell: 'wsl.exe', args: ['bash', '-lc', 'openshell term --gateway nemoclaw'] };
  }
  if (isIntelMac() && isOpenShellSidecarRunning()) {
    const dk = findDockerBin() || 'docker';
    return { shell: dk, args: ['exec', '-it', OPENSHELL_SIDECAR, '/usr/local/bin/openshell', 'term', '--gateway', GATEWAY_NAME] };
  }
  const w = path.join(os.homedir(), '.local', 'bin', 'openshell');
  const bin = fs.existsSync(w) ? w : 'openshell';
  return { shell: bin, args: ['term', '--gateway', GATEWAY_NAME] };
}

/**
 * NemoClaw runs OpenClaw inside the sandbox; Chrome on the Mac needs the unpacked
 * extension under ~/.openclaw/browser/chrome-extension. Copy it from the sandbox
 * when there is no host `openclaw` CLI (doctor --fix never ran on the host).
 */
export function syncSandboxChromeExtensionToHost(): { ok: boolean; error?: string } {
  const pref = loadRuntime();
  if (pref?.runtime !== 'nemoclaw') {
    return { ok: false, error: 'not-nemoclaw' };
  }
  if (!isSandboxReady()) {
    return { ok: false, error: 'NemoClaw sandbox is not ready. Start the agent first.' };
  }

  try {
    sandboxSSH(`test -f ${SANDBOX_CHROME_EXT}/manifest.json`, 8000);
  } catch {
    try {
      logApp('info', 'Running: openclaw browser extension install (inside sandbox)...');
      sandboxSSH('openclaw browser extension install', 120000);
    } catch (e: any) {
      logApp('warn', `sandbox browser extension install: ${e?.message || e}`);
    }
    try {
      sandboxSSH(`test -f ${SANDBOX_CHROME_EXT}/manifest.json`, 3000);
    } catch {
      try {
        logApp('info', 'Running: openclaw doctor --fix (inside sandbox, fallback)...');
        sandboxSSH('openclaw doctor --fix', 180000);
      } catch (e2: any) {
        logApp('warn', `sandbox doctor --fix: ${e2?.message || e2}`);
      }
    }
    try {
      sandboxSSH(`test -f ${SANDBOX_CHROME_EXT}/manifest.json`, 8000);
    } catch {
      return {
        ok: false,
        error:
          'Extension is missing inside the sandbox. In Terminal run: ' +
          `openshell sandbox connect ${getSandboxName()} --gateway ${GATEWAY_NAME}` +
          ` then: openclaw browser extension install`,
      };
    }
  }

  let parent = SANDBOX_BROWSER_PARENT;
  let base = 'chrome-extension';
  try {
    const raw = sandboxSSH('openclaw browser extension path 2>/dev/null | head -1', 15000).trim();
    if (raw.startsWith('/') && !raw.includes('\n') && !raw.includes(' ')) {
      parent = path.posix.dirname(raw);
      base = path.posix.basename(raw);
    }
  } catch {
    /* use defaults */
  }

  const destBase = path.join(getOpenClawDir(), 'browser');
  fs.mkdirSync(destBase, { recursive: true });
  const tmpTar = path.join(os.tmpdir(), `openclaw-chrome-ext-${Date.now()}.tar.gz`);
  const { execSync } = require('child_process');

  try {
    let tarGz: Buffer;
    if (isIntelMac() && isOpenShellSidecarRunning()) {
      const remote = `tar cz - -C ${parent} ${base}`;
      const cmd =
        `docker exec ${OPENSHELL_SIDECAR} ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR ` +
        `openshell-${getSandboxName()} "${remote.replace(/"/g, '\\"')}"`;
      tarGz = execSync(cmd, { maxBuffer: 50 * 1024 * 1024, timeout: 120000 }) as Buffer;
    } else {
      const name = getSandboxName();
      const oshBin = IS_WIN
        ? 'openshell'
        : (fs.existsSync(path.join(os.homedir(), '.local', 'bin', 'openshell'))
            ? path.join(os.homedir(), '.local', 'bin', 'openshell')
            : 'openshell');
      const proxy = `${oshBin} ssh-proxy --gateway-name ${GATEWAY_NAME} --name ${name}`;
      const prefix = IS_WIN ? 'wsl ' : '';
      const cmd =
        `${prefix}ssh -o "ProxyCommand=${proxy}" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR ` +
        `sandbox@openshell-${name} "tar cz - -C '${parent}' '${base}'"`;
      tarGz = execSync(cmd, {
        maxBuffer: 50 * 1024 * 1024,
        timeout: 120000,
        shell: IS_WIN ? 'cmd.exe' : '/bin/bash',
      }) as Buffer;
    }

    if (!tarGz || tarGz.length < 100) {
      throw new Error('tar archive from sandbox was empty or too small');
    }

    fs.writeFileSync(tmpTar, tarGz);
    const extDest = path.join(destBase, 'chrome-extension');
    fs.rmSync(extDest, { recursive: true, force: true });
    execSync(IS_WIN ? `tar -xzf "${tmpTar}" -C "${destBase}"` : `tar xzf "${tmpTar}" -C "${destBase}"`, {
      stdio: 'pipe',
      timeout: 60000,
      shell: IS_WIN ? 'cmd.exe' : '/bin/bash',
      windowsHide: true,
    });
  } catch (err: any) {
    logApp('warn', `syncSandboxChromeExtensionToHost: ${err?.message || err}`);
    return {
      ok: false,
      error:
        `Could not copy extension from sandbox. In Terminal: openshell sandbox connect ${getSandboxName()} --gateway ${GATEWAY_NAME}` +
        ` then: openclaw browser extension install` +
        (err?.message ? ` — ${err.message}` : ''),
    };
  } finally {
    try {
      fs.unlinkSync(tmpTar);
    } catch {
      /* ok */
    }
  }

  const manifest = path.join(getOpenClawDir(), 'browser', 'chrome-extension', 'manifest.json');
  if (!fs.existsSync(manifest)) {
    return { ok: false, error: 'Copy finished but manifest.json missing under ~/.openclaw/browser/chrome-extension.' };
  }

  logApp('info', 'Synced chrome-extension from NemoClaw sandbox to ~/.openclaw/browser/');
  return { ok: true };
}

/** Merge OpenAI / Anthropic keys into an openclaw.json object (host or sandbox). */
export function mergeModelProviderKeysIntoConfig(config: Record<string, any>, apiKeys: Record<string, string>): void {
  if (!apiKeys || Object.keys(apiKeys).length === 0) return;
  if (!config.env) config.env = {};
  for (const [key, value] of Object.entries(apiKeys)) {
    if (value) config.env[key] = value;
  }
  if (!config.models) config.models = {};
  if (!config.models.providers) config.models.providers = {};

  if (apiKeys.OPENAI_API_KEY) {
    config.models.providers.openai = {
      apiKey: apiKeys.OPENAI_API_KEY,
      models: [
        { id: 'gpt-4o', name: 'GPT-4o', reasoning: false, input: ['text', 'image'] },
        { id: 'o3-mini', name: 'o3-mini', reasoning: true, input: ['text'] },
      ],
    };
  }
  if (apiKeys.ANTHROPIC_API_KEY) {
    config.models.providers.anthropic = {
      apiKey: apiKeys.ANTHROPIC_API_KEY,
      models: [
        { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', reasoning: false, input: ['text', 'image'] },
      ],
    };
  }
}

/**
 * Add optional model keys to ~/.openclaw/openclaw.json (OpenClaw local runtime).
 * Restart the gateway afterward (Valnaa does this after a successful save).
 */
export function applyHostOpenclawModelKeys(apiKeys: Record<string, string>): void {
  const dir = getOpenClawDir();
  const p = path.join(dir, 'openclaw.json');
  let config: Record<string, any> = {};
  try {
    config = JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    config = {};
  }
  mergeModelProviderKeysIntoConfig(config, apiKeys);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(p, JSON.stringify(config, null, 2), 'utf-8');
  logApp('info', 'Wrote optional model keys to host openclaw.json');
}

/**
 * Write additional API keys and channel config into the sandbox's openclaw.json.
 * Merges with existing config so NemoClaw's NVIDIA inference stays intact.
 */
export function applySandboxSettings(settings: {
  apiKeys?: Record<string, string>;
  channels?: Record<string, any>;
  agentName?: string;
}): void {
  const config = readSandboxConfig();
  if (!config) throw new Error('Cannot read sandbox config');

  if (settings.apiKeys) {
    mergeModelProviderKeysIntoConfig(config, settings.apiKeys);
  }

  if (settings.channels) {
    if (!config.channels) config.channels = {};
    for (const [platform, channelCfg] of Object.entries(settings.channels)) {
      config.channels[platform] = { ...config.channels[platform], ...channelCfg };
    }
  }

  if (settings.agentName) {
    if (!config.agents) config.agents = {};
    if (!config.agents.defaults) config.agents.defaults = {};
    config.agents.defaults.name = settings.agentName;
  }

  writeSandboxConfig(config);
  restartSandboxGateway();
}

/**
 * Check if the SSH tunnel for port 18789 is alive inside the sidecar.
 * Returns true when an ssh process is listening on the port.
 */
export function isPortForwardAlive(): boolean {
  const gwPort = _activeGatewayPort;
  if (!isIntelMac() || !isOpenShellSidecarRunning()) {
    try {
      if (IS_WIN) {
        const out = execSyncSafe(`powershell -Command "Get-NetTCPConnection -LocalPort ${gwPort} -State Listen -ErrorAction SilentlyContinue"`, 5000);
        return out.includes('Listen');
      }
      execSyncSafe(`lsof -i :${gwPort} -sTCP:LISTEN -t 2>/dev/null`, 5000);
      return true;
    } catch {
      return false;
    }
  }
  try {
    const out = execSyncSafe(
      `docker exec ${OPENSHELL_SIDECAR} netstat -tlnp 2>/dev/null`,
      5000,
    );
    return out.includes(`:${OPENCLAW_PORT}`);
  } catch {
    return false;
  }
}

/**
 * Re-establish port forwarding for port 18789 to the sandbox.
 *
 * On Intel Mac the openshell forward command has a bug in v0.0.10
 * (false-positive port conflict detection inside Docker containers).
 * Workaround: SSH tunnel via openshell ssh-proxy, which goes through
 * the gateway API and is confirmed working.
 *
 * On ARM Mac, openshell forward runs natively and works fine.
 */
export function ensurePortForward(): void {
  if (isPortForwardAlive()) return;

  const { execSync } = require('child_process');

  if (isIntelMac() && isOpenShellSidecarRunning()) {
    try {
      // Write SSH config for the sandbox into the sidecar
      const sshConfig = execSyncSafe(
        `docker exec ${OPENSHELL_SIDECAR} /usr/local/bin/openshell sandbox ssh-config ${getSandboxName()} --gateway ${GATEWAY_NAME}`,
        10000,
      );
      execSync(
        `docker exec ${OPENSHELL_SIDECAR} sh -c 'mkdir -p /root/.ssh && chmod 700 /root/.ssh'`,
        { stdio: 'pipe', windowsHide: true, timeout: 5000 },
      );
      const b64 = Buffer.from(sshConfig).toString('base64');
      execSync(
        `docker exec ${OPENSHELL_SIDECAR} sh -c 'echo "${b64}" | base64 -d > /root/.ssh/config && chmod 600 /root/.ssh/config'`,
        { stdio: 'pipe', windowsHide: true, timeout: 5000 },
      );

      // Start SSH tunnel: host active ports → sandbox internal ports (always 18789/18792 inside)
      execSync(
        `docker exec -d ${OPENSHELL_SIDECAR} ssh -N -o ExitOnForwardFailure=yes ` +
        `-L 0.0.0.0:${OPENCLAW_PORT}:127.0.0.1:${OPENCLAW_PORT} ` +
        `-L 0.0.0.0:${EXTENSION_RELAY_PORT}:127.0.0.1:${EXTENSION_RELAY_PORT} ` +
        `openshell-${getSandboxName()}`,
        { stdio: 'pipe', windowsHide: true, timeout: 10000 },
      );

      // Wait up to 5s for the tunnel to become ready
      for (let i = 0; i < 10; i++) {
        execSync('sleep 0.5', { stdio: 'pipe', windowsHide: true });
        if (isPortForwardAlive()) {
          logApp('info', `SSH tunnel forwarding port ${_activeGatewayPort} to sandbox ${getSandboxName()}`);
          return;
        }
      }
      throw new Error(`SSH tunnel started but port ${_activeGatewayPort} not listening after 5s`);
    } catch (err: any) {
      logApp('error', `Port forward failed: ${err.message}`);
      throw new Error(`Port forward to sandbox failed: ${err.message}. Tap Retry to try again.`);
    }
  }

  if (IS_WIN) {
    // On WSL2, --background daemonizes the forward but WSL kills orphaned
    // background processes when the parent shell exits. Instead, spawn
    // foreground forwards as detached child processes of the Electron app.
    const { spawn } = require('child_process');
    const name = getSandboxName();
    const gwPort = _activeGatewayPort;
    const rlPort = _activeRelayPort;

    // Kill any stale SSH listeners on the ports inside WSL
    try {
      execSync(`wsl bash -c "fuser -k ${gwPort}/tcp 2>/dev/null; fuser -k ${rlPort}/tcp 2>/dev/null"`, { stdio: 'pipe', windowsHide: true, timeout: 8000 });
    } catch { /* ok */ }

    for (const port of [gwPort, rlPort]) {
      const child = spawn('wsl', ['openshell', 'forward', 'start', String(port), name, '--gateway', GATEWAY_NAME], {
        stdio: 'ignore',
        windowsHide: true,
      });
      child.unref();
      wslForwardChildren.push(child);
    }

    // Wait up to 10s for the ports to become reachable
    for (let i = 0; i < 20; i++) {
      execSync('powershell -Command "Start-Sleep -Milliseconds 500"', { stdio: 'pipe', windowsHide: true, timeout: 3000 });
      if (isPortForwardAlive()) {
        logApp('info', `Ports ${gwPort}, ${rlPort} forwarded to sandbox ${name} (managed child)`);
        return;
      }
    }
    throw new Error(`Port forward to sandbox failed: ports not reachable after 10s. Tap Retry to try again.`);
  }

  // ARM Mac / native: use openshell forward directly
  const gwPort = _activeGatewayPort;
  const rlPort = _activeRelayPort;
  try {
    openshellExec(`forward stop ${gwPort}`, 5000);
    openshellExec(`forward stop ${rlPort}`, 5000);
  } catch { /* ok */ }

  try {
    openshellExec(`forward start --background ${gwPort} ${getSandboxName()} --gateway ${GATEWAY_NAME}`, 15000);
    openshellExec(`forward start --background ${rlPort} ${getSandboxName()} --gateway ${GATEWAY_NAME}`, 15000);
    logApp('info', `Ports ${gwPort}, ${rlPort} forwarded to sandbox ${getSandboxName()}`);
  } catch (err: any) {
    logApp('error', `Port forward failed: ${err.message}`);
    throw new Error(`Port forward to sandbox failed: ${err.message}. Tap Retry to try again.`);
  }
}

/** Tear down any NemoClaw port forwards so port 18789 is free for local OpenClaw. */
export function stopPortForward(): void {
  try {
    // Kill managed WSL forward child processes (Windows)
    while (wslForwardChildren.length > 0) {
      const child = wslForwardChildren.pop();
      try { child?.kill(); } catch { /* ok */ }
    }

    if (isIntelMac() && isOpenShellSidecarRunning()) {
      const { execSync } = require('child_process');
      execSync(
        `docker exec ${OPENSHELL_SIDECAR} pkill -f "ssh -N" 2>/dev/null || true`,
        { stdio: 'pipe', windowsHide: true, timeout: 5000 },
      );
    } else if (IS_WIN) {
      try {
        execSync(`wsl bash -c "fuser -k ${_activeGatewayPort}/tcp 2>/dev/null; fuser -k ${_activeRelayPort}/tcp 2>/dev/null"`, { stdio: 'pipe', windowsHide: true, timeout: 8000 });
      } catch { /* ok */ }
    } else {
      try { openshellExec(`forward stop ${_activeGatewayPort}`, 5000); } catch { /* ok */ }
      try { openshellExec(`forward stop ${_activeRelayPort}`, 5000); } catch { /* ok */ }
    }
    logApp('info', 'Stopped NemoClaw port forwards');
  } catch (err: any) {
    logApp('warn', `stopPortForward: ${err?.message || err}`);
  }
}

export { OPENCLAW_PORT, EXTENSION_RELAY_PORT };

// ════════════════════════════════════
// Docker Helpers
// ════════════════════════════════════

function findDockerBin(): string | null {
  const knownPaths = IS_WIN
    ? [
        path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Docker', 'Docker', 'resources', 'bin', 'docker.exe'),
        path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Programs', 'Docker', 'Docker', 'resources', 'bin', 'docker.exe'),
        path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Docker', 'Docker', 'resources', 'bin', 'docker.exe'),
      ]
    : [
        '/usr/local/bin/docker',
        '/opt/homebrew/bin/docker',
        '/Applications/Docker.app/Contents/Resources/bin/docker',
      ];
  for (const p of knownPaths) {
    try { if (fs.existsSync(p)) return p; } catch { /* skip */ }
  }
  try {
    const { execSync } = require('child_process');
    const whichCmd = IS_WIN ? 'where docker' : 'which docker';
    const result = execSync(whichCmd, { encoding: 'utf-8', timeout: 3000, stdio: 'pipe', windowsHide: true }).trim();
    return (IS_WIN ? result.split('\n')[0].trim() : result) || null;
  } catch { return null; }
}

/** Resolved docker binary path, quoted for shell use. */
export function dockerBin(): string {
  const resolved = findDockerBin();
  return resolved ? `"${resolved}"` : 'docker';
}

export function isDockerInstalled(): boolean {
  if (findDockerBin()) return true;
  try {
    const { execSync } = require('child_process');
    execSync('docker --version', { encoding: 'utf-8', timeout: 5000, stdio: 'pipe', windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

export function isDockerRunning(): boolean {
  const bin = findDockerBin() || 'docker';
  try {
    const { execSync } = require('child_process');
    execSync(`"${bin}" info`, { encoding: 'utf-8', timeout: 10000, stdio: 'pipe', windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * On macOS, Docker Desktop stores its Unix socket at ~/.docker/run/docker.sock
 * and /var/run/docker.sock is a symlink to it. If ~/.docker was deleted (clean
 * installs, user cleanup), Docker runs but can't create the socket — `docker info`
 * fails forever. Ensure the directory exists before (re)starting Docker.
 */
export function ensureDockerSocketDir(): void {
  if (process.platform !== 'darwin') return;
  const fs = require('fs');
  const socketDir = path.join(os.homedir(), '.docker', 'run');
  try {
    if (!fs.existsSync(socketDir)) {
      fs.mkdirSync(socketDir, { recursive: true });
      logApp('info', `Created missing Docker socket directory: ${socketDir}`);
    }
  } catch (e: any) {
    logApp('warn', `Failed to create Docker socket dir: ${e.message}`);
  }
}

/**
 * Detect Docker processes running with a broken/missing socket.
 * Returns true if Docker needs a restart to fix the socket.
 */
export function isDockerSocketBroken(): boolean {
  if (process.platform === 'win32') return false;
  const { execSync } = require('child_process');
  try {
    const procs = execSync('pgrep -f com.docker.backend', { encoding: 'utf-8', timeout: 3000, stdio: 'pipe' }).trim();
    if (!procs) return false;
  } catch {
    return false;
  }
  return !isDockerRunning();
}

/**
 * Kill Docker Desktop processes so it can be relaunched cleanly.
 */
export function killDockerDesktop(): void {
  const { execSync } = require('child_process');
  if (process.platform === 'darwin') {
    try { execSync('killall Docker', { timeout: 5000, stdio: 'pipe' }); } catch { /* ok */ }
    try { execSync('killall com.docker.backend', { timeout: 5000, stdio: 'pipe' }); } catch { /* ok */ }
    try { execSync('killall "Docker Desktop"', { timeout: 5000, stdio: 'pipe' }); } catch { /* ok */ }
  } else if (IS_WIN) {
    try { execSync('powershell -Command "Get-Process -Name \'Docker Desktop\', \'com.docker.backend\', \'com.docker.proxy\' -ErrorAction SilentlyContinue | Stop-Process -Force"', { stdio: 'pipe', timeout: 15000, windowsHide: true }); } catch { /* ok */ }
  }
}

/**
 * Run `docker info` and return the daemon error string (if any).
 * Used to give actionable feedback when Docker fails to start.
 */
export function getDockerInfoError(): string {
  const bin = findDockerBin() || 'docker';
  try {
    const { execSync } = require('child_process');
    execSync(`"${bin}" info`, { encoding: 'utf-8', timeout: 10000, stdio: 'pipe', windowsHide: true });
    return '';
  } catch (err: any) {
    const stderr = (err.stderr || '').toString();
    const msg = (err.message || '').toString();
    const combined = `${stderr}\n${msg}`;
    const daemonMatch = combined.match(/Error response from daemon:\s*([^\n]+)/i);
    if (daemonMatch) return daemonMatch[1].trim();
    const pipeMatch = combined.match(/(failed to connect[^\n]{0,200})/i);
    if (pipeMatch) return pipeMatch[1].trim();
    if (/ETIMEDOUT/i.test(msg)) return 'Docker daemon connection timed out';
    if (/ECONNREFUSED/i.test(msg)) return 'Docker daemon connection refused';
    const errorLines = stderr.split(/\r?\n/).filter((l: string) => /^ERROR:/i.test(l.trim()));
    if (errorLines.length > 0) return errorLines[0].replace(/^ERROR:\s*/i, '').trim();
    return '';
  }
}

export function isHomebrewInstalled(): boolean {
  if (process.platform !== 'darwin') return true;
  try {
    execSyncSafe('brew --version', 5000);
    return true;
  } catch {
    return false;
  }
}

export function getHomebrewInstallCommand(): string {
  return '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"';
}

export function canInstallDocker(): boolean {
  const { execSync } = require('child_process');
  try {
    if (IS_WIN) {
      execSync('winget --version', { encoding: 'utf-8', timeout: 5000, stdio: 'pipe', windowsHide: true });
      return true;
    }
    if (process.platform === 'darwin') {
      execSync('brew --version', { encoding: 'utf-8', timeout: 5000, stdio: 'pipe', windowsHide: true });
      return true;
    }
    return true;
  } catch {
    return false;
  }
}

export function getDockerInstallCommand(): string {
  if (IS_WIN) {
    return 'winget install Docker.DockerDesktop --accept-package-agreements --accept-source-agreements';
  }
  if (process.platform === 'darwin') {
    return 'brew install --cask docker';
  }
  return 'curl -fsSL https://get.docker.com | sh';
}

export function launchDockerDesktop(): boolean {
  try {
    const { execSync } = require('child_process');
    if (process.platform === 'darwin') {
      execSync('open -a Docker', { encoding: 'utf-8', timeout: 5000 });
      return true;
    }
    if (IS_WIN) {
      const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
      const paths = [
        process.env['ProgramFiles'] ? process.env['ProgramFiles'] + '\\Docker\\Docker\\Docker Desktop.exe' : '',
        process.env['ProgramFiles(x86)'] ? process.env['ProgramFiles(x86)'] + '\\Docker\\Docker\\Docker Desktop.exe' : '',
        localAppData + '\\Programs\\Docker\\Docker\\Docker Desktop.exe',
        localAppData + '\\Docker\\Docker\\Docker Desktop.exe',
      ].filter(Boolean);
      for (const p of paths) {
        try {
          const fsMod = require('fs');
          if (fsMod.existsSync(p)) {
            execSync(`start "" "${p}"`, { shell: true, timeout: 5000 });
            return true;
          }
        } catch { /* try next */ }
      }
    }
  } catch { /* ok */ }
  return false;
}

/**
 * On Windows, Docker Desktop shares binaries into WSL via a cross-distro mount
 * at /mnt/wsl/docker-desktop/. If WSL was in a bad state when Docker started,
 * the mount can end up with 0-byte stub files that lack execute permission,
 * causing "Permission denied" on docker-desktop-user-distro.
 *
 * Returns true if the mount looks healthy (file exists, >0 bytes, executable).
 */
export function isDockerWslMountHealthy(): boolean {
  if (!IS_WIN) return true;
  try {
    const distro = getWslDefaultDistro();
    if (!distro) return false;
    const result = execSync(
      `wsl -d ${distro} -u root -e stat -c "%s %a" /mnt/wsl/docker-desktop/docker-desktop-user-distro`,
      { encoding: 'utf-8', timeout: 8000, stdio: 'pipe', windowsHide: true },
    ).replace(/\0/g, '').trim();
    const [sizeStr, perms] = result.split(' ');
    const size = parseInt(sizeStr, 10);
    const hasExec = perms && perms.length >= 3 && parseInt(perms[0], 10) >= 7;
    return size > 0 && !!hasExec;
  } catch {
    return false;
  }
}

/**
 * Fix a broken Docker Desktop WSL mount by shutting down WSL (clears stale
 * mounts) and restarting Docker Desktop so it re-initializes cleanly.
 * Returns true if the mount is healthy after the fix.
 */
export async function repairDockerWslMount(onProgress?: (msg: string) => void): Promise<boolean> {
  if (!IS_WIN) return true;
  const report = (msg: string) => { if (onProgress) onProgress(msg); };

  report('Shutting down WSL to clear stale mounts...');
  try {
    execSync(
      'powershell -Command "Get-Process -Name \'Docker Desktop\', \'com.docker.backend\', \'com.docker.proxy\' -ErrorAction SilentlyContinue | Stop-Process -Force"',
      { stdio: 'pipe', windowsHide: true, timeout: 15000 },
    );
  } catch { /* ok */ }

  await new Promise(r => setTimeout(r, 3000));

  try {
    execSync('wsl --shutdown', { stdio: 'pipe', windowsHide: true, timeout: 30000 });
  } catch { /* ok */ }

  await new Promise(r => setTimeout(r, 3000));

  report('Restarting Docker Desktop...');
  launchDockerDesktop();

  // Wait up to 90s for Docker + WSL mount to come back
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 5000));
    if (isDockerRunning() && isDockerWslMountHealthy()) {
      report('Docker WSL mount repaired');
      return true;
    }
  }
  return isDockerWslMountHealthy();
}

// ════════════════════════════════════
// NemoClaw CLI Helpers
// ════════════════════════════════════

/** Locate the nemoclaw npm package root (for mounting into the sidecar). */
export function findNemoClawPackageRoot(): string | null {
  const candidates = [
    '/usr/local/lib/node_modules/nemoclaw',
    path.join(os.homedir(), '.local', 'lib', 'node_modules', 'nemoclaw'),
  ];

  // Also check nvm-managed Node paths
  const nvmDir = path.join(os.homedir(), '.nvm', 'versions', 'node');
  try {
    for (const ver of fs.readdirSync(nvmDir)) {
      candidates.push(path.join(nvmDir, ver, 'lib', 'node_modules', 'nemoclaw'));
    }
  } catch { /* nvm not installed */ }

  // ~/.nemoclaw/source is the git-cloned source with blueprints/policies
  candidates.push(path.join(os.homedir(), '.nemoclaw', 'source'));

  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'package.json'))) return c;
  }
  return null;
}

export function findNemoClawBinary(): string | null {
  if (IS_WIN) {
    try {
      // Check well-known paths inside WSL (which doesn't source .bashrc)
      const check = execSync(
        'wsl bash -c "test -f /root/.local/bin/nemoclaw && echo FOUND || test -f /usr/local/bin/nemoclaw && echo FOUND || which nemoclaw 2>/dev/null && echo FOUND || echo MISSING"',
        { encoding: 'utf-8', timeout: 8000, stdio: 'pipe', windowsHide: true },
      ).replace(/\0/g, '').trim();
      if (check.includes('FOUND')) return 'wsl';
    } catch { /* not in WSL */ }
    return null;
  }
  // Check well-known paths first (Electron launched via `open` may have a minimal PATH)
  const knownPaths = [
    '/usr/local/bin/nemoclaw',
    path.join(os.homedir(), '.local', 'bin', 'nemoclaw'),
    '/opt/homebrew/bin/nemoclaw',
  ];
  for (const p of knownPaths) {
    try { if (fs.existsSync(p)) return p; } catch { /* skip */ }
  }
  try {
    const { execSync } = require('child_process');
    const result = execSync('which nemoclaw', { encoding: 'utf-8', timeout: 5000 }).trim();
    if (result) return result.split('\n')[0].trim();
  } catch { /* not found */ }
  return null;
}

export function getNemoClawInstallCommand(): string {
  if (IS_WIN) {
    return 'wsl bash -c "curl -fsSL https://nvidia.com/nemoclaw.sh -o /tmp/nemoclaw-install.sh && bash /tmp/nemoclaw-install.sh"';
  }
  const pathPrefix = isIntelMac() ? `export PATH="$HOME/.local/bin:/usr/local/bin:$PATH" && ` : '';
  const nvmSource = 'source "$HOME/.nvm/nvm.sh" 2>/dev/null; ';
  return `${pathPrefix}${nvmSource}curl -fsSL https://nvidia.com/nemoclaw.sh -o /tmp/nemoclaw-install.sh && bash /tmp/nemoclaw-install.sh`;
}

export function getNemoClawOnboardCommand(): string {
  const pathPrefix = isIntelMac() ? `export PATH="$HOME/.local/bin:$PATH" && ` : '';
  if (IS_WIN) {
    return 'wsl bash -c "source \\"\\$HOME/.nvm/nvm.sh\\" 2>/dev/null; \\$HOME/.local/bin/nemoclaw onboard"';
  }
  return `${pathPrefix}nemoclaw onboard`;
}

export function getNemoClawSetupCommand(): string {
  if (IS_WIN) {
    return 'wsl bash -c "source \\"\\$HOME/.nvm/nvm.sh\\" 2>/dev/null; \\$HOME/.local/bin/nemoclaw setup"';
  }
  const pathPrefix = isIntelMac() ? `export PATH="$HOME/.local/bin:$PATH" && ` : '';
  return `${pathPrefix}nemoclaw setup`;
}

export interface NemoClawSandboxStatus {
  running: boolean;
  port: number | null;
}

const DEFAULT_NEMOCLAW_PORT = 18789;

export function getNemoClawSandboxStatus(): NemoClawSandboxStatus {
  const prefix = IS_WIN ? 'wsl ' : '';

  try {
    const { execSync } = require('child_process');
    const out = execSync(`${prefix}nemoclaw status`, {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: 'pipe',
      windowsHide: true,
    });
    const running = /running|active|up/i.test(out);
    return { running, port: running ? DEFAULT_NEMOCLAW_PORT : null };
  } catch { /* nemoclaw status failed */ }

  try {
    const { execSync } = require('child_process');
    const out = execSync(`${prefix}${dockerBin()} ps --filter "name=openclaw" --format "{{.Ports}}"`, {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: 'pipe',
      windowsHide: true,
    });
    if (out.trim()) {
      const portMatch = out.match(/0\.0\.0\.0:(\d+)/);
      const port = portMatch ? parseInt(portMatch[1], 10) : DEFAULT_NEMOCLAW_PORT;
      return { running: true, port };
    }
  } catch { /* docker query failed */ }

  return { running: false, port: null };
}

export function nemoClawNeedsSetup(): boolean {
  const nemoBin = findNemoClawBinary();
  if (!nemoBin) return true;

  const prefix = IS_WIN ? 'wsl ' : '';
  try {
    const { execSync } = require('child_process');
    const out = execSync(`${prefix}nemoclaw status`, {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: 'pipe',
      windowsHide: true,
    });
    if (/no sandbox|not found|not configured/i.test(out)) return true;
  } catch {
    return true;
  }

  try {
    const gwOut = openshellExec('gateway select 2>&1', 5000);
    if (/no gateways found/i.test(gwOut)) return true;
  } catch {
    return true;
  }

  return false;
}

// ════════════════════════════════════
// WSL Health Checks & Auto-Fix (Windows)
// ════════════════════════════════════

/**
 * Check if WSL has a usable Linux distro (not just docker-desktop).
 * Returns the name of the default distro, or null if none is usable.
 */
export function getWslDefaultDistro(): string | null {
  if (!IS_WIN) return null;
  try {
    const out = execSync('wsl --list --quiet', { encoding: 'utf-8', timeout: 10000, stdio: 'pipe', windowsHide: true });
    const distros = out.replace(/\0/g, '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const usable = distros.filter(d => !/^docker-desktop/i.test(d));
    return usable.length > 0 ? usable[0] : null;
  } catch {
    return null;
  }
}

/** True when WSL has a general-purpose distro (Ubuntu, Debian, etc.) set up. */
export function hasUsableWslDistro(): boolean {
  return getWslDefaultDistro() !== null;
}

/**
 * Check if WSL is truly functional — not just whether wsl.exe exists.
 * wsl.exe is an inbox Windows binary that responds to --version even when
 * the underlying features are disabled, so we verify by trying to list distros.
 */
export function isWslHealthy(): boolean {
  if (!IS_WIN) return true;
  try {
    // wsl --status will fail with a meaningful error if the VM platform isn't ready
    const out = execSync('wsl --status', { encoding: 'utf-8', timeout: 10000, stdio: 'pipe', windowsHide: true });
    const clean = out.replace(/\0/g, '');
    // If it mentions "enable Virtual Machine" or similar, WSL isn't functional
    if (/enable.*virtual|not.*enabled|reboot/i.test(clean)) return false;
    return true;
  } catch (err: any) {
    const msg = `${err.stderr || ''} ${err.stdout || ''} ${err.message || ''}`.replace(/\0/g, '');
    // "class not registered" or similar means WSL is completely absent
    if (/class not registered|REGDB_E_CLASSNOTREG|not recognized/i.test(msg)) return false;
    // Other errors (e.g. "no installed distributions") still mean WSL itself works
    return true;
  }
}

/**
 * Detect if WSL needs updating (the error that blocks Docker Desktop).
 * Returns true if `wsl --version` signals a problem.
 */
export function wslNeedsUpdate(): boolean {
  if (!IS_WIN) return false;
  try {
    execSync('wsl --version', { encoding: 'utf-8', timeout: 10000, stdio: 'pipe', windowsHide: true });
    return false;
  } catch (err: any) {
    const msg = `${err.stderr || ''} ${err.stdout || ''} ${err.message || ''}`.replace(/\0/g, '');
    return /class not registered|REGDB_E_CLASSNOTREG|not recognized|is not a valid/i.test(msg);
  }
}

/** Get the latest WSL MSI download URL from GitHub releases. */
export function getWslMsiUrl(): string {
  try {
    const out = execSync(
      'powershell -Command "(Invoke-RestMethod -Uri \'https://api.github.com/repos/microsoft/WSL/releases/latest\').assets | Where-Object { $_.name -match \'x64\\.msi\' } | Select-Object -First 1 -ExpandProperty browser_download_url"',
      { encoding: 'utf-8', timeout: 30000, stdio: 'pipe', windowsHide: true },
    ).trim();
    if (out.startsWith('https://')) return out;
  } catch (e: any) {
    logApp('warn', `Failed to fetch WSL release URL: ${e.message}`);
  }
  return 'https://github.com/microsoft/WSL/releases/latest/download/wsl.2.6.3.0.x64.msi';
}

/**
 * Download and install the latest WSL MSI. Requires UAC elevation.
 * On fresh PCs, enables required Windows features and installs WSL in a
 * single elevated script (one UAC prompt). If WSL still doesn't work
 * afterward, returns 'reboot' (features need a restart to activate).
 */
export async function updateWsl(onProgress?: (msg: string) => void): Promise<boolean | 'reboot'> {
  if (!IS_WIN) return true;

  // Always include both feature-enable commands. They're no-ops if already
  // enabled, so there's no need for a pre-check (which would require admin).
  const scriptLines: string[] = [
    "Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Windows-Subsystem-Linux -NoRestart -All -ErrorAction SilentlyContinue",
    "Enable-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform -NoRestart -All -ErrorAction SilentlyContinue",
    "wsl --install --no-launch 2>&1 | Out-Null",
  ];

  if (scriptLines.length > 0) {
    onProgress?.('Setting up WSL — an admin permission prompt will appear...');

    // Use @vscode/sudo-prompt to run elevated commands entirely inside the app.
    // Only the native Windows UAC dialog is shown — no PowerShell windows flash.
    const sudo = require('@vscode/sudo-prompt');
    const psCmd = scriptLines.join('; ');
    const elevatedCmd = `powershell -ExecutionPolicy Bypass -WindowStyle Hidden -Command "${psCmd.replace(/"/g, '\\"')}"`;
    logApp('info', `Running elevated WSL setup: ${psCmd}`);

    try {
      const { stdout, stderr } = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
        sudo.exec(elevatedCmd, { name: 'Valnaa' }, (error: Error | null, stdout?: string | Buffer, stderr?: string | Buffer) => {
          if (error) return reject(error);
          resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
        });
      });
      logApp('info', `Elevated WSL setup completed. stdout: ${stdout.slice(0, 500)}`);
      if (stderr) logApp('warn', `Elevated WSL setup stderr: ${stderr.slice(0, 500)}`);
    } catch (e: any) {
      if (/permission|denied|cancel/i.test(e.message)) {
        logApp('warn', `User denied UAC prompt: ${e.message}`);
        onProgress?.('Admin permission is required to install WSL. Please tap Retry and approve the prompt.');
        return false;
      }
      logApp('warn', `Elevated WSL setup failed: ${e.message}`);
    }

    // Give Windows a moment to finalize feature changes
    await new Promise(r => setTimeout(r, 3000));
  }

  // Check if wsl --version works now (use try/catch — execSyncSafe throws on failure)
  let ver = '';
  try { ver = execSyncSafe('wsl --version', 10000); } catch { /* expected on fresh PCs */ }
  if (ver && /WSL version/i.test(ver.replace(/\0/g, ''))) {
    logApp('info', `WSL ready: ${ver.split('\n')[0]?.trim()}`);
    onProgress?.('WSL installed successfully');
    return true;
  }

  // Try MSI fallback before giving up — wsl --install may have failed silently
  const tmpDir = os.tmpdir();
  const msiPath = path.join(tmpDir, 'wsl_latest.msi');
  try {
    onProgress?.('Downloading WSL update...');
    const url = getWslMsiUrl();
    logApp('info', `WSL MSI URL: ${url}`);

    execSync(
      `curl.exe -L -o "${msiPath}" "${url}" --progress-bar`,
      { timeout: 600000, stdio: 'pipe', windowsHide: true },
    );

    const stat = fs.statSync(msiPath);
    if (stat.size < 10_000_000) {
      logApp('warn', `WSL MSI suspiciously small (${stat.size} bytes)`);
    } else {
      logApp('info', `WSL MSI downloaded: ${Math.round(stat.size / 1048576)} MB`);
      onProgress?.('Installing WSL update...');
      const sudo2 = require('@vscode/sudo-prompt');
      await new Promise<void>((resolve, reject) => {
        sudo2.exec(`msiexec.exe /i "${msiPath}" /quiet /norestart`, { name: 'Valnaa' }, (error: Error | null) => {
          if (error) return reject(error);
          resolve();
        });
      });

      let verAfter = '';
      try { verAfter = execSyncSafe('wsl --version', 10000); } catch { /* still may need reboot */ }
      if (verAfter && /WSL version/i.test(verAfter.replace(/\0/g, ''))) {
        logApp('info', `WSL updated successfully: ${verAfter.split('\n')[0]?.trim()}`);
        onProgress?.('WSL updated successfully');
        return true;
      }
    }
  } catch (e: any) {
    logApp('warn', `WSL MSI fallback failed: ${e.message}`);
  }

  // WSL still not working after elevated setup + MSI fallback.
  // Features were likely just enabled and Windows needs a reboot.
  logApp('info', 'WSL still not functional after setup — reboot likely required');
  onProgress?.('Windows needs a restart to finish setting up WSL.');
  return 'reboot';
}

/**
 * Install Ubuntu in WSL and set it as the default distro.
 * Returns true on success.
 */
export async function installWslDistro(onProgress?: (msg: string) => void): Promise<boolean> {
  if (!IS_WIN) return true;
  if (hasUsableWslDistro()) return true;

  try {
    onProgress?.('Installing Ubuntu in WSL (this may take a few minutes)...');
    logApp('info', 'Installing Ubuntu WSL distro');

    // Use sudo-prompt for elevation — wsl --install requires admin on Windows 10
    const sudo = require('@vscode/sudo-prompt');
    await new Promise<void>((resolve, reject) => {
      sudo.exec('wsl --install Ubuntu --no-launch', { name: 'Valnaa' }, (error: Error | null) => {
        if (error) return reject(error);
        resolve();
      });
    });

    // Detect the actual distro name (might be "Ubuntu", "Ubuntu-24.04", etc.)
    await new Promise(r => setTimeout(r, 3000));
    const distro = getWslDefaultDistro();
    if (distro) {
      logApp('info', `Installed distro detected as: ${distro}`);
      try {
        execSync(`wsl --set-default ${distro}`, { timeout: 15000, stdio: 'pipe', windowsHide: true });
      } catch { /* best effort — may already be default */ }
    }

    // Verify bash is accessible (retry a few times — first boot can be slow)
    onProgress?.('Verifying WSL installation...');
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const check = execSync('wsl bash -c "echo ok"', { encoding: 'utf-8', timeout: 60000, stdio: 'pipe', windowsHide: true }).replace(/\0/g, '').trim();
        if (check.includes('ok')) {
          logApp('info', 'WSL distro installed and verified');
          onProgress?.('Ubuntu installed successfully');
          return true;
        }
      } catch (e: any) {
        logApp('warn', `WSL bash check attempt ${attempt + 1} failed: ${e.message}`);
        await new Promise(r => setTimeout(r, 5000));
      }
    }
    logApp('warn', 'WSL bash check failed after retries');
    return false;
  } catch (e: any) {
    logApp('error', `WSL distro install failed: ${e.message}`);
    onProgress?.(`WSL distro install failed: ${e.message}`);
    return false;
  }
}

/**
 * Full WSL health check & repair for Windows.
 * 1. If WSL itself is broken/outdated → download and install latest MSI
 * 2. If no usable Linux distro → install Ubuntu
 * 3. Restart Docker Desktop if it was affected
 * Returns true if WSL is healthy after repairs.
 */
export async function ensureWslReady(onProgress?: (msg: string) => void): Promise<boolean | 'reboot'> {
  if (!IS_WIN) return true;

  // Step 1: ensure WSL itself is installed and current
  if (wslNeedsUpdate() || !isWslHealthy()) {
    logApp('info', 'WSL needs update — starting auto-fix');
    const updated = await updateWsl(onProgress);
    if (updated === 'reboot') return 'reboot';
    if (!updated) {
      logApp('error', 'WSL auto-update failed');
      return false;
    }
  }

  // Step 2: ensure a usable Linux distro is available
  if (!hasUsableWslDistro()) {
    logApp('info', 'No usable WSL distro — installing Ubuntu');
    const installed = await installWslDistro(onProgress);
    if (!installed) return false;
  }

  return true;
}
