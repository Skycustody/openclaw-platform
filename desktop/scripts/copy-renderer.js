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

// Copy xterm.js assets for the in-app terminal
const vendorDir = path.join(dest, 'vendor');
fs.mkdirSync(vendorDir, { recursive: true });

const xtermPkg = path.join(__dirname, '..', 'node_modules', '@xterm', 'xterm');
const fitPkg = path.join(__dirname, '..', 'node_modules', '@xterm', 'addon-fit');

fs.copyFileSync(path.join(xtermPkg, 'css', 'xterm.css'), path.join(vendorDir, 'xterm.css'));
fs.copyFileSync(path.join(xtermPkg, 'lib', 'xterm.mjs'), path.join(vendorDir, 'xterm.mjs'));
fs.copyFileSync(path.join(fitPkg, 'lib', 'addon-fit.mjs'), path.join(vendorDir, 'addon-fit.mjs'));

console.log('xterm.js vendor files copied to dist/renderer/vendor/');
