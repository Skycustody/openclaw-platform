'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/Button';
import api from '@/lib/api';
import { useStore } from '@/lib/store';
import {
  Bot, Loader2,
  AlertTriangle, RefreshCw, ExternalLink,
} from 'lucide-react';

type AgentDisplayStatus = 'active' | 'online' | 'sleeping' | 'paused' | 'provisioning' | 'cancelled' | 'offline' | 'grace_period';

type Phase = 'loading' | 'starting' | 'provisioning' | 'polling' | 'ready' | 'error';

export default function DashboardHome() {
  const { user, agentUrl, setAgentUrl } = useStore();

  const [phase, setPhase] = useState<Phase>(agentUrl ? 'ready' : 'loading');
  const [statusMsg, setStatusMsg] = useState('Connecting to agent...');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [agentStatus, setAgentStatus] = useState<AgentDisplayStatus>('offline');

  const pollAbort = useRef<AbortController | null>(null);

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

  const storeGatewayInfo = useCallback((data: { url?: string; [k: string]: any }) => {
    if (data.url) setAgentUrl(data.url);
  }, [setAgentUrl]);

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
    // If we already have the URL from a previous visit, skip the whole flow
    if (agentUrl) {
      setPhase('ready');
      return;
    }

    pollAbort.current = new AbortController();

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

  const handleRetry = () => {
    setErrorMsg(null);
    setAgentUrl(null);
    setPhase('loading');
    startAgent();
  };

  // The iframe is rendered in layout.tsx (persistent). This page only shows loading/error states.
  if (phase === 'ready') return null;

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full overflow-hidden">
      {agentStatus === 'paused' && (
        <div className="border border-red-500/15 bg-red-500/[0.04] rounded-lg px-4 py-3 flex items-center gap-3 mb-3 shrink-0 mx-4 mt-3">
          <AlertTriangle className="h-4 w-4 text-red-400/70 shrink-0" />
          <p className="text-[13px] text-red-400/80 flex-1">Agent paused — update your subscription or payment to resume</p>
          <Button variant="danger" size="sm" onClick={() => window.location.href = '/dashboard/billing'}>
            Billing
          </Button>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-hidden relative flex flex-col">
        {(phase === 'loading' || phase === 'starting' || phase === 'provisioning' || phase === 'polling') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center z-10">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.04] mb-5">
              <Loader2 className="h-6 w-6 animate-spin text-white/20" />
            </div>
            <p className="text-[14px] font-medium text-white/40">{statusMsg}</p>
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
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center z-10 px-6">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f87171]/[0.06] mb-5">
              <AlertTriangle className="h-6 w-6 text-[#f87171]/50" />
            </div>
            <p className="text-[14px] font-medium text-white/50 max-w-md">{errorMsg}</p>
            <div className="flex items-center gap-3 mt-5">
              <Button variant="glass" size="sm" onClick={handleRetry}>
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Retry
              </Button>
              {agentStatus === 'paused' && (
                <Button variant="glass" size="sm" onClick={() => window.location.href = '/dashboard/billing'}>
                  Billing
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
