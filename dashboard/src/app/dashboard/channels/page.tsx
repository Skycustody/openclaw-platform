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
  Check, Lock, Loader2, QrCode, MessageSquare,
  ArrowRight, Link2Off, AlertCircle, RefreshCw,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

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

const WHATSAPP_TIMEOUT_MS = 120_000;

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
  const [whatsAppQr, setWhatsAppQr] = useState('');
  const [whatsAppError, setWhatsAppError] = useState('');
  const [whatsAppPaired, setWhatsAppPaired] = useState(false);
  const [whatsAppStatus, setWhatsAppStatus] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pairingStartRef = useRef<number>(0);
  const qrShownRef = useRef(false);

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
      if (pollRef.current) clearInterval(pollRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
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

  const [whatsAppDashboardUrl, setWhatsAppDashboardUrl] = useState('');

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
  };

  const startWhatsAppPairing = async () => {
    setWhatsAppLoading(true);
    setWhatsAppError('');
    setWhatsAppQr('');
    setWhatsAppPaired(false);
    setWhatsAppStatus('Starting agent...');
    setWhatsAppDashboardUrl('');
    stopPolling();
    pairingStartRef.current = Date.now();
    qrShownRef.current = false;

    try {
      const data = await api.post<{ agentUrl: string; dashboardUrl: string; alreadyLinked: boolean }>('/channels/whatsapp/pair');
      setWhatsAppDashboardUrl(data.dashboardUrl || data.agentUrl || '');

      if (data.alreadyLinked) {
        setWhatsAppPaired(true);
        setWhatsAppLoading(false);
        setWhatsAppStatus('');
        await fetchChannels();
        return;
      }

      setWhatsAppStatus('Agent restarted. Generating QR code...');

      const pollQr = async () => {
        if (Date.now() - pairingStartRef.current > WHATSAPP_TIMEOUT_MS) {
          stopPolling();
          setWhatsAppLoading(false);
          setWhatsAppError('QR code generation timed out. Click Retry to try again.');
          setWhatsAppStatus('');
          return;
        }

        try {
          const qrData = await api.get<{ status: string; qrText?: string; message?: string }>('/channels/whatsapp/qr');

          if (qrData.status === 'finalizing') {
            setWhatsAppQr('');
            setWhatsAppLoading(true);
            setWhatsAppStatus('Finalizing connection — your phone will stop showing "logging in" shortly...');
            return;
          }

          if (qrData.status === 'paired') {
            setWhatsAppPaired(true);
            setWhatsAppQr('');
            setWhatsAppLoading(false);
            setWhatsAppStatus('');
            stopPolling();
            await fetchChannels();
            return;
          }

          if (qrData.status === 'error') {
            setWhatsAppError(qrData.message || 'WhatsApp encountered an error. Try again.');
            setWhatsAppLoading(false);
            setWhatsAppStatus('');
            stopPolling();
            return;
          }

          if (qrData.status === 'qr' && qrData.qrText) {
            setWhatsAppQr(qrData.qrText);
            setWhatsAppLoading(false);
            setWhatsAppStatus('');

            // Once QR is shown, switch to faster polling (every 2s)
            // so we detect the scan almost instantly
            if (!qrShownRef.current) {
              qrShownRef.current = true;
              if (pollRef.current) clearInterval(pollRef.current);
              pollRef.current = setInterval(pollQr, 2000);
            }
          } else if (qrData.message) {
            setWhatsAppStatus(qrData.message);
          }
        } catch {
          // keep polling — container may still be starting
        }
      };

      // First poll after 6s, then every 4s until QR appears
      setTimeout(pollQr, 6000);
      pollRef.current = setInterval(pollQr, 4000);

    } catch (err: any) {
      setWhatsAppError(err?.message || 'Could not start WhatsApp pairing. Make sure your agent is running, then retry.');
      setWhatsAppLoading(false);
      setWhatsAppStatus('');
    }
  };

  const closeWhatsAppModal = () => {
    setShowWhatsAppModal(false);
    setWhatsAppQr('');
    setWhatsAppError('');
    setWhatsAppPaired(false);
    setWhatsAppStatus('');
    stopPolling();
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
                    onClick={() => {
                      if (ch.platform === 'whatsapp') {
                        if (confirm('Disconnect WhatsApp?\n\nYour agent will stop replying to WhatsApp messages.\n\nAfter disconnecting, open WhatsApp on your phone → Settings → Linked Devices → tap the OpenClaw device → Unlink, to fully remove it.')) {
                          disconnect(ch.platform);
                        }
                      } else {
                        disconnect(ch.platform);
                      }
                    }}
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
        title={whatsAppPaired ? 'WhatsApp Connected' : 'Connect WhatsApp'}
      >
        <div className="space-y-5">
          {/* Instructions (only shown before pairing) */}
          {!whatsAppPaired && (
            <div className="space-y-2 rounded-lg border border-white/10 bg-white/[0.02] p-3">
              <p className="text-[13px] font-medium text-white/80">How to connect WhatsApp</p>
              <ol className="list-decimal space-y-1 pl-5 text-[12px] text-white/55">
                <li>Wait for the QR code to appear below (takes 10-30 seconds).</li>
                <li>On your phone: WhatsApp &rarr; Settings &rarr; Linked Devices &rarr; Link a Device.</li>
                <li>Scan the QR code shown below within 20 seconds.</li>
                <li>If the QR expires or fails, click Refresh QR Code to try again.</li>
              </ol>
            </div>
          )}

          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-6 min-h-[280px]">
            {whatsAppPaired ? (
              <>
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20 mb-4">
                  <Check className="h-8 w-8 text-green-400" />
                </div>
                <p className="text-[16px] font-semibold text-green-400 mb-2">WhatsApp Connected!</p>
                <p className="text-[13px] text-white/50 text-center mb-1">
                  Your agent is now linked to your WhatsApp as a companion device.
                </p>
                <p className="text-[12px] text-white/30 text-center">
                  You can safely close your phone &mdash; the connection will stay active.
                </p>
              </>
            ) : whatsAppQr ? (
              <>
                <div className="bg-white p-4 rounded-xl mb-4">
                  {!whatsAppQr.includes('\n') && whatsAppQr.length > 20 ? (
                    <QRCodeSVG value={whatsAppQr} size={260} level="M" bgColor="#ffffff" fgColor="#000000" />
                  ) : (
                    <pre
                      className="text-[5px] sm:text-[6px] md:text-[7px] leading-[1.05] text-black whitespace-pre font-mono select-none"
                      style={{ letterSpacing: '-0.5px' }}
                    >
                      {whatsAppQr}
                    </pre>
                  )}
                </div>
                <p className="text-[13px] text-white/50 text-center">
                  Scan this QR code with your phone&apos;s WhatsApp
                </p>
                <p className="text-[11px] text-white/25 mt-1 text-center">
                  Checking for connection...
                  <Loader2 className="inline h-3 w-3 animate-spin ml-1 align-text-bottom" />
                </p>
              </>
            ) : whatsAppLoading ? (
              <>
                <Loader2 className="h-10 w-10 animate-spin text-white/20 mb-4" />
                <p className="text-[14px] text-white/50">{whatsAppStatus || 'Preparing WhatsApp pairing...'}</p>
                <p className="text-[12px] text-white/25 mt-1">This may take up to 30 seconds while the agent restarts</p>
              </>
            ) : (
              <>
                <QrCode className="h-20 w-20 text-white/10 mb-4" />
                <p className="text-[14px] text-white/50 text-center">
                  {whatsAppError || 'Click Retry to generate a new QR code'}
                </p>
                {whatsAppDashboardUrl && !whatsAppError && (
                  <a
                    href={whatsAppDashboardUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600/20 border border-blue-500/30 px-4 py-2.5 text-[13px] font-medium text-blue-400 hover:bg-blue-600/30 transition-colors"
                  >
                    <QrCode className="h-4 w-4" />
                    Open Agent Dashboard to scan QR
                    <ArrowRight className="h-3.5 w-3.5" />
                  </a>
                )}
              </>
            )}
          </div>

          {/* What to do next (shown after successful pairing) */}
          {whatsAppPaired && (
            <div className="space-y-4">
              <div className="space-y-2 rounded-lg border border-green-500/20 bg-green-500/5 p-4">
                <p className="text-[13px] font-semibold text-green-400">How to chat with your AI agent</p>
                <p className="text-[13px] text-white/60">
                  When someone sends a message to your WhatsApp number, your AI agent will automatically read and reply to them.
                  The agent uses your personality settings, skills, and custom instructions to respond.
                </p>
              </div>

              <p className="text-[13px] font-medium text-white/80">Try it now</p>
              <div className="space-y-2">
                {[
                  ['1', 'Open WhatsApp on another phone or ask a friend to message your number.'],
                  ['2', 'Send any message — for example: "Hey, what can you help me with?"'],
                  ['3', 'Your AI agent will reply within a few seconds automatically.'],
                ].map(([num, text]) => (
                  <div key={num} className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.03] border border-white/[0.04]">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-500/20 text-green-400 text-[12px] font-bold shrink-0">{num}</span>
                    <p className="text-[13px] text-white/60">{text}</p>
                  </div>
                ))}
              </div>

              <p className="text-[13px] font-medium text-white/80">Customize your agent</p>
              <div className="space-y-2">
                {[
                  ['Personality', 'Set your agent\'s name, tone, and custom instructions so it responds the way you want.'],
                  ['Skills', 'Enable or disable what your agent can do — web search, image generation, scheduling, and more.'],
                  ['Disconnect', 'Click Disconnect on the WhatsApp card anytime. Then open WhatsApp on your phone → Settings → Linked Devices → tap the device → Unlink.'],
                ].map(([title, text]) => (
                  <div key={title} className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.03] border border-white/[0.04]">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/[0.08] text-white/60 text-[11px] font-bold shrink-0">{(title as string)[0]}</span>
                    <div>
                      <p className="text-[13px] font-medium text-white/70">{title}</p>
                      <p className="text-[12px] text-white/40 mt-0.5">{text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {whatsAppError && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-[13px] text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <p>{whatsAppError}</p>
            </div>
          )}

          <div className="flex justify-end gap-2">
            {!whatsAppPaired && !whatsAppLoading && (
              <Button variant="primary" size="md" onClick={startWhatsAppPairing}>
                <RefreshCw className="h-3.5 w-3.5" />
                {whatsAppQr ? 'Refresh QR Code' : 'Retry'}
              </Button>
            )}
            {whatsAppDashboardUrl && !whatsAppPaired && (
              <a href={whatsAppDashboardUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="glass" size="md">
                  <QrCode className="h-3.5 w-3.5" />
                  Agent Dashboard
                </Button>
              </a>
            )}
            <Button variant="glass" size="md" onClick={closeWhatsAppModal}>
              {whatsAppPaired ? 'Done' : 'Close'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
