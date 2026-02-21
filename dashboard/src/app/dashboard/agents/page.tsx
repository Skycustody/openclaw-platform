'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardTitle, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import api from '@/lib/api';
import { cn, timeAgo } from '@/lib/utils';
import {
  Bot, Plus, Loader2, Play, Square, Trash2, Edit3,
  HardDrive, Cpu, ArrowRight, Check, ChevronRight,
  Sparkles, AlertTriangle, Zap, Crown, Moon, Info,
} from 'lucide-react';
import { useStore } from '@/lib/store';

interface Agent {
  id: string;
  name: string;
  purpose: string | null;
  instructions: string | null;
  status: string;
  ram_mb: number;
  is_primary: boolean;
  created_at: string;
  last_active: string;
  subdomain: string | null;
}

interface AgentLimits {
  maxAgents: number;
  currentCount: number;
  canCreate: boolean;
  totalRamMb: number;
  usedRamMb: number;
  freeRamMb: number;
  borrowableRamMb: number;
  agentRamMb: number;
}

interface AgentsResponse {
  agents: Agent[];
  limits: AgentLimits;
  plan: string;
}

const statusConfig: Record<string, { label: string; color: string; dotColor: string }> = {
  active:       { label: 'Running',      color: 'text-green-400',  dotColor: 'bg-green-400' },
  sleeping:     { label: 'Sleeping',     color: 'text-blue-400',   dotColor: 'bg-blue-400' },
  provisioning: { label: 'Setting up',   color: 'text-amber-400',  dotColor: 'bg-amber-400' },
  paused:       { label: 'Paused',       color: 'text-red-400',    dotColor: 'bg-red-400' },
  stopped:      { label: 'Stopped',      color: 'text-white/30',   dotColor: 'bg-white/30' },
  pending:      { label: 'Not started',  color: 'text-white/30',   dotColor: 'bg-white/20' },
};

const ONBOARDING_STEPS = [
  {
    title: 'What should this agent be called?',
    subtitle: 'Give it a name that describes its role.',
    field: 'name',
  },
  {
    title: 'What will this agent do?',
    subtitle: 'Describe its main purpose in a sentence or two.',
    field: 'purpose',
  },
  {
    title: 'Any special instructions?',
    subtitle: 'Optional — personality, rules, context, or constraints.',
    field: 'instructions',
  },
];

export default function AgentsPage() {
  const [data, setData] = useState<AgentsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const { user } = useStore();

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [createStep, setCreateStep] = useState(0);
  const [newAgent, setNewAgent] = useState({ name: '', purpose: '', instructions: '' });
  const [creating, setCreating] = useState(false);

  // Edit modal
  const [editAgent, setEditAgent] = useState<Agent | null>(null);
  const [editForm, setEditForm] = useState({ name: '', purpose: '', instructions: '' });
  const [saving, setSaving] = useState(false);

  // Delete confirm
  const [deleteAgent, setDeleteAgent] = useState<Agent | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchAgents = useCallback(async () => {
    try {
      const res = await api.get<AgentsResponse>('/agents');
      setData(res);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const handleCreate = async () => {
    if (!newAgent.name.trim()) return;
    setCreating(true);
    try {
      await api.post('/agents', newAgent);
      setShowCreate(false);
      setCreateStep(0);
      setNewAgent({ name: '', purpose: '', instructions: '' });
      await fetchAgents();
    } catch {} finally { setCreating(false); }
  };

  const handleStartStop = async (agent: Agent) => {
    setActionLoading(agent.id);
    try {
      if (agent.status === 'active') {
        await api.post(`/agents/${agent.id}/stop`);
      } else {
        await api.post(`/agents/${agent.id}/start`);
      }
      await fetchAgents();
    } catch {} finally { setActionLoading(null); }
  };

  const handleEdit = (agent: Agent) => {
    setEditAgent(agent);
    setEditForm({
      name: agent.name,
      purpose: agent.purpose || '',
      instructions: agent.instructions || '',
    });
  };

  const handleSaveEdit = async () => {
    if (!editAgent) return;
    setSaving(true);
    try {
      await api.put(`/agents/${editAgent.id}`, editForm);
      setEditAgent(null);
      await fetchAgents();
    } catch {} finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteAgent) return;
    setDeleting(true);
    try {
      await api.delete(`/agents/${deleteAgent.id}`);
      setDeleteAgent(null);
      await fetchAgents();
    } catch {} finally { setDeleting(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
      </div>
    );
  }

  const { agents = [], limits, plan = 'starter' } = data || { limits: {
    maxAgents: 1, currentCount: 0, canCreate: true, totalRamMb: 2048,
    usedRamMb: 0, freeRamMb: 2048, borrowableRamMb: 0, agentRamMb: 2048,
  }};

  const ramPercentUsed = limits.totalRamMb > 0 ? (limits.usedRamMb / limits.totalRamMb) * 100 : 0;
  const canAddAgent = limits.canCreate && plan !== 'starter';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between animate-fade-up">
        <div>
          <h1 className="text-[26px] font-bold text-white tracking-tight">Agents</h1>
          <p className="text-[14px] text-white/40 mt-0.5">
            {plan === 'starter'
              ? 'Upgrade to Pro to run multiple agents'
              : `Manage your AI agents — ${limits.currentCount} of ${limits.maxAgents} used`
            }
          </p>
        </div>
        {plan !== 'starter' && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => canAddAgent ? setShowCreate(true) : null}
            disabled={!canAddAgent}
          >
            <Plus className="h-3.5 w-3.5" />
            New Agent
          </Button>
        )}
      </div>

      {/* Starter Plan Upgrade Banner */}
      {plan === 'starter' && (
        <Card className="!p-5 animate-fade-up">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10">
              <Crown className="h-6 w-6 text-amber-400" />
            </div>
            <div className="flex-1">
              <p className="text-[15px] font-semibold text-white">Unlock Multiple Agents</p>
              <p className="text-[13px] text-white/40 mt-0.5">
                Pro plan lets you run 2 agents (2GB each). Business plan gives you 4 agents with shared RAM pooling.
              </p>
            </div>
            <Button variant="primary" size="sm" onClick={() => window.location.href = '/dashboard/billing'}>
              Upgrade <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </Card>
      )}

      {/* Resource Overview */}
      {plan !== 'starter' && (
        <div className="grid grid-cols-3 gap-3 animate-fade-up">
          {/* RAM Usage */}
          <Card className="!p-4">
            <div className="flex items-center gap-2 mb-3">
              <HardDrive className="h-4 w-4 text-white/20" />
              <span className="text-[12px] text-white/30">Memory Pool</span>
            </div>
            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <span className="text-[20px] font-bold text-white tabular-nums">
                  {(limits.usedRamMb / 1024).toFixed(1)}
                </span>
                <span className="text-[12px] text-white/30">
                  / {(limits.totalRamMb / 1024).toFixed(1)} GB
                </span>
              </div>
              <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    ramPercentUsed > 85 ? 'bg-red-400' : ramPercentUsed > 60 ? 'bg-amber-400' : 'bg-green-400'
                  }`}
                  style={{ width: `${Math.min(100, ramPercentUsed)}%` }}
                />
              </div>
            </div>
          </Card>

          {/* Agent Slots */}
          <Card className="!p-4">
            <div className="flex items-center gap-2 mb-3">
              <Bot className="h-4 w-4 text-white/20" />
              <span className="text-[12px] text-white/30">Agent Slots</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-[20px] font-bold text-white tabular-nums">{limits.currentCount}</span>
              <span className="text-[14px] text-white/30">/ {limits.maxAgents}</span>
            </div>
            <div className="flex gap-1.5 mt-2">
              {Array.from({ length: limits.maxAgents }).map((_, i) => (
                <div key={i} className={`h-2 flex-1 rounded-full ${
                  i < limits.currentCount ? 'bg-white/30' : 'bg-white/5'
                }`} />
              ))}
            </div>
          </Card>

          {/* Borrowable RAM */}
          <Card className="!p-4">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="h-4 w-4 text-white/20" />
              <span className="text-[12px] text-white/30">Borrowable RAM</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-[20px] font-bold text-white tabular-nums">
                {limits.borrowableRamMb > 0 ? `${(limits.borrowableRamMb / 1024).toFixed(1)}` : '0'}
              </span>
              <span className="text-[14px] text-white/30">GB</span>
            </div>
            <div className="flex items-center gap-1 mt-1">
              <Info className="h-3 w-3 text-white/15" />
              <span className="text-[10px] text-white/20">From idle agents</span>
            </div>
          </Card>
        </div>
      )}

      {/* Agent Cards */}
      <div className="space-y-3 animate-fade-up">
        {agents.length === 0 && plan !== 'starter' && (
          <Card className="flex flex-col items-center justify-center py-16 text-center">
            <Bot className="h-12 w-12 text-white/10 mb-4" />
            <p className="text-[16px] font-medium text-white/50">No agents yet</p>
            <p className="text-[13px] text-white/25 mt-1 max-w-sm">
              Your primary agent will appear here. Create additional agents for different tasks.
            </p>
            <Button variant="primary" size="sm" className="mt-5" onClick={() => setShowCreate(true)}>
              <Plus className="h-3.5 w-3.5" /> Create Agent
            </Button>
          </Card>
        )}

        {agents.map(agent => {
          const sc = statusConfig[agent.status] || statusConfig.pending;
          const ramPercent = limits.totalRamMb > 0 ? (agent.ram_mb / limits.totalRamMb) * 100 : 0;

          return (
            <Card key={agent.id} className="!p-5">
              <div className="flex items-start gap-4">
                {/* Agent icon */}
                <div className="relative">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.08] ${
                    agent.status === 'active' ? 'bg-green-500/10' :
                    agent.status === 'sleeping' ? 'bg-blue-500/10' : 'bg-white/5'
                  }`}>
                    <Bot className="h-6 w-6 text-white/50" />
                  </div>
                  {agent.status === 'active' && (
                    <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-green-400 ring-2 ring-black animate-pulse" />
                  )}
                </div>

                {/* Agent info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-[15px] font-semibold text-white truncate">{agent.name}</h3>
                    {agent.is_primary && <Badge variant="amber" className="!text-[10px]">Primary</Badge>}
                    <div className="flex items-center gap-1.5">
                      <span className={`h-1.5 w-1.5 rounded-full ${sc.dotColor}`} />
                      <span className={`text-[12px] ${sc.color}`}>{sc.label}</span>
                    </div>
                  </div>

                  {agent.purpose && (
                    <p className="text-[13px] text-white/40 mt-1 line-clamp-1">{agent.purpose}</p>
                  )}

                  {/* RAM bar */}
                  <div className="flex items-center gap-3 mt-3">
                    <div className="flex items-center gap-1.5">
                      <HardDrive className="h-3 w-3 text-white/15" />
                      <span className="text-[11px] text-white/25">{(agent.ram_mb / 1024).toFixed(1)} GB</span>
                    </div>
                    <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden max-w-[120px]">
                      <div className="h-full bg-white/20 rounded-full" style={{ width: `${ramPercent}%` }} />
                    </div>
                    {agent.status === 'sleeping' && (
                      <div className="flex items-center gap-1">
                        <Moon className="h-3 w-3 text-blue-400/50" />
                        <span className="text-[10px] text-blue-400/50">RAM shareable</span>
                      </div>
                    )}
                    {agent.last_active && (
                      <span className="text-[11px] text-white/15">Active {timeAgo(agent.last_active)}</span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5">
                  <button onClick={() => handleStartStop(agent)} disabled={actionLoading === agent.id}
                    className={`p-2 rounded-lg transition-colors disabled:opacity-30 ${
                      agent.status === 'active'
                        ? 'text-white/30 hover:text-amber-400 hover:bg-amber-400/5'
                        : 'text-white/30 hover:text-green-400 hover:bg-green-400/5'
                    }`}
                    title={agent.status === 'active' ? 'Sleep' : 'Start'}>
                    {actionLoading === agent.id
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : agent.status === 'active'
                        ? <Square className="h-4 w-4" />
                        : <Play className="h-4 w-4" />
                    }
                  </button>

                  <button onClick={() => handleEdit(agent)}
                    className="p-2 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-colors"
                    title="Edit">
                    <Edit3 className="h-4 w-4" />
                  </button>

                  {!agent.is_primary && (
                    <button onClick={() => setDeleteAgent(agent)}
                      className="p-2 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-400/5 transition-colors"
                      title="Delete">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Create Agent Modal (with Onboarding) */}
      <Modal open={showCreate} onClose={() => { setShowCreate(false); setCreateStep(0); setNewAgent({ name: '', purpose: '', instructions: '' }); }}
        title={`New Agent — Step ${createStep + 1} of ${ONBOARDING_STEPS.length}`}
        className="max-w-md">
        <div className="space-y-5">
          {/* Progress */}
          <div className="h-1 bg-white/5 rounded-full overflow-hidden">
            <div className="h-full bg-white/30 rounded-full transition-all duration-500"
              style={{ width: `${((createStep + 1) / ONBOARDING_STEPS.length) * 100}%` }} />
          </div>

          <div>
            <h3 className="text-[16px] font-semibold text-white">{ONBOARDING_STEPS[createStep].title}</h3>
            <p className="text-[13px] text-white/40 mt-1">{ONBOARDING_STEPS[createStep].subtitle}</p>
          </div>

          {createStep === 0 && (
            <input
              type="text"
              value={newAgent.name}
              onChange={e => setNewAgent(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g. Sales Assistant, Research Bot, Support Agent"
              autoFocus
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-[14px] text-white placeholder:text-white/20 focus:border-white/25 focus:outline-none"
            />
          )}

          {createStep === 1 && (
            <textarea
              value={newAgent.purpose}
              onChange={e => setNewAgent(prev => ({ ...prev, purpose: e.target.value }))}
              placeholder="e.g. Handle customer inquiries on Telegram, do market research, manage social media..."
              rows={4}
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-[14px] text-white placeholder:text-white/20 focus:border-white/25 focus:outline-none resize-none"
            />
          )}

          {createStep === 2 && (
            <textarea
              value={newAgent.instructions}
              onChange={e => setNewAgent(prev => ({ ...prev, instructions: e.target.value }))}
              placeholder="e.g. Be professional, always confirm before taking actions, respond in English only..."
              rows={4}
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-[14px] text-white placeholder:text-white/20 focus:border-white/25 focus:outline-none resize-none"
            />
          )}

          {/* RAM allocation info */}
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3">
            <div className="flex items-center gap-2 text-[12px] text-white/30">
              <HardDrive className="h-3.5 w-3.5" />
              <span>This agent will use <strong className="text-white/50">2 GB</strong> of your memory pool</span>
            </div>
            {limits.freeRamMb < 2048 && (
              <p className="text-[11px] text-amber-400/70 mt-1.5 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Low memory — idle agents will share RAM automatically
              </p>
            )}
          </div>

          {/* Nav */}
          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => setCreateStep(Math.max(0, createStep - 1))}
              className={`text-[13px] text-white/30 hover:text-white/50 transition-colors ${createStep === 0 ? 'invisible' : ''}`}>
              Back
            </button>

            {createStep < ONBOARDING_STEPS.length - 1 ? (
              <Button variant="primary" size="sm"
                onClick={() => setCreateStep(createStep + 1)}
                disabled={createStep === 0 && !newAgent.name.trim()}>
                Continue <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button variant="primary" size="sm" onClick={handleCreate} loading={creating}
                disabled={!newAgent.name.trim() || creating}>
                <Sparkles className="h-3.5 w-3.5" /> Create Agent
              </Button>
            )}
          </div>
        </div>
      </Modal>

      {/* Edit Agent Modal */}
      <Modal open={!!editAgent} onClose={() => setEditAgent(null)} title="Edit Agent" className="max-w-md">
        <div className="space-y-4">
          <div>
            <label className="text-[12px] text-white/30 block mb-1.5">Name</label>
            <input
              type="text"
              value={editForm.name}
              onChange={e => setEditForm(prev => ({ ...prev, name: e.target.value }))}
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[14px] text-white placeholder:text-white/20 focus:border-white/25 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-[12px] text-white/30 block mb-1.5">Purpose</label>
            <textarea
              value={editForm.purpose}
              onChange={e => setEditForm(prev => ({ ...prev, purpose: e.target.value }))}
              rows={3}
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[14px] text-white placeholder:text-white/20 focus:border-white/25 focus:outline-none resize-none"
            />
          </div>
          <div>
            <label className="text-[12px] text-white/30 block mb-1.5">Instructions</label>
            <textarea
              value={editForm.instructions}
              onChange={e => setEditForm(prev => ({ ...prev, instructions: e.target.value }))}
              rows={3}
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[14px] text-white placeholder:text-white/20 focus:border-white/25 focus:outline-none resize-none"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="glass" size="sm" onClick={() => setEditAgent(null)}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={handleSaveEdit} loading={saving}>Save</Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal open={!!deleteAgent} onClose={() => setDeleteAgent(null)} title="Delete Agent" className="max-w-sm">
        <div className="space-y-4">
          <p className="text-[14px] text-white/50">
            Are you sure you want to delete <strong className="text-white/80">{deleteAgent?.name}</strong>?
            This will free up {((deleteAgent?.ram_mb || 0) / 1024).toFixed(1)} GB of memory.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="glass" size="sm" onClick={() => setDeleteAgent(null)}>Cancel</Button>
            <Button variant="danger" size="sm" onClick={handleDelete} loading={deleting}>Delete</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
