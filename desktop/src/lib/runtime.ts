import fs from 'fs';
import path from 'path';
import os from 'os';
import { getAppDataDir, IS_WIN, IS_MAC } from './platform';
import { logApp } from '../openclaw/logger';

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
  return execSync(cmd, { encoding: 'utf-8', timeout: timeoutMs, stdio: 'pipe' }).trim();
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
    const result = execSyncSafe(`docker inspect ${OPENSHELL_SIDECAR} --format "{{.State.Running}}" 2>/dev/null`, 10000);
    return result === 'true';
  } catch {
    return false;
  }
}

function sidecarHasPort(port: number): boolean {
  try {
    const out = execSyncSafe(`docker port ${OPENSHELL_SIDECAR} ${port} 2>/dev/null`, 5000);
    return out.includes(String(port));
  } catch {
    return false;
  }
}

function sidecarHasPidHost(): boolean {
  try {
    const out = execSyncSafe(`docker inspect ${OPENSHELL_SIDECAR} --format "{{.HostConfig.PidMode}}" 2>/dev/null`, 5000);
    return out === 'host';
  } catch {
    return false;
  }
}

function sidecarHasInit(): boolean {
  try {
    const out = execSyncSafe(`docker inspect ${OPENSHELL_SIDECAR} --format "{{.HostConfig.Init}}" 2>/dev/null`, 5000);
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
  try {
    execSyncSafe(
      `docker exec ${OPENSHELL_SIDECAR} test -f /usr/local/lib/node_modules/nemoclaw/nemoclaw-blueprint/policies/openclaw-sandbox.yaml`,
      5000,
    );
    return true;
  } catch {
    return false;
  }
}

export function isSidecarReady(): boolean {
  if (!isOpenShellInstalled()) return false;
  if (!isOpenShellSidecarRunning()) return false;
  if (!sidecarHasPort(OPENCLAW_PORT)) return false;
  if (sidecarHasPidHost()) return false;
  if (!sidecarHasInit()) return false;
  if (findNemoClawPackageRoot() && !sidecarHasNemoClawBlueprint()) return false;
  return true;
}

export async function setupOpenShellSidecar(onProgress?: (msg: string) => void): Promise<void> {
  const { execSync } = require('child_process');
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
      { timeout: 60000, stdio: 'pipe' }
    );
    fs.chmodSync(OPENSHELL_BIN, 0o755);
    report('Binary downloaded');
  }

  // 2. Create config dir
  fs.mkdirSync(OPENSHELL_CONFIG_DIR, { recursive: true });

  // 3. Create/ensure the sidecar container.
  //    - Publish port 18789 so openshell forward is reachable from the host.
  //    - NO --pid host: it causes openshell forward to see k3s pod ports as
  //      "in use" (false positive from the host PID namespace), blocking the
  //      port forward. openshell uses the Docker socket, not host PIDs.
  const needsRecreate = !isOpenShellSidecarRunning()
    || !sidecarHasPort(OPENCLAW_PORT)
    || sidecarHasPidHost()
    || !sidecarHasInit();
  if (needsRecreate) {
    report('Setting up Docker sidecar...');
    try { execSync(`docker rm -f ${OPENSHELL_SIDECAR} 2>/dev/null`, { stdio: 'pipe', timeout: 10000 }); } catch { /* ok */ }

    // Mount the host temp dir so openshell can read build contexts created
    // by nemoclaw onboard. /var/folders is in Docker Desktop's default shares.
    const tmpDir = os.tmpdir().replace(/\/+$/, '');
    const tmpMount = tmpDir ? `-v "${tmpDir}:${tmpDir}"` : '';

    execSync(
      `docker create --name ${OPENSHELL_SIDECAR} --init ` +
      `-v /var/run/docker.sock:/var/run/docker.sock ` +
      `-v "${OPENSHELL_CONFIG_DIR}:/root/.config/openshell" ` +
      `-v "${OPENSHELL_BIN}:/usr/local/bin/openshell:ro" ` +
      `${tmpMount} ` +
      `--add-host "host.docker.internal:host-gateway" ` +
      `-p ${OPENCLAW_PORT}:${OPENCLAW_PORT} ` +
      `alpine:latest sleep infinity`,
      { timeout: 30000, stdio: 'pipe' }
    );
    execSync(`docker start ${OPENSHELL_SIDECAR}`, { timeout: 10000, stdio: 'pipe' });

    report('Installing networking tools...');
    execSync(`docker exec ${OPENSHELL_SIDECAR} apk add --no-cache socat openssh-client`, { timeout: 60000, stdio: 'pipe' });

    report('Sidecar ready');
  }

  // 3b. Copy the nemoclaw-blueprint directory (policy files, presets — ~72KB)
  // into the sidecar so `openshell sandbox create --policy ...` can read them.
  // Only the blueprint dir is needed; the full package is 700MB+ due to
  // node_modules. /usr/local isn't in Docker Desktop's default file shares.
  const nemoClawPkg = findNemoClawPackageRoot();
  if (nemoClawPkg && !sidecarHasNemoClawBlueprint()) {
    report('Copying NemoClaw blueprint to sidecar...');
    const blueprintSrc = path.join(nemoClawPkg, 'nemoclaw-blueprint');
    const blueprintDst = path.join(nemoClawPkg, 'nemoclaw-blueprint');
    execSync(`docker exec ${OPENSHELL_SIDECAR} mkdir -p "${path.dirname(blueprintDst)}"`, { stdio: 'pipe', timeout: 5000 });
    execSync(`docker cp "${blueprintSrc}" ${OPENSHELL_SIDECAR}:${blueprintDst}`, { stdio: 'pipe', timeout: 15000 });
  }

  // 4. Start socat forwarder (port 8080 inside sidecar → host gateway)
  try {
    const listening = execSyncSafe(`docker exec ${OPENSHELL_SIDECAR} sh -c "ss -tln | grep :8080 || true"`, 5000);
    if (!listening.includes(':8080')) {
      execSync(`docker exec -d ${OPENSHELL_SIDECAR} socat TCP-LISTEN:8080,fork,reuseaddr TCP:host.docker.internal:8080`, { timeout: 5000, stdio: 'pipe' });
    }
  } catch { /* socat may already be running */ }

  // 5. Create wrapper script at ~/.local/bin/openshell
  const wrapperDir = path.dirname(OPENSHELL_WRAPPER);
  fs.mkdirSync(wrapperDir, { recursive: true });
  const wrapperScript = [
    '#!/bin/sh',
    `if ! docker inspect ${OPENSHELL_SIDECAR} --format "{{.State.Running}}" 2>/dev/null | grep -q true; then`,
    `  docker start ${OPENSHELL_SIDECAR} >/dev/null 2>&1`,
    'fi',
    `exec docker exec -i ${OPENSHELL_SIDECAR} /usr/local/bin/openshell "$@"`,
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
  try {
    execSync(`docker network connect openshell-cluster-nemoclaw ${OPENSHELL_SIDECAR} 2>/dev/null`, { stdio: 'pipe', timeout: 5000 });
  } catch { /* already connected or network doesn't exist yet */ }

  try {
    const listening = execSyncSafe(`docker exec ${OPENSHELL_SIDECAR} sh -c "ss -tln | grep :8080 || true"`, 5000);
    if (!listening.includes(':8080')) {
      execSync(`docker exec -d ${OPENSHELL_SIDECAR} socat TCP-LISTEN:8080,fork,reuseaddr TCP:host.docker.internal:8080`, { timeout: 5000, stdio: 'pipe' });
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
    return execSyncSafe(`docker exec ${OPENSHELL_SIDECAR} /usr/local/bin/openshell ${args}`, timeoutMs);
  }
  return execSyncSafe(`openshell ${args}`, timeoutMs);
}

const GATEWAY_NAME = 'nemoclaw';

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

const SANDBOX_NAME = 'nemoclaw';
const OPENCLAW_PORT = 18789;

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
 * Check if `nemoclaw onboard` has been completed:
 * - Gateway deployed
 * - At least one sandbox registered in ~/.nemoclaw/sandboxes.json
 */
export function isOnboardComplete(): boolean {
  if (!isGatewayDeployed()) return false;
  try {
    const registryPath = path.join(os.homedir(), '.nemoclaw', 'sandboxes.json');
    const data = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
    return Object.keys(data.sandboxes || {}).length > 0;
  } catch {
    return false;
  }
}

/**
 * Check if the SSH tunnel for port 18789 is alive inside the sidecar.
 * Returns true when an ssh process is listening on the port.
 */
export function isPortForwardAlive(): boolean {
  if (!isIntelMac() || !isOpenShellSidecarRunning()) {
    try {
      execSyncSafe(`lsof -i :${OPENCLAW_PORT} -sTCP:LISTEN -t 2>/dev/null`, 5000);
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
        `docker exec ${OPENSHELL_SIDECAR} /usr/local/bin/openshell sandbox ssh-config ${SANDBOX_NAME} --gateway ${GATEWAY_NAME}`,
        10000,
      );
      execSync(
        `docker exec ${OPENSHELL_SIDECAR} sh -c 'mkdir -p /root/.ssh && chmod 700 /root/.ssh'`,
        { stdio: 'pipe', timeout: 5000 },
      );
      const b64 = Buffer.from(sshConfig).toString('base64');
      execSync(
        `docker exec ${OPENSHELL_SIDECAR} sh -c 'echo "${b64}" | base64 -d > /root/.ssh/config && chmod 600 /root/.ssh/config'`,
        { stdio: 'pipe', timeout: 5000 },
      );

      // Start SSH tunnel: sidecar 0.0.0.0:18789 → sandbox 127.0.0.1:18789
      execSync(
        `docker exec -d ${OPENSHELL_SIDECAR} ssh -N -o ExitOnForwardFailure=yes ` +
        `-L 0.0.0.0:${OPENCLAW_PORT}:127.0.0.1:${OPENCLAW_PORT} ` +
        `openshell-${SANDBOX_NAME}`,
        { stdio: 'pipe', timeout: 10000 },
      );

      // Wait up to 5s for the tunnel to become ready
      for (let i = 0; i < 10; i++) {
        execSync('sleep 0.5', { stdio: 'pipe' });
        if (isPortForwardAlive()) {
          logApp('info', `SSH tunnel forwarding port ${OPENCLAW_PORT} to sandbox ${SANDBOX_NAME}`);
          return;
        }
      }
      logApp('warn', `SSH tunnel started but port ${OPENCLAW_PORT} not yet listening`);
    } catch (err: any) {
      logApp('warn', `SSH tunnel port forward failed: ${err.message}`);
    }
    return;
  }

  // ARM Mac / native: use openshell forward directly
  try {
    openshellExec(`forward stop ${OPENCLAW_PORT}`, 5000);
  } catch { /* ok */ }

  try {
    openshellExec(`forward start --background ${OPENCLAW_PORT} ${SANDBOX_NAME} --gateway ${GATEWAY_NAME}`, 15000);
    logApp('info', `Port ${OPENCLAW_PORT} forwarded to sandbox ${SANDBOX_NAME}`);
  } catch (err: any) {
    logApp('warn', `Port forward failed: ${err.message}`);
  }
}

export { SANDBOX_NAME, OPENCLAW_PORT };

// ════════════════════════════════════
// Docker Helpers
// ════════════════════════════════════

export function isDockerInstalled(): boolean {
  try {
    const { execSync } = require('child_process');
    execSync('docker --version', { encoding: 'utf-8', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

export function isDockerRunning(): boolean {
  try {
    const { execSync } = require('child_process');
    execSync('docker info', { encoding: 'utf-8', timeout: 10000, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

export function canInstallDocker(): boolean {
  const { execSync } = require('child_process');
  try {
    if (IS_WIN) {
      execSync('winget --version', { encoding: 'utf-8', timeout: 5000, stdio: 'pipe' });
      return true;
    }
    if (process.platform === 'darwin') {
      execSync('brew --version', { encoding: 'utf-8', timeout: 5000, stdio: 'pipe' });
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
      const paths = [
        process.env['ProgramFiles'] + '\\Docker\\Docker\\Docker Desktop.exe',
        process.env['ProgramFiles(x86)'] + '\\Docker\\Docker\\Docker Desktop.exe',
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

// ════════════════════════════════════
// NemoClaw CLI Helpers
// ════════════════════════════════════

/** Locate the nemoclaw npm package root (for mounting into the sidecar). */
function findNemoClawPackageRoot(): string | null {
  const candidates = [
    '/usr/local/lib/node_modules/nemoclaw',
    path.join(os.homedir(), '.local', 'lib', 'node_modules', 'nemoclaw'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'package.json'))) return c;
  }
  return null;
}

export function findNemoClawBinary(): string | null {
  if (IS_WIN) {
    try {
      const { execSync } = require('child_process');
      const result = execSync('wsl which nemoclaw', { encoding: 'utf-8', timeout: 5000 }).trim();
      if (result) return 'wsl';
    } catch { /* not in WSL */ }
    return null;
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
    return 'wsl bash -c "curl -fsSL https://nvidia.com/nemoclaw.sh | bash"';
  }
  const pathPrefix = isIntelMac() ? `export PATH="$HOME/.local/bin:$PATH" && ` : '';
  return `${pathPrefix}curl -fsSL https://nvidia.com/nemoclaw.sh | bash`;
}

export function getNemoClawOnboardCommand(): string {
  const pathPrefix = isIntelMac() ? `export PATH="$HOME/.local/bin:$PATH" && ` : '';
  if (IS_WIN) {
    return 'wsl bash -c "nemoclaw onboard"';
  }
  return `${pathPrefix}nemoclaw onboard`;
}

export function getNemoClawSetupCommand(): string {
  if (IS_WIN) {
    return 'wsl nemoclaw setup';
  }
  const pathPrefix = isIntelMac() ? `export PATH="$HOME/.local/bin:$PATH" && ` : '';
  return `${pathPrefix}nemoclaw onboard`;
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
    });
    const running = /running|active|up/i.test(out);
    return { running, port: running ? DEFAULT_NEMOCLAW_PORT : null };
  } catch { /* nemoclaw status failed */ }

  try {
    const { execSync } = require('child_process');
    const out = execSync(`${prefix}docker ps --filter "name=openclaw" --format "{{.Ports}}"`, {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: 'pipe',
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
