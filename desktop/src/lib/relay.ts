/**
 * Browser Relay — WebSocket server that bridges the Chrome extension
 * with the OpenClaw agent. The extension connects as a client and
 * handles browser commands (tabs, page actions, screenshots).
 * The agent connects as another client and sends commands.
 * Messages from the agent are forwarded to the extension and
 * responses flow back.
 */

import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { logApp } from '../openclaw/logger';

let server: http.Server | null = null;
let wss: WebSocketServer | null = null;

/** All connected clients. First one is typically the extension. */
const clients = new Set<WebSocket>();

export function startRelay(port: number): void {
  if (server) return;

  server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, clients: clients.size }));
  });

  wss = new WebSocketServer({ server });

  wss.on('connection', (ws) => {
    clients.add(ws);
    logApp('info', `Browser relay: client connected (total: ${clients.size})`);

    ws.on('message', (raw) => {
      // Forward message to all OTHER connected clients
      const data = raw.toString();
      for (const client of clients) {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(data);
        }
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      logApp('info', `Browser relay: client disconnected (total: ${clients.size})`);
    });

    ws.on('error', (err) => {
      logApp('warn', `Browser relay: client error — ${err.message}`);
      clients.delete(ws);
    });
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      logApp('warn', `Browser relay: port ${port} already in use — skipping`);
      server = null;
      wss = null;
      return;
    }
    logApp('error', `Browser relay server error: ${err.message}`);
  });

  server.listen(port, '127.0.0.1', () => {
    logApp('info', `Browser relay server listening on ws://127.0.0.1:${port}`);
  });
}

export function stopRelay(): void {
  for (const ws of clients) {
    try { ws.close(); } catch { /* ok */ }
  }
  clients.clear();

  if (wss) {
    try { wss.close(); } catch { /* ok */ }
    wss = null;
  }
  if (server) {
    try { server.close(); } catch { /* ok */ }
    server = null;
  }
  logApp('info', 'Browser relay server stopped');
}

export function isRelayRunning(): boolean {
  return server !== null && server.listening;
}
