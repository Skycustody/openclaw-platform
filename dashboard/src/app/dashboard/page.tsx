'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardTitle, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/Badge';
import api from '@/lib/api';
import { formatTokens, timeAgo } from '@/lib/utils';
import { useStore } from '@/lib/store';
import {
  ExternalLink, RotateCcw, Square, MessageSquare,
  Zap, Moon, AlertTriangle, Loader2, ArrowUpRight,
  Check, X, Coins, ListChecks,
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

interface ChannelStatuses {
  telegram: boolean;
  discord: boolean;
  slack: boolean;
  whatsapp: boolean;
  signal: boolean;
}

interface TokenBalance {
  balance: number;
}

type AgentDisplayStatus = 'active' | 'online' | 'sleeping' | 'paused' | 'provisioning' | 'cancelled' | 'offline' | 'grace_period';

const STATUS_MESSAGES: Record<string, string> = {
  active: 'Your agent is running and ready to handle tasks',
  online: 'Your agent is running and ready to handle tasks',
  sleeping: 'Your agent is sleeping to save resources',
  paused: 'Your agent is paused — top up tokens to continue',
  provisioning: 'Your agent is being set up...',
  cancelled: 'Subscription cancelled',
  offline: 'Your agent is offline',
  grace_period: 'Your subscription is in grace period',
};

const CHANNEL_LABELS: Record<string, string> = {
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  discord: 'Discord',
  slack: 'Slack',
  signal: 'Signal',
};

export default function AgentControlCenter() {
  const [apiData, setApiData] = useState<ApiStatus | null>(null);
  const [channels, setChannels] = useState<ChannelStatuses | null>(null);
  const [tokenBalance, setTokenBalance] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [provisionMsg, setProvisionMsg] = useState<string | null>(null);
  const { user } = useStore();

  const fetchAll = useCallback(async () => {
    try {
      const [statusRes, channelsRes, tokensRes] = await Promise.allSettled([
        api.get<any>('/agent/status'),
        api.get<any>('/channels'),
        api.get<any>('/tokens/balance'),
      ]);

      if (statusRes.status === 'fulfilled') setApiData(statusRes.value);
      if (channelsRes.status === 'fulfilled') setChannels(channelsRes.value.channels || null);
      if (tokensRes.status === 'fulfilled') setTokenBalance(tokensRes.value.balance ?? 0);
    } catch {
      // all settled, individual failures handled
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 30000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const displayStatus: AgentDisplayStatus = (apiData?.subscriptionStatus || apiData?.status || 'offline') as AgentDisplayStatus;
  const statusMessage = STATUS_MESSAGES[displayStatus] || 'Unknown status';

  const handleAction = async (action: 'stop' | 'restart') => {
    setActionLoading(action);
    try {
      await api.post(`/agent/${action}`);
      await fetchAll();
    } catch {} finally {
      setActionLoading(null);
    }
  };

  const handleOpenAgent = async () => {
    setActionLoading('open');
    setProvisionMsg('Setting up agent...');
    try {
      const data = await api.post<{ url: string; status: string }>('/agent/open');
      if (!data.url) throw new Error('No URL returned');

      setProvisionMsg('Waiting for agent to come online...');

      let ready = false;
      let elapsed = 0;
      for (let i = 0; i < 30; i++) {
        const delay = i < 3 ? 2000 : 4000;
        await new Promise(r => setTimeout(r, delay));
        elapsed += delay / 1000;
        try {
          const check = await api.get<{ ready: boolean; httpCode?: string; detail?: string }>('/agent/ready');
          if (check.ready) {
            ready = true;
            break;
          }
          const detail = check.detail || 'Starting up...';
          setProvisionMsg(`${detail} (${Math.round(elapsed)}s)`);
        } catch {
          setProvisionMsg(`Connecting to agent... (${Math.round(elapsed)}s)`);
        }
      }

      if (!ready) {
        setProvisionMsg('Opening agent...');
        await new Promise(r => setTimeout(r, 1000));
      }

      window.open(data.url, '_blank');
      await fetchAll();
    } catch (err: any) {
      console.error('Failed to open agent:', err);
      const sub = apiData?.subdomain || user?.subdomain;
      if (sub) window.open(`https://${sub}.valnaa.com`, '_blank');
    } finally {
      setActionLoading(null);
      setProvisionMsg(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
      </div>
    );
  }

  const stats = apiData?.stats || { messagesToday: 0, tokensToday: 0, activeSkills: 0 };
  const subdomain = apiData?.subdomain || user?.subdomain || 'your-agent';
  const channelEntries = channels
    ? Object.entries(channels).map(([key, connected]) => ({
        name: CHANNEL_LABELS[key] || key,
        connected: !!connected,
      }))
    : [];

  return (
    <div className="space-y-6">
      <div className="animate-fade-up">
        <h1 className="text-[26px] font-bold text-white tracking-tight">Agent Control Center</h1>
        <p className="mt-1 text-[15px] text-white/40">Everything about your agent, at a glance</p>
      </div>

      {displayStatus === 'paused' && (
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
              {displayStatus === 'active' && (
                <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-green-400 ring-2 ring-black" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-[18px] font-semibold text-white">
                  {subdomain}.valnaa.com
                </h2>
                <StatusBadge status={displayStatus} />
              </div>
              <p className="text-[14px] text-white/50">{statusMessage}</p>
              {apiData?.lastActive && displayStatus === 'active' && (
                <p className="text-[13px] text-white/30 mt-1">
                  Last active {timeAgo(apiData.lastActive)}
                </p>
              )}
              {displayStatus === 'sleeping' && (
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
              onClick={handleOpenAgent}
              loading={actionLoading === 'open'}
              disabled={actionLoading !== null}
            >
              <ExternalLink className="h-4 w-4" />
              {provisionMsg || 'Open Agent'}
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
              disabled={displayStatus === 'paused' || actionLoading !== null}
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
            <span className="text-[13px] text-white/40">Messages today</span>
            <MessageSquare className="h-4 w-4 text-white/20" />
          </div>
          <p className="text-[28px] font-bold text-white tabular-nums">{stats.messagesToday}</p>
          <p className="text-[12px] text-white/30 mt-1">across all connected apps</p>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[13px] text-white/40">Tokens used today</span>
            <Coins className="h-4 w-4 text-white/20" />
          </div>
          <p className="text-[28px] font-bold text-white tabular-nums">{formatTokens(stats.tokensToday)}</p>
          <p className="text-[12px] text-white/30 mt-1">AI model consumption</p>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[13px] text-white/40">Active skills</span>
            <ListChecks className="h-4 w-4 text-white/20" />
          </div>
          <p className="text-[28px] font-bold text-white tabular-nums">{stats.activeSkills}</p>
          <p className="text-[12px] text-white/30 mt-1">scheduled automations</p>
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
            {formatTokens(tokenBalance)}
          </p>
          <p className="text-[13px] text-white/40 mt-2">
            Available tokens for AI operations
          </p>
          {tokenBalance <= 50000 && tokenBalance > 0 && (
            <p className="mt-3 text-[13px] text-amber-400 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              Running low — consider topping up
            </p>
          )}
          {tokenBalance === 0 && (
            <p className="mt-3 text-[13px] text-red-400 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              No tokens remaining
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
            {channelEntries.length > 0 ? channelEntries.map((ch) => (
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
            )) : (
              <p className="text-[13px] text-white/30 py-4 text-center">No channels configured yet</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
