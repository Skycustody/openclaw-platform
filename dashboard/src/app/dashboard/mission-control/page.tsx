'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge, Badge } from '@/components/ui/Badge';
import api from '@/lib/api';
import { formatUsd, timeAgo, formatTime } from '@/lib/utils';
import { useStore } from '@/lib/store';
import {
  ExternalLink, RotateCcw, Square, MessageSquare,
  Zap, Moon, AlertTriangle, Loader2,
  Coins, Sparkles, Activity,
  CheckCircle, Bot, XCircle,
  Clock, ArrowRight, Eye,
  Calendar, Radio, Wifi, WifiOff,
  Terminal, Cpu, Settings, BarChart3,
  ChevronRight, Play, Globe, Shield,
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

interface ActivityEntry {
  id: string;
  type: string;
  summary: string;
  created_at: string;
  status?: string;
  tokens_used?: number;
  model_used?: string;
  channel?: string;
  details?: any;
}

interface CronJob {
  id: string;
  name: string;
  schedule: string;
  next_run: string | null;
  last_run: string | null;
  last_result: string | null;
  enabled: boolean;
}

interface AgentInfo {
  id: string;
  name: string;
  status: string;
  is_primary: boolean;
  purpose: string | null;
}

type AgentDisplayStatus = 'active' | 'online' | 'sleeping' | 'paused' | 'provisioning' | 'cancelled' | 'offline' | 'grace_period';

const STATUS_CONFIG: Record<string, { message: string; color: string; glow: string; pulse: boolean }> = {
  active:       { message: 'Running',              color: 'text-green-400',  glow: 'shadow-green-500/20',  pulse: true },
  online:       { message: 'Running',              color: 'text-green-400',  glow: 'shadow-green-500/20',  pulse: true },
  sleeping:     { message: 'Sleeping',             color: 'text-blue-400',   glow: 'shadow-blue-500/20',   pulse: false },
  paused:       { message: 'Paused',               color: 'text-red-400',    glow: 'shadow-red-500/20',    pulse: false },
  provisioning: { message: 'Setting up',           color: 'text-amber-400',  glow: 'shadow-amber-500/20',  pulse: true },
  cancelled:    { message: 'Cancelled',            color: 'text-red-400',    glow: 'shadow-red-500/20',    pulse: false },
  offline:      { message: 'Offline',              color: 'text-white/30',   glow: '',                      pulse: false },
  grace_period: { message: 'Grace period',         color: 'text-amber-400',  glow: 'shadow-amber-500/20',  pulse: false },
};

const channelLabel: Record<string, { name: string; color: string }> = {
  telegram:  { name: 'Telegram',  color: 'text-blue-400 bg-blue-500/10' },
  discord:   { name: 'Discord',   color: 'text-indigo-400 bg-indigo-500/10' },
  whatsapp:  { name: 'WhatsApp',  color: 'text-green-400 bg-green-500/10' },
  slack:     { name: 'Slack',     color: 'text-purple-400 bg-purple-500/10' },
  direct:    { name: 'Dashboard', color: 'text-white/50 bg-white/5' },
  web:       { name: 'Web',       color: 'text-white/50 bg-white/5' },
  auto:      { name: 'Auto',      color: 'text-amber-400 bg-amber-500/10' },
  cron:      { name: 'Cron',      color: 'text-emerald-400 bg-emerald-500/10' },
};

const activityIcon = (type: string) => {
  switch (type) {
    case 'message': return <MessageSquare className="h-3.5 w-3.5 text-blue-400" />;
    case 'browsing': return <Globe className="h-3.5 w-3.5 text-purple-400" />;
    case 'task': return <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />;
    case 'email': return <MessageSquare className="h-3.5 w-3.5 text-amber-400" />;
    default: return <Activity className="h-3.5 w-3.5 text-white/30" />;
  }
};

const statusIcon = (s?: string) => {
  switch (s) {
    case 'completed': return <CheckCircle className="h-3 w-3 text-emerald-400" />;
    case 'failed': return <XCircle className="h-3 w-3 text-red-400" />;
    case 'attention': return <AlertTriangle className="h-3 w-3 text-amber-400" />;
    default: return null;
  }
};

export default function MissionControlPage() {
  const [apiData, setApiData] = useState<ApiStatus | null>(null);
  const [balanceUsd, setBalanceUsd] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [provisionMsg, setProvisionMsg] = useState<string | null>(null);
  const { user } = useStore();

  const [recentActivity, setRecentActivity] = useState<ActivityEntry[]>([]);
  const [upcomingTasks, setUpcomingTasks] = useState<CronJob[]>([]);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [lastFetch, setLastFetch] = useState<Date>(new Date());

  const fetchAll = useCallback(async () => {
    try {
      const [statusRes, tokensRes, activityRes, cronRes, agentsRes] = await Promise.allSettled([
        api.get<any>('/agent/status'),
        api.get<any>('/settings/nexos-usage'),
        api.get<{ activities: ActivityEntry[] }>('/activity?limit=20&offset=0'),
        api.get<{ jobs: CronJob[] }>('/cron'),
        api.get<{ agents: AgentInfo[] }>('/agents'),
      ]);
      if (statusRes.status === 'fulfilled') setApiData(statusRes.value);
      if (tokensRes.status === 'fulfilled' && tokensRes.value.usage) setBalanceUsd(tokensRes.value.usage.remainingUsd ?? 0);
      if (activityRes.status === 'fulfilled') setRecentActivity(activityRes.value.activities || []);
      if (cronRes.status === 'fulfilled') {
        const jobs = (cronRes.value.jobs || cronRes.value || []) as CronJob[];
        setUpcomingTasks(
          jobs.filter((j) => j.enabled && j.next_run)
            .sort((a, b) => new Date(a.next_run!).getTime() - new Date(b.next_run!).getTime())
            .slice(0, 5)
        );
      }
      if (agentsRes.status === 'fulfilled') {
        setAgents((agentsRes.value.agents || agentsRes.value || []) as AgentInfo[]);
      }
      setLastFetch(new Date());
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 10000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const displayStatus = (apiData?.subscriptionStatus || apiData?.status || 'offline') as AgentDisplayStatus;
  const statusConf = STATUS_CONFIG[displayStatus] || STATUS_CONFIG.offline;
  const stats = apiData?.stats || { messagesToday: 0, tokensToday: 0, activeSkills: 0 };
  const subdomain = apiData?.subdomain || user?.subdomain || 'your-agent';
  const isRunning = displayStatus === 'active' || displayStatus === 'online';

  const currentlyDoing = recentActivity.length > 0 ? recentActivity[0] : null;
  const isCurrentlyActive = currentlyDoing && (Date.now() - new Date(currentlyDoing.created_at).getTime()) < 120_000;

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
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-white/40" />
          <p className="text-[12px] text-white/20">Loading mission control...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-[1100px]">
      {/* ── Header ── */}
      <div className="flex items-center justify-between animate-fade-up">
        <div>
          <h1 className="text-[26px] font-bold text-white tracking-tight">Mission Control</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-[12px] text-white/20">
              Updated {lastFetch.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
            <span className="flex items-center gap-1.5 text-[11px]">
              {isRunning
                ? <><Wifi className="h-3 w-3 text-green-400" /><span className="text-green-400/70">Connected</span></>
                : <><WifiOff className="h-3 w-3 text-white/20" /><span className="text-white/20">Disconnected</span></>
              }
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="glass" size="sm" onClick={() => window.location.href = '/dashboard/activity'}>
            <BarChart3 className="h-3.5 w-3.5" /> Activity Log
          </Button>
          <Button variant="primary" size="sm" onClick={handleOpenAgent} loading={actionLoading === 'open'} disabled={actionLoading !== null}>
            <ExternalLink className="h-3.5 w-3.5" />
            {provisionMsg || 'Open Agent'}
          </Button>
        </div>
      </div>

      {/* ── Alert ── */}
      {displayStatus === 'paused' && (
        <div className="border border-red-500/20 bg-red-500/5 rounded-xl px-4 py-3 flex items-center gap-3 animate-fade-up">
          <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
          <p className="text-[13px] text-red-400 flex-1">Agent paused — your AI balance is empty</p>
          <Button variant="danger" size="sm" onClick={() => window.location.href = '/dashboard/tokens'}>
            Top Up
          </Button>
        </div>
      )}

      {/* ── Status Hero ── */}
      <div className="grid grid-cols-3 gap-4 animate-fade-up">
        {/* Main status card */}
        <Card className={`!p-5 col-span-2 relative overflow-hidden ${statusConf.glow}`}>
          {isRunning && (
            <div className="absolute top-0 right-0 w-64 h-64 bg-green-500/[0.03] rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl pointer-events-none" />
          )}
          <div className="flex items-start gap-4 relative">
            <div className="relative shrink-0">
              <div className={`flex h-16 w-16 items-center justify-center rounded-2xl border border-white/[0.08] ${
                isRunning ? 'bg-green-500/10' : displayStatus === 'sleeping' ? 'bg-blue-500/10' : 'bg-white/5'
              }`}>
                <Bot className={`h-8 w-8 ${isRunning ? 'text-green-400/70' : 'text-white/30'}`} />
              </div>
              {statusConf.pulse && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-50" />
                  <span className="relative inline-flex h-4 w-4 rounded-full bg-green-400" />
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[18px] font-bold text-white tracking-tight truncate">{subdomain}.valnaa.com</span>
              </div>
              <div className="flex items-center gap-2 mb-2">
                <StatusBadge status={displayStatus} />
                <Badge variant={apiData?.plan === 'business' ? 'amber' : apiData?.plan === 'pro' ? 'blue' : 'default'}>
                  {apiData?.plan?.toUpperCase() || 'STARTER'}
                </Badge>
                <span className={`text-[12px] ${statusConf.color}`}>
                  {statusConf.message}
                  {displayStatus === 'sleeping' && <Moon className="inline h-3 w-3 ml-1" />}
                </span>
              </div>
              {apiData?.lastActive && (
                <p className="text-[11px] text-white/20">Last active {timeAgo(apiData.lastActive)} &middot; Since {new Date(apiData.createdAt || '').toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</p>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button onClick={() => handleAction('restart')} disabled={actionLoading !== null}
                className="p-2.5 rounded-lg text-white/20 hover:text-white/60 hover:bg-white/[0.06] transition-colors disabled:opacity-30"
                title="Restart agent">
                {actionLoading === 'restart' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              </button>
              <button onClick={() => handleAction('stop')} disabled={displayStatus === 'paused' || actionLoading !== null}
                className="p-2.5 rounded-lg text-white/20 hover:text-red-400 hover:bg-red-400/5 transition-colors disabled:opacity-30"
                title="Stop agent">
                <Square className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Currently doing */}
          {isCurrentlyActive && currentlyDoing && (
            <div className="mt-4 rounded-xl border border-green-500/15 bg-green-500/[0.04] px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-green-400" />
                </span>
                <span className="text-[11px] font-medium text-green-400/70 uppercase tracking-wider">Working on</span>
              </div>
              <p className="text-[13px] text-white/70 mt-1.5">{currentlyDoing.summary}</p>
              <div className="flex items-center gap-2 mt-1">
                {currentlyDoing.channel && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${channelLabel[currentlyDoing.channel]?.color || 'text-white/30 bg-white/5'}`}>
                    {channelLabel[currentlyDoing.channel]?.name || currentlyDoing.channel}
                  </span>
                )}
                {currentlyDoing.model_used && <span className="text-[10px] text-white/15 font-mono">{currentlyDoing.model_used}</span>}
              </div>
            </div>
          )}
        </Card>

        {/* Metrics column */}
        <div className="space-y-4">
          <Card className="!p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-medium text-white/20 uppercase tracking-wider">Today</span>
              <span className="text-[10px] text-white/15">{new Date().toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <MessageSquare className="h-3 w-3 text-blue-400/60" />
                  <span className="text-[10px] text-white/25">Messages</span>
                </div>
                <p className="text-[20px] font-bold text-white tabular-nums leading-none">{stats.messagesToday}</p>
              </div>
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <Zap className="h-3 w-3 text-purple-400/60" />
                  <span className="text-[10px] text-white/25">Spent</span>
                </div>
                <p className="text-[20px] font-bold text-white tabular-nums leading-none">{formatUsd(stats.tokensToday)}</p>
              </div>
            </div>
          </Card>

          <button className="w-full text-left" onClick={() => window.location.href = '/dashboard/tokens'}>
            <Card className="!p-4 hover:!border-white/15 transition-colors group">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <Coins className="h-3 w-3 text-amber-400/60" />
                    <span className="text-[10px] text-white/25">Balance</span>
                  </div>
                  <p className={`text-[22px] font-bold tabular-nums leading-none ${balanceUsd < 0.50 ? 'text-amber-400' : 'text-white'}`}>
                    {formatUsd(balanceUsd)}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-white/10 group-hover:text-white/30 transition-colors" />
              </div>
            </Card>
          </button>
        </div>
      </div>

      {/* ── Main Content Grid ── */}
      <div className="grid grid-cols-5 gap-4 animate-fade-up">
        {/* Activity Feed — 3 cols */}
        <Card className="!p-0 col-span-3 overflow-hidden">
          <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Radio className="h-3.5 w-3.5 text-white/20" />
              <span className="text-[13px] font-semibold text-white/70">Activity Feed</span>
              {recentActivity.length > 0 && (
                <span className="text-[10px] text-white/15 bg-white/5 px-1.5 py-0.5 rounded">{recentActivity.length}</span>
              )}
            </div>
            <button onClick={() => window.location.href = '/dashboard/activity'}
              className="text-[11px] text-white/20 hover:text-white/50 transition-colors flex items-center gap-1">
              View all <ArrowRight className="h-3 w-3" />
            </button>
          </div>

          <div className="h-[420px] overflow-y-auto custom-scrollbar">
            {recentActivity.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-4">
                <Activity className="h-10 w-10 text-white/[0.06] mb-3" />
                <p className="text-[13px] text-white/25">No activity yet</p>
                <p className="text-[11px] text-white/15 mt-1">Activity will appear here when your agent starts working</p>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.04]">
                {recentActivity.map((entry, idx) => {
                  const isRecent = (Date.now() - new Date(entry.created_at).getTime()) < 120_000;
                  return (
                    <div key={entry.id}
                      className={`flex items-start gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors ${isRecent ? 'bg-green-500/[0.02]' : ''}`}>
                      <div className="flex h-7 w-7 mt-0.5 items-center justify-center rounded-lg bg-white/[0.04] shrink-0">
                        {activityIcon(entry.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-2">
                          <p className="text-[13px] text-white/70 leading-relaxed flex-1">{entry.summary}</p>
                          {statusIcon(entry.status)}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-[11px] text-white/20">{timeAgo(entry.created_at)}</span>
                          {entry.channel && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${channelLabel[entry.channel]?.color || 'text-white/30 bg-white/5'}`}>
                              {channelLabel[entry.channel]?.name || entry.channel}
                            </span>
                          )}
                          {entry.model_used && (
                            <span className="text-[10px] text-white/15 font-mono">{entry.model_used.split('/').pop()}</span>
                          )}
                          {entry.tokens_used ? <span className="text-[10px] text-white/15">{formatUsd(entry.tokens_used)}</span> : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>

        {/* Right sidebar — 2 cols */}
        <div className="col-span-2 space-y-4">
          {/* Agents roster */}
          <Card className="!p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bot className="h-3.5 w-3.5 text-white/20" />
                <span className="text-[13px] font-semibold text-white/70">Agents</span>
                {agents.length > 0 && (
                  <span className="text-[10px] text-white/15 bg-white/5 px-1.5 py-0.5 rounded">{agents.length}</span>
                )}
              </div>
              <button onClick={() => window.location.href = '/dashboard/agents'}
                className="text-[11px] text-white/20 hover:text-white/50 transition-colors flex items-center gap-1">
                Manage <ArrowRight className="h-3 w-3" />
              </button>
            </div>
            <div className="max-h-[200px] overflow-y-auto custom-scrollbar">
              {agents.length === 0 ? (
                <div className="px-4 py-6 text-center">
                  <p className="text-[12px] text-white/20">No agents created yet</p>
                </div>
              ) : (
                agents.map(agent => (
                  <button key={agent.id}
                    onClick={() => window.location.href = `/dashboard/agents/${agent.id}`}
                    className="flex items-center gap-3 w-full px-4 py-2.5 hover:bg-white/[0.03] transition-colors text-left">
                    <div className="relative">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04]">
                        <Bot className="h-4 w-4 text-white/25" />
                      </div>
                      {agent.status === 'active' && (
                        <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-green-400 ring-2 ring-[#0a0a0a]" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13px] font-medium text-white/60 truncate">{agent.name}</span>
                        {agent.is_primary && <Badge variant="amber" className="!text-[9px] !py-0 !px-1">Primary</Badge>}
                      </div>
                      {agent.purpose && <p className="text-[10px] text-white/20 truncate">{agent.purpose}</p>}
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 text-white/10 shrink-0" />
                  </button>
                ))
              )}
            </div>
          </Card>

          {/* Upcoming scheduled tasks */}
          <Card className="!p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5 text-white/20" />
                <span className="text-[13px] font-semibold text-white/70">Scheduled</span>
              </div>
              <button onClick={() => window.location.href = '/dashboard/cron'}
                className="text-[11px] text-white/20 hover:text-white/50 transition-colors flex items-center gap-1">
                Manage <ArrowRight className="h-3 w-3" />
              </button>
            </div>
            <div className="max-h-[200px] overflow-y-auto custom-scrollbar">
              {upcomingTasks.length === 0 ? (
                <div className="px-4 py-6 text-center">
                  <p className="text-[12px] text-white/20">No scheduled tasks</p>
                  <button onClick={() => window.location.href = '/dashboard/cron'}
                    className="text-[11px] text-white/30 hover:text-white/50 mt-1 transition-colors">
                    Create one
                  </button>
                </div>
              ) : (
                upcomingTasks.map(job => (
                  <div key={job.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.03] transition-colors">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 shrink-0">
                      <Clock className="h-3.5 w-3.5 text-blue-400/60" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] text-white/60 truncate">{job.name}</p>
                      <p className="text-[10px] text-white/20">{job.schedule}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[11px] text-white/30">
                        {job.next_run ? new Date(job.next_run).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                      </p>
                      <p className="text-[9px] text-white/15">
                        {job.next_run ? new Date(job.next_run).toLocaleDateString([], { month: 'short', day: 'numeric' }) : ''}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* ── Quick Actions ── */}
      <div className="grid grid-cols-5 gap-3 animate-fade-up">
        {[
          { label: 'Connect Apps',   href: '/dashboard/channels',      icon: MessageSquare, desc: 'Telegram, Discord, WhatsApp', color: 'text-blue-400/40' },
          { label: 'Skills & Tools', href: '/dashboard/skills',        icon: Sparkles,      desc: 'Browser, search, memory',     color: 'text-purple-400/40' },
          { label: 'Model Router',   href: '/dashboard/router',        icon: Cpu,           desc: 'Smart model selection',       color: 'text-amber-400/40' },
          { label: 'Conversations',  href: '/dashboard/conversations', icon: Terminal,       desc: 'Full chat history',           color: 'text-emerald-400/40' },
          { label: 'Security',       href: '/dashboard/security',      icon: Shield,         desc: 'Sessions & access',           color: 'text-red-400/40' },
        ].map(link => (
          <button key={link.href} onClick={() => window.location.href = link.href}
            className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.015] p-3.5 text-left hover:border-white/15 hover:bg-white/[0.04] transition-all group">
            <link.icon className={`h-5 w-5 ${link.color} group-hover:opacity-80 transition-opacity shrink-0`} />
            <div className="min-w-0">
              <p className="text-[12px] font-medium text-white/50 group-hover:text-white/70 transition-colors">{link.label}</p>
              <p className="text-[10px] text-white/15 truncate">{link.desc}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
