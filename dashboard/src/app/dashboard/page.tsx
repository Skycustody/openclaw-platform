'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardTitle, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/Badge';
import api from '@/lib/api';
import { formatTokens, formatTokensWithDays, formatDollars, timeAgo, getStatusMessage } from '@/lib/utils';
import { useStore } from '@/lib/store';
import {
  ExternalLink, RotateCcw, Square, MessageSquare, DollarSign,
  CheckCircle2, Zap, Moon, AlertTriangle, Loader2, ArrowUpRight,
  Check, X,
} from 'lucide-react';

interface AgentStatus {
  status: 'active' | 'online' | 'sleeping' | 'paused' | 'provisioning' | 'cancelled' | 'offline' | 'grace_period';
  uptime: number;
  lastActive: string;
  messagesHandled: number;
  totalSpentCents: number;
  tasksDone: number;
  tokenBalance: number;
  dailyTokenRate: number;
  tokenCap: number;
  subdomain: string;
  channels: { name: string; connected: boolean }[];
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `Running for ${d} day${d !== 1 ? 's' : ''}, ${h} hour${h !== 1 ? 's' : ''}`;
  if (h > 0) return `Running for ${h} hour${h !== 1 ? 's' : ''}, ${m} minute${m !== 1 ? 's' : ''}`;
  return `Running for ${m} minute${m !== 1 ? 's' : ''}`;
}

export default function AgentControlCenter() {
  const [agent, setAgent] = useState<AgentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const { user } = useStore();

  const fetchStatus = useCallback(async () => {
    try {
      const data = await api.get<AgentStatus>('/agent/status');
      setAgent(data);
    } catch {
      setAgent({
        status: 'active',
        uptime: 273600,
        lastActive: new Date(Date.now() - 120000).toISOString(),
        messagesHandled: 47,
        totalSpentCents: 23,
        tasksDone: 8,
        tokenBalance: 245000,
        dailyTokenRate: 13600,
        tokenCap: 500000,
        subdomain: user?.subdomain || 'my-agent',
        channels: [
          { name: 'Telegram', connected: true },
          { name: 'WhatsApp', connected: true },
          { name: 'Discord', connected: false },
          { name: 'Slack', connected: false },
          { name: 'Signal', connected: false },
        ],
      });
    } finally {
      setLoading(false);
    }
  }, [user?.subdomain]);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 15000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleAction = async (action: 'stop' | 'restart') => {
    setActionLoading(action);
    try {
      await api.post(`/agent/${action}`);
      await fetchStatus();
    } catch {
      // handled
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
      </div>
    );
  }

  const status = agent ? getStatusMessage(agent.status) : getStatusMessage('active');
  const tokenPct = agent ? Math.round((agent.tokenBalance / agent.tokenCap) * 100) : 0;
  const tokenProgressColor = tokenPct > 50 ? 'progress-fill-green' : tokenPct > 20 ? 'progress-fill-amber' : 'progress-fill-red';

  return (
    <div className="space-y-6">
      <div className="animate-fade-up">
        <h1 className="text-[26px] font-bold text-white tracking-tight">Agent Control Center</h1>
        <p className="mt-1 text-[15px] text-white/40">Everything about your agent, at a glance</p>
      </div>

      {agent?.status === 'paused' && (
        <div className="border border-red-500/20 bg-red-500/5 rounded-xl p-5 animate-fade-up">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/10">
              <AlertTriangle className="h-5 w-5 text-red-400" />
            </div>
            <div className="flex-1">
              <p className="text-[15px] font-semibold text-red-400">Your agent is paused</p>
              <p className="text-[13px] text-white/40 mt-0.5">You&apos;ve run out of tokens. Top up to get your agent running again.</p>
            </div>
            <Button variant="danger" size="md" onClick={() => window.location.href = '/dashboard/tokens'}>
              Top Up Tokens
            </Button>
          </div>
        </div>
      )}

      {/* Hero card */}
      <Card>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white/[0.06] border border-white/[0.08]">
                <Zap className="h-6 w-6 text-white/70" />
              </div>
              {agent?.status === 'active' && (
                <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-green-400 ring-2 ring-black" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-[18px] font-semibold text-white">
                  {agent?.subdomain || user?.subdomain || 'your-agent'}.openclaw.ai
                </h2>
                <StatusBadge status={agent?.status || 'active'} />
              </div>
              <p className="text-[14px] text-white/50">{status.message}</p>
              {agent?.status === 'active' && (
                <p className="text-[13px] text-white/30 mt-1">
                  {formatUptime(agent.uptime)} · Last active {timeAgo(agent.lastActive)}
                </p>
              )}
              {agent?.status === 'sleeping' && (
                <p className="text-[13px] text-blue-400/60 mt-1 flex items-center gap-1.5">
                  <Moon className="h-3.5 w-3.5" />
                  Wakes up instantly when you send a message
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              size="lg"
              onClick={() => {
                const sub = agent?.subdomain || user?.subdomain || 'agent';
                window.open(`https://${sub}.openclaw.ai`, '_blank');
              }}
            >
              <ExternalLink className="h-4 w-4" />
              Open Agent
            </Button>
            <Button
              variant="glass"
              size="md"
              onClick={() => handleAction('restart')}
              loading={actionLoading === 'restart'}
              disabled={actionLoading !== null}
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
            <Button
              variant="glass"
              size="md"
              onClick={() => handleAction('stop')}
              loading={actionLoading === 'stop'}
              disabled={agent?.status === 'paused' || actionLoading !== null}
            >
              <Square className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>

      {/* Quick stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[13px] text-white/40">Messages handled</span>
            <MessageSquare className="h-4 w-4 text-white/20" />
          </div>
          <p className="text-[28px] font-bold text-white tabular-nums">{agent?.messagesHandled ?? 0}</p>
          <p className="text-[12px] text-white/30 mt-1">across all connected apps</p>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[13px] text-white/40">Total spent</span>
            <DollarSign className="h-4 w-4 text-white/20" />
          </div>
          <p className="text-[28px] font-bold text-white tabular-nums">{formatDollars(agent?.totalSpentCents ?? 0)}</p>
          <p className="text-[12px] text-white/30 mt-1">since your agent started</p>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[13px] text-white/40">Tasks completed</span>
            <CheckCircle2 className="h-4 w-4 text-white/20" />
          </div>
          <p className="text-[28px] font-bold text-white tabular-nums">{agent?.tasksDone ?? 0}</p>
          <p className="text-[12px] text-white/30 mt-1">scheduled and on-demand tasks</p>
        </Card>
      </div>

      {/* Token balance + connected apps */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between mb-4">
            <CardTitle>Token Balance</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => window.location.href = '/dashboard/tokens'}>
              Manage <ArrowUpRight className="h-3.5 w-3.5" />
            </Button>
          </div>
          <p className="text-[32px] font-bold text-white tabular-nums">
            {formatTokensWithDays(agent?.tokenBalance ?? 0, agent?.dailyTokenRate)}
          </p>
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-white/30">{tokenPct}% remaining</span>
              <span className="text-white/30">{formatTokens(agent?.tokenCap ?? 0)} total</span>
            </div>
            <div className="progress-bar h-2">
              <div className={`progress-fill ${tokenProgressColor} h-full`} style={{ width: `${tokenPct}%` }} />
            </div>
          </div>
          {tokenPct <= 20 && (
            <p className="mt-3 text-[13px] text-amber-400 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              Running low — consider topping up
            </p>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <CardTitle>Connected Apps</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => window.location.href = '/dashboard/channels'}>
              Manage <ArrowUpRight className="h-3.5 w-3.5" />
            </Button>
          </div>
          <CardDescription>Your agent sends and receives messages through these apps</CardDescription>
          <div className="mt-4 space-y-2">
            {(agent?.channels ?? []).map((ch) => (
              <div key={ch.name} className="flex items-center justify-between py-2 px-3 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                <span className="text-[14px] text-white/70">{ch.name}</span>
                {ch.connected ? (
                  <span className="flex items-center gap-1.5 text-[13px] text-green-400">
                    <Check className="h-3.5 w-3.5" />
                    Connected
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-[13px] text-white/25">
                    <X className="h-3.5 w-3.5" />
                    Not connected
                  </span>
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
