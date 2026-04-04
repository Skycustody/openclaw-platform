const dot = document.getElementById('status-dot');
const text = document.getElementById('status-text');
const gwPort = document.getElementById('gateway-port');
const rlPort = document.getElementById('relay-port');

async function checkStatus() {
  gwPort.textContent = '18789';
  rlPort.textContent = '18792';

  // Check if user manually disconnected
  const store = await chrome.storage.local.get('paused');
  if (store.paused) {
    dot.className = 'dot disconnected';
    text.textContent = 'Disconnected';
    return;
  }

  try {
    const res = await fetch('http://127.0.0.1:18789/health', { signal: AbortSignal.timeout(3000) });
    const json = await res.json();
    if (json.ok) {
      dot.className = 'dot connected';
      text.textContent = 'Connected to OpenClaw gateway';
    } else {
      dot.className = 'dot disconnected';
      text.textContent = 'Gateway not healthy';
    }
  } catch {
    dot.className = 'dot disconnected';
    text.textContent = 'Cannot reach gateway — is Valnaa running?';
  }
}

document.getElementById('reconnect-btn').addEventListener('click', () => {
  text.textContent = 'Reconnecting...';
  chrome.runtime.sendMessage({ action: 'reconnect' });
  setTimeout(checkStatus, 2000);
});

document.getElementById('disconnect-btn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'disconnect' });
  dot.className = 'dot disconnected';
  text.textContent = 'Disconnected';
});

checkStatus();
