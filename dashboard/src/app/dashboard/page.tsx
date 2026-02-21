'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge, Badge } from '@/components/ui/Badge';
import api from '@/lib/api';
import { formatTokens, timeAgo } from '@/lib/utils';
import { useStore } from '@/lib/store';
import {
  ExternalLink, RotateCcw, Square, MessageSquare,
  Zap, Moon, AlertTriangle, Loader2,
  Coins, ListChecks, Sparkles, Activity,
  ChevronRight, Bot, Smartphone, Brain,
  Clock, Shield, FileText, Cpu, Radio,
  Gift, CreditCard, Globe, User,
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

type AgentDisplayStatus = 'active' | 'online' | 'sleeping' | 'paused' | 'provisioning' | 'cancelled' | 'offline' | 'grace_period';

const STATUS_CONFIG: Record<string, { message: string; color: string }> = {
  active:       { message: 'Running and ready',          color: 'text-green-400' },
  online:       { message: 'Running and ready',          color: 'text-green-400' },
  sleeping:     { message: 'Sleeping — wakes on message', color: 'text-blue-400' },
  paused:       { message: 'Paused — top up tokens',     color: 'text-red-400' },
  provisioning: { message: 'Setting up...',              color: 'text-amber-400' },
  cancelled:    { message: 'Subscription cancelled',     color: 'text-red-400' },
  offline:      { message: 'Offline',                    color: 'text-white/30' },
  grace_period: { message: 'Grace period',               color: 'text-amber-400' },
};

export default function DashboardHome() {
  const [apiData, setApiData] = useState<ApiStatus | null>(null);
  const [tokenBalance, setTokenBalance] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [provisionMsg, setProvisionMsg] = useState<string | null>(null);
  const { user } = useStore();

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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
      </div>
    );
  }

  const quickLinks = [
    { label: 'Mission Control', href: '/dashboard/mission-control', icon: Radio, desc: 'Live agent overview & chat', highlight: true },
    { label: 'Connect Apps', href: '/dashboard/channels', icon: Smartphone, desc: 'Telegram, Discord, WhatsApp' },
    { label: 'Activity Feed', href: '/dashboard/activity', icon: Activity, desc: 'Everything your agent did' },
    { label: 'Skills', href: '/dashboard/skills', icon: Sparkles, desc: 'Teach your agent new abilities' },
    { label: 'Memory', href: '/dashboard/memories', icon: Brain, desc: 'What your agent remembers' },
    { label: 'Schedule', href: '/dashboard/cron', icon: Clock, desc: 'Automated recurring tasks' },
    { label: 'Auto Mode', href: '/dashboard/router', icon: Cpu, desc: 'Smart model routing' },
    { label: 'Agents', href: '/dashboard/agents', icon: Bot, desc: 'Manage multiple agents' },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="animate-fade-up">
        <h1 className="text-[26px] font-bold text-white tracking-tight">Dashboard</h1>
        <p className="text-[14px] text-white/40 mt-0.5">Welcome back{user?.email ? `, ${user.email.split('@')[0]}` : ''}</p>
      </div>

      {/* Paused Alert */}
      {displayStatus === 'paused' && (
        <div className="border border-red-500/20 bg-red-500/5 rounded-xl px-4 py-3 flex items-center gap-3">
          <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
          <p className="text-[13px] text-red-400 flex-1">Agent paused — you&apos;re out of tokens</p>
          <Button variant="danger" size="sm" onClick={() => window.location.href = '/dashboard/tokens'}>
            Top Up
          </Button>
        </div>
      )}

      {/* Agent Status Bar */}
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

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-3 animate-fade-up">
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

      {/* Quick Links Grid */}
      <div className="animate-fade-up">
        <p className="text-[12px] font-medium text-white/20 uppercase tracking-wider mb-3 px-1">Quick Access</p>
        <div className="grid grid-cols-4 gap-3">
          {quickLinks.map(link => (
            <button key={link.href} onClick={() => window.location.href = link.href}
              className={`flex flex-col gap-3 rounded-xl border p-4 text-left transition-all group ${
                link.highlight
                  ? 'border-white/15 bg-white/[0.04] hover:border-white/25 hover:bg-white/[0.06]'
                  : 'border-white/[0.06] bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]'
              }`}>
              <link.icon className={`h-5 w-5 transition-colors ${
                link.highlight ? 'text-white/40 group-hover:text-white/60' : 'text-white/20 group-hover:text-white/40'
              }`} />
              <div>
                <div className="flex items-center gap-1.5">
                  <p className={`text-[13px] font-medium transition-colors ${
                    link.highlight ? 'text-white/70 group-hover:text-white/90' : 'text-white/50 group-hover:text-white/70'
                  }`}>{link.label}</p>
                  {link.highlight && <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />}
                </div>
                <p className="text-[11px] text-white/20 mt-0.5">{link.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
