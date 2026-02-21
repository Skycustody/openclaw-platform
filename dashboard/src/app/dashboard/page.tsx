'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Card, CardTitle, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge, Badge } from '@/components/ui/Badge';
import api from '@/lib/api';
import { formatTokens, timeAgo } from '@/lib/utils';
import { useStore } from '@/lib/store';
import {
  ExternalLink, RotateCcw, Square, MessageSquare,
  Zap, Moon, AlertTriangle, Loader2, ArrowUpRight,
  Coins, ListChecks, Send, Sparkles, Activity,
  CheckCircle, XCircle, ChevronRight, Bot,
} from 'lucide-react';

interface ApiStatus {
  status: string;
  subscriptionStatus: string;
  subdomain: string;
  plan: string;
  lastActive: string;
  createdAt: string;
  stats: {
    messagesToday: number;
    tokensToday: number;
    activeSkills: number;
  };
}

interface TokenBalance {
  balance: number;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  tokens?: number;
  timestamp: Date;
}

interface AutoStep {
  step: number;
  action: string;
  model: string;
  reasoning: string;
  result: string;
  tokensUsed: number;
}

type AgentDisplayStatus = 'active' | 'online' | 'sleeping' | 'paused' | 'provisioning' | 'cancelled' | 'offline' | 'grace_period';

const STATUS_CONFIG: Record<string, { message: string; color: string }> = {
  active: { message: 'Running and ready', color: 'text-green-400' },
  online: { message: 'Running and ready', color: 'text-green-400' },
  sleeping: { message: 'Sleeping — wakes on message', color: 'text-blue-400' },
  paused: { message: 'Paused — top up tokens', color: 'text-red-400' },
  provisioning: { message: 'Setting up...', color: 'text-amber-400' },
  cancelled: { message: 'Subscription cancelled', color: 'text-red-400' },
  offline: { message: 'Offline', color: 'text-white/30' },
  grace_period: { message: 'Grace period', color: 'text-amber-400' },
};

export default function MissionControl() {
  const [apiData, setApiData] = useState<ApiStatus | null>(null);
  const [tokenBalance, setTokenBalance] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [provisionMsg, setProvisionMsg] = useState<string | null>(null);
  const { user } = useStore();

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatSteps, setChatSteps] = useState<AutoStep[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [statusRes, tokensRes] = await Promise.allSettled([
        api.get<any>('/agent/status'),
        api.get<any>('/tokens/balance'),
      ]);
      if (statusRes.status === 'fulfilled') setApiData(statusRes.value);
      if (tokensRes.status === 'fulfilled') setTokenBalance(tokensRes.value.balance ?? 0);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 30000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, chatSteps]);

  const displayStatus = (apiData?.subscriptionStatus || apiData?.status || 'offline') as AgentDisplayStatus;
  const statusConf = STATUS_CONFIG[displayStatus] || STATUS_CONFIG.offline;
  const stats = apiData?.stats || { messagesToday: 0, tokensToday: 0, activeSkills: 0 };
  const subdomain = apiData?.subdomain || user?.subdomain || 'your-agent';

  const handleAction = async (action: 'stop' | 'restart') => {
    setActionLoading(action);
    try { await api.post(`/agent/${action}`); await fetchAll(); } catch {} finally { setActionLoading(null); }
  };

  const handleOpenAgent = async () => {
    setActionLoading('open');
    setProvisionMsg('Starting agent...');
    try {
      const data = await api.post<{ url: string; status: string }>('/agent/open');
      if (!data.url) throw new Error('No URL');
      setProvisionMsg('Waiting for agent...');
      let ready = false;
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, i < 3 ? 2000 : 4000));
        try {
          const check = await api.get<{ ready: boolean; detail?: string }>('/agent/ready');
          if (check.ready) { ready = true; break; }
          setProvisionMsg(check.detail || 'Starting up...');
        } catch {}
      }
      if (!ready) await new Promise(r => setTimeout(r, 1000));
      window.open(data.url, '_blank');
      await fetchAll();
    } catch {
      const sub = apiData?.subdomain || user?.subdomain;
      if (sub) window.open(`https://${sub}.valnaa.com`, '_blank');
    } finally { setActionLoading(null); setProvisionMsg(null); }
  };

  // ── Chat with AI agent ──
  const sendMessage = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: chatInput.trim(),
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setChatLoading(true);
    setChatSteps([]);

    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/auto/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ task: userMsg.content }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setMessages(prev => [...prev, {
          id: `err_${Date.now()}`,
          role: 'assistant',
          content: err.error?.message || err.error || 'Something went wrong. Please try again.',
          timestamp: new Date(),
        }]);
        setChatLoading(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No reader');
      const decoder = new TextDecoder();
      let buffer = '';
      let finalAnswer = '';
      let totalTokens = 0;
      let modelUsed = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            if (event.type === 'step') {
              setChatSteps(prev => [...prev, event.step]);
              setTokenBalance(event.balance);
            } else if (event.type === 'result') {
              finalAnswer = event.finalAnswer || '';
              totalTokens = event.totalTokens || 0;
              modelUsed = event.steps?.[event.steps.length - 1]?.model || 'auto';
            }
          } catch {}
        }
      }
      if (buffer.trim()) {
        try {
          const event = JSON.parse(buffer);
          if (event.type === 'result') {
            finalAnswer = event.finalAnswer || '';
            totalTokens = event.totalTokens || 0;
          }
        } catch {}
      }

      setMessages(prev => [...prev, {
        id: `resp_${Date.now()}`,
        role: 'assistant',
        content: finalAnswer || 'No response generated.',
        model: modelUsed,
        tokens: totalTokens,
        timestamp: new Date(),
      }]);
      setChatSteps([]);
      fetchAll();
    } catch (err: any) {
      setMessages(prev => [...prev, {
        id: `err_${Date.now()}`,
        role: 'assistant',
        content: err.message || 'Connection failed. Please try again.',
        timestamp: new Date(),
      }]);
    }
    setChatLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="animate-fade-up">
        <h1 className="text-[26px] font-bold text-white tracking-tight">Mission Control</h1>
      </div>

      {/* ── Paused Alert ── */}
      {displayStatus === 'paused' && (
        <div className="border border-red-500/20 bg-red-500/5 rounded-xl px-4 py-3 flex items-center gap-3">
          <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
          <p className="text-[13px] text-red-400 flex-1">Agent paused — you&apos;re out of tokens</p>
          <Button variant="danger" size="sm" onClick={() => window.location.href = '/dashboard/tokens'}>
            Top Up
          </Button>
        </div>
      )}

      {/* ── Agent Status Bar ── */}
      <Card className="!p-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.06] border border-white/[0.08]">
              <Bot className="h-5 w-5 text-white/60" />
            </div>
            {(displayStatus === 'active' || displayStatus === 'online') && (
              <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-green-400 ring-2 ring-black" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-semibold text-white truncate">{subdomain}.valnaa.com</span>
              <StatusBadge status={displayStatus} />
            </div>
            <p className={`text-[12px] ${statusConf.color}`}>
              {statusConf.message}
              {displayStatus === 'sleeping' && <Moon className="inline h-3 w-3 ml-1" />}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="primary" size="sm" onClick={handleOpenAgent} loading={actionLoading === 'open'} disabled={actionLoading !== null}>
              <ExternalLink className="h-3.5 w-3.5" />
              {provisionMsg ? 'Starting...' : 'Open'}
            </Button>
            <button onClick={() => handleAction('restart')} disabled={actionLoading !== null}
              className="p-2 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-colors disabled:opacity-30">
              {actionLoading === 'restart' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
            </button>
            <button onClick={() => handleAction('stop')} disabled={displayStatus === 'paused' || actionLoading !== null}
              className="p-2 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-400/5 transition-colors disabled:opacity-30">
              <Square className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </Card>

      {/* ── Stats Row ── */}
      <div className="grid grid-cols-4 gap-3">
        <Card className="!p-3">
          <div className="flex items-center gap-2 mb-1">
            <MessageSquare className="h-3.5 w-3.5 text-white/20" />
            <span className="text-[11px] text-white/30">Messages</span>
          </div>
          <p className="text-[22px] font-bold text-white tabular-nums">{stats.messagesToday}</p>
          <p className="text-[10px] text-white/20">today</p>
        </Card>

        <Card className="!p-3">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="h-3.5 w-3.5 text-white/20" />
            <span className="text-[11px] text-white/30">Tokens Used</span>
          </div>
          <p className="text-[22px] font-bold text-white tabular-nums">{formatTokens(stats.tokensToday)}</p>
          <p className="text-[10px] text-white/20">today</p>
        </Card>

        <button className="text-left w-full" onClick={() => window.location.href = '/dashboard/tokens'}>
          <Card className="!p-3 hover:!border-white/20 transition-colors">
            <div className="flex items-center gap-2 mb-1">
              <Coins className="h-3.5 w-3.5 text-white/20" />
              <span className="text-[11px] text-white/30">Balance</span>
            </div>
            <p className={`text-[22px] font-bold tabular-nums ${tokenBalance < 50000 ? 'text-amber-400' : 'text-white'}`}>
              {formatTokens(tokenBalance)}
            </p>
            <p className="text-[10px] text-white/20">tokens</p>
          </Card>
        </button>

        <button className="text-left w-full" onClick={() => window.location.href = '/dashboard/cron'}>
          <Card className="!p-3 hover:!border-white/20 transition-colors">
            <div className="flex items-center gap-2 mb-1">
              <ListChecks className="h-3.5 w-3.5 text-white/20" />
              <span className="text-[11px] text-white/30">Skills</span>
            </div>
            <p className="text-[22px] font-bold text-white tabular-nums">{stats.activeSkills}</p>
            <p className="text-[10px] text-white/20">active</p>
          </Card>
        </button>
      </div>

      {/* ── Quick Links ── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Connect Apps', href: '/dashboard/channels', icon: MessageSquare },
          { label: 'Activity', href: '/dashboard/activity', icon: Activity },
          { label: 'Auto Mode', href: '/dashboard/router', icon: Sparkles },
        ].map(link => (
          <button key={link.href} onClick={() => window.location.href = link.href}
            className="flex items-center gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-left hover:border-white/15 hover:bg-white/[0.04] transition-all">
            <link.icon className="h-4 w-4 text-white/30" />
            <span className="text-[13px] text-white/60 flex-1">{link.label}</span>
            <ChevronRight className="h-3.5 w-3.5 text-white/15" />
          </button>
        ))}
      </div>

      {/* ── Chat with your AI ── */}
      <Card className="!p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-white/40" />
            <span className="text-[14px] font-semibold text-white">Chat with your AI</span>
          </div>
          <Badge variant="green" dot>Auto Pipeline</Badge>
        </div>

        {/* Messages area */}
        <div className="h-[400px] overflow-y-auto px-4 py-3 space-y-3 custom-scrollbar">
          {messages.length === 0 && !chatLoading && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Bot className="h-10 w-10 text-white/10 mb-3" />
              <p className="text-[14px] text-white/30">Ask your AI anything</p>
              <p className="text-[12px] text-white/15 mt-1">Uses the auto pipeline to give you the best answer</p>
            </div>
          )}

          {messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-xl px-3.5 py-2.5 ${
                msg.role === 'user'
                  ? 'bg-white/10 text-white'
                  : 'bg-white/[0.03] border border-white/[0.06] text-white/70'
              }`}>
                <div className="text-[13px] whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                {msg.role === 'assistant' && (msg.model || msg.tokens) && (
                  <div className="flex items-center gap-2 mt-1.5 text-[10px] text-white/20">
                    {msg.model && <span>{msg.model}</span>}
                    {msg.tokens ? <span>{msg.tokens.toLocaleString()} tokens</span> : null}
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Pipeline steps while processing */}
          {chatLoading && chatSteps.length > 0 && (
            <div className="space-y-1.5">
              {chatSteps.map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px] text-white/30">
                  <CheckCircle className="h-3 w-3 text-green-400/50" />
                  <span>{s.action}</span>
                  <Badge>{s.model.length > 15 ? s.model.slice(0, 12) + '...' : s.model}</Badge>
                </div>
              ))}
            </div>
          )}

          {chatLoading && (
            <div className="flex items-center gap-2 text-[12px] text-white/30">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Thinking...</span>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <div className="px-4 py-3 border-t border-white/[0.06]">
          <div className="flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              placeholder="Ask your AI..."
              disabled={chatLoading}
              className="flex-1 rounded-lg border border-white/[0.08] bg-transparent px-3 py-2 text-[13px] text-white placeholder:text-white/20 focus:border-white/25 focus:outline-none disabled:opacity-40"
            />
            <Button variant="primary" size="sm" onClick={sendMessage} loading={chatLoading} disabled={!chatInput.trim() || chatLoading}>
              <Send className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
