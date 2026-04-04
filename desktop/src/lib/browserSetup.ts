import fs from 'fs';
import path from 'path';
import { execFileSync, execSync, spawnSync } from 'child_process';
import type { Shell } from 'electron';
import { getOpenClawDir } from './platform';
import { logApp } from '../openclaw/logger';
import { findOpenClawBinary } from '../openclaw/installer';
import { loadRuntime, syncSandboxChromeExtensionToHost, findNemoClawPackageRoot, getActiveGatewayPort, getActiveRelayPort } from './runtime';

/** OpenClaw ships the loadable extension here after install / doctor. */
export function getChromeExtensionDir(): string {
  return path.join(getOpenClawDir(), 'browser', 'chrome-extension');
}

export function chromeExtensionIsReady(): boolean {
  const dir = getChromeExtensionDir();
  try {
    return fs.existsSync(path.join(dir, 'manifest.json'));
  } catch {
    return false;
  }
}

/** Copy from global openclaw npm package (works when CLI is installed but install subcommand failed). */
export function copyChromeExtensionFromOpenClawNpmTo(destExtDir: string): boolean {
  const home = require('os').homedir();
  const roots = [
    path.join(home, '.local', 'lib', 'node_modules', 'openclaw'),
    '/usr/local/lib/node_modules/openclaw',
  ];
  const rels = ['assets/chrome-extension', 'dist/assets/chrome-extension'];
  for (const root of roots) {
    for (const rel of rels) {
      const src = path.join(root, rel);
      const man = path.join(src, 'manifest.json');
      try {
        if (fs.existsSync(man)) {
          fs.mkdirSync(path.dirname(destExtDir), { recursive: true });
          fs.rmSync(destExtDir, { recursive: true, force: true });
          fs.cpSync(src, destExtDir, { recursive: true });
          logApp('info', `Copied Chrome extension from ${src}`);
          return true;
        }
      } catch {
        /* next */
      }
    }
  }

  // Walk upward from the real openclaw binary (npm bin layout)
  const bin = findOpenClawBinary();
  if (!bin) return false;
  try {
    let dir = path.dirname(fs.realpathSync(bin));
    for (let i = 0; i < 10; i++) {
      for (const rel of rels) {
        const src = path.join(dir, rel);
        if (fs.existsSync(path.join(src, 'manifest.json'))) {
          fs.mkdirSync(path.dirname(destExtDir), { recursive: true });
          fs.rmSync(destExtDir, { recursive: true, force: true });
          fs.cpSync(src, destExtDir, { recursive: true });
          logApp('info', `Copied Chrome extension from ${src}`);
          return true;
        }
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
    /* ok */
  }
  return false;
}

/** NemoClaw’s npm tree often includes openclaw with a bundled extension — no sandbox SSH needed. */
function copyChromeExtensionFromNemoclawDependency(): boolean {
  const nemoRoot = findNemoClawPackageRoot();
  if (!nemoRoot) return false;
  const candidates = [
    path.join(nemoRoot, 'node_modules', 'openclaw', 'assets', 'chrome-extension'),
    path.join(nemoRoot, 'node_modules', 'openclaw', 'dist', 'assets', 'chrome-extension'),
  ];
  const dest = getChromeExtensionDir();
  for (const src of candidates) {
    try {
      if (fs.existsSync(path.join(src, 'manifest.json'))) {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.rmSync(dest, { recursive: true, force: true });
        fs.cpSync(src, dest, { recursive: true });
        logApp('info', `Copied Chrome extension from NemoClaw bundle: ${src}`);
        return true;
      }
    } catch {
      /* next */
    }
  }
  return false;
}

function tryHostOpenclawBrowserInstall(bin: string): void {
  try {
    logApp('info', 'Running: openclaw browser extension install (host)...');
    execFileSync(bin, ['browser', 'extension', 'install'], {
      timeout: 120000,
      stdio: 'pipe',
      cwd: require('os').homedir(),
    });
  } catch (err: any) {
    logApp('warn', `openclaw browser extension install (host): ${err?.message || err}`);
  }
}

function tryHostDoctorFix(bin: string): void {
  try {
    logApp('info', 'Running: openclaw doctor --fix (host, last resort)...');
    execFileSync(bin, ['doctor', '--fix'], {
      timeout: 180000,
      stdio: 'pipe',
      cwd: require('os').homedir(),
    });
  } catch (err: any) {
    logApp('warn', `openclaw doctor --fix (host): ${err?.message || err}`);
  }
}

/**
 * Try to materialize extension files via OpenClaw CLI (non-interactive fix).
 * Returns true if manifest exists after (or already).
 */
export function ensureChromeExtensionFiles(): { ok: boolean; error?: string } {
  if (chromeExtensionIsReady()) {
    return { ok: true };
  }

  const dest = getChromeExtensionDir();
  const bin = findOpenClawBinary();

  // 0) Valnaa bundled extension — copy from app resources (fastest, always available)
  try {
    const appPath = require('electron').app?.getAppPath?.() || '';
    const bundledPaths = [
      path.join(appPath, 'chrome-extension'),
      path.join(appPath, 'dist', 'chrome-extension'),
      path.join(__dirname, '..', 'chrome-extension'),
      path.join(__dirname, '..', '..', 'chrome-extension'),
    ];
    for (const src of bundledPaths) {
      if (fs.existsSync(path.join(src, 'manifest.json'))) {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.rmSync(dest, { recursive: true, force: true });
        fs.cpSync(src, dest, { recursive: true });
        logApp('info', `Copied Valnaa browser extension from ${src}`);
        if (chromeExtensionIsReady()) return { ok: true };
      }
    }
  } catch (err: any) {
    logApp('warn', `Valnaa bundled extension copy failed: ${err?.message || err}`);
  }

  // 1) NemoClaw npm bundle (openclaw nested under nemoclaw)
  if (loadRuntime()?.runtime === 'nemoclaw' && copyChromeExtensionFromNemoclawDependency()) {
    return { ok: true };
  }

  // 2) Host CLI: try openclaw npm package copy (skip `browser extension install` — removed in 2026.4+)
  if (bin) {
    if (copyChromeExtensionFromOpenClawNpmTo(dest)) {
      return { ok: true };
    }
  }

  // 2) NemoClaw: copy from sandbox (install + tar inside syncSandboxChromeExtensionToHost)
  if (loadRuntime()?.runtime === 'nemoclaw') {
    const synced = syncSandboxChromeExtensionToHost();
    if (synced.ok && chromeExtensionIsReady()) {
      return { ok: true };
    }
    if (!synced.ok && synced.error && synced.error !== 'not-nemoclaw') {
      return { ok: false, error: synced.error };
    }
  }

  // 3) doctor --fix on host (older CLI; can be destructive — last)
  if (bin) {
    tryHostDoctorFix(bin);
    if (chromeExtensionIsReady()) {
      return { ok: true };
    }
    if (copyChromeExtensionFromOpenClawNpmTo(dest)) {
      return { ok: true };
    }
  }

  if (!bin && loadRuntime()?.runtime !== 'nemoclaw') {
    return {
      ok: false,
      error:
        'OpenClaw CLI not found. Install: npm install -g openclaw — then use “Refresh path & token” in Valnaa.',
    };
  }

  return {
    ok: false,
    error:
      'Could not get the Chrome extension onto this Mac. If you use NemoClaw: install OpenClaw on the host too (npm i -g openclaw) so we can copy assets/chrome-extension, then “Refresh path & token” in Valnaa. Docs: https://docs.openclaw.ai/tools/browser',
  };
}

/**
 * Clipboard: line 1 is the absolute path — user pastes it into Chrome’s file picker (⌘⇧G).
 * Rest is token/URLs for the extension Options page.
 */
export function buildBrowserSetupClipboardBlock(gatewayToken: string, extensionDirAbsolute: string): string {
  const tok = gatewayToken.trim();
  const lines = [
    extensionDirAbsolute,
    '',
    '↑ PASTE ONLY THE FIRST LINE ABOVE: in “Load unpacked”, press ⌘⇧G (Go to Folder), paste, Go, then Select.',
    '',
    '— OpenClaw Browser Relay → Options —',
    'Gateway token field: paste ONLY the next line (no label, no quotes, no spaces before/after):',
    tok,
    '',
    `Gateway URL: http://127.0.0.1:${getActiveGatewayPort()}`,
    `Browser relay URL: http://127.0.0.1:${getActiveRelayPort()}`,
  ];
  return lines.join('\n');
}

export const BROWSER_DOCS_URL = 'https://docs.openclaw.ai/tools/browser';

/** Folder name used when copying the unpacked extension into Downloads. */
export const CHROME_EXTENSION_USER_FOLDER_NAME = 'openclaw-browser-relay-extension';

/** Suggested zip filename (Load unpacked works on the folder after unzip). */
export const CHROME_EXTENSION_ZIP_NAME = 'openclaw-browser-relay-extension.zip';

/**
 * Create a .zip of the unpacked extension directory (one top-level folder inside the archive).
 */
export function zipChromeExtensionDirectory(extensionDirAbsolute: string, zipFileAbsolute: string): void {
  const abs = path.resolve(extensionDirAbsolute);
  const manifest = path.join(abs, 'manifest.json');
  if (!fs.existsSync(manifest)) {
    throw new Error('Extension folder is missing manifest.json');
  }
  const parent = path.dirname(abs);
  const base = path.basename(abs);
  const outZip = path.resolve(zipFileAbsolute);
  fs.mkdirSync(path.dirname(outZip), { recursive: true });
  if (fs.existsSync(outZip)) {
    fs.unlinkSync(outZip);
  }

  const tryTar = () => {
    const r = spawnSync('tar', ['-a', '-cf', outZip, '-C', parent, base], {
      timeout: 120000,
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024,
    });
    if (r.status !== 0) {
      throw new Error((r.stderr && String(r.stderr)) || 'tar failed');
    }
  };
  const tryZip = () => {
    execFileSync('zip', ['-r', '-q', outZip, base], {
      cwd: parent,
      timeout: 120000,
      stdio: 'pipe',
      maxBuffer: 50 * 1024 * 1024,
    });
  };
  const tryPowerShell = () => {
    if (process.platform !== 'win32') return;
    const esc = (s: string) => s.replace(/'/g, "''");
    const ps = `Compress-Archive -LiteralPath '${esc(abs)}' -DestinationPath '${esc(outZip)}' -Force`;
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {
      timeout: 120000,
      stdio: 'pipe',
    });
  };

  try {
    tryTar();
  } catch {
    try {
      tryZip();
    } catch {
      tryPowerShell();
    }
  }

  if (!fs.existsSync(outZip) || fs.statSync(outZip).size < 64) {
    throw new Error('Could not create zip (tar / zip / PowerShell).');
  }
}

/** Copy the unpacked extension tree to a destination folder (e.g. Downloads). */
export function copyChromeExtensionTree(extensionDirAbsolute: string, destDirAbsolute: string): void {
  const abs = path.resolve(extensionDirAbsolute);
  const manifest = path.join(abs, 'manifest.json');
  if (!fs.existsSync(manifest)) {
    throw new Error('Extension folder is missing manifest.json');
  }
  const dest = path.resolve(destDirAbsolute);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(abs, dest, { recursive: true });
}

/**
 * Open Chrome's extension management page (best-effort; OS differences).
 */
export function openChromeExtensionsPage(electronShell: Shell): void {
  if (process.platform === 'darwin') {
    for (const appName of ['Google Chrome', 'Google Chrome Canary', 'Chromium']) {
      try {
        execSync(`open -a "${appName}" "chrome://extensions/"`, { stdio: 'pipe', timeout: 8000 });
        return;
      } catch {
        /* try next */
      }
    }
  }
  if (process.platform === 'win32') {
    try {
      execSync('cmd /c start chrome "chrome://extensions/"', { stdio: 'pipe', timeout: 8000 });
      return;
    } catch {
      /* fall through */
    }
  }
  void electronShell.openExternal('chrome://extensions/');
}
