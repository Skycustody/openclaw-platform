'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge, Badge } from '@/components/ui/Badge';
import api from '@/lib/api';
import { formatTokens, timeAgo, formatTime } from '@/lib/utils';
import { useStore } from '@/lib/store';
import {
  ExternalLink, RotateCcw, Square, MessageSquare,
  Zap, Moon, AlertTriangle, Loader2,
  Coins, ListChecks, Sparkles, Activity,
  CheckCircle, Bot,
  Clock, ArrowRight, Eye,
  Calendar, Radio,
  Terminal, Cpu,
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

type AgentDisplayStatus = 'active' | 'online' | 'sleeping' | 'paused' | 'provisioning' | 'cancelled' | 'offline' | 'grace_period';

const STATUS_CONFIG: Record<string, { message: string; color: string; bgColor: string }> = {
  active:       { message: 'Running and ready',          color: 'text-green-400',  bgColor: 'bg-green-500/10' },
  online:       { message: 'Running and ready',          color: 'text-green-400',  bgColor: 'bg-green-500/10' },
  sleeping:     { message: 'Sleeping — wakes on message', color: 'text-blue-400',   bgColor: 'bg-blue-500/10' },
  paused:       { message: 'Paused — top up tokens',     color: 'text-red-400',    bgColor: 'bg-red-500/10' },
  provisioning: { message: 'Setting up...',              color: 'text-amber-400',  bgColor: 'bg-amber-500/10' },
  cancelled:    { message: 'Subscription cancelled',     color: 'text-red-400',    bgColor: 'bg-red-500/10' },
  offline:      { message: 'Offline',                    color: 'text-white/30',   bgColor: 'bg-white/5' },
  grace_period: { message: 'Grace period',               color: 'text-amber-400',  bgColor: 'bg-amber-500/10' },
};

const channelLabel: Record<string, string> = {
  telegram: 'Telegram',
  discord: 'Discord',
  whatsapp: 'WhatsApp',
  slack: 'Slack',
  direct: 'Dashboard',
  web: 'Web',
  auto: 'Auto Mode',
  cron: 'Scheduled',
};

export default function MissionControlPage() {
  const [apiData, setApiData] = useState<ApiStatus | null>(null);
  const [tokenBalance, setTokenBalance] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [provisionMsg, setProvisionMsg] = useState<string | null>(null);
  const { user } = useStore();

  const [recentActivity, setRecentActivity] = useState<ActivityEntry[]>([]);
  const [upcomingTasks, setUpcomingTasks] = useState<CronJob[]>([]);
  const [activeTab, setActiveTab] = useState<'live' | 'recent' | 'upcoming'>('live');

  const fetchAll = useCallback(async () => {
    try {
      const [statusRes, tokensRes, activityRes, cronRes] = await Promise.allSettled([
        api.get<any>('/agent/status'),
        api.get<any>('/tokens/balance'),
        api.get<{ activities: ActivityEntry[] }>('/activity?limit=15&offset=0'),
        api.get<{ jobs: CronJob[] }>('/cron'),
      ]);
      if (statusRes.status === 'fulfilled') setApiData(statusRes.value);
      if (tokensRes.status === 'fulfilled') setTokenBalance(tokensRes.value.balance ?? 0);
      if (activityRes.status === 'fulfilled') setRecentActivity(activityRes.value.activities || []);
      if (cronRes.status === 'fulfilled') {
        const jobs = (cronRes.value.jobs || cronRes.value || []) as CronJob[];
        const upcoming = jobs
          .filter((j: CronJob) => j.enabled && j.next_run)
          .sort((a: CronJob, b: CronJob) => new Date(a.next_run!).getTime() - new Date(b.next_run!).getTime())
          .slice(0, 5);
        setUpcomingTasks(upcoming);
      }
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 20000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const displayStatus = (apiData?.subscriptionStatus || apiData?.status || 'offline') as AgentDisplayStatus;
  const statusConf = STATUS_CONFIG[displayStatus] || STATUS_CONFIG.offline;
  const stats = apiData?.stats || { messagesToday: 0, tokensToday: 0, activeSkills: 0 };
  const subdomain = apiData?.subdomain || user?.subdomain || 'your-agent';
  const isRunning = displayStatus === 'active' || displayStatus === 'online';

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

  const currentlyDoing = recentActivity.length > 0 ? recentActivity[0] : null;
  const isCurrentlyActive = currentlyDoing && (Date.now() - new Date(currentlyDoing.created_at).getTime()) < 120000;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between animate-fade-up">
        <div>
          <h1 className="text-[26px] font-bold text-white tracking-tight">Mission Control</h1>
          <p className="text-[14px] text-white/40 mt-0.5">Real-time overview of your AI agent</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="glass" size="sm" onClick={() => window.location.href = '/dashboard/activity'}>
            <Activity className="h-3.5 w-3.5" /> Full Activity
          </Button>
        </div>
      </div>

      {/* Paused Alert */}
      {displayStatus === 'paused' && (
        <div className="border border-red-500/20 bg-red-500/5 rounded-xl px-4 py-3 flex items-center gap-3 animate-fade-up">
          <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
          <p className="text-[13px] text-red-400 flex-1">Agent paused — you&apos;re out of tokens</p>
          <Button variant="danger" size="sm" onClick={() => window.location.href = '/dashboard/tokens'}>
            Top Up
          </Button>
        </div>
      )}

      {/* Agent Status Card — Large */}
      <Card className="!p-5 animate-fade-up">
        <div className="flex items-start gap-4">
          <div className="relative">
            <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ${statusConf.bgColor} border border-white/[0.08]`}>
              <Bot className="h-7 w-7 text-white/70" />
            </div>
            {isRunning && (
              <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-green-400 ring-2 ring-black animate-pulse" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[16px] font-semibold text-white truncate">{subdomain}.valnaa.com</span>
              <StatusBadge status={displayStatus} />
              <Badge variant={apiData?.plan === 'business' ? 'amber' : apiData?.plan === 'pro' ? 'blue' : 'default'}>
                {apiData?.plan?.toUpperCase() || 'STARTER'}
              </Badge>
            </div>
            <p className={`text-[13px] ${statusConf.color}`}>
              {statusConf.message}
              {displayStatus === 'sleeping' && <Moon className="inline h-3 w-3 ml-1" />}
            </p>
            {apiData?.lastActive && (
              <p className="text-[12px] text-white/20 mt-1">Last active: {timeAgo(apiData.lastActive)}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="primary" size="sm" onClick={handleOpenAgent} loading={actionLoading === 'open'} disabled={actionLoading !== null}>
              <ExternalLink className="h-3.5 w-3.5" />
              {provisionMsg ? 'Starting...' : 'Open Agent'}
            </Button>
            <button onClick={() => handleAction('restart')} disabled={actionLoading !== null}
              className="p-2.5 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-colors disabled:opacity-30"
              title="Restart">
              {actionLoading === 'restart' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            </button>
            <button onClick={() => handleAction('stop')} disabled={displayStatus === 'paused' || actionLoading !== null}
              className="p-2.5 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-400/5 transition-colors disabled:opacity-30"
              title="Stop">
              <Square className="h-4 w-4" />
            </button>
          </div>
        </div>
      </Card>

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-3 animate-fade-up">
        <Card className="!p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
              <MessageSquare className="h-4 w-4 text-blue-400" />
            </div>
            <span className="text-[12px] text-white/30">Messages</span>
          </div>
          <p className="text-[24px] font-bold text-white tabular-nums">{stats.messagesToday}</p>
          <p className="text-[11px] text-white/20 mt-0.5">today</p>
        </Card>

        <Card className="!p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10">
              <Zap className="h-4 w-4 text-purple-400" />
            </div>
            <span className="text-[12px] text-white/30">Tokens Used</span>
          </div>
          <p className="text-[24px] font-bold text-white tabular-nums">{formatTokens(stats.tokensToday)}</p>
          <p className="text-[11px] text-white/20 mt-0.5">today</p>
        </Card>

        <button className="text-left w-full" onClick={() => window.location.href = '/dashboard/tokens'}>
          <Card className="!p-4 hover:!border-white/20 transition-colors">
            <div className="flex items-center gap-2 mb-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10">
                <Coins className="h-4 w-4 text-amber-400" />
              </div>
              <span className="text-[12px] text-white/30">Balance</span>
            </div>
            <p className={`text-[24px] font-bold tabular-nums ${tokenBalance < 50000 ? 'text-amber-400' : 'text-white'}`}>
              {formatTokens(tokenBalance)}
            </p>
            <p className="text-[11px] text-white/20 mt-0.5">tokens remaining</p>
          </Card>
        </button>

        <button className="text-left w-full" onClick={() => window.location.href = '/dashboard/cron'}>
          <Card className="!p-4 hover:!border-white/20 transition-colors">
            <div className="flex items-center gap-2 mb-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
                <ListChecks className="h-4 w-4 text-emerald-400" />
              </div>
              <span className="text-[12px] text-white/30">Active Skills</span>
            </div>
            <p className="text-[24px] font-bold text-white tabular-nums">{stats.activeSkills}</p>
            <p className="text-[11px] text-white/20 mt-0.5">scheduled</p>
          </Card>
        </button>
      </div>

      {/* Activity Feed */}
      <div className="animate-fade-up">
        <Card className="!p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-white/[0.06]">
            <div className="flex items-center gap-1">
              {(['live', 'recent', 'upcoming'] as const).map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all ${
                    activeTab === tab
                      ? 'bg-white/10 text-white'
                      : 'text-white/30 hover:text-white/50 hover:bg-white/[0.04]'
                  }`}>
                  {tab === 'live' && <Radio className="inline h-3 w-3 mr-1" />}
                  {tab === 'recent' && <Clock className="inline h-3 w-3 mr-1" />}
                  {tab === 'upcoming' && <Calendar className="inline h-3 w-3 mr-1" />}
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="h-[420px] overflow-y-auto custom-scrollbar">
            {/* Live Tab */}
            {activeTab === 'live' && (
              <div className="p-4 space-y-3">
                {isCurrentlyActive && currentlyDoing ? (
                  <div className="rounded-xl border border-green-500/20 bg-green-500/[0.04] p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
                      <span className="text-[12px] font-medium text-green-400/70 uppercase tracking-wider">Doing now</span>
                    </div>
                    <p className="text-[14px] text-white/80">{currentlyDoing.summary}</p>
                    {currentlyDoing.channel && (
                      <p className="text-[11px] text-white/30 mt-1">via {channelLabel[currentlyDoing.channel] || currentlyDoing.channel}</p>
                    )}
                  </div>
                ) : (
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-center">
                    <Bot className="h-8 w-8 text-white/10 mx-auto mb-2" />
                    <p className="text-[13px] text-white/30">
                      {isRunning ? 'Agent is idle — waiting for tasks' : 'Agent is not running'}
                    </p>
                  </div>
                )}

                {upcomingTasks.length > 0 && (
                  <div>
                    <p className="text-[11px] font-medium text-white/20 uppercase tracking-wider mb-2 px-1">Coming up next</p>
                    {upcomingTasks.slice(0, 3).map(job => (
                      <div key={job.id} className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-white/[0.03] transition-colors">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
                          <Clock className="h-3.5 w-3.5 text-blue-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] text-white/70 truncate">{job.name}</p>
                          <p className="text-[11px] text-white/25">
                            {job.next_run ? timeAgo(job.next_run).replace('ago', 'from now').replace('just now', 'running now') : 'Pending'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {recentActivity.length > 0 && (
                  <div>
                    <p className="text-[11px] font-medium text-white/20 uppercase tracking-wider mb-2 px-1">Just completed</p>
                    {recentActivity.slice(0, 4).map(entry => (
                      <div key={entry.id} className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-white/[0.03] transition-colors">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
                          <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] text-white/70 truncate">{entry.summary}</p>
                          <div className="flex items-center gap-2 text-[11px] text-white/25">
                            <span>{timeAgo(entry.created_at)}</span>
                            {entry.tokens_used ? <span>{formatTokens(entry.tokens_used)} tokens</span> : null}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Recent Tab */}
            {activeTab === 'recent' && (
              <div className="p-4 space-y-1">
                {recentActivity.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <Activity className="h-8 w-8 text-white/10 mb-2" />
                    <p className="text-[13px] text-white/30">No recent activity</p>
                  </div>
                ) : (
                  recentActivity.map(entry => (
                    <div key={entry.id} className="flex items-start gap-3 rounded-lg px-3 py-2.5 hover:bg-white/[0.03] transition-colors">
                      <div className="flex h-7 w-7 mt-0.5 items-center justify-center rounded-lg bg-white/5 shrink-0">
                        {entry.type === 'message' && <MessageSquare className="h-3.5 w-3.5 text-blue-400/60" />}
                        {entry.type === 'task' && <ListChecks className="h-3.5 w-3.5 text-emerald-400/60" />}
                        {entry.type === 'browsing' && <Eye className="h-3.5 w-3.5 text-purple-400/60" />}
                        {!['message', 'task', 'browsing'].includes(entry.type) && <Activity className="h-3.5 w-3.5 text-white/30" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] text-white/70 leading-relaxed">{entry.summary}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[11px] text-white/20">{timeAgo(entry.created_at)}</span>
                          {entry.channel && <Badge className="!text-[10px] !py-0 !px-1.5">{channelLabel[entry.channel] || entry.channel}</Badge>}
                          {entry.tokens_used ? <span className="text-[11px] text-white/20">{formatTokens(entry.tokens_used)} tkns</span> : null}
                          {entry.model_used && <span className="text-[10px] text-white/15">{entry.model_used}</span>}
                        </div>
                      </div>
                    </div>
                  ))
                )}
                {recentActivity.length > 0 && (
                  <button onClick={() => window.location.href = '/dashboard/activity'}
                    className="flex items-center justify-center gap-1 w-full py-2 mt-2 text-[12px] text-white/30 hover:text-white/50 transition-colors">
                    View all activity <ArrowRight className="h-3 w-3" />
                  </button>
                )}
              </div>
            )}

            {/* Upcoming Tab */}
            {activeTab === 'upcoming' && (
              <div className="p-4 space-y-1">
                {upcomingTasks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <Calendar className="h-8 w-8 text-white/10 mb-2" />
                    <p className="text-[13px] text-white/30">No scheduled tasks</p>
                    <button onClick={() => window.location.href = '/dashboard/cron'}
                      className="text-[12px] text-white/20 hover:text-white/40 mt-1 transition-colors">
                      Set up scheduled tasks
                    </button>
                  </div>
                ) : (
                  upcomingTasks.map(job => (
                    <div key={job.id} className="flex items-center gap-3 rounded-lg px-3 py-3 hover:bg-white/[0.03] transition-colors">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
                        <Clock className="h-4 w-4 text-blue-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] text-white/70 truncate">{job.name}</p>
                        <p className="text-[11px] text-white/25 mt-0.5">{job.schedule}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[12px] text-white/40">
                          {job.next_run ? new Date(job.next_run).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                        </p>
                        <p className="text-[10px] text-white/20">
                          {job.next_run ? new Date(job.next_run).toLocaleDateString([], { month: 'short', day: 'numeric' }) : ''}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-4 gap-3 animate-fade-up">
        {[
          { label: 'Connect Apps', href: '/dashboard/channels', icon: MessageSquare, desc: 'Add messaging apps' },
          { label: 'Manage Skills', href: '/dashboard/skills', icon: Sparkles, desc: 'Teach your agent' },
          { label: 'Auto Mode', href: '/dashboard/router', icon: Cpu, desc: 'Smart model routing' },
          { label: 'Conversations', href: '/dashboard/conversations', icon: Terminal, desc: 'Full message history' },
        ].map(link => (
          <button key={link.href} onClick={() => window.location.href = link.href}
            className="flex flex-col gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-left hover:border-white/15 hover:bg-white/[0.04] transition-all group">
            <link.icon className="h-5 w-5 text-white/20 group-hover:text-white/40 transition-colors" />
            <div>
              <p className="text-[13px] font-medium text-white/60 group-hover:text-white/80 transition-colors">{link.label}</p>
              <p className="text-[11px] text-white/20">{link.desc}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
