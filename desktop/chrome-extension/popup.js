const dot = document.getElementById('status-dot');
const text = document.getElementById('status-text');
const gwPort = document.getElementById('gateway-port');
const rlPort = document.getElementById('relay-port');

async function checkStatus() {
  const data = await chrome.storage.local.get(['gatewayPort', 'relayPort']);
  const port = data.gatewayPort || 18789;
  const relay = data.relayPort || 18792;
  gwPort.textContent = port;
  rlPort.textContent = relay;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(3000) });
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

document.getElementById('reconnect-btn').addEventListener('click', async () => {
  text.textContent = 'Reconnecting...';
  chrome.runtime.sendMessage({ action: 'reconnect' });
  setTimeout(checkStatus, 2000);
});

document.getElementById('disconnect-btn').addEventListener('click', async () => {
  chrome.runtime.sendMessage({ action: 'disconnect' });
  dot.className = 'dot disconnected';
  text.textContent = 'Disconnected';
});

checkStatus();
