'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { flushSync } from 'react-dom';
import {
  Send, Square, Loader2, Bot, User, AlertCircle, WifiOff, RefreshCw,
  ChevronDown, ChevronRight, Image as ImageIcon, Mic, MicOff, Upload,
  Check, X,
} from 'lucide-react';
import api from '@/lib/api';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
  streaming?: boolean;
  imageUrl?: string;
}

interface AgentInfo {
  id: string;
  name: string;
  is_primary: boolean;
  status: string;
  openclawAgentId?: string;
}

interface ModelInfo {
  id: string;
  displayName: string;
  costPer1MTokens: number;
}

const AVAILABLE_MODELS: ModelInfo[] = [
  { id: 'auto', displayName: 'Auto (Smart Router)', costPer1MTokens: 0 },
  { id: 'openai/gpt-4.1-nano', displayName: 'GPT-4.1 Nano', costPer1MTokens: 0.10 },
  { id: 'openai/gpt-4o-mini', displayName: 'GPT-4o Mini', costPer1MTokens: 0.15 },
  { id: 'google/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', costPer1MTokens: 0.30 },
  { id: 'openai/gpt-4.1-mini', displayName: 'GPT-4.1 Mini', costPer1MTokens: 0.40 },
  { id: 'deepseek/deepseek-r1', displayName: 'DeepSeek R1', costPer1MTokens: 0.70 },
  { id: 'anthropic/claude-3.5-haiku', displayName: 'Claude 3.5 Haiku', costPer1MTokens: 1.00 },
  { id: 'google/gemini-2.5-pro', displayName: 'Gemini 2.5 Pro', costPer1MTokens: 1.25 },
  { id: 'openai/gpt-4.1', displayName: 'GPT-4.1', costPer1MTokens: 2.00 },
  { id: 'openai/gpt-4o', displayName: 'GPT-4o', costPer1MTokens: 2.50 },
  { id: 'anthropic/claude-sonnet-4', displayName: 'Claude Sonnet 4', costPer1MTokens: 3.00 },
  { id: 'anthropic/claude-opus-4', displayName: 'Claude Opus 4', costPer1MTokens: 15.00 },
];

interface GatewayChatProps {
  gatewayUrl: string;
  token: string;
  agentName?: string;
  modelName?: string;
}

type WsState = 'connecting' | 'connected' | 'disconnected' | 'error';

let reqCounter = 0;
function nextId() {
  return `r_${++reqCounter}_${Date.now()}`;
}

function extractContent(entry: Record<string, unknown>): string {
  if (typeof entry.content === 'string') return entry.content;
  if (typeof entry.text === 'string') return entry.text;
  const parts = entry.parts as Array<{ text?: string; content?: string }> | undefined;
  if (Array.isArray(parts)) {
    return parts.map((p) => p?.text ?? p?.content ?? '').filter(Boolean).join('\n');
  }
  const contentArr = entry.content as Array<{ text?: string }> | undefined;
  if (Array.isArray(contentArr)) {
    return contentArr.map((c) => c?.text ?? '').filter(Boolean).join('\n');
  }
  return '';
}

export default function GatewayChat({ gatewayUrl, token, agentName, modelName }: GatewayChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [wsState, setWsState] = useState<WsState>('connecting');
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filesOpen, setFilesOpen] = useState(false);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>(agentName || 'Agent');
  const [selectedModel, setSelectedModel] = useState<string>('auto');
  const [agentModels, setAgentModels] = useState<Record<string, string>>({});
  const [showAgentDropdown, setShowAgentDropdown] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const [agentSearch, setAgentSearch] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const agentDropdownRef = useRef<HTMLDivElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pendingCallbacks = useRef<Map<string, (res: any) => void>>(new Map());
  const streamBufferRef = useRef<string>('');
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastHistoryLen = useRef<number>(0);
  const isUnmounted = useRef(false);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    });
  }, []);

  // Fetch agents list
  useEffect(() => {
    api.get<{ agents: AgentInfo[] }>('/agents')
      .then(res => {
        setAgents(res.agents || []);
        if (!agentName && res.agents?.length > 0) {
          const primary = res.agents.find(a => a.is_primary);
          setSelectedAgent(primary?.name || res.agents[0].name);
        }
      })
      .catch(() => {});
  }, [agentName]);

  // Load saved model (brain_mode + manual_model) so it reflects at top and persists on reload
  useEffect(() => {
    api.get<{ settings: { brain_mode?: string; manual_model?: string | null } }>('/settings')
      .then(res => {
        const s = res.settings;
        if (s?.brain_mode === 'manual' && s?.manual_model) {
          setSelectedModel(s.manual_model);
        } else {
          setSelectedModel('auto');
        }
      })
      .catch(() => {});
  }, []);

  // Close dropdowns on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (agentDropdownRef.current && !agentDropdownRef.current.contains(e.target as Node)) setShowAgentDropdown(false);
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) setShowModelDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleImageUpload = useCallback(() => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.onchange = async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      setUploadStatus('Uploading...');
      try {
        const reader = new FileReader();
        const content = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve((reader.result as string).split(',')[1] || '');
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        await api.post('/files/upload', { filename: file.name, content });
        setUploadStatus(`${file.name} uploaded`);
        setInput(prev => prev + (prev ? '\n' : '') + `[Attached: ${file.name}]`);
        setTimeout(() => setUploadStatus(null), 3000);
      } catch (err: any) {
        setUploadStatus(`Failed: ${err.message}`);
        setTimeout(() => setUploadStatus(null), 4000);
      }
    };
    fileInput.click();
  }, []);

  const handleVoice = useCallback(() => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setUploadStatus('Speech recognition not supported in this browser');
      setTimeout(() => setUploadStatus(null), 3000);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    setIsRecording(true);

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput(prev => prev + (prev ? ' ' : '') + transcript);
      setIsRecording(false);
    };
    recognition.onerror = () => setIsRecording(false);
    recognition.onend = () => setIsRecording(false);
    recognition.start();
  }, [isRecording]);

  const handleSelectAgent = useCallback((agent: AgentInfo) => {
    // Save current agent's model before switching
    setAgentModels(prev => ({ ...prev, [selectedAgent]: selectedModel }));
    setSelectedAgent(agent.name);
    // Restore the new agent's model (or default to auto)
    setSelectedModel(prev => agentModels[agent.name] || 'auto');
    setShowAgentDropdown(false);
  }, [selectedAgent, selectedModel, agentModels]);

  const handleSelectModel = useCallback(async (model: ModelInfo) => {
    setSelectedModel(model.id);
    setAgentModels(prev => ({ ...prev, [selectedAgent]: model.id }));
    setShowModelDropdown(false);
    try {
      if (model.id === 'auto') {
        await api.put('/settings/brain', { brainMode: 'auto', manualModel: null });
      } else {
        await api.put('/settings/brain', { brainMode: 'manual', manualModel: model.id });
      }
    } catch {}
  }, [selectedAgent]);

  const getModelLabel = () => {
    if (selectedModel === 'auto') return 'Auto';
    return AVAILABLE_MODELS.find(m => m.id === selectedModel)?.displayName || selectedModel;
  };

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

  const getSessionKey = useCallback((): string => {
    return agents.find(a => a.name === selectedAgent)?.openclawAgentId ?? 'main';
  }, [agents, selectedAgent]);

  const loadHistory = useCallback(async () => {
    try {
      const sessionKey = getSessionKey();
      const res = await sendReq('chat.history', { sessionKey, limit: 50 });
      const entries: Message[] = [];
      const items = res?.messages || res?.entries || res?.data?.messages || (Array.isArray(res) ? res : []);
      if (Array.isArray(items)) {
        for (const entry of items) {
          const role = entry.role === 'user' ? 'user' : entry.role === 'assistant' ? 'assistant' : 'system';
          const content = extractContent(entry as Record<string, unknown>);
          if (!content) continue;
          entries.push({
            id: entry.id || `h_${entries.length}`,
            role,
            content,
            timestamp: entry.ts || entry.timestamp,
          });
        }
      }
      lastHistoryLen.current = entries.length;
      setMessages(entries);
      setTimeout(scrollToBottom, 100);
    } catch {
      // History might not be available yet
    }
  }, [sendReq, scrollToBottom, getSessionKey]);

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
            client: { id: 'openclaw-control-ui', version: '1.0.0', platform: 'web', mode: 'ui' },
            role: 'operator',
            scopes: ['operator.read', 'operator.write', 'operator.admin', 'operator.pairing', 'operator.approvals'],
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
        if (cb) {
          cb(msg);
          // If this was chat.send response with inline reply (non-streaming), show it
          const pl = msg.payload || {};
          const replyText = pl.text ?? pl.content ?? pl.reply;
          const isChatSendResponse = 'runId' in pl || (typeof replyText === 'string' && replyText.length > 0 && !Array.isArray(pl.messages));
          if (isChatSendResponse && typeof replyText === 'string' && replyText.length > 0) {
            streamBufferRef.current = '';
            setActiveRunId(pl.runId ?? null);
            setMessages(prev => {
              const last = prev[prev.length - 1];
              if (last?.streaming) {
                return [...prev.slice(0, -1), { ...last, content: replyText, streaming: false }];
              }
              return [...prev, {
                id: `a_${Date.now()}`,
                role: 'assistant',
                content: replyText,
                streaming: false,
              }];
            });
            scrollToBottom();
          }
        }
        return;
      }

      // Old (non-v3) protocol: gateway sends { type:'response', payload:{ text:'...' } }
      if (msg.type === 'response') {
        const text = msg.payload?.text ?? msg.payload?.content ?? msg.text ?? msg.content ?? '';
        if (typeof text === 'string' && text.length > 0) {
          streamBufferRef.current = '';
          setActiveRunId(null);
          if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null; }
          setMessages(prev => {
            const cleaned = prev.map(m => m.streaming ? { ...m, streaming: false } : m);
            const last = cleaned[cleaned.length - 1];
            if (last?.role === 'assistant' && last.content === text) return cleaned;
            return [...cleaned, { id: `a_${Date.now()}`, role: 'assistant' as const, content: text }];
          });
          scrollToBottom();
        }
        return;
      }

      // tool_call / tool_result (old protocol top-level types)
      if (msg.type === 'tool_call') {
        const toolName = msg.payload?.tool ?? msg.payload?.name ?? 'tool';
        setMessages(prev => [...prev, {
          id: `tool_${Date.now()}`,
          role: 'assistant' as const,
          content: `*Using ${String(toolName)}...*`,
          streaming: true,
        }]);
        scrollToBottom();
        return;
      }
      if (msg.type === 'tool_result') {
        setMessages(prev => prev.map(m => m.streaming ? { ...m, streaming: false } : m));
        return;
      }

      // Chat stream events: accept 'chat' and 'chat.*' and any event with chat-like payload
      const isChatEvent = msg.type === 'event' && (
        msg.event === 'chat' ||
        (typeof msg.event === 'string' && msg.event.startsWith('chat.')) ||
        (typeof msg.event === 'string' && (msg.event === 'run.chunk' || msg.event === 'run.delta'))
      );
      const p = (msg.payload != null ? msg.payload : msg) as Record<string, unknown>;
      const chunk = typeof p === 'string' ? p : (
        (p.text as string) ??
        (p.content as string) ??
        (p.chunk as string) ??
        (typeof p.delta === 'string' ? p.delta : (p.delta as Record<string, unknown>)?.content as string) ??
        (msg as Record<string, unknown>).chunk as string ??
        (msg as Record<string, unknown>).text as string ??
        ''
      );

      if (isChatEvent && typeof chunk === 'string' && chunk.length > 0) {
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

      const isChatRelated = msg.type === 'event' && (
        msg.event === 'chat' ||
        (typeof msg.event === 'string' && (msg.event.startsWith('chat.') || msg.event.startsWith('run.')))
      );
      if (isChatRelated) {
        const ev = msg.event;
        const pay = (msg.payload || {}) as Record<string, unknown>;
        const isDone = pay.type === 'done' || pay.type === 'end' || pay.finished === true || pay.done === true ||
          ev === 'chat.done' || ev === 'run.done';
        if (isDone) {
          streamBufferRef.current = '';
          setActiveRunId(null);
          if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null; }
          setMessages(prev => prev.map(m => m.streaming ? { ...m, streaming: false } : m));
        }

        const isError = pay.type === 'error' || ev === 'chat.error' || ev === 'run.error';
        if (isError) {
          streamBufferRef.current = '';
          setActiveRunId(null);
          const errMsg = pay.message ?? pay.error ?? 'Unknown error';
          setMessages(prev => {
            const cleaned = prev.map(m => m.streaming ? { ...m, streaming: false } : m);
            return [...cleaned, {
              id: `err_${Date.now()}`,
              role: 'system',
              content: `Error: ${String(errMsg)}`,
            }];
          });
        }

        const isTool = pay.type === 'tool_call' || pay.type === 'tool' || ev === 'chat.tool';
        if (isTool) {
          const toolName = pay.tool ?? pay.name ?? 'tool';
          setMessages(prev => {
            const last = prev[prev.length - 1];
            if (last?.streaming) {
              return [...prev.slice(0, -1), {
                ...last,
                content: last.content + `\n\n*Using ${String(toolName)}...*`,
              }];
            }
            return [...prev, {
              id: `tool_${Date.now()}`,
              role: 'assistant',
              content: `*Using ${String(toolName)}...*`,
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
      if (pollTimer.current) clearInterval(pollTimer.current);
      if (wsRef.current) wsRef.current.close(1000);
    };
  }, [connect]);

  // When user switches agent, load that agent's conversation
  useEffect(() => {
    if (wsState === 'connected') loadHistory();
  }, [selectedAgent]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll chat.history until we see a new assistant reply after sending
  const pollForReply = useCallback(async (sentMsgCount: number): Promise<boolean> => {
    try {
      const sessionKey = getSessionKey();
      const res = await sendReq('chat.history', { sessionKey, limit: 50 });
      const items = res?.messages || res?.entries || res?.data?.messages || (Array.isArray(res) ? res : []);
      if (!Array.isArray(items)) return false;
      const newEntries: Message[] = [];
      for (const entry of items) {
        const role: Message['role'] = entry.role === 'user' ? 'user' : entry.role === 'assistant' ? 'assistant' : 'system';
        const content = extractContent(entry as Record<string, unknown>);
        if (!content) continue;
        newEntries.push({ id: entry.id || `h_${newEntries.length}`, role, content, timestamp: entry.ts || entry.timestamp });
      }
      // Only stop when there's a new assistant message (not just the user's own message)
      const hasNewAssistant = newEntries.length > sentMsgCount &&
        newEntries.some((m, i) => i >= sentMsgCount && m.role === 'assistant');
      if (hasNewAssistant) {
        flushSync(() => setMessages(newEntries));
        lastHistoryLen.current = newEntries.length;
        setActiveRunId(null);
        streamBufferRef.current = '';
        requestAnimationFrame(() => scrollToBottom());
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [sendReq, scrollToBottom, getSessionKey]);

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

    // Snapshot of current message count before sending
    const snapshotLen = lastHistoryLen.current;

    try {
      const sessionKey = getSessionKey();
      const res = await sendReq('chat.send', {
        sessionKey,
        message: text,
        idempotencyKey: userMsg.id,
      });
      if (res?.runId) setActiveRunId(res.runId);

      // Poll for assistant reply — wait a moment then check every 2s
      if (pollTimer.current) { clearTimeout(pollTimer.current); pollTimer.current = null; }
      const delays = [2000, 2000, 2000, 3000, 3000, 3000, 3000, 5000, 5000, 5000, 5000, 5000, 5000];
      let idx = 0;
      const scheduleNext = () => {
        if (idx >= delays.length) {
          setActiveRunId(null);
          return;
        }
        const delay = delays[idx++];
        pollTimer.current = setTimeout(async () => {
          const updated = await pollForReply(snapshotLen);
          if (!updated) scheduleNext();
          else pollTimer.current = null;
        }, delay);
      };
      scheduleNext();
    } catch (err: any) {
      setMessages(prev => [...prev, {
        id: `err_${Date.now()}`,
        role: 'system',
        content: `Failed to send: ${err.message}`,
      }]);
    }
  }, [input, activeRunId, sendReq, scrollToBottom, pollForReply, getSessionKey]);

  const handleRefresh = useCallback(async () => {
    if (refreshing || wsState !== 'connected') return;
    setRefreshing(true);
    try {
      await loadHistory();
    } finally {
      setRefreshing(false);
    }
  }, [loadHistory, refreshing, wsState]);

  const handleStop = useCallback(async () => {
    if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null; }
    try { await sendReq('chat.abort', {}); } catch {}
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
    <div className="flex flex-col h-full w-full min-w-0 bg-[#1e1e1e]">
      {/* Connection status bar */}
      {wsState !== 'connected' && (
        <div className={`flex items-center gap-2 px-4 py-1.5 text-[12px] shrink-0 ${
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
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5 space-y-4 min-w-0">
        {messages.length === 0 && wsState === 'connected' && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Bot className="h-8 w-8 text-white/15 mb-3" />
            <p className="text-[13px] text-white/25">Send a message to start chatting</p>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
            {msg.role !== 'user' && (
              <div className="shrink-0 mt-1">
                {msg.role === 'assistant' ? (
                  <div className="h-6 w-6 rounded-md bg-white/[0.06] flex items-center justify-center">
                    <Bot className="h-3.5 w-3.5 text-white/30" />
                  </div>
                ) : (
                  <div className="h-6 w-6 rounded-md bg-red-500/10 flex items-center justify-center">
                    <AlertCircle className="h-3.5 w-3.5 text-red-400/50" />
                  </div>
                )}
              </div>
            )}

            <div className={`max-w-[85%] ${
              msg.role === 'user'
                ? 'bg-[#2d2d2d] rounded-xl rounded-br-sm px-3.5 py-2'
                : msg.role === 'system'
                  ? 'bg-red-500/5 border border-red-500/10 rounded-lg px-3.5 py-2'
                  : 'flex-1 min-w-0'
            }`}>
              <p className={`text-[13px] leading-[1.6] whitespace-pre-wrap break-words ${
                msg.role === 'user' ? 'text-white/85'
                : msg.role === 'system' ? 'text-red-400/70 text-[12px]'
                : 'text-[#cccccc]'
              }`}>
                {msg.content}
                {msg.streaming && (
                  <span className="inline-block w-[3px] h-[14px] bg-white/50 ml-0.5 animate-pulse rounded-[1px]" />
                )}
              </p>
            </div>

            {msg.role === 'user' && (
              <div className="shrink-0 mt-1">
                <div className="h-6 w-6 rounded-md bg-[#264f78]/40 flex items-center justify-center">
                  <User className="h-3.5 w-3.5 text-[#569cd6]/70" />
                </div>
              </div>
            )}
          </div>
        ))}

        {activeRunId && !messages.some(m => m.streaming) && (
          <div className="flex gap-3">
            <div className="h-6 w-6 rounded-md bg-white/[0.06] flex items-center justify-center">
              <Loader2 className="h-3.5 w-3.5 text-white/30 animate-spin" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-white/30">Agent is thinking...</span>
            </div>
          </div>
        )}
      </div>

      {/* Upload status toast */}
      {uploadStatus && (
        <div className={`mx-3 mb-1 px-3 py-1.5 rounded-lg text-[12px] ${
          uploadStatus.startsWith('Failed') ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'
        }`}>
          {uploadStatus}
        </div>
      )}

      {/* Bottom input area — Cursor-style */}
      <div className="shrink-0 bg-[#1e1e1e]">
        <div className="mx-4 mb-3 rounded-xl border border-[#3c3c3c] bg-[#252526] focus-within:border-[#505050] transition-colors">
          {/* Collapsible context header */}
          <button
            onClick={() => setFilesOpen(!filesOpen)}
            className="w-full flex items-center gap-1.5 px-3 py-[6px] text-[12px] text-white/35 hover:text-white/55 border-b border-[#333] transition-colors"
          >
            {filesOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            <span>{messages.length} Messages</span>
            <span className="ml-auto flex items-center gap-2">
              {wsState === 'connected' && (
                <span
                  onClick={(e) => { e.stopPropagation(); handleRefresh(); }}
                  className="text-[11px] text-white/25 hover:text-white/50 cursor-pointer"
                >
                  {refreshing ? 'Syncing...' : 'Refresh'}
                </span>
              )}
            </span>
          </button>

          {filesOpen && messages.length > 0 && (
            <div className="px-3 py-1.5 max-h-[100px] overflow-y-auto border-b border-[#333]">
              {messages.slice(-10).map((m) => (
                <div key={m.id} className="flex items-center gap-2 py-[2px] text-[11px]">
                  <span className={`shrink-0 w-[38px] ${
                    m.role === 'user' ? 'text-[#569cd6]/50' : m.role === 'assistant' ? 'text-[#dcdcaa]/50' : 'text-red-400/40'
                  }`}>
                    {m.role === 'user' ? 'You' : m.role === 'assistant' ? 'Agent' : 'Sys'}
                  </span>
                  <span className="text-white/20 truncate">{m.content.slice(0, 80)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Text input */}
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Plan, @ for context, / for commands"
            rows={1}
            disabled={wsState !== 'connected'}
            className="w-full resize-none bg-transparent px-3 pt-2.5 pb-1.5 text-[13px] text-white/90 placeholder:text-white/20 focus:outline-none disabled:opacity-30"
            style={{ maxHeight: '120px', minHeight: '36px' }}
            onInput={(e) => {
              const t = e.target as HTMLTextAreaElement;
              t.style.height = '36px';
              t.style.height = Math.min(t.scrollHeight, 120) + 'px';
            }}
          />

          {/* Bottom toolbar */}
          <div className="flex items-center justify-between px-2 pb-2 pt-0.5">
            {/* Left: Agent selector + Model selector */}
            <div className="flex items-center gap-0.5">
              {/* Agent selector with dropdown */}
              <div ref={agentDropdownRef} className="relative">
                <button
                  onClick={() => { setShowAgentDropdown(!showAgentDropdown); setShowModelDropdown(false); setAgentSearch(''); }}
                  className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-white/[0.04] transition-colors group"
                >
                  <span className="text-[12px] text-white/30 group-hover:text-white/50">&#8734;</span>
                  <span className="text-[12px] text-white/50 group-hover:text-white/70 font-medium">{selectedAgent}</span>
                  <ChevronDown className="h-3 w-3 text-white/20 group-hover:text-white/40" />
                </button>

                {showAgentDropdown && (
                  <div className="absolute bottom-[calc(100%+4px)] left-0 w-60 rounded-lg border border-[#3c3c3c] bg-[#252526] shadow-2xl overflow-hidden" style={{ zIndex: 9999 }}>
                    {/* Search */}
                    <div className="px-3 py-2 border-b border-[#333]">
                      <input
                        type="text"
                        value={agentSearch}
                        onChange={e => setAgentSearch(e.target.value)}
                        placeholder="Search agents"
                        autoFocus
                        className="w-full bg-transparent text-[13px] text-white/60 placeholder:text-white/20 focus:outline-none"
                      />
                    </div>

                    {/* Agent list */}
                    <div className="max-h-[240px] overflow-y-auto py-1">
                      {agents.length === 0 && (
                        <div className="px-3 py-3 text-[12px] text-white/25 text-center">No agents found</div>
                      )}
                      {agents
                        .filter(a => !agentSearch || a.name.toLowerCase().includes(agentSearch.toLowerCase()))
                        .map(agent => (
                        <button
                          key={agent.id}
                          onClick={() => handleSelectAgent(agent)}
                          className="w-full flex items-center gap-2.5 px-3 py-[7px] text-left hover:bg-white/[0.05] transition-colors"
                        >
                          <span className="text-[13px] text-white/70 flex-1 truncate">{agent.name}</span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {agent.is_primary && (
                              <span className="text-[10px] text-white/20 bg-white/[0.04] px-1.5 py-0.5 rounded">primary</span>
                            )}
                            <div className={`h-2 w-2 rounded-full ${
                              agent.status === 'active' || agent.status === 'online' ? 'bg-green-400' :
                              agent.status === 'sleeping' ? 'bg-amber-400' : 'bg-white/15'
                            }`} />
                            {selectedAgent === agent.name && <Check className="h-3.5 w-3.5 text-white/50" />}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Model selector with dropdown */}
              <div ref={modelDropdownRef} className="relative">
                <button
                  onClick={() => { setShowModelDropdown(!showModelDropdown); setShowAgentDropdown(false); setModelSearch(''); }}
                  className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-white/[0.04] transition-colors group"
                >
                  <span className="text-[12px] text-white/40 group-hover:text-white/60">{getModelLabel()}</span>
                  <ChevronDown className="h-3 w-3 text-white/20 group-hover:text-white/40" />
                </button>

                {showModelDropdown && (
                  <div className="absolute bottom-[calc(100%+4px)] left-0 w-64 rounded-lg border border-[#3c3c3c] bg-[#252526] shadow-2xl overflow-hidden" style={{ zIndex: 9999 }}>
                    {/* Search */}
                    <div className="px-3 py-2 border-b border-[#333]">
                      <input
                        type="text"
                        value={modelSearch}
                        onChange={e => setModelSearch(e.target.value)}
                        placeholder="Search models"
                        autoFocus
                        className="w-full bg-transparent text-[13px] text-white/60 placeholder:text-white/20 focus:outline-none"
                      />
                    </div>

                    {/* Auto toggle */}
                    <div className="border-b border-[#333]">
                      <button
                        onClick={() => handleSelectModel(AVAILABLE_MODELS[0])}
                        className="w-full flex items-center justify-between px-3 py-[7px] hover:bg-white/[0.05] transition-colors"
                      >
                        <span className="text-[13px] text-white/70">Auto</span>
                        <div className={`w-7 h-4 rounded-full relative transition-colors ${
                          selectedModel === 'auto' ? 'bg-[#007acc]' : 'bg-white/10'
                        }`}>
                          <div className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${
                            selectedModel === 'auto' ? 'translate-x-3.5' : 'translate-x-0.5'
                          }`} />
                        </div>
                      </button>
                    </div>

                    {/* Model list */}
                    <div className="max-h-[260px] overflow-y-auto py-1">
                      {AVAILABLE_MODELS
                        .filter(m => m.id !== 'auto')
                        .filter(m => !modelSearch || m.displayName.toLowerCase().includes(modelSearch.toLowerCase()))
                        .map(model => (
                        <button
                          key={model.id}
                          onClick={() => handleSelectModel(model)}
                          className="w-full flex items-center justify-between px-3 py-[7px] text-left hover:bg-white/[0.05] transition-colors"
                        >
                          <span className="text-[13px] text-white/70">{model.displayName}</span>
                          {selectedModel === model.id && <Check className="h-3.5 w-3.5 text-white/50 shrink-0" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Action icons */}
            <div className="flex items-center gap-0.5">
              <button
                onClick={handleRefresh}
                disabled={refreshing || wsState !== 'connected'}
                className="p-1.5 rounded-md hover:bg-white/[0.06] transition-colors disabled:opacity-20"
                title="Sync messages"
              >
                <RefreshCw className={`h-[14px] w-[14px] text-white/30 ${refreshing ? 'animate-spin' : ''}`} />
              </button>

              <button
                onClick={handleImageUpload}
                disabled={wsState !== 'connected'}
                className="p-1.5 rounded-md hover:bg-white/[0.06] transition-colors disabled:opacity-20"
                title="Upload image"
              >
                <ImageIcon className="h-[14px] w-[14px] text-white/30" />
              </button>

              <button
                onClick={handleVoice}
                className={`p-1.5 rounded-md transition-colors ${
                  isRecording ? 'bg-red-500/20 hover:bg-red-500/30' : 'hover:bg-white/[0.06]'
                }`}
                title={isRecording ? 'Stop recording' : 'Voice input'}
              >
                {isRecording
                  ? <MicOff className="h-[14px] w-[14px] text-red-400" />
                  : <Mic className="h-[14px] w-[14px] text-white/30" />
                }
              </button>

              {/* Send / Stop button */}
              {(isStreaming || activeRunId) ? (
                <button
                  onClick={handleStop}
                  className="ml-1 h-7 w-7 rounded-full bg-white/10 hover:bg-white/15 flex items-center justify-center transition-all"
                  title="Stop"
                >
                  <Square className="h-3 w-3 text-white/70 fill-white/70" />
                </button>
              ) : (
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || wsState !== 'connected'}
                  className={`ml-1 h-7 w-7 rounded-full flex items-center justify-center transition-all ${
                    input.trim()
                      ? 'bg-white/90 hover:bg-white text-[#1e1e1e]'
                      : 'bg-white/10 text-white/30 cursor-default'
                  } disabled:opacity-20`}
                  title="Send"
                >
                  <Send className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
