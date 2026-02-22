'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import api from '@/lib/api';
import { timeAgo } from '@/lib/utils';
import {
  Bot, Plus, Loader2, Trash2, Edit3,
  HardDrive, ArrowRight, ChevronRight,
  Sparkles, AlertTriangle, Crown, Info, X,
} from 'lucide-react';
import { useStore } from '@/lib/store';

interface Agent {
  id: string;
  name: string;
  purpose: string | null;
  instructions: string | null;
  openclawAgentId: string;
  status: string;
  ram_mb: number;
  is_primary: boolean;
  created_at: string;
  last_active: string;
}

interface AgentLimits {
  maxAgents: number;
  currentCount: number;
  canCreate: boolean;
  totalRamMb: number;
  sharedRam: boolean;
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
  pending:      { label: 'Not started',  color: 'text-white/30',   dotColor: 'bg-white/20' },
};

const ONBOARDING_STEPS = [
  {
    title: 'What should this agent be called?',
    subtitle: 'This becomes the agent identity inside your OpenClaw instance.',
    field: 'name',
  },
  {
    title: 'What will this agent do?',
    subtitle: 'Written to the agent\'s SOUL.md file as its personality and purpose.',
    field: 'purpose',
  },
  {
    title: 'Any special instructions?',
    subtitle: 'Optional rules or context. Also goes into SOUL.md inside the container.',
    field: 'instructions',
  },
];

export default function AgentsPage() {
  const [data, setData] = useState<AgentsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const { user } = useStore();

  const [showCreate, setShowCreate] = useState(false);
  const [createStep, setCreateStep] = useState(0);
  const [newAgent, setNewAgent] = useState({ name: '', purpose: '', instructions: '' });
  const [creating, setCreating] = useState(false);

  const [editAgent, setEditAgent] = useState<Agent | null>(null);
  const [editForm, setEditForm] = useState({ name: '', purpose: '', instructions: '' });
  const [saving, setSaving] = useState(false);

  const [deleteAgent, setDeleteAgent] = useState<Agent | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchAgents = useCallback(async () => {
    try {
      const res = await api.get<AgentsResponse>('/agents');
      setData(res);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAgents(); }, [fetchAgents]);

  const handleCreate = async () => {
    if (!newAgent.name.trim()) return;
    setCreating(true);
    setActionError(null);
    try {
      await api.post('/agents', newAgent);
      setShowCreate(false);
      setCreateStep(0);
      setNewAgent({ name: '', purpose: '', instructions: '' });
      await fetchAgents();
    } catch (err: any) {
      setActionError(err.message || 'Failed to create agent');
    } finally { setCreating(false); }
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
    } catch (err: any) {
      setActionError(err.message || 'Failed to update agent');
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteAgent) return;
    setDeleting(true);
    try {
      await api.delete(`/agents/${deleteAgent.id}`);
      setDeleteAgent(null);
      await fetchAgents();
    } catch (err: any) {
      setActionError(err.message || 'Failed to delete agent');
    } finally { setDeleting(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
      </div>
    );
  }

  const { agents = [], limits, plan = 'starter' } = data || {
    limits: { maxAgents: 1, currentCount: 0, canCreate: true, totalRamMb: 2048, sharedRam: true },
  };

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
              : `Multiple agents inside one OpenClaw instance — ${limits.currentCount} of ${limits.maxAgents} used`
            }
          </p>
        </div>
        {plan !== 'starter' && (
          <Button variant="primary" size="sm"
            onClick={() => canAddAgent ? setShowCreate(true) : null}
            disabled={!canAddAgent}>
            <Plus className="h-3.5 w-3.5" /> New Agent
          </Button>
        )}
      </div>

      {/* Error banner */}
      {actionError && (
        <div className="border border-red-500/20 bg-red-500/5 rounded-xl px-4 py-3 flex items-center gap-3 animate-fade-up">
          <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
          <p className="text-[13px] text-red-400 flex-1">{actionError}</p>
          <button onClick={() => setActionError(null)} className="text-white/20 hover:text-white/40">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Starter Upgrade Banner */}
      {plan === 'starter' && (
        <Card className="!p-5 animate-fade-up">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10">
              <Crown className="h-6 w-6 text-amber-400" />
            </div>
            <div className="flex-1">
              <p className="text-[15px] font-semibold text-white">Unlock Multiple Agents</p>
              <p className="text-[13px] text-white/40 mt-0.5">
                Pro plan: 2 agents sharing 4GB. Business: 4 agents sharing 8GB. All run inside one OpenClaw container — idle agents free RAM automatically.
              </p>
            </div>
            <Button variant="primary" size="sm" onClick={() => window.location.href = '/dashboard/billing'}>
              Upgrade <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </Card>
      )}

      {/* Shared RAM Info */}
      {plan !== 'starter' && (
        <Card className="!p-4 animate-fade-up">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.04]">
              <HardDrive className="h-5 w-5 text-white/20" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-medium text-white">
                  {(limits.totalRamMb / 1024).toFixed(0)} GB shared RAM
                </span>
                <Badge variant="green" className="!text-[10px]">Pooled</Badge>
              </div>
              <p className="text-[12px] text-white/30 mt-0.5">
                All {limits.currentCount} agent{limits.currentCount !== 1 ? 's' : ''} share one container. Idle agents free RAM automatically.
              </p>
            </div>
            <div className="flex gap-1.5">
              {Array.from({ length: limits.maxAgents }).map((_, i) => (
                <div key={i} className={`h-6 w-6 rounded-lg flex items-center justify-center ${
                  i < limits.currentCount ? 'bg-white/10' : 'bg-white/[0.03] border border-dashed border-white/[0.08]'
                }`}>
                  {i < limits.currentCount && <Bot className="h-3 w-3 text-white/40" />}
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Agent Cards */}
      <div className="space-y-3 animate-fade-up">
        {agents.length === 0 && plan !== 'starter' && (
          <Card className="flex flex-col items-center justify-center py-16 text-center">
            <Bot className="h-12 w-12 text-white/10 mb-4" />
            <p className="text-[16px] font-medium text-white/50">No agents yet</p>
            <p className="text-[13px] text-white/25 mt-1 max-w-sm">
              Your primary agent appears once provisioned. Create additional agents — each gets its own workspace and personality inside your OpenClaw instance.
            </p>
          </Card>
        )}

        {agents.map(agent => {
          const sc = statusConfig[agent.status] || statusConfig.pending;

          return (
            <Card key={agent.id} className="!p-5">
              <div className="flex items-start gap-4">
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

                  <div className="flex items-center gap-3 mt-3">
                    <div className="flex items-center gap-1">
                      <Info className="h-3 w-3 text-white/15" />
                      <span className="text-[11px] text-white/20 font-mono">{agent.openclawAgentId}</span>
                    </div>
                    {agent.last_active && (
                      <span className="text-[11px] text-white/15">Active {timeAgo(agent.last_active)}</span>
                    )}
                  </div>
                </div>

                {/* Actions — only for non-primary agents */}
                {!agent.is_primary && (
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => handleEdit(agent)}
                      className="p-2 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-colors"
                      title="Edit personality">
                      <Edit3 className="h-4 w-4" />
                    </button>
                    <button onClick={() => setDeleteAgent(agent)}
                      className="p-2 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-400/5 transition-colors"
                      title="Delete">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Create Agent Modal */}
      <Modal open={showCreate} onClose={() => { setShowCreate(false); setCreateStep(0); setNewAgent({ name: '', purpose: '', instructions: '' }); }}
        title={`New Agent — Step ${createStep + 1} of ${ONBOARDING_STEPS.length}`}
        className="max-w-md">
        <div className="space-y-5">
          <div className="h-1 bg-white/5 rounded-full overflow-hidden">
            <div className="h-full bg-white/30 rounded-full transition-all duration-500"
              style={{ width: `${((createStep + 1) / ONBOARDING_STEPS.length) * 100}%` }} />
          </div>

          <div>
            <h3 className="text-[16px] font-semibold text-white">{ONBOARDING_STEPS[createStep].title}</h3>
            <p className="text-[13px] text-white/40 mt-1">{ONBOARDING_STEPS[createStep].subtitle}</p>
          </div>

          {createStep === 0 && (
            <input type="text" value={newAgent.name}
              onChange={e => setNewAgent(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g. Sales Assistant, Research Bot, Support Agent"
              autoFocus
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-[14px] text-white placeholder:text-white/20 focus:border-white/25 focus:outline-none"
            />
          )}

          {createStep === 1 && (
            <textarea value={newAgent.purpose}
              onChange={e => setNewAgent(prev => ({ ...prev, purpose: e.target.value }))}
              placeholder="e.g. Handle customer inquiries, do market research, manage social media..."
              rows={4}
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-[14px] text-white placeholder:text-white/20 focus:border-white/25 focus:outline-none resize-none"
            />
          )}

          {createStep === 2 && (
            <textarea value={newAgent.instructions}
              onChange={e => setNewAgent(prev => ({ ...prev, instructions: e.target.value }))}
              placeholder="e.g. Be professional, always confirm before taking actions, respond in English only..."
              rows={4}
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-[14px] text-white placeholder:text-white/20 focus:border-white/25 focus:outline-none resize-none"
            />
          )}

          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3">
            <div className="flex items-center gap-2 text-[12px] text-white/30">
              <Bot className="h-3.5 w-3.5" />
              <span>Creates a new agent inside your <strong className="text-white/50">existing OpenClaw container</strong> — no extra resources needed</span>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <button onClick={() => setCreateStep(Math.max(0, createStep - 1))}
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

      {/* Edit Modal */}
      <Modal open={!!editAgent} onClose={() => setEditAgent(null)} title="Edit Agent" className="max-w-md">
        <div className="space-y-4">
          <div>
            <label className="text-[12px] text-white/30 block mb-1.5">Name</label>
            <input type="text" value={editForm.name}
              onChange={e => setEditForm(prev => ({ ...prev, name: e.target.value }))}
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[14px] text-white focus:border-white/25 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-[12px] text-white/30 block mb-1.5">Purpose</label>
            <textarea value={editForm.purpose}
              onChange={e => setEditForm(prev => ({ ...prev, purpose: e.target.value }))}
              rows={3}
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[14px] text-white focus:border-white/25 focus:outline-none resize-none"
            />
          </div>
          <div>
            <label className="text-[12px] text-white/30 block mb-1.5">Instructions</label>
            <textarea value={editForm.instructions}
              onChange={e => setEditForm(prev => ({ ...prev, instructions: e.target.value }))}
              rows={3}
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[14px] text-white focus:border-white/25 focus:outline-none resize-none"
            />
          </div>
          <p className="text-[11px] text-white/20">
            Updates the agent&apos;s SOUL.md and identity in your OpenClaw container.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="glass" size="sm" onClick={() => setEditAgent(null)}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={handleSaveEdit} loading={saving}>Save</Button>
          </div>
        </div>
      </Modal>

      {/* Delete Modal */}
      <Modal open={!!deleteAgent} onClose={() => setDeleteAgent(null)} title="Delete Agent" className="max-w-sm">
        <div className="space-y-4">
          <p className="text-[14px] text-white/50">
            Delete <strong className="text-white/80">{deleteAgent?.name}</strong>? This removes it from your OpenClaw container&apos;s agents list and deletes its workspace.
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
