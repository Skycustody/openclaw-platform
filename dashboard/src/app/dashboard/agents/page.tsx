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
  MessageSquare, Radio, Send, Settings2,
  Store, Download, Check, Search,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
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
  channelCount: number;
  commCount: number;
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

interface MarketplaceAgent {
  id: string;
  name: string;
  category: string;
  icon: string;
  role: string;
  description: string;
  salary: string;
  skills: string[];
  cron: { name: string; schedule: string }[];
  requiredKeys: string[];
  hasSoul: boolean;
  hasHeartbeat: boolean;
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

const CATEGORY_LABELS: Record<string, string> = {
  all: 'All',
  marketing: 'Marketing',
  business: 'Business',
  finance: 'Finance',
  development: 'Development',
  devops: 'DevOps',
  hr: 'HR',
  creative: 'Creative',
  productivity: 'Productivity',
  freelance: 'Freelance',
  ecommerce: 'E-Commerce',
};

const CATEGORY_STYLE = 'border-white/[0.08] text-white/50';

// Map skill names to recognizable brand icons — one entry per brand
const SKILL_ICONS: Record<string, string> = {
  'web-pilot':              'google',
  'agent-browser-clawdbot': 'chrome',
  'google-search':          'google',
  'x-api':                  'x',
  'x-research':             'x',
  'github':                 'github',
  'gh-issues':              'github',
  'coding-agent':           'github',
  'notion-skill':           'notion',
  'slack':                  'slack',
  'slack-personal':         'slack',
  'discord':                'discord',
  'exa-web-search-free':    'exa',
  'stripe-api':             'stripe',
  'trello':                 'trello',
  'obsidian':               'obsidian',
  'resend-email-sender':    'email',
  'porteden-email':         'email',
  'calendly-api':           'calendly',
  'canvas':                 'canva',
};

const BRAND_LOGOS: Record<string, { src: string; alt: string }> = {
  'google':   { src: 'https://www.google.com/s2/favicons?domain=google.com&sz=32', alt: 'Google' },
  'chrome':   { src: 'https://www.google.com/s2/favicons?domain=chrome.google.com&sz=32', alt: 'Chrome' },
  'x':        { src: 'https://abs.twimg.com/favicons/twitter.3.ico', alt: 'X' },
  'github':   { src: 'https://github.githubassets.com/favicons/favicon-dark.svg', alt: 'GitHub' },
  'notion':   { src: 'https://www.google.com/s2/favicons?domain=notion.so&sz=32', alt: 'Notion' },
  'slack':    { src: 'https://www.google.com/s2/favicons?domain=slack.com&sz=32', alt: 'Slack' },
  'discord':  { src: 'https://www.google.com/s2/favicons?domain=discord.com&sz=32', alt: 'Discord' },
  'exa':      { src: 'https://www.google.com/s2/favicons?domain=exa.ai&sz=32', alt: 'Exa' },
  'stripe':   { src: 'https://www.google.com/s2/favicons?domain=stripe.com&sz=32', alt: 'Stripe' },
  'trello':   { src: 'https://www.google.com/s2/favicons?domain=trello.com&sz=32', alt: 'Trello' },
  'obsidian': { src: 'https://www.google.com/s2/favicons?domain=obsidian.md&sz=32', alt: 'Obsidian' },
  'email':    { src: 'https://www.google.com/s2/favicons?domain=gmail.com&sz=32', alt: 'Email' },
  'calendly': { src: 'https://www.google.com/s2/favicons?domain=calendly.com&sz=32', alt: 'Calendly' },
  'canva':    { src: 'https://www.google.com/s2/favicons?domain=canva.com&sz=32', alt: 'Canva' },
};

function SkillLogos({ skills }: { skills: string[] }) {
  const seen = new Set<string>();
  const logos: { src: string; alt: string }[] = [];
  for (const s of skills) {
    const brand = SKILL_ICONS[s];
    if (brand && !seen.has(brand)) {
      seen.add(brand);
      const logo = BRAND_LOGOS[brand];
      if (logo) logos.push(logo);
    }
    if (logos.length >= 5) break;
  }
  if (logos.length === 0) return null;
  return (
    <div className="flex items-center -space-x-1">
      {logos.map((logo, i) => (
        <img key={i} src={logo.src} alt={logo.alt} title={logo.alt}
          className="h-6 w-6 rounded-full border-2 border-[#2a2a28] bg-white/10 object-contain"
        />
      ))}
    </div>
  );
}

export default function AgentsPage() {
  const [data, setData] = useState<AgentsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const { user } = useStore();
  const router = useRouter();

  const [showCreate, setShowCreate] = useState(false);
  const [createStep, setCreateStep] = useState(0);
  const [newAgent, setNewAgent] = useState({ name: '', purpose: '', instructions: '' });
  const [creating, setCreating] = useState(false);

  const [editAgent, setEditAgent] = useState<Agent | null>(null);
  const [editForm, setEditForm] = useState({ name: '', purpose: '', instructions: '' });
  const [saving, setSaving] = useState(false);

  const [deleteAgent, setDeleteAgent] = useState<Agent | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Marketplace state
  const [marketplace, setMarketplace] = useState<MarketplaceAgent[]>([]);
  const [marketplaceLoading, setMarketplaceLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [previewAgent, setPreviewAgent] = useState<MarketplaceAgent | null>(null);

  const fetchAgents = useCallback(async () => {
    try {
      const res = await api.get<AgentsResponse>('/agents');
      setData(res);
    } catch {} finally { setLoading(false); }
  }, []);

  const fetchMarketplace = useCallback(async () => {
    try {
      const res = await api.get<{ agents: MarketplaceAgent[] }>('/agents/marketplace');
      setMarketplace(res.agents);
    } catch {} finally { setMarketplaceLoading(false); }
  }, []);

  useEffect(() => { fetchAgents(); fetchMarketplace(); }, [fetchAgents, fetchMarketplace]);

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

  const handleInstall = async (catalogAgentId: string) => {
    setInstallingId(catalogAgentId);
    setActionError(null);
    try {
      await api.post('/agents/install-from-marketplace', { agentId: catalogAgentId });
      await fetchAgents();
    } catch (err: any) {
      setActionError(err.message || 'Failed to install agent');
    } finally { setInstallingId(null); }
  };

  const installedOpenclawIds = new Set(
    (data?.agents || []).map(a => a.openclawAgentId)
  );

  // Filter marketplace agents
  const categories = ['all', ...Array.from(new Set(marketplace.map(a => a.category)))];
  const filteredMarketplace = marketplace.filter(agent => {
    const matchesCategory = selectedCategory === 'all' || agent.category === selectedCategory;
    const matchesSearch = !searchQuery ||
      agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.category.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

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
            <Card key={agent.id} className="!p-5 hover:border-white/[0.12] transition-colors cursor-pointer"
              onClick={() => router.push(`/dashboard/agents/${agent.id}`)}>
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

                  <div className="flex items-center gap-3 mt-3 flex-wrap">
                    <div className="flex items-center gap-1">
                      <Info className="h-3 w-3 text-white/15" />
                      <span className="text-[11px] text-white/20 font-mono truncate max-w-[120px] sm:max-w-none">{agent.openclawAgentId}</span>
                    </div>
                    {agent.channelCount > 0 && (
                      <div className="flex items-center gap-1">
                        <Radio className="h-3 w-3 text-blue-400/40" />
                        <span className="text-[11px] text-blue-400/50">{agent.channelCount} channel{agent.channelCount !== 1 ? 's' : ''}</span>
                      </div>
                    )}
                    {agent.commCount > 0 && (
                      <div className="flex items-center gap-1">
                        <Send className="h-3 w-3 text-purple-400/40" />
                        <span className="text-[11px] text-purple-400/50">{agent.commCount} link{agent.commCount !== 1 ? 's' : ''}</span>
                      </div>
                    )}
                    {agent.last_active && (
                      <span className="text-[11px] text-white/15">Active {timeAgo(agent.last_active)}</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                  <button onClick={() => router.push(`/dashboard/agents/${agent.id}`)}
                    className="p-2 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-colors"
                    title="Configure agent">
                    <Settings2 className="h-4 w-4" />
                  </button>
                  <button onClick={() => router.push(`/dashboard?agent=${agent.id}`)}
                    className="p-2 rounded-lg text-white/30 hover:text-blue-400 hover:bg-blue-400/5 transition-colors"
                    title="Chat with this agent">
                    <MessageSquare className="h-4 w-4" />
                  </button>
                  {!agent.is_primary && (
                    <>
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
                    </>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* ─── Agent Store / Marketplace ─── */}
      <div className="pt-4 animate-fade-up">
        <div className="flex items-center gap-3 mb-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.04]">
            <Store className="h-5 w-5 text-white/30" />
          </div>
          <div>
            <h2 className="text-[20px] font-bold text-white tracking-tight">Agent Store</h2>
            <p className="text-[13px] text-white/35">Pre-built agents with personality, skills, and schedules — install in one click</p>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search agents..."
            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] pl-10 pr-4 py-2.5 text-[14px] text-white placeholder:text-white/20 focus:border-white/20 focus:outline-none transition-colors"
          />
        </div>

        {/* Category filter pills */}
        <div className="flex flex-wrap gap-2 mb-5">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-all ${
                selectedCategory === cat
                  ? 'bg-white/10 border-white/20 text-white'
                  : 'bg-white/[0.02] border-white/[0.06] text-white/40 hover:border-white/[0.12] hover:text-white/60'
              }`}
            >
              {CATEGORY_LABELS[cat] || cat.charAt(0).toUpperCase() + cat.slice(1)}
            </button>
          ))}
        </div>

        {/* Marketplace Grid */}
        {marketplaceLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-white/30" />
          </div>
        ) : filteredMarketplace.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Store className="h-10 w-10 text-white/10 mb-3" />
            <p className="text-[14px] text-white/40">No agents found</p>
            <p className="text-[12px] text-white/20 mt-1">Try a different category or search term</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filteredMarketplace.map(agent => {
              const isInstalled = installedOpenclawIds.has(agent.id);
              const isInstalling = installingId === agent.id;
              const catColor = CATEGORY_STYLE;

              return (
                <div
                  key={agent.id}
                  className="group rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 hover:border-white/[0.12] hover:bg-white/[0.04] transition-all cursor-pointer"
                  onClick={() => setPreviewAgent(agent)}
                >
                  <h3 className="text-[15px] font-semibold text-white leading-tight mb-2">{agent.name}</h3>

                  <p className="text-[13px] text-white/40 leading-relaxed line-clamp-3 mb-4 min-h-[3.5rem]">
                    {agent.role}
                  </p>

                  <div className="flex items-center gap-2 pt-3 border-t border-white/[0.06]">
                    <SkillLogos skills={agent.skills} />
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ml-auto ${catColor}`}>
                      {CATEGORY_LABELS[agent.category] || agent.category}
                    </span>
                    {isInstalled ? (
                      <span className="text-[12px] text-white/30 font-medium">Installed</span>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!isInstalling && canAddAgent) handleInstall(agent.id);
                        }}
                        disabled={isInstalling || !canAddAgent}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all ${
                          !canAddAgent
                            ? 'text-white/20 cursor-not-allowed'
                            : isInstalling
                              ? 'text-white/40'
                              : 'text-white bg-white/[0.08] border border-white/[0.12] hover:bg-white/[0.14] hover:border-white/[0.2]'
                        }`}
                      >
                        {isInstalling ? (
                          <><Loader2 className="h-3 w-3 animate-spin" /> Installing...</>
                        ) : (
                          'Install'
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Agent Preview Modal */}
      <Modal open={!!previewAgent} onClose={() => setPreviewAgent(null)}
        title={previewAgent?.name || ''} className="max-w-lg">
        {previewAgent && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-[17px] font-semibold text-white">{previewAgent.name}</h3>
                <div className="flex items-center gap-2 mt-1.5">
                  <SkillLogos skills={previewAgent.skills} />
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${CATEGORY_STYLE}`}>
                    {CATEGORY_LABELS[previewAgent.category] || previewAgent.category}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <p className="text-[13px] text-white/50 leading-relaxed">{previewAgent.description}</p>
            </div>

            {previewAgent.cron.length > 0 && (
              <div>
                <h4 className="text-[12px] font-medium text-white/30 uppercase tracking-wider mb-2">Scheduled Tasks</h4>
                <div className="space-y-1.5">
                  {previewAgent.cron.map((job, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                      <div className="h-1.5 w-1.5 rounded-full bg-blue-400/50" />
                      <span className="text-[12px] text-white/50">{job.name.replace(/-/g, ' ')}</span>
                      <span className="text-[10px] text-white/20 font-mono ml-auto">{job.schedule}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {previewAgent.skills.length > 0 && (
              <div>
                <h4 className="text-[12px] font-medium text-white/30 uppercase tracking-wider mb-2">Skills ({previewAgent.skills.length})</h4>
                <div className="flex flex-wrap gap-1.5">
                  {previewAgent.skills.map(skill => (
                    <span key={skill} className="px-2 py-0.5 rounded text-[10px] text-white/35 bg-white/[0.03] border border-white/[0.05]">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {previewAgent.requiredKeys.length > 0 && (
              <div className="rounded-lg border border-amber-500/10 bg-amber-500/5 px-4 py-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-400/60" />
                  <span className="text-[12px] font-medium text-amber-400/70">API Keys Needed</span>
                </div>
                <div className="space-y-1">
                  {previewAgent.requiredKeys.map((key, i) => (
                    <p key={i} className="text-[11px] text-amber-400/40">{key}</p>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="glass" size="sm" onClick={() => setPreviewAgent(null)}>Close</Button>
              {installedOpenclawIds.has(previewAgent.id) ? (
                <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium text-green-400/70 bg-green-500/5 border border-green-500/10">
                  <Check className="h-3.5 w-3.5" /> Already Installed
                </span>
              ) : (
                <Button variant="primary" size="sm"
                  onClick={() => { handleInstall(previewAgent.id); setPreviewAgent(null); }}
                  disabled={!canAddAgent || installingId === previewAgent.id}>
                  <Download className="h-3.5 w-3.5" /> Install Agent
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>

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
