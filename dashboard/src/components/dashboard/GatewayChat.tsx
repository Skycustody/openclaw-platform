'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Send, Square, Loader2, Bot, User, AlertCircle, WifiOff, Wifi,
} from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
  streaming?: boolean;
}

interface GatewayChatProps {
  gatewayUrl: string;
  token: string;
}

type WsState = 'connecting' | 'connected' | 'disconnected' | 'error';

let reqCounter = 0;
function nextId() {
  return `r_${++reqCounter}_${Date.now()}`;
}

export default function GatewayChat({ gatewayUrl, token }: GatewayChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [wsState, setWsState] = useState<WsState>('connecting');
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pendingCallbacks = useRef<Map<string, (res: any) => void>>(new Map());
  const streamBufferRef = useRef<string>('');
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isUnmounted = useRef(false);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    });
  }, []);

  const sendReq = useCallback((method: string, params: any = {}): Promise<any> => {
    return new Promise((resolve, reject) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        reject(new Error('Not connected'));
        return;
      }
      const id = nextId();
      const timeout = setTimeout(() => {
        pendingCallbacks.current.delete(id);
        reject(new Error('Request timed out'));
      }, 30000);

      pendingCallbacks.current.set(id, (res: any) => {
        clearTimeout(timeout);
        pendingCallbacks.current.delete(id);
        if (res.ok) resolve(res.payload);
        else reject(new Error(res.error?.message || 'Request failed'));
      });

      ws.send(JSON.stringify({ type: 'req', id, method, params }));
    });
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const res = await sendReq('chat.history', { limit: 50 });
      const entries: Message[] = [];
      const items = res?.messages || res?.entries || res || [];
      if (Array.isArray(items)) {
        for (const entry of items) {
          const role = entry.role === 'user' ? 'user' : entry.role === 'assistant' ? 'assistant' : 'system';
          const content = typeof entry.content === 'string' ? entry.content
            : typeof entry.text === 'string' ? entry.text : '';
          if (!content) continue;
          entries.push({
            id: entry.id || `h_${entries.length}`,
            role,
            content,
            timestamp: entry.ts || entry.timestamp,
          });
        }
      }
      setMessages(entries);
      setTimeout(scrollToBottom, 100);
    } catch {
      // History might not be available yet
    }
  }, [sendReq, scrollToBottom]);

  const connect = useCallback(() => {
    if (isUnmounted.current) return;
    if (wsRef.current && wsRef.current.readyState < 2) return;

    setWsState('connecting');
    setError(null);

    const wsUrlWithToken = gatewayUrl.includes('?')
      ? `${gatewayUrl}&token=${encodeURIComponent(token)}`
      : `${gatewayUrl}?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(wsUrlWithToken);
    wsRef.current = ws;

    ws.onopen = () => {
      // Wait for challenge then send connect
    };

    ws.onmessage = (evt) => {
      let msg: any;
      try { msg = JSON.parse(evt.data); } catch { return; }

      if (msg.type === 'event' && msg.event === 'connect.challenge') {
        ws.send(JSON.stringify({
          type: 'req',
          id: nextId(),
          method: 'connect',
          params: {
            minProtocol: 3,
            maxProtocol: 3,
            client: { id: 'cli', version: '1.0.0', platform: 'web', mode: 'operator' },
            role: 'operator',
            scopes: ['operator.read', 'operator.write', 'operator.admin'],
            caps: [],
            commands: [],
            permissions: {},
            auth: { token },
            locale: 'en-US',
            userAgent: 'openclaw-cli/1.0.0',
          },
        }));
        return;
      }

      if (msg.type === 'res') {
        if (msg.payload?.type === 'hello-ok') {
          setWsState('connected');
          loadHistory();
          return;
        }

        const cb = pendingCallbacks.current.get(msg.id);
        if (cb) cb(msg);
        return;
      }

      if (msg.type === 'event' && msg.event === 'chat') {
        const p = msg.payload || {};

        if (p.type === 'text' || p.type === 'chunk' || p.text || p.content) {
          const chunk = p.text || p.content || p.chunk || '';
          if (chunk) {
            streamBufferRef.current += chunk;
            const buffered = streamBufferRef.current;

            setMessages(prev => {
              const last = prev[prev.length - 1];
              if (last?.streaming) {
                return [...prev.slice(0, -1), { ...last, content: buffered }];
              }
              return [...prev, {
                id: `stream_${Date.now()}`,
                role: 'assistant',
                content: buffered,
                streaming: true,
              }];
            });
            scrollToBottom();
          }
        }

        if (p.type === 'done' || p.type === 'end' || p.finished || p.done) {
          streamBufferRef.current = '';
          setActiveRunId(null);
          setMessages(prev => prev.map(m => m.streaming ? { ...m, streaming: false } : m));
        }

        if (p.type === 'error') {
          streamBufferRef.current = '';
          setActiveRunId(null);
          setMessages(prev => {
            const cleaned = prev.map(m => m.streaming ? { ...m, streaming: false } : m);
            return [...cleaned, {
              id: `err_${Date.now()}`,
              role: 'system',
              content: `Error: ${p.message || p.error || 'Unknown error'}`,
            }];
          });
        }

        if (p.type === 'tool_call' || p.type === 'tool') {
          const toolName = p.tool || p.name || 'tool';
          const toolStatus = p.status || 'running';
          setMessages(prev => {
            const last = prev[prev.length - 1];
            if (last?.streaming) {
              return [...prev.slice(0, -1), {
                ...last,
                content: last.content + `\n\n*Using ${toolName}...*`,
              }];
            }
            return [...prev, {
              id: `tool_${Date.now()}`,
              role: 'assistant',
              content: `*Using ${toolName} (${toolStatus})...*`,
              streaming: true,
            }];
          });
          scrollToBottom();
        }
      }
    };

    ws.onerror = () => {
      setWsState('error');
      setError('Connection error — check browser console');
    };

    ws.onclose = (e) => {
      wsRef.current = null;
      if (e.code === 1008) {
        setWsState('error');
        setError(`Gateway rejected: ${e.reason || 'pairing required'}`);
      } else {
        setWsState('disconnected');
      }
      if (!isUnmounted.current && e.code !== 1000) {
        const delay = e.code === 1008 ? 10000 : 3000;
        reconnectTimer.current = setTimeout(connect, delay);
      }
    };
  }, [gatewayUrl, token, loadHistory, scrollToBottom]);

  useEffect(() => {
    isUnmounted.current = false;
    connect();
    return () => {
      isUnmounted.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) wsRef.current.close(1000);
    };
  }, [connect]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || activeRunId) return;

    const userMsg: Message = {
      id: `u_${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    scrollToBottom();

    streamBufferRef.current = '';

    try {
      const res = await sendReq('chat.send', {
        message: text,
        idempotencyKey: userMsg.id,
      });
      if (res?.runId) setActiveRunId(res.runId);
    } catch (err: any) {
      setMessages(prev => [...prev, {
        id: `err_${Date.now()}`,
        role: 'system',
        content: `Failed to send: ${err.message}`,
      }]);
    }
  }, [input, activeRunId, sendReq, scrollToBottom]);

  const handleStop = useCallback(async () => {
    try {
      await sendReq('chat.abort', {});
    } catch {}
    streamBufferRef.current = '';
    setActiveRunId(null);
    setMessages(prev => prev.map(m => m.streaming ? { ...m, streaming: false } : m));
  }, [sendReq]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isStreaming = messages.some(m => m.streaming);

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a]">
      {/* Connection status bar */}
      {wsState !== 'connected' && (
        <div className={`flex items-center gap-2 px-4 py-2 text-[12px] shrink-0 ${
          wsState === 'connecting' ? 'bg-amber-500/10 text-amber-400' :
          wsState === 'error' ? 'bg-red-500/10 text-red-400' :
          'bg-white/5 text-white/40'
        }`}>
          {wsState === 'connecting' ? (
            <><Loader2 className="h-3 w-3 animate-spin" /> Connecting to agent...</>
          ) : wsState === 'error' ? (
            <><AlertCircle className="h-3 w-3" /> {error || 'Connection failed'} — retrying...</>
          ) : (
            <><WifiOff className="h-3 w-3" /> Disconnected — reconnecting...</>
          )}
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {messages.length === 0 && wsState === 'connected' && (
          <div className="flex flex-col items-center justify-center h-full text-center opacity-40">
            <Bot className="h-10 w-10 text-white/20 mb-3" />
            <p className="text-[14px] text-white/30">Send a message to start chatting</p>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-3 py-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
            {msg.role !== 'user' && (
              <div className="shrink-0 mt-0.5">
                {msg.role === 'assistant' ? (
                  <div className="h-7 w-7 rounded-lg bg-white/[0.06] flex items-center justify-center">
                    <Bot className="h-3.5 w-3.5 text-white/40" />
                  </div>
                ) : (
                  <div className="h-7 w-7 rounded-lg bg-red-500/10 flex items-center justify-center">
                    <AlertCircle className="h-3.5 w-3.5 text-red-400/60" />
                  </div>
                )}
              </div>
            )}

            <div className={`max-w-[80%] ${
              msg.role === 'user'
                ? 'bg-white/[0.08] rounded-2xl rounded-br-md px-4 py-2.5'
                : msg.role === 'system'
                  ? 'bg-red-500/5 border border-red-500/10 rounded-xl px-4 py-2.5'
                  : 'flex-1 min-w-0'
            }`}>
              <p className={`text-[14px] leading-relaxed whitespace-pre-wrap break-words ${
                msg.role === 'user' ? 'text-white/90'
                : msg.role === 'system' ? 'text-red-400/80 text-[13px]'
                : 'text-white/80'
              }`}>
                {msg.content}
                {msg.streaming && (
                  <span className="inline-block w-1.5 h-4 bg-white/40 ml-0.5 animate-pulse rounded-sm" />
                )}
              </p>
            </div>

            {msg.role === 'user' && (
              <div className="shrink-0 mt-0.5">
                <div className="h-7 w-7 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <User className="h-3.5 w-3.5 text-blue-400/60" />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-white/[0.06] px-4 py-3">
        <div className="flex items-end gap-2">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message your agent..."
              rows={1}
              disabled={wsState !== 'connected'}
              className="w-full resize-none rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-[14px] text-white/90 placeholder:text-white/20 focus:outline-none focus:border-white/20 focus:bg-white/[0.04] transition-all disabled:opacity-40"
              style={{ maxHeight: '120px', minHeight: '44px' }}
              onInput={(e) => {
                const t = e.target as HTMLTextAreaElement;
                t.style.height = '44px';
                t.style.height = Math.min(t.scrollHeight, 120) + 'px';
              }}
            />
          </div>

          {isStreaming ? (
            <button
              onClick={handleStop}
              className="shrink-0 h-11 w-11 rounded-xl bg-red-500/20 hover:bg-red-500/30 flex items-center justify-center transition-all"
              title="Stop"
            >
              <Square className="h-4 w-4 text-red-400" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim() || wsState !== 'connected'}
              className="shrink-0 h-11 w-11 rounded-xl bg-white/[0.08] hover:bg-white/[0.12] flex items-center justify-center transition-all disabled:opacity-30 disabled:hover:bg-white/[0.08]"
              title="Send"
            >
              <Send className="h-4 w-4 text-white/60" />
            </button>
          )}
        </div>

        <div className="flex items-center justify-between mt-2 px-1">
          <div className="flex items-center gap-1.5">
            <div className={`h-1.5 w-1.5 rounded-full ${
              wsState === 'connected' ? 'bg-green-400' :
              wsState === 'connecting' ? 'bg-amber-400 animate-pulse' :
              'bg-red-400'
            }`} />
            <span className="text-[10px] text-white/20">
              {wsState === 'connected' ? 'Connected' : wsState === 'connecting' ? 'Connecting' : 'Disconnected'}
            </span>
          </div>
          <span className="text-[10px] text-white/15">Shift+Enter for new line</span>
        </div>
      </div>
    </div>
  );
}
