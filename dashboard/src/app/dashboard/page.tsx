'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import api from '@/lib/api';
import { formatTokens } from '@/lib/utils';
import { useStore } from '@/lib/store';
import {
  Send, Sparkles, Loader2, Bot, CheckCircle,
  Cpu, Key, Zap, Settings, Moon, AlertTriangle,
} from 'lucide-react';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  tokens?: number;
  usedOwnKey?: boolean;
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

interface UserSettings {
  brain_mode: 'auto' | 'manual';
  manual_model: string | null;
  has_own_openai_key: boolean;
  has_own_anthropic_key: boolean;
  agent_name: string;
}

type AgentDisplayStatus = 'active' | 'online' | 'sleeping' | 'paused' | 'provisioning' | 'cancelled' | 'offline' | 'grace_period';

export default function DashboardHome() {
  const { user } = useStore();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatSteps, setChatSteps] = useState<AutoStep[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [tokenBalance, setTokenBalance] = useState<number>(0);
  const [agentStatus, setAgentStatus] = useState<AgentDisplayStatus>('offline');

  const fetchContext = useCallback(async () => {
    try {
      const [settingsRes, tokensRes, statusRes] = await Promise.allSettled([
        api.get<{ settings: UserSettings }>('/settings'),
        api.get<any>('/tokens/balance'),
        api.get<any>('/agent/status'),
      ]);
      if (settingsRes.status === 'fulfilled') setSettings(settingsRes.value.settings);
      if (tokensRes.status === 'fulfilled') setTokenBalance(tokensRes.value.balance ?? 0);
      if (statusRes.status === 'fulfilled') {
        setAgentStatus((statusRes.value.subscriptionStatus || statusRes.value.status || 'offline') as AgentDisplayStatus);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchContext();
  }, [fetchContext]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, chatSteps]);

  const getModeLabel = () => {
    if (!settings) return { label: 'Auto', icon: Cpu, desc: 'Smart model routing', variant: 'green' as const };

    const hasOwnKey = settings.has_own_openai_key || settings.has_own_anthropic_key;

    if (settings.brain_mode === 'manual' && settings.manual_model) {
      return {
        label: settings.manual_model.length > 20 ? settings.manual_model.slice(0, 18) + '...' : settings.manual_model,
        icon: Zap,
        desc: hasOwnKey ? 'Using your API key' : 'Fixed model',
        variant: hasOwnKey ? 'amber' as const : 'blue' as const,
      };
    }

    return {
      label: 'Auto',
      icon: Cpu,
      desc: hasOwnKey ? 'Smart routing + your API key' : 'Smart model routing',
      variant: 'green' as const,
    };
  };

  const mode = getModeLabel();

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
          id: `err_${Date.now()}`, role: 'assistant',
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
      let usedOwnKey = false;

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
              if (event.balance !== undefined) setTokenBalance(event.balance);
              if (event.step?.usedOwnKey) usedOwnKey = true;
            } else if (event.type === 'result') {
              finalAnswer = event.finalAnswer || '';
              totalTokens = event.totalTokens || 0;
              modelUsed = event.steps?.[event.steps.length - 1]?.model || 'auto';
              if (event.usedOwnKey) usedOwnKey = true;
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
        id: `resp_${Date.now()}`, role: 'assistant',
        content: finalAnswer || 'No response generated.',
        model: modelUsed, tokens: totalTokens, usedOwnKey,
        timestamp: new Date(),
      }]);
      setChatSteps([]);
      fetchContext();
    } catch (err: any) {
      setMessages(prev => [...prev, {
        id: `err_${Date.now()}`, role: 'assistant',
        content: err.message || 'Connection failed. Please try again.',
        timestamp: new Date(),
      }]);
    }
    setChatLoading(false);
  };

  const getModelBadge = (msg: ChatMessage) => {
    if (!msg.model) return null;
    const isOwnKey = msg.usedOwnKey;
    return (
      <div className="flex items-center gap-2 mt-1.5 text-[10px] text-white/20">
        {isOwnKey && (
          <span className="flex items-center gap-0.5 text-amber-400/60">
            <Key className="h-2.5 w-2.5" /> Your key
          </span>
        )}
        <span>{msg.model}</span>
        {msg.tokens ? <span>{msg.tokens.toLocaleString()} tokens</span> : null}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-[calc(100vh-48px)]">
      {agentStatus === 'paused' && (
        <div className="border border-red-500/20 bg-red-500/5 rounded-xl px-4 py-3 flex items-center gap-3 mb-3 shrink-0">
          <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
          <p className="text-[13px] text-red-400 flex-1">Agent paused — you&apos;re out of tokens</p>
          <Button variant="danger" size="sm" onClick={() => window.location.href = '/dashboard/tokens'}>
            Top Up
          </Button>
        </div>
      )}

      {/* Header bar */}
      <div className="flex items-center justify-between px-1 pb-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.06]">
              <Bot className="h-4.5 w-4.5 text-white/50" />
            </div>
            {(agentStatus === 'active' || agentStatus === 'online') && (
              <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-green-400 ring-2 ring-[#0a0a0a]" />
            )}
          </div>
          <div>
            <span className="text-[15px] font-semibold text-white">
              {settings?.agent_name || 'Your AI'}
            </span>
            <div className="flex items-center gap-2 mt-0.5">
              <StatusBadge status={agentStatus} className="!text-[10px] !py-0 !px-1.5" />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={() => window.location.href = '/dashboard/router'}
            className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 hover:border-white/15 hover:bg-white/[0.04] transition-all"
            title="Change model settings">
            <mode.icon className="h-3.5 w-3.5 text-white/30" />
            <div className="text-left">
              <p className="text-[11px] font-medium text-white/50">{mode.label}</p>
              <p className="text-[9px] text-white/20">{mode.desc}</p>
            </div>
          </button>

          <button onClick={() => window.location.href = '/dashboard/tokens'}
            className="flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 hover:border-white/15 hover:bg-white/[0.04] transition-all"
            title="Token balance">
            <Sparkles className="h-3.5 w-3.5 text-white/20" />
            <span className={`text-[12px] font-medium tabular-nums ${tokenBalance < 50000 ? 'text-amber-400' : 'text-white/50'}`}>
              {formatTokens(tokenBalance)}
            </span>
          </button>
        </div>
      </div>

      {/* Chat area — full height, no Card wrapper to avoid double borders */}
      <div className="flex-1 flex flex-col rounded-xl border border-white/[0.06] bg-white/[0.01] overflow-hidden">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 custom-scrollbar">
          {messages.length === 0 && !chatLoading && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.04] mb-4">
                <Bot className="h-8 w-8 text-white/10" />
              </div>
              <p className="text-[17px] font-medium text-white/30">What can I help you with?</p>
              <p className="text-[13px] text-white/15 mt-1.5 max-w-md">
                Ask anything — your AI uses{' '}
                {settings?.brain_mode === 'manual'
                  ? `${settings.manual_model || 'your chosen model'}`
                  : 'the auto pipeline to pick the best model'
                }
                {(settings?.has_own_openai_key || settings?.has_own_anthropic_key) && ' with your own API key'}
              </p>
              <div className="flex items-center gap-3 mt-6">
                {[
                  'Summarize my emails',
                  'Research competitors',
                  'Draft a blog post',
                ].map(suggestion => (
                  <button key={suggestion}
                    onClick={() => { setChatInput(suggestion); }}
                    className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-2.5 text-[13px] text-white/30 hover:text-white/50 hover:border-white/15 transition-all">
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] rounded-2xl px-4 py-3 ${
                msg.role === 'user'
                  ? 'bg-white/10 text-white'
                  : 'bg-white/[0.03] border border-white/[0.06] text-white/70'
              }`}>
                <div className="text-[14px] whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                {msg.role === 'assistant' && getModelBadge(msg)}
              </div>
            </div>
          ))}

          {chatLoading && chatSteps.length > 0 && (
            <div className="space-y-1.5 pl-1">
              {chatSteps.map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px] text-white/30">
                  <CheckCircle className="h-3 w-3 text-green-400/50" />
                  <span>{s.action}</span>
                  <Badge className="!text-[9px] !py-0 !px-1.5">{s.model.length > 18 ? s.model.slice(0, 15) + '...' : s.model}</Badge>
                </div>
              ))}
            </div>
          )}

          {chatLoading && (
            <div className="flex items-center gap-2 text-[13px] text-white/30 pl-1">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Thinking...</span>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <div className="px-5 py-4 border-t border-white/[0.06] shrink-0">
          <div className="flex gap-3">
            <input
              type="text"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              placeholder="Ask your AI anything..."
              disabled={chatLoading}
              className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-[14px] text-white placeholder:text-white/20 focus:border-white/25 focus:outline-none disabled:opacity-40"
            />
            <Button variant="primary" size="sm" onClick={sendMessage} loading={chatLoading}
              disabled={!chatInput.trim() || chatLoading} className="!rounded-xl !px-4">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
