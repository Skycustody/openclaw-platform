'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardTitle, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import api from '@/lib/api';
import { useStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import {
  Check, X, Lock, Loader2, QrCode, MessageSquare,
  ArrowRight, Copy, ExternalLink, Link2Off,
} from 'lucide-react';

interface Channel {
  id: string;
  platform: string;
  connected: boolean;
  botName?: string;
  messagesToday: number;
  messagesThisMonth: number;
  planLocked?: boolean;
}

const platformMeta: Record<string, { label: string; emoji: string; gradient: string; description: string }> = {
  telegram: {
    label: 'Telegram',
    emoji: '✈️',
    gradient: 'from-blue-500/10 to-blue-600/5',
    description: 'Connect a Telegram bot to send and receive messages',
  },
  whatsapp: {
    label: 'WhatsApp',
    emoji: '💬',
    gradient: 'from-emerald-500/10 to-emerald-600/5',
    description: 'Pair your WhatsApp to let your agent message on your behalf',
  },
  discord: {
    label: 'Discord',
    emoji: '🎮',
    gradient: 'from-indigo-500/10 to-indigo-600/5',
    description: 'Add your agent to a Discord server',
  },
  slack: {
    label: 'Slack',
    emoji: '⚡',
    gradient: 'from-purple-500/10 to-purple-600/5',
    description: 'Install your agent in a Slack workspace',
  },
  signal: {
    label: 'Signal',
    emoji: '🔒',
    gradient: 'from-sky-500/10 to-sky-600/5',
    description: 'Pair Signal for private, encrypted messaging',
  },
};

const MOCK_CHANNELS: Channel[] = [
  { id: '1', platform: 'telegram', connected: true, botName: '@MyAgentBot', messagesToday: 12, messagesThisMonth: 340 },
  { id: '2', platform: 'whatsapp', connected: true, botName: '+1 (555) 012-3456', messagesToday: 5, messagesThisMonth: 89 },
  { id: '3', platform: 'discord', connected: false, messagesToday: 0, messagesThisMonth: 0 },
  { id: '4', platform: 'slack', connected: false, messagesToday: 0, messagesThisMonth: 0, planLocked: true },
  { id: '5', platform: 'signal', connected: false, messagesToday: 0, messagesThisMonth: 0, planLocked: true },
];

export default function ConnectApps() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [showTelegramModal, setShowTelegramModal] = useState(false);
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [telegramToken, setTelegramToken] = useState('');
  const [tokenError, setTokenError] = useState('');
  const { user } = useStore();

  const fetchChannels = useCallback(async () => {
    try {
      const data = await api.get<Channel[]>('/channels');
      setChannels(data);
    } catch {
      setChannels(MOCK_CHANNELS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  const findChannel = (platform: string) => channels.find((c) => c.platform === platform);

  const connectTelegram = async () => {
    if (!telegramToken.trim()) {
      setTokenError('Please paste your connection key');
      return;
    }
    setTokenError('');
    setConnecting('telegram');
    try {
      await api.post('/channels/telegram/connect', { token: telegramToken.trim() });
      setTelegramToken('');
      setShowTelegramModal(false);
      await fetchChannels();
    } catch (err: any) {
      setTokenError(err?.message || 'Could not connect. Double-check your key and try again.');
    } finally {
      setConnecting(null);
    }
  };

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

  const connectedCount = channels.filter((c) => c.connected).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
      </div>
    );
  }

  const renderChannelCard = (platform: string) => {
    const meta = platformMeta[platform];
    const ch = findChannel(platform);
    const isConnected = ch?.connected ?? false;
    const isLocked = ch?.planLocked ?? false;

    return (
      <Card key={platform} className="relative overflow-hidden">
        <div className={`absolute inset-0 bg-gradient-to-br ${meta.gradient} pointer-events-none`} />
        <div className="relative">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{meta.emoji}</span>
              <div>
                <CardTitle>{meta.label}</CardTitle>
                <CardDescription>
                  {isConnected ? meta.description : meta.description}
                </CardDescription>
              </div>
            </div>
            {isConnected && (
              <Badge variant="active">Connected</Badge>
            )}
            {isLocked && !isConnected && (
              <Badge variant="accent">
                <Lock className="h-3 w-3" />
                Pro
              </Badge>
            )}
          </div>

          {isConnected ? (
            <div className="space-y-3">
              <div className="flex items-center gap-4 text-[13px]">
                <div className="flex items-center gap-1.5 text-emerald-400">
                  <Check className="h-3.5 w-3.5" />
                  <span>{ch?.botName}</span>
                </div>
                <span className="text-white/25">·</span>
                <span className="text-white/40">{ch?.messagesToday} messages today</span>
                <span className="text-white/25">·</span>
                <span className="text-white/40">{ch?.messagesThisMonth} this month</span>
              </div>
              <Button
                variant="danger"
                size="sm"
                onClick={() => disconnect(platform)}
                loading={connecting === platform}
              >
                <Link2Off className="h-3.5 w-3.5" />
                Disconnect
              </Button>
            </div>
          ) : isLocked ? (
            <Button
              variant="glass"
              size="sm"
              onClick={() => window.location.href = '/dashboard/billing'}
            >
              <Lock className="h-3.5 w-3.5" />
              Upgrade to Pro
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                if (platform === 'telegram') setShowTelegramModal(true);
                else if (platform === 'whatsapp') setShowWhatsAppModal(true);
              }}
            >
              <ArrowRight className="h-3.5 w-3.5" />
              Connect Now
            </Button>
          )}
        </div>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div className="animate-fade-up">
        <h1 className="text-[26px] font-bold text-white tracking-tight">Connect Your Apps</h1>
        <p className="mt-1 text-[15px] text-white/40 max-w-lg">
          Connect your messaging apps so your agent can send and receive messages on your behalf
        </p>
      </div>

      {/* Summary bar */}
      <Card className="!p-4">
        <div className="flex items-center gap-4 text-[14px]">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-indigo-400" />
            <span className="text-white/60">
              <strong className="text-white">{connectedCount}</strong> of {channels.length} apps connected
            </span>
          </div>
          <span className="text-white/10">|</span>
          <span className="text-white/40">
            {channels.reduce((a, c) => a + (c.messagesThisMonth || 0), 0).toLocaleString()} total messages this month
          </span>
        </div>
      </Card>

      {/* Channel grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {['telegram', 'whatsapp', 'discord', 'slack', 'signal'].map(renderChannelCard)}
      </div>

      {/* Telegram connect modal */}
      <Modal
        open={showTelegramModal}
        onClose={() => { setShowTelegramModal(false); setTelegramToken(''); setTokenError(''); }}
        title="Connect Telegram"
        description="Follow these steps to connect your Telegram bot"
      >
        <div className="space-y-5">
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03]">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500/15 text-indigo-400 text-[12px] font-bold shrink-0">1</span>
              <div>
                <p className="text-[14px] text-white/80">Open Telegram and search for <strong className="text-white">@BotFather</strong></p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03]">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500/15 text-indigo-400 text-[12px] font-bold shrink-0">2</span>
              <div>
                <p className="text-[14px] text-white/80">Send <code className="px-1.5 py-0.5 rounded bg-white/5 text-indigo-400 text-[13px]">/newbot</code> and follow the prompts</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03]">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500/15 text-indigo-400 text-[12px] font-bold shrink-0">3</span>
              <div>
                <p className="text-[14px] text-white/80">Copy the connection key BotFather gives you and paste it below</p>
              </div>
            </div>
          </div>

          <Input
            label="Connection key"
            placeholder="Paste your connection key from BotFather"
            value={telegramToken}
            onChange={(e) => { setTelegramToken(e.target.value); setTokenError(''); }}
            error={tokenError}
          />

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="glass" size="md" onClick={() => { setShowTelegramModal(false); setTelegramToken(''); setTokenError(''); }}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={connectTelegram}
              loading={connecting === 'telegram'}
              disabled={!telegramToken.trim()}
            >
              Connect Telegram
            </Button>
          </div>
        </div>
      </Modal>

      {/* WhatsApp connect modal */}
      <Modal
        open={showWhatsAppModal}
        onClose={() => setShowWhatsAppModal(false)}
        title="Connect WhatsApp"
        description="Scan the QR code with your phone to pair"
      >
        <div className="space-y-5">
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-10">
            <QrCode className="h-24 w-24 text-white/15 mb-4" />
            <p className="text-[14px] text-white/50 text-center">
              Open WhatsApp on your phone → Settings → Linked Devices → Link a Device
            </p>
            <p className="text-[12px] text-white/25 mt-2">QR code will appear here when ready</p>
          </div>

          <div className="flex justify-end">
            <Button variant="glass" size="md" onClick={() => setShowWhatsAppModal(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
