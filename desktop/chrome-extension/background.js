// Valnaa Browser Relay — background service worker

const GATEWAY_PORT = 18789;
const RELAY_PORT = 18792;
const POLL_INTERVAL = 8000;

let ws = null;
let connected = false;
let paused = false; // user manually disconnected

// ── Badge ──
function setBadge(isConnected) {
  connected = isConnected;
  // Green checkmark when connected, empty when not
  chrome.action.setBadgeText({ text: isConnected ? '\u2713' : '' });
  chrome.action.setBadgeBackgroundColor({ color: '#16a34a' });
  chrome.action.setTitle({
    title: isConnected ? 'Valnaa: Connected to OpenClaw' : (paused ? 'Valnaa: Disconnected by user' : 'Valnaa: Not connected'),
  });
}

// ── Health ──
async function isGatewayUp() {
  try {
    const r = await fetch(`http://127.0.0.1:${GATEWAY_PORT}/health`, { signal: AbortSignal.timeout(2000) });
    const j = await r.json();
    return j.ok === true;
  } catch { return false; }
}

// ── WebSocket relay (optional) ──
function connectRelay() {
  if (ws) return;
  try {
    ws = new WebSocket(`ws://127.0.0.1:${RELAY_PORT}`);
    ws.onmessage = async (e) => {
      try {
        const msg = JSON.parse(e.data);
        const res = await handleMessage(msg);
        if (res) ws.send(JSON.stringify(res));
      } catch {}
    };
    ws.onclose = () => { ws = null; };
    ws.onerror = () => {};
  } catch { ws = null; }
}

// ── Poll loop ──
async function poll() {
  if (!paused) {
    const up = await isGatewayUp();
    setBadge(up);
    if (up) connectRelay();
  }
  setTimeout(poll, POLL_INTERVAL);
}

// ── Startup: load paused state, then start polling ──
chrome.storage.local.get('paused', (d) => {
  paused = d.paused === true;
  if (paused) {
    setBadge(false);
  } else {
    poll();
  }
});

// ── Messages from popup ──
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'reconnect') {
    paused = false;
    chrome.storage.local.set({ paused: false });
    poll();
  }
  if (msg.action === 'disconnect') {
    paused = true;
    chrome.storage.local.set({ paused: true });
    if (ws) { ws.close(); ws = null; }
    setBadge(false);
  }
  if (msg.action === 'status') {
    return true; // keep channel open for async response
  }
});

// ── Relay message handler ──
async function handleMessage(msg) {
  const { id, action, params } = msg;
  try {
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
      case 'tabs.close':
        await chrome.tabs.remove(params.tabId);
        return { id, result: { ok: true } };
      case 'tabs.navigate':
        await chrome.tabs.update(params.tabId, { url: params.url });
        return { id, result: { ok: true } };
      case 'tabs.activate':
        await chrome.tabs.update(params.tabId, { active: true });
        return { id, result: { ok: true } };
      case 'page.content': {
        const r = await chrome.scripting.executeScript({
          target: { tabId: params.tabId },
          func: () => ({ title: document.title, url: location.href, text: document.body?.innerText?.slice(0, 50000) || '' }),
        });
        return { id, result: r[0]?.result || {} };
      }
      case 'page.screenshot': {
        const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
        return { id, result: { dataUrl } };
      }
      case 'page.click':
        await chrome.scripting.executeScript({
          target: { tabId: params.tabId },
          func: (sel) => { const el = document.querySelector(sel); if (el) el.click(); },
          args: [params.selector],
        });
        return { id, result: { ok: true } };
      case 'page.fill':
        await chrome.scripting.executeScript({
          target: { tabId: params.tabId },
          func: (sel, val) => {
            const el = document.querySelector(sel);
            if (el) { el.value = val; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }
          },
          args: [params.selector, params.value],
        });
        return { id, result: { ok: true } };
      default:
        return { id, error: `Unknown action: ${action}` };
    }
  } catch (err) {
    return { id, error: err.message };
  }
}
