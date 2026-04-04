const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'src', 'renderer');
const dest = path.join(__dirname, '..', 'dist', 'renderer');

function copyDir(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const s = path.join(srcDir, entry.name);
    const d = path.join(destDir, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

copyDir(src, dest);
console.log('Renderer files copied to dist/renderer');

const iconSrc = path.join(__dirname, '..', 'assets', 'icon.png');
const iconDest = path.join(dest, 'app-icon.png');
try {
  if (fs.existsSync(iconSrc)) fs.copyFileSync(iconSrc, iconDest);
} catch {
  /* optional */
}

// Copy xterm.js assets for the in-app terminal
const vendorDir = path.join(dest, 'vendor');
fs.mkdirSync(vendorDir, { recursive: true });

const xtermPkg = path.join(__dirname, '..', 'node_modules', '@xterm', 'xterm');
const fitPkg = path.join(__dirname, '..', 'node_modules', '@xterm', 'addon-fit');

fs.copyFileSync(path.join(xtermPkg, 'css', 'xterm.css'), path.join(vendorDir, 'xterm.css'));
fs.copyFileSync(path.join(xtermPkg, 'lib', 'xterm.mjs'), path.join(vendorDir, 'xterm.mjs'));
fs.copyFileSync(path.join(fitPkg, 'lib', 'addon-fit.mjs'), path.join(vendorDir, 'addon-fit.mjs'));

console.log('xterm.js vendor files copied to dist/renderer/vendor/');

// Copy Valnaa Chrome extension to dist
const extSrc = path.join(__dirname, '..', 'chrome-extension');
const extDest = path.join(__dirname, '..', 'dist', 'chrome-extension');
if (fs.existsSync(extSrc)) {
  copyDir(extSrc, extDest);
  console.log('Chrome extension copied to dist/chrome-extension/');
}
