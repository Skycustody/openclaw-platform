'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Toggle } from '@/components/ui/Toggle';
import api from '@/lib/api';
import {
  Bot, ArrowLeft, Loader2, Save, Trash2, MessageSquare,
  Plus, Link2Off, AlertTriangle, X, Send,
  Radio, ChevronDown,
} from 'lucide-react';

interface Agent {
  id: string;
  name: string;
  purpose: string | null;
  instructions: string | null;
  openclawAgentId: string;
  status: string;
  is_primary: boolean;
}

interface AgentChannel {
  id: string;
  channel_type: string;
  connected: boolean;
  label: string | null;
  hasToken: boolean;
  config: Record<string, any>;
}

interface OtherAgent {
  id: string;
  name: string;
  is_primary: boolean;
}

interface AgentDetail {
  agent: Agent;
  channels: AgentChannel[];
  communications: {
    canTalkTo: string[];
    canBeReachedBy: string[];
  };
  otherAgents: OtherAgent[];
}

const CHANNEL_INFO: Record<string, { name: string; color: string; icon: string; tokenLabel: string; tokenPlaceholder: string }> = {
  telegram: {
    name: 'Telegram',
    color: 'text-blue-400 border-blue-500/20 bg-blue-500/5',
    icon: '✈',
    tokenLabel: 'Bot Token',
    tokenPlaceholder: '123456:ABC-DEF...',
  },
  discord: {
    name: 'Discord',
    color: 'text-indigo-400 border-indigo-500/20 bg-indigo-500/5',
    icon: '🎮',
    tokenLabel: 'Bot Token',
    tokenPlaceholder: 'MTA5...',
  },
  slack: {
    name: 'Slack',
    color: 'text-purple-400 border-purple-500/20 bg-purple-500/5',
    icon: '💬',
    tokenLabel: 'Access Token',
    tokenPlaceholder: 'xoxb-...',
  },
  whatsapp: {
    name: 'WhatsApp',
    color: 'text-green-400 border-green-500/20 bg-green-500/5',
    icon: '📱',
    tokenLabel: 'Phone Number',
    tokenPlaceholder: 'Paired via QR code',
  },
  signal: {
    name: 'Signal',
    color: 'text-sky-400 border-sky-500/20 bg-sky-500/5',
    icon: '🔒',
    tokenLabel: 'Phone Number',
    tokenPlaceholder: '+1234567890',
  },
};

export default function AgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = params.agentId as string;

  const [data, setData] = useState<AgentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Personality form
  const [form, setForm] = useState({ name: '', purpose: '', instructions: '' });
  const [dirty, setDirty] = useState(false);

  // Channel modal
  const [showAddChannel, setShowAddChannel] = useState(false);
  const [newChannel, setNewChannel] = useState({ type: 'telegram', token: '', label: '', guildId: '', teamId: '' });
  const [addingChannel, setAddingChannel] = useState(false);

  // Communication
  const [commTargets, setCommTargets] = useState<string[]>([]);
  const [commDirty, setCommDirty] = useState(false);
  const [savingComm, setSavingComm] = useState(false);

  // Delete channel
  const [deletingChannelId, setDeletingChannelId] = useState<string | null>(null);

  const fetchAgent = useCallback(async () => {
    try {
      const res = await api.get<AgentDetail>(`/agents/${agentId}`);
      setData(res);
      setForm({
        name: res.agent.name,
        purpose: res.agent.purpose || '',
        instructions: res.agent.instructions || '',
      });
      setCommTargets(res.communications.canTalkTo);
      setDirty(false);
      setCommDirty(false);
    } catch (err: any) {
      setError(err.message || 'Failed to load agent');
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => { fetchAgent(); }, [fetchAgent]);

  const handleSavePersonality = async () => {
    setSaving(true);
    setActionError(null);
    try {
      await api.put(`/agents/${agentId}`, form);
      setDirty(false);
      await fetchAgent();
    } catch (err: any) {
      setActionError(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleAddChannel = async () => {
    setAddingChannel(true);
    setActionError(null);
    try {
      const body: any = {
        channelType: newChannel.type,
        token: newChannel.token || undefined,
        label: newChannel.label || undefined,
        config: {},
      };
      if (newChannel.type === 'discord' && newChannel.guildId) {
        body.config.guildId = newChannel.guildId;
      }
      if (newChannel.type === 'slack' && newChannel.teamId) {
        body.config.teamId = newChannel.teamId;
      }
      await api.post(`/agents/${agentId}/channels`, body);
      setShowAddChannel(false);
      setNewChannel({ type: 'telegram', token: '', label: '', guildId: '', teamId: '' });
      await fetchAgent();
    } catch (err: any) {
      setActionError(err.message || 'Failed to connect channel');
    } finally {
      setAddingChannel(false);
    }
  };

  const handleDeleteChannel = async (channelId: string) => {
    setDeletingChannelId(channelId);
    try {
      await api.delete(`/agents/${agentId}/channels/${channelId}`);
      await fetchAgent();
    } catch (err: any) {
      setActionError(err.message || 'Failed to disconnect');
    } finally {
      setDeletingChannelId(null);
    }
  };

  const handleSaveComm = async () => {
    setSavingComm(true);
    setActionError(null);
    try {
      await api.put(`/agents/${agentId}/communications`, { canTalkTo: commTargets });
      setCommDirty(false);
      await fetchAgent();
    } catch (err: any) {
      setActionError(err.message || 'Failed to save communication settings');
    } finally {
      setSavingComm(false);
    }
  };

  const toggleComm = (targetId: string) => {
    setCommTargets(prev => {
      const next = prev.includes(targetId)
        ? prev.filter(id => id !== targetId)
        : [...prev, targetId];
      setCommDirty(true);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertTriangle className="h-8 w-8 text-red-400" />
        <p className="text-white/50">{error || 'Agent not found'}</p>
        <Button variant="glass" size="sm" onClick={() => router.push('/dashboard/agents')}>
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Agents
        </Button>
      </div>
    );
  }

  const { agent, channels, otherAgents } = data;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-4 animate-fade-up">
        <button onClick={() => router.push('/dashboard/agents')}
          className="p-2 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-[26px] font-bold text-white tracking-tight">{agent.name}</h1>
            {agent.is_primary && <Badge variant="amber" className="!text-[10px]">Primary</Badge>}
            <Badge variant={agent.status === 'active' ? 'green' : 'blue'} dot className="!text-[10px]">
              {agent.status}
            </Badge>
          </div>
          <p className="text-[13px] text-white/30 mt-0.5 font-mono">{agent.openclawAgentId}</p>
        </div>
        <Button variant="glass" size="sm" onClick={() => router.push(`/dashboard?agent=${agent.id}`)}>
          <MessageSquare className="h-3.5 w-3.5" /> Chat
        </Button>
      </div>

      {/* Error */}
      {actionError && (
        <div className="border border-red-500/20 bg-red-500/5 rounded-xl px-4 py-3 flex items-center gap-3 animate-fade-up">
          <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
          <p className="text-[13px] text-red-400 flex-1">{actionError}</p>
          <button onClick={() => setActionError(null)} className="text-white/20 hover:text-white/40">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ─── Personality ─── */}
      <Card className="!p-5 animate-fade-up">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.04]">
            <Bot className="h-5 w-5 text-white/30" />
          </div>
          <div>
            <h2 className="text-[16px] font-semibold text-white">Identity & Personality</h2>
            <p className="text-[12px] text-white/30">Stored in the agent&apos;s SOUL.md file</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-[12px] text-white/30 block mb-1.5">Name</label>
            <input type="text" value={form.name}
              onChange={e => { setForm(prev => ({ ...prev, name: e.target.value })); setDirty(true); }}
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[14px] text-white focus:border-white/25 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-[12px] text-white/30 block mb-1.5">Purpose</label>
            <textarea value={form.purpose}
              onChange={e => { setForm(prev => ({ ...prev, purpose: e.target.value })); setDirty(true); }}
              rows={3}
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[14px] text-white focus:border-white/25 focus:outline-none resize-none"
            />
          </div>
          <div>
            <label className="text-[12px] text-white/30 block mb-1.5">Instructions</label>
            <textarea value={form.instructions}
              onChange={e => { setForm(prev => ({ ...prev, instructions: e.target.value })); setDirty(true); }}
              rows={4}
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[14px] text-white focus:border-white/25 focus:outline-none resize-none"
            />
          </div>
          {dirty && (
            <div className="flex justify-end">
              <Button variant="primary" size="sm" onClick={handleSavePersonality} loading={saving}>
                <Save className="h-3.5 w-3.5" /> Save Personality
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* ─── Connected Channels ─── */}
      <Card className="!p-5 animate-fade-up">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.04]">
              <Radio className="h-5 w-5 text-white/30" />
            </div>
            <div>
              <h2 className="text-[16px] font-semibold text-white">Connected Channels</h2>
              <p className="text-[12px] text-white/30">
                Messages on these channels go to this agent
              </p>
            </div>
          </div>
          <Button variant="glass" size="sm" onClick={() => setShowAddChannel(true)}>
            <Plus className="h-3.5 w-3.5" /> Add Channel
          </Button>
        </div>

        {channels.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-white/[0.06] rounded-xl">
            <Radio className="h-8 w-8 text-white/10 mx-auto mb-3" />
            <p className="text-[14px] text-white/30">No channels connected</p>
            <p className="text-[12px] text-white/20 mt-1">
              Connect a Telegram bot, Discord bot, WhatsApp number, or other channel
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {channels.map(ch => {
              const info = CHANNEL_INFO[ch.channel_type] || CHANNEL_INFO.telegram;
              return (
                <div key={ch.id}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${info.color} transition-colors`}>
                  <span className="text-lg">{info.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-medium text-white">{info.name}</span>
                      {ch.connected && <span className="h-1.5 w-1.5 rounded-full bg-green-400" />}
                    </div>
                    {ch.label && (
                      <span className="text-[12px] text-white/30 truncate block">{ch.label}</span>
                    )}
                  </div>
                  <button
                    onClick={() => handleDeleteChannel(ch.id)}
                    disabled={deletingChannelId === ch.id}
                    className="p-1.5 rounded-lg text-white/20 hover:text-red-400 hover:bg-red-400/5 transition-colors disabled:opacity-50">
                    {deletingChannelId === ch.id
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Link2Off className="h-4 w-4" />
                    }
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* ─── Agent Communication ─── */}
      {otherAgents.length > 0 && (
        <Card className="!p-5 animate-fade-up">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.04]">
              <Send className="h-5 w-5 text-white/30" />
            </div>
            <div>
              <h2 className="text-[16px] font-semibold text-white">Agent Communication</h2>
              <p className="text-[12px] text-white/30">
                Allow this agent to spawn sub-tasks or send messages to your other agents
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {otherAgents.map(other => (
              <div key={other.id}
                className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                <Toggle
                  enabled={commTargets.includes(other.id)}
                  onChange={() => toggleComm(other.id)}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Bot className="h-4 w-4 text-white/20" />
                    <span className="text-[14px] font-medium text-white">{other.name}</span>
                    {other.is_primary && <Badge variant="amber" className="!text-[10px]">Primary</Badge>}
                  </div>
                  <p className="text-[11px] text-white/20 mt-0.5">
                    {commTargets.includes(other.id)
                      ? `${agent.name} can spawn and message ${other.name}`
                      : `${agent.name} cannot communicate with ${other.name}`
                    }
                  </p>
                </div>
              </div>
            ))}
          </div>

          {commDirty && (
            <div className="flex justify-end mt-4">
              <Button variant="primary" size="sm" onClick={handleSaveComm} loading={savingComm}>
                <Save className="h-3.5 w-3.5" /> Save Permissions
              </Button>
            </div>
          )}

          <div className="mt-4 rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3">
            <p className="text-[11px] text-white/20">
              Communication uses OpenClaw&apos;s native subagent system. When enabled, this agent can use
              <code className="mx-1 text-white/30">sessions_spawn</code> and
              <code className="mx-1 text-white/30">sessions_send</code> to interact with allowed agents.
            </p>
          </div>
        </Card>
      )}

      {/* ─── Add Channel Modal ─── */}
      <Modal open={showAddChannel} onClose={() => setShowAddChannel(false)}
        title="Connect Channel" className="max-w-md">
        <div className="space-y-4">
          <div>
            <label className="text-[12px] text-white/30 block mb-1.5">Channel Type</label>
            <div className="relative">
              <select value={newChannel.type}
                onChange={e => setNewChannel(prev => ({ ...prev, type: e.target.value, token: '', label: '' }))}
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[14px] text-white focus:border-white/25 focus:outline-none appearance-none cursor-pointer">
                {Object.entries(CHANNEL_INFO).map(([key, info]) => (
                  <option key={key} value={key} className="bg-zinc-900 text-white">
                    {info.icon} {info.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20 pointer-events-none" />
            </div>
          </div>

          {newChannel.type !== 'whatsapp' && (
            <div>
              <label className="text-[12px] text-white/30 block mb-1.5">
                {CHANNEL_INFO[newChannel.type]?.tokenLabel || 'Token'}
              </label>
              <input type="password" value={newChannel.token}
                onChange={e => setNewChannel(prev => ({ ...prev, token: e.target.value }))}
                placeholder={CHANNEL_INFO[newChannel.type]?.tokenPlaceholder}
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[14px] text-white placeholder:text-white/15 focus:border-white/25 focus:outline-none font-mono"
              />
            </div>
          )}

          {newChannel.type === 'whatsapp' && (
            <div className="rounded-lg border border-green-500/10 bg-green-500/5 px-4 py-3">
              <p className="text-[13px] text-green-400/80">
                WhatsApp uses QR code pairing. After connecting, go to the Channels page to scan the QR code.
              </p>
            </div>
          )}

          {newChannel.type === 'discord' && (
            <div>
              <label className="text-[12px] text-white/30 block mb-1.5">Guild ID (optional)</label>
              <input type="text" value={newChannel.guildId}
                onChange={e => setNewChannel(prev => ({ ...prev, guildId: e.target.value }))}
                placeholder="123456789012345678"
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[14px] text-white placeholder:text-white/15 focus:border-white/25 focus:outline-none font-mono"
              />
            </div>
          )}

          {newChannel.type === 'slack' && (
            <div>
              <label className="text-[12px] text-white/30 block mb-1.5">Team ID</label>
              <input type="text" value={newChannel.teamId}
                onChange={e => setNewChannel(prev => ({ ...prev, teamId: e.target.value }))}
                placeholder="T01234567"
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[14px] text-white placeholder:text-white/15 focus:border-white/25 focus:outline-none font-mono"
              />
            </div>
          )}

          <div>
            <label className="text-[12px] text-white/30 block mb-1.5">Label (optional)</label>
            <input type="text" value={newChannel.label}
              onChange={e => setNewChannel(prev => ({ ...prev, label: e.target.value }))}
              placeholder={`e.g. "Store Bot", "Support Line"`}
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[14px] text-white placeholder:text-white/15 focus:border-white/25 focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="glass" size="sm" onClick={() => setShowAddChannel(false)}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={handleAddChannel} loading={addingChannel}
              disabled={addingChannel || (newChannel.type !== 'whatsapp' && !newChannel.token.trim())}>
              Connect
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
