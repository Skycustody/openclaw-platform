// Valnaa Browser Relay — background service worker
// Connects to the OpenClaw gateway relay port and bridges browser actions

const DEFAULT_GATEWAY_PORT = 18789;
const DEFAULT_RELAY_PORT = 18792;
const RECONNECT_INTERVAL = 5000;
const HEALTH_CHECK_INTERVAL = 10000;

let ws = null;
let connected = false;
let gatewayPort = DEFAULT_GATEWAY_PORT;
let relayPort = DEFAULT_RELAY_PORT;

// Load saved settings
chrome.storage.local.get(['gatewayPort', 'relayPort'], (data) => {
  if (data.gatewayPort) gatewayPort = data.gatewayPort;
  if (data.relayPort) relayPort = data.relayPort;
  connect();
});

function updateBadge(status) {
  connected = status === 'connected';
  chrome.action.setBadgeText({ text: connected ? 'ON' : 'OFF' });
  chrome.action.setBadgeBackgroundColor({ color: connected ? '#22c55e' : '#ef4444' });
  chrome.action.setTitle({ title: connected ? 'Valnaa Relay: Connected to OpenClaw' : 'Valnaa Relay: Disconnected' });
}

async function checkGatewayHealth() {
  try {
    const res = await fetch(`http://127.0.0.1:${gatewayPort}/health`, { signal: AbortSignal.timeout(3000) });
    const data = await res.json();
    return data.ok === true;
  } catch {
    return false;
  }
}

function connect() {
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) return;

  const url = `ws://127.0.0.1:${relayPort}`;
  try {
    ws = new WebSocket(url);
  } catch {
    updateBadge('disconnected');
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    console.log('[valnaa-relay] Connected to gateway relay');
    updateBadge('connected');
  };

  ws.onmessage = async (event) => {
    try {
      const msg = JSON.parse(event.data);
      const response = await handleRelayMessage(msg);
      if (response) ws.send(JSON.stringify(response));
    } catch (err) {
      console.error('[valnaa-relay] Message handling error:', err);
    }
  };

  ws.onclose = () => {
    console.log('[valnaa-relay] Disconnected');
    updateBadge('disconnected');
    ws = null;
    scheduleReconnect();
  };

  ws.onerror = () => {
    updateBadge('disconnected');
  };
}

function scheduleReconnect() {
  setTimeout(async () => {
    const healthy = await checkGatewayHealth();
    if (healthy) connect();
    else scheduleReconnect();
  }, RECONNECT_INTERVAL);
}

async function handleRelayMessage(msg) {
  const { id, action, params } = msg;

  switch (action) {
    case 'ping':
      return { id, result: { ok: true } };

    case 'tabs.list': {
      const tabs = await chrome.tabs.query({});
      return { id, result: tabs.map(t => ({ id: t.id, url: t.url, title: t.title, active: t.active })) };
    }

    case 'tabs.open': {
      const tab = await chrome.tabs.create({ url: params.url, active: params.active !== false });
      return { id, result: { tabId: tab.id, url: tab.url } };
    }

    case 'tabs.close': {
      await chrome.tabs.remove(params.tabId);
      return { id, result: { ok: true } };
    }

    case 'tabs.navigate': {
      await chrome.tabs.update(params.tabId, { url: params.url });
      return { id, result: { ok: true } };
    }

    case 'tabs.activate': {
      await chrome.tabs.update(params.tabId, { active: true });
      return { id, result: { ok: true } };
    }

    case 'page.content': {
      const results = await chrome.scripting.executeScript({
        target: { tabId: params.tabId },
        func: () => ({ title: document.title, url: location.href, text: document.body?.innerText?.slice(0, 50000) || '' }),
      });
      return { id, result: results[0]?.result || {} };
    }

    case 'page.screenshot': {
      const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
      return { id, result: { dataUrl } };
    }

    case 'page.execute': {
      const results = await chrome.scripting.executeScript({
        target: { tabId: params.tabId },
        func: new Function('return (' + params.code + ')()'),
      });
      return { id, result: results[0]?.result };
    }

    case 'page.click': {
      await chrome.scripting.executeScript({
        target: { tabId: params.tabId },
        func: (selector) => { const el = document.querySelector(selector); if (el) el.click(); },
        args: [params.selector],
      });
      return { id, result: { ok: true } };
    }

    case 'page.fill': {
      await chrome.scripting.executeScript({
        target: { tabId: params.tabId },
        func: (selector, value) => {
          const el = document.querySelector(selector);
          if (el) { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }
        },
        args: [params.selector, params.value],
      });
      return { id, result: { ok: true } };
    }

    default:
      return { id, error: `Unknown action: ${action}` };
  }
}

let manualDisconnect = false;

// Listen for popup messages
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'reconnect') {
    manualDisconnect = false;
    connect();
  }
  if (msg.action === 'disconnect') {
    manualDisconnect = true;
    if (ws) { ws.close(); ws = null; }
    updateBadge('disconnected');
  }
});

// Periodic health check (skip if manually disconnected)
setInterval(async () => {
  if (!connected && !manualDisconnect) {
    const healthy = await checkGatewayHealth();
    if (healthy) connect();
  }
}, HEALTH_CHECK_INTERVAL);
