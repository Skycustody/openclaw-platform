/**
 * Re-run copy-renderer when src/renderer changes (tsc -w does not copy HTML).
 */
const fs = require('fs');
const path = require('path');

const rendererSrc = path.join(__dirname, '..', 'src', 'renderer');

function copyOnce() {
  require('./copy-renderer.js');
}

copyOnce();
console.log('[watch-renderer] Watching', rendererSrc);

let timer = null;
function scheduleCopy() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    try {
      copyOnce();
    } catch (e) {
      console.error('[watch-renderer]', e);
    }
  }, 150);
}

try {
  fs.watch(rendererSrc, { recursive: true }, scheduleCopy);
} catch (e) {
  console.error('[watch-renderer] fs.watch failed:', e.message);
  process.exit(1);
}
