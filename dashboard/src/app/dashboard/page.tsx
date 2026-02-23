'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/Badge';
import api from '@/lib/api';
import { formatUsd } from '@/lib/utils';
import { useStore } from '@/lib/store';
import GatewayChat from '@/components/dashboard/GatewayChat';
import {
  Bot, Sparkles, Loader2, Cpu, Zap,
  AlertTriangle, RefreshCw, ExternalLink,
} from 'lucide-react';

type AgentDisplayStatus = 'active' | 'online' | 'sleeping' | 'paused' | 'provisioning' | 'cancelled' | 'offline' | 'grace_period';

interface UserSettings {
  brain_mode: 'auto' | 'manual';
  manual_model: string | null;
  has_own_openrouter_key: boolean;
  agent_name: string;
}

type Phase = 'loading' | 'starting' | 'provisioning' | 'polling' | 'ready' | 'error';

export default function DashboardHome() {
  const { user } = useStore();

  const [phase, setPhase] = useState<Phase>('loading');
  const [agentUrl, setAgentUrl] = useState<string | null>(null);
  const [gatewayWsUrl, setGatewayWsUrl] = useState<string | null>(null);
  const [gatewayToken, setGatewayToken] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState('Connecting to agent...');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [balanceUsd, setBalanceUsd] = useState<number | null>(null);
  const [agentStatus, setAgentStatus] = useState<AgentDisplayStatus>('offline');

  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);

  const pollAbort = useRef<AbortController | null>(null);

  const fetchContext = useCallback(async () => {
    try {
      const [settingsRes, usageRes, statusRes] = await Promise.allSettled([
        api.get<{ settings: UserSettings }>('/settings'),
        api.get<{ usage?: { remainingUsd: number } }>('/settings/nexos-usage'),
        api.get<any>('/agent/status'),
      ]);
      if (settingsRes.status === 'fulfilled') setSettings(settingsRes.value.settings);
      if (usageRes.status === 'fulfilled' && usageRes.value.usage) setBalanceUsd(usageRes.value.usage.remainingUsd);
      if (statusRes.status === 'fulfilled') {
        setAgentStatus((statusRes.value.subscriptionStatus || statusRes.value.status || 'offline') as AgentDisplayStatus);
      }
    } catch {}
  }, []);

  const pollUntilReady = useCallback(async () => {
    setPhase('polling');
    setStatusMsg('Waiting for agent to come online...');

    for (let i = 0; i < 40; i++) {
      if (pollAbort.current?.signal.aborted) return;
      const delay = i < 5 ? 2000 : 4000;
      await new Promise(r => setTimeout(r, delay));

      try {
        const check = await api.get<{ ready: boolean; detail?: string }>('/agent/ready');
        if (check.ready) {
          setPhase('ready');
          return;
        }
        setStatusMsg(check.detail || 'Starting up...');
      } catch {}
    }

    setPhase('error');
    setErrorMsg('Agent took too long to start. Try refreshing.');
  }, []);

  const storeGatewayInfo = useCallback((data: { gatewayWsUrl?: string | null; gatewayUrl?: string | null; gatewayToken?: string | null; url?: string }) => {
    if (data.url) setAgentUrl(data.url);
    if (data.gatewayToken) setGatewayToken(data.gatewayToken);

    if (data.gatewayWsUrl) {
      setGatewayWsUrl(data.gatewayWsUrl);
    } else if (data.gatewayUrl) {
      // Derive clean WSS URL by stripping query params
      try {
        const u = new URL(data.gatewayUrl.replace('wss://', 'https://'));
        setGatewayWsUrl(`wss://${u.host}`);
      } catch {
        setGatewayWsUrl(data.gatewayUrl.split('?')[0]);
      }
    } else if (data.url) {
      // Derive from the HTTPS URL
      try {
        const u = new URL(data.url);
        setGatewayWsUrl(`wss://${u.host}`);
      } catch {}
    }
  }, []);

  const startAgent = useCallback(async () => {
    setPhase('starting');
    setStatusMsg('Starting agent...');

    try {
      const data = await api.post<{
        url: string;
        status: string;
        message?: string;
        gatewayUrl?: string | null;
        gatewayWsUrl?: string | null;
        gatewayToken: string | null;
      }>('/agent/open');

      if (data.status === 'provisioning') {
        setPhase('provisioning');
        setAgentStatus('provisioning');
        setStatusMsg(data.message || 'Setting up your agent...');

        for (let i = 0; i < 60; i++) {
          if (pollAbort.current?.signal.aborted) return;
          await new Promise(r => setTimeout(r, 10000));

          try {
            const retry = await api.post<{
              url: string;
              status: string;
              message?: string;
              gatewayUrl?: string | null;
              gatewayWsUrl?: string | null;
              gatewayToken: string | null;
            }>('/agent/open');

            if (retry.status === 'provisioning') {
              setStatusMsg(retry.message || 'Setting up your agent...');
              continue;
            }

            if (retry.url) {
              storeGatewayInfo(retry);
              setAgentStatus('active');
              await pollUntilReady();
              return;
            }
          } catch {}
        }

        setPhase('error');
        setErrorMsg('Agent setup timed out. Please try refreshing the page.');
        return;
      }

      if (!data.url) {
        setPhase('error');
        setErrorMsg('Could not get agent URL.');
        return;
      }

      storeGatewayInfo(data);
      setAgentStatus('active');
      await pollUntilReady();
    } catch (err: any) {
      setPhase('error');
      const msg = err.message || 'Failed to start agent.';
      if (msg.includes('No worker servers') || msg.includes('Register your server')) {
        setErrorMsg(
          'No worker servers available. A separate worker server must be registered before agents can be created. ' +
          'Register a worker using: POST /webhooks/servers/register with your worker server IP and RAM.'
        );
      } else if (msg.includes('HETZNER')) {
        setErrorMsg('Auto-provisioning not configured. Register a worker server manually or set HETZNER_API_TOKEN.');
      } else if (msg.includes('SSH')) {
        setErrorMsg('Cannot connect to worker server. Check SSH keys and network connectivity.');
      } else {
        setErrorMsg(msg);
      }
    }
  }, [pollUntilReady, storeGatewayInfo]);

  useEffect(() => {
    if (phase !== 'ready') return;
    const interval = setInterval(async () => {
      try {
        const res = await api.get<{ usage?: { remainingUsd: number } }>('/settings/nexos-usage');
        if (res.usage?.remainingUsd !== undefined) setBalanceUsd(res.usage.remainingUsd);
      } catch {}
    }, 30000);
    return () => clearInterval(interval);
  }, [phase]);

  useEffect(() => {
    pollAbort.current = new AbortController();
    fetchContext();

    (async () => {
      try {
        const embed = await api.get<{
          available: boolean;
          url?: string;
          gatewayUrl?: string;
          gatewayWsUrl?: string;
          gatewayToken?: string;
          subscriptionStatus?: string;
          reason?: string;
        }>('/agent/embed-url');

        const subStatus = (embed.subscriptionStatus || 'offline') as AgentDisplayStatus;
        setAgentStatus(subStatus);

        if (!embed.available) {
          if (embed.reason === 'paused') {
            setPhase('error');
            setErrorMsg('Agent paused — update your subscription or payment to resume.');
            return;
          }
          if (embed.reason === 'cancelled') {
            setPhase('error');
            setErrorMsg('Subscription cancelled. Please resubscribe.');
            return;
          }
          await startAgent();
          return;
        }

        storeGatewayInfo(embed);

        if (subStatus === 'sleeping' || subStatus === 'provisioning') {
          await startAgent();
          return;
        }

        const readyCheck = await api.get<{ ready: boolean }>('/agent/ready');
        if (readyCheck.ready) {
          setPhase('ready');
        } else {
          await startAgent();
        }
      } catch {
        await startAgent();
      }
    })();

    return () => {
      pollAbort.current?.abort();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFileUpload = useCallback(async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setUploadingFile(true);
      setUploadMsg(null);
      try {
        const reader = new FileReader();
        const content = await new Promise<string>((resolve, reject) => {
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1] || '');
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        await api.post('/files/upload', { filename: file.name, content });
        setUploadMsg(`${file.name} uploaded to workspace`);
        setTimeout(() => setUploadMsg(null), 4000);
      } catch (err: any) {
        setUploadMsg(`Upload failed: ${err.message}`);
        setTimeout(() => setUploadMsg(null), 5000);
      } finally {
        setUploadingFile(false);
      }
    };
    input.click();
  }, []);

  const getModeLabel = () => {
    if (!settings) return { label: 'Auto', icon: Cpu, desc: 'Smart model routing', variant: 'green' as const };

    if (settings.brain_mode === 'manual' && settings.manual_model) {
      return {
        label: settings.manual_model.length > 20 ? settings.manual_model.slice(0, 18) + '...' : settings.manual_model,
        icon: Zap,
        desc: settings.has_own_openrouter_key ? 'Using your API key' : 'Fixed model',
        variant: settings.has_own_openrouter_key ? 'amber' as const : 'blue' as const,
      };
    }

    return {
      label: 'Auto',
      icon: Cpu,
      desc: settings.has_own_openrouter_key ? 'Smart routing + your key' : 'Smart model routing',
      variant: 'green' as const,
    };
  };

  const mode = getModeLabel();

  const handleRetry = () => {
    setErrorMsg(null);
    setPhase('loading');
    startAgent();
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full overflow-hidden">
      {agentStatus === 'paused' && (
        <div className="border border-red-500/20 bg-red-500/5 rounded-xl px-5 py-3 flex items-center gap-3 mb-3 shrink-0">
          <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
          <p className="text-[13px] text-red-400 flex-1">Agent paused — update your subscription or payment to resume</p>
          <Button variant="danger" size="sm" onClick={() => window.location.href = '/dashboard/tokens'}>
            Billing
          </Button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
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

        <div className="flex items-center gap-2">
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
            title="AI Balance">
            <Sparkles className="h-3.5 w-3.5 text-white/20" />
            <span className={`text-[12px] font-medium tabular-nums ${balanceUsd != null && balanceUsd < 0.50 ? 'text-amber-400' : 'text-white/50'}`}>
              {balanceUsd != null ? `${formatUsd(balanceUsd)} left` : 'Balance'}
            </span>
          </button>
        </div>
      </div>

      {/* Main content — full width edge-to-edge */}
      <div className="flex-1 min-h-0 overflow-hidden border-t border-white/[0.06] bg-white/[0.01] relative flex flex-col">
        {(phase === 'loading' || phase === 'starting' || phase === 'provisioning' || phase === 'polling') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center z-10">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.04] mb-5">
              <Loader2 className="h-8 w-8 animate-spin text-white/20" />
            </div>
            <p className="text-[15px] font-medium text-white/40">{statusMsg}</p>
            <p className="text-[12px] text-white/20 mt-2 max-w-sm">
              {phase === 'provisioning'
                ? 'A new server is being created for your agent. This usually takes 3-5 minutes.'
                : phase === 'starting'
                  ? 'Your OpenClaw agent is being prepared. This may take a moment.'
                  : phase === 'polling'
                    ? 'Almost there - waiting for the agent to finish booting.'
                    : 'Checking agent status...'}
            </p>
          </div>
        )}

        {phase === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center z-10">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/10 mb-5">
              <AlertTriangle className="h-8 w-8 text-red-400/60" />
            </div>
            <p className="text-[15px] font-medium text-white/50">{errorMsg}</p>
            <div className="flex items-center gap-3 mt-5">
              <Button variant="primary" size="sm" onClick={handleRetry}>
                <RefreshCw className="h-4 w-4 mr-1.5" />
                Retry
              </Button>
              {agentStatus === 'paused' && (
                <Button variant="danger" size="sm" onClick={() => window.location.href = '/dashboard/tokens'}>
                  Billing
                </Button>
              )}
            </div>
          </div>
        )}

        {phase === 'ready' && gatewayWsUrl && gatewayToken && (
          <GatewayChat gatewayUrl={gatewayWsUrl} token={gatewayToken} />
        )}

        {phase === 'ready' && (!gatewayWsUrl || !gatewayToken) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center z-10">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.04] mb-5">
              <Bot className="h-8 w-8 text-white/20" />
            </div>
            <p className="text-[15px] font-medium text-white/40">Connecting to agent gateway...</p>
            <p className="text-[12px] text-white/20 mt-2 max-w-sm">
              Could not establish WebSocket connection. The agent may still be starting up.
            </p>
            <div className="flex items-center gap-3 mt-5">
              <Button variant="primary" size="sm" onClick={handleRetry}>
                <RefreshCw className="h-4 w-4 mr-1.5" />
                Retry
              </Button>
              {agentUrl && (
                <Button variant="secondary" size="sm" onClick={() => window.open(agentUrl, '_blank')}>
                  <ExternalLink className="h-4 w-4 mr-1.5" />
                  Open Gateway
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
