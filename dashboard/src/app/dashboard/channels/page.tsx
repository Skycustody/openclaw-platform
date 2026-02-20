'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Card, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import api from '@/lib/api';
import { useStore } from '@/lib/store';
import {
  Check, Lock, Loader2, MessageSquare,
  ArrowRight, Link2Off, AlertCircle, ExternalLink,
} from 'lucide-react';

interface ChannelStatuses {
  telegram: boolean;
  discord: boolean;
  slack: boolean;
  whatsapp: boolean;
  signal: boolean;
}

interface ChannelView {
  platform: string;
  connected: boolean;
  messagesThisMonth: number;
  planLocked: boolean;
}

const platformMeta: Record<string, { label: string; emoji: string; description: string }> = {
  telegram: {
    label: 'Telegram',
    emoji: '✈️',
    description: 'Connect a Telegram bot to send and receive messages',
  },
  whatsapp: {
    label: 'WhatsApp',
    emoji: '💬',
    description: 'Pair your WhatsApp to let your agent message on your behalf',
  },
  discord: {
    label: 'Discord',
    emoji: '🎮',
    description: 'Add your agent to a Discord server',
  },
  slack: {
    label: 'Slack',
    emoji: '⚡',
    description: 'Install your agent in a Slack workspace',
  },
  signal: {
    label: 'Signal',
    emoji: '🔒',
    description: 'Pair Signal for private, encrypted messaging',
  },
};

const PRO_ONLY = ['discord', 'slack', 'signal'];

export default function ConnectApps() {
  const [channels, setChannels] = useState<ChannelView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState<string | null>(null);

  // Telegram modal
  const [showTelegramModal, setShowTelegramModal] = useState(false);
  const [telegramToken, setTelegramToken] = useState('');
  const [tokenError, setTokenError] = useState('');

  // Discord modal
  const [showDiscordModal, setShowDiscordModal] = useState(false);
  const [discordToken, setDiscordToken] = useState('');
  const [discordError, setDiscordError] = useState('');

  // WhatsApp modal
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [whatsAppLoading, setWhatsAppLoading] = useState(false);
  const [whatsAppAgentUrl, setWhatsAppAgentUrl] = useState('');
  const [whatsAppError, setWhatsAppError] = useState('');
  const [whatsAppPaired, setWhatsAppPaired] = useState(false);
  const [whatsAppStep, setWhatsAppStep] = useState<'idle' | 'setting-up' | 'ready' | 'paired'>('idle');
  const statusPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { user } = useStore();
  const isStarterPlan = user?.plan === 'starter';

  const fetchChannels = useCallback(async () => {
    try {
      const data = await api.get<{ channels: ChannelStatuses; messageCounts: Record<string, number> }>('/channels');
      const statuses = data.channels || {};
      const counts = data.messageCounts || {};

      const list: ChannelView[] = Object.keys(platformMeta).map((platform) => ({
        platform,
        connected: !!(statuses as any)[platform],
        messagesThisMonth: counts[platform] || 0,
        planLocked: isStarterPlan && PRO_ONLY.includes(platform),
      }));

      setChannels(list);
      setError('');
    } catch (err: any) {
      setError(err?.message || 'Could not load channels');
      const list: ChannelView[] = Object.keys(platformMeta).map((platform) => ({
        platform,
        connected: false,
        messagesThisMonth: 0,
        planLocked: isStarterPlan && PRO_ONLY.includes(platform),
      }));
      setChannels(list);
    } finally {
      setLoading(false);
    }
  }, [isStarterPlan]);

  useEffect(() => { fetchChannels(); }, [fetchChannels]);

  useEffect(() => {
    return () => {
      if (statusPollRef.current) clearInterval(statusPollRef.current);
    };
  }, []);

  // ── Telegram ──

  const connectTelegram = async () => {
    if (!telegramToken.trim()) {
      setTokenError('Please paste your bot token');
      return;
    }
    setTokenError('');
    setConnecting('telegram');
    try {
      await api.post('/channels/telegram/connect', { botToken: telegramToken.trim() });
      setTelegramToken('');
      setShowTelegramModal(false);
      await fetchChannels();
    } catch (err: any) {
      setTokenError(err?.message || 'Could not connect. Double-check your token and try again.');
    } finally {
      setConnecting(null);
    }
  };

  // ── Discord ──

  const connectDiscord = async () => {
    if (!discordToken.trim()) {
      setDiscordError('Please paste your bot token');
      return;
    }
    setDiscordError('');
    setConnecting('discord');
    try {
      await api.post('/channels/discord/connect', { botToken: discordToken.trim() });
      setDiscordToken('');
      setShowDiscordModal(false);
      await fetchChannels();
    } catch (err: any) {
      setDiscordError(err?.message || 'Could not connect. Double-check your token and try again.');
    } finally {
      setConnecting(null);
    }
  };

  // ── WhatsApp ──

  const startWhatsAppPairing = async () => {
    setWhatsAppLoading(true);
    setWhatsAppError('');
    setWhatsAppAgentUrl('');
    setWhatsAppPaired(false);
    setWhatsAppStep('setting-up');

    if (statusPollRef.current) {
      clearInterval(statusPollRef.current);
      statusPollRef.current = null;
    }

    try {
      const data = await api.post<{ agentUrl: string; alreadyLinked: boolean }>('/channels/whatsapp/pair');

      if (data.alreadyLinked) {
        setWhatsAppPaired(true);
        setWhatsAppStep('paired');
        await fetchChannels();
        return;
      }

      setWhatsAppAgentUrl(data.agentUrl || '');
      setWhatsAppStep('ready');

      if (!data.agentUrl) {
        setWhatsAppError('Could not get your agent URL. Please open your Agent from the dashboard first.');
        return;
      }

      // Poll for pairing status every 5 seconds
      statusPollRef.current = setInterval(async () => {
        try {
          const status = await api.get<{ paired: boolean }>('/channels/whatsapp/status');
          if (status.paired) {
            setWhatsAppPaired(true);
            setWhatsAppStep('paired');
            if (statusPollRef.current) {
              clearInterval(statusPollRef.current);
              statusPollRef.current = null;
            }
            await fetchChannels();
          }
        } catch {
          // ignore polling errors
        }
      }, 5000);
    } catch (err: any) {
      setWhatsAppError(err?.message || 'Could not start WhatsApp setup. Open Agent first, then retry.');
      setWhatsAppStep('idle');
    } finally {
      setWhatsAppLoading(false);
    }
  };

  const closeWhatsAppModal = () => {
    setShowWhatsAppModal(false);
    setWhatsAppAgentUrl('');
    setWhatsAppError('');
    setWhatsAppPaired(false);
    setWhatsAppStep('idle');
    if (statusPollRef.current) {
      clearInterval(statusPollRef.current);
      statusPollRef.current = null;
    }
  };

  // ── Disconnect ──

  const disconnect = async (platform: string) => {
    setConnecting(platform);
    try {
      await api.post(`/channels/${platform}/disconnect`);
      await fetchChannels();
    } catch {
      setChannels((prev) => prev.map((c) => c.platform === platform ? { ...c, connected: false } : c));
    } finally {
      setConnecting(null);
    }
  };

  const openConnect = (platform: string) => {
    if (platform === 'telegram') setShowTelegramModal(true);
    else if (platform === 'discord') setShowDiscordModal(true);
    else if (platform === 'whatsapp') {
      setShowWhatsAppModal(true);
      startWhatsAppPairing();
    }
  };

  const connectedCount = channels.filter((c) => c.connected).length;
  const totalMessages = channels.reduce((a, c) => a + (c.messagesThisMonth || 0), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="animate-fade-up">
        <h1 className="text-[26px] font-bold text-white tracking-tight">Connect Your Apps</h1>
        <p className="mt-1 text-[15px] text-white/40">
          Connect messaging apps so your agent can communicate on your behalf
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-[13px] text-amber-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <Card className="!p-4">
        <div className="flex items-center gap-4 text-[14px]">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-white/30" />
            <span className="text-white/60">
              <strong className="text-white">{connectedCount}</strong> of {channels.length} apps connected
            </span>
          </div>
          <span className="text-white/10">|</span>
          <span className="text-white/40">
            {totalMessages.toLocaleString()} messages this month
          </span>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {channels.map((ch) => {
          const meta = platformMeta[ch.platform];
          if (!meta) return null;

          return (
            <Card key={ch.platform}>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{meta.emoji}</span>
                  <div>
                    <CardTitle>{meta.label}</CardTitle>
                    <p className="mt-0.5 text-[13px] text-white/40">{meta.description}</p>
                  </div>
                </div>
                {ch.connected && <Badge variant="green">Connected</Badge>}
                {ch.planLocked && !ch.connected && (
                  <Badge><Lock className="h-3 w-3" /> Pro</Badge>
                )}
              </div>

              {ch.connected ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-4 text-[13px]">
                    <span className="flex items-center gap-1.5 text-green-400">
                      <Check className="h-3.5 w-3.5" />
                      Active
                    </span>
                    <span className="text-white/15">&middot;</span>
                    <span className="text-white/40">{ch.messagesThisMonth} this month</span>
                  </div>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => disconnect(ch.platform)}
                    loading={connecting === ch.platform}
                  >
                    <Link2Off className="h-3.5 w-3.5" />
                    Disconnect
                  </Button>
                </div>
              ) : ch.planLocked ? (
                <Button variant="glass" size="sm" onClick={() => window.location.href = '/dashboard/billing'}>
                  <Lock className="h-3.5 w-3.5" />
                  Upgrade to Pro
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => openConnect(ch.platform)}
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                  Connect
                </Button>
              )}
            </Card>
          );
        })}
      </div>

      {/* ── Telegram Modal ── */}
      <Modal
        open={showTelegramModal}
        onClose={() => { setShowTelegramModal(false); setTelegramToken(''); setTokenError(''); }}
        title="Connect Telegram"
      >
        <div className="space-y-5">
          <div className="space-y-3">
            {[
              ['1', 'Open Telegram and search for @BotFather'],
              ['2', 'Send /newbot and follow the prompts to create a bot'],
              ['3', 'Copy the bot token and paste it below'],
            ].map(([num, text]) => (
              <div key={num} className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.03] border border-white/[0.04]">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/[0.08] text-white/60 text-[12px] font-bold shrink-0">{num}</span>
                <p className="text-[14px] text-white/70">{text}</p>
              </div>
            ))}
          </div>

          <Input
            label="Bot Token"
            placeholder="Paste your bot token from BotFather"
            value={telegramToken}
            onChange={(e) => { setTelegramToken(e.target.value); setTokenError(''); }}
            error={tokenError}
          />

          <div className="flex justify-end gap-2">
            <Button variant="glass" size="md" onClick={() => { setShowTelegramModal(false); setTelegramToken(''); setTokenError(''); }}>
              Cancel
            </Button>
            <Button variant="primary" size="md" onClick={connectTelegram} loading={connecting === 'telegram'} disabled={!telegramToken.trim()}>
              Connect Telegram
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Discord Modal ── */}
      <Modal
        open={showDiscordModal}
        onClose={() => { setShowDiscordModal(false); setDiscordToken(''); setDiscordError(''); }}
        title="Connect Discord"
      >
        <div className="space-y-5">
          <div className="space-y-3">
            {[
              ['1', 'Go to discord.com/developers/applications and create a New Application'],
              ['2', 'Click "Bot" in the sidebar, then click "Reset Token" to get your bot token'],
              ['3', 'Enable "Message Content Intent" under Privileged Gateway Intents'],
              ['4', 'Go to OAuth2 URL Generator, select "bot" + "applications.commands", add permissions (Send Messages, Read Message History, View Channels), and invite the bot to your server'],
              ['5', 'Paste the bot token below'],
            ].map(([num, text]) => (
              <div key={num} className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.03] border border-white/[0.04]">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/[0.08] text-white/60 text-[12px] font-bold shrink-0">{num}</span>
                <p className="text-[14px] text-white/70">{text}</p>
              </div>
            ))}
          </div>

          <Input
            label="Bot Token"
            placeholder="Paste your Discord bot token"
            value={discordToken}
            onChange={(e) => { setDiscordToken(e.target.value); setDiscordError(''); }}
            error={discordError}
          />

          <div className="flex justify-end gap-2">
            <Button variant="glass" size="md" onClick={() => { setShowDiscordModal(false); setDiscordToken(''); setDiscordError(''); }}>
              Cancel
            </Button>
            <Button variant="primary" size="md" onClick={connectDiscord} loading={connecting === 'discord'} disabled={!discordToken.trim()}>
              Connect Discord
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── WhatsApp Modal ── */}
      <Modal
        open={showWhatsAppModal}
        onClose={closeWhatsAppModal}
        title="Connect WhatsApp"
      >
        <div className="space-y-5">
          {whatsAppStep === 'paired' ? (
            <div className="flex flex-col items-center justify-center py-6">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20 mb-4">
                <Check className="h-8 w-8 text-green-400" />
              </div>
              <p className="text-[16px] font-semibold text-green-400 mb-1">WhatsApp Connected!</p>
              <p className="text-[13px] text-white/40 text-center">Your agent can now send and receive WhatsApp messages.</p>
            </div>
          ) : whatsAppStep === 'setting-up' ? (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="h-10 w-10 animate-spin text-white/20 mb-4" />
              <p className="text-[14px] text-white/50">Setting up WhatsApp on your agent...</p>
              <p className="text-[12px] text-white/25 mt-1">This may take a few seconds</p>
            </div>
          ) : whatsAppStep === 'ready' ? (
            <>
              <div className="space-y-3">
                {[
                  ['1', 'Click the button below to open your Agent Dashboard'],
                  ['2', 'In the Agent Dashboard, you will see a WhatsApp QR code'],
                  ['3', 'On your phone: WhatsApp \u2192 Settings \u2192 Linked Devices \u2192 Link a Device'],
                  ['4', 'Scan the QR code shown in the Agent Dashboard'],
                ].map(([num, text]) => (
                  <div key={num} className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.03] border border-white/[0.04]">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/[0.08] text-white/60 text-[12px] font-bold shrink-0">{num}</span>
                    <p className="text-[14px] text-white/70">{text}</p>
                  </div>
                ))}
              </div>

              {whatsAppAgentUrl && (
                <a href={whatsAppAgentUrl} target="_blank" rel="noopener noreferrer" className="block">
                  <Button variant="primary" size="md" className="w-full">
                    <ExternalLink className="h-4 w-4" />
                    Open Agent Dashboard to Scan QR Code
                  </Button>
                </a>
              )}

              <div className="flex items-center gap-2 rounded-lg border border-blue-500/20 bg-blue-500/10 p-3 text-[13px] text-blue-400">
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                Waiting for you to scan the QR code... This page will update automatically.
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-8">
              <p className="text-[14px] text-white/50">Click below to set up WhatsApp pairing</p>
            </div>
          )}

          {whatsAppError && (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-[13px] text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {whatsAppError}
            </div>
          )}

          <div className="flex justify-end gap-2">
            {whatsAppStep === 'idle' && (
              <Button variant="primary" size="md" onClick={startWhatsAppPairing} loading={whatsAppLoading}>
                Set Up WhatsApp
              </Button>
            )}
            <Button variant="glass" size="md" onClick={closeWhatsAppModal}>
              {whatsAppStep === 'paired' ? 'Done' : 'Close'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
