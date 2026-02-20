'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardTitle, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import api from '@/lib/api';
import {
  Check, X, Lock, Loader2, QrCode, MessageSquare,
  ArrowRight, Link2Off,
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

  useEffect(() => { fetchChannels(); }, [fetchChannels]);

  const findChannel = (platform: string) => channels.find((c) => c.platform === platform);

  const connectTelegram = async () => {
    if (!telegramToken.trim()) {
      setTokenError('Please paste your connection key');
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
        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
      </div>
    );
  }

  const renderChannelCard = (platform: string) => {
    const meta = platformMeta[platform];
    const ch = findChannel(platform);
    const isConnected = ch?.connected ?? false;
    const isLocked = ch?.planLocked ?? false;

    return (
      <Card key={platform}>
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{meta.emoji}</span>
            <div>
              <CardTitle>{meta.label}</CardTitle>
              <p className="mt-0.5 text-[13px] text-white/40">{meta.description}</p>
            </div>
          </div>
          {isConnected && <Badge variant="green">Connected</Badge>}
          {isLocked && !isConnected && (
            <Badge><Lock className="h-3 w-3" /> Pro</Badge>
          )}
        </div>

        {isConnected ? (
          <div className="space-y-3">
            <div className="flex items-center gap-4 text-[13px]">
              <span className="flex items-center gap-1.5 text-green-400">
                <Check className="h-3.5 w-3.5" />
                {ch?.botName}
              </span>
              <span className="text-white/15">·</span>
              <span className="text-white/40">{ch?.messagesToday} today</span>
              <span className="text-white/15">·</span>
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
          <Button variant="glass" size="sm" onClick={() => window.location.href = '/dashboard/billing'}>
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
            Connect
          </Button>
        )}
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div className="animate-fade-up">
        <h1 className="text-[26px] font-bold text-white tracking-tight">Connect Your Apps</h1>
        <p className="mt-1 text-[15px] text-white/40">
          Connect messaging apps so your agent can communicate on your behalf
        </p>
      </div>

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
            {channels.reduce((a, c) => a + (c.messagesThisMonth || 0), 0).toLocaleString()} messages this month
          </span>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {['telegram', 'whatsapp', 'discord', 'slack', 'signal'].map(renderChannelCard)}
      </div>

      <Modal
        open={showTelegramModal}
        onClose={() => { setShowTelegramModal(false); setTelegramToken(''); setTokenError(''); }}
        title="Connect Telegram"
      >
        <div className="space-y-5">
          <div className="space-y-3">
            {[
              ['1', 'Open Telegram and search for @BotFather'],
              ['2', 'Send /newbot and follow the prompts'],
              ['3', 'Copy the connection key and paste it below'],
            ].map(([num, text]) => (
              <div key={num} className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.03] border border-white/[0.04]">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/[0.08] text-white/60 text-[12px] font-bold shrink-0">{num}</span>
                <p className="text-[14px] text-white/70">{text}</p>
              </div>
            ))}
          </div>

          <Input
            label="Connection key"
            placeholder="Paste your connection key from BotFather"
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

      <Modal
        open={showWhatsAppModal}
        onClose={() => setShowWhatsAppModal(false)}
        title="Connect WhatsApp"
      >
        <div className="space-y-5">
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-10">
            <QrCode className="h-20 w-20 text-white/10 mb-4" />
            <p className="text-[14px] text-white/50 text-center">
              Open WhatsApp → Settings → Linked Devices → Link a Device
            </p>
            <p className="text-[12px] text-white/25 mt-2">QR code will appear here when ready</p>
          </div>
          <div className="flex justify-end">
            <Button variant="glass" size="md" onClick={() => setShowWhatsAppModal(false)}>Close</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
