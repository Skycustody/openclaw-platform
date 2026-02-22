'use client';

import { useEffect, useState, useMemo } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input, Textarea } from '@/components/ui/Input';
import api from '@/lib/api';
import {
  Search,
  Download,
  Star,
  Share2,
  Loader2,
  Sparkles,
  Check,
  Package,
  Briefcase,
  TrendingUp,
  Mail,
  Globe,
  BookOpen,
  Zap,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';

interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  rating: number;
  installs: number;
  author: string;
  installed?: boolean;
  icon?: string;
  requiredSkills?: { name: string; hasIt: boolean }[];
  setupActions?: string[];
}

const CATEGORIES = [
  { value: 'All', label: 'All', icon: Sparkles },
  { value: 'Productivity', label: 'Productivity', icon: Briefcase },
  { value: 'Research', label: 'Research', icon: BookOpen },
  { value: 'Trading', label: 'Trading', icon: TrendingUp },
  { value: 'Email', label: 'Email', icon: Mail },
  { value: 'Social', label: 'Social', icon: Globe },
];

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [installModal, setInstallModal] = useState<Template | null>(null);
  const [shareModal, setShareModal] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareForm, setShareForm] = useState({ name: '', description: '', category: 'Productivity' });

  useEffect(() => {
    api.get<{ templates: Template[] }>('/templates')
      .then((res) => setTemplates(res.templates || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return templates.filter((t) => {
      const matchSearch =
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        t.description.toLowerCase().includes(search.toLowerCase());
      const matchCategory = category === 'All' || t.category === category;
      return matchSearch && matchCategory;
    });
  }, [templates, search, category]);

  const popular = useMemo(() => {
    return [...templates].sort((a, b) => b.installs - a.installs).slice(0, 3);
  }, [templates]);

  const [installSuccess, setInstallSuccess] = useState<string | null>(null);

  async function handleInstall(template: Template) {
    setInstallingId(template.id);
    try {
      await api.post(`/templates/${template.id}/install`);
      setTemplates((prev) =>
        prev.map((t) =>
          t.id === template.id ? { ...t, installed: true, installs: t.installs + 1 } : t
        )
      );
      setInstallModal(null);
      setInstallSuccess(template.name);
      setTimeout(() => setInstallSuccess(null), 4000);
    } catch {}
    setInstallingId(null);
  }

  async function handleShare() {
    setSharing(true);
    try {
      const res = await api.post<{ template: Template }>('/templates', shareForm);
      setTemplates((prev) => [res.template, ...prev]);
      setShareModal(false);
      setShareForm({ name: '', description: '', category: 'Productivity' });
    } catch {}
    setSharing(false);
  }

  function renderStars(rating: number) {
    return (
      <div className="flex items-center gap-0.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            className={`h-3.5 w-3.5 ${
              i < Math.round(rating) ? 'fill-amber-400 text-amber-400' : 'text-white/10'
            }`}
          />
        ))}
        <span className="ml-1.5 text-[12px] text-white/40">{rating.toFixed(1)}</span>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-bold text-white tracking-tight">Agent Templates</h1>
          <p className="mt-2 text-[15px] text-white/50 leading-relaxed">
            Pre-built agent configurations. Install to apply personality, skills, tools, and automations in one click.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="glass" size="sm" onClick={() => { setLoading(true); api.get<{ templates: Template[] }>('/templates').then((res) => setTemplates(res.templates || [])).catch(() => {}).finally(() => setLoading(false)); }}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button variant="glass" onClick={() => setShareModal(true)}>
            <Share2 className="h-4 w-4" />
            Share My Setup
          </Button>
        </div>
      </div>

      {/* Search & Category Pills */}
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
          <input
            type="text"
            placeholder="Search templates..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="glass-input w-full py-3 pl-11 pr-4 text-[14px]"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => {
            const CatIcon = cat.icon;
            return (
              <button
                key={cat.value}
                onClick={() => setCategory(cat.value)}
                className={`flex items-center gap-2 rounded-xl px-4 py-2 text-[13px] font-medium transition-all ${
                  category === cat.value
                    ? 'bg-white/[0.06] text-white border border-white/[0.08]'
                    : 'glass-subtle text-white/50 hover:text-white/70 hover:bg-white/[0.04]'
                }`}
              >
                <CatIcon className="h-3.5 w-3.5" />
                {cat.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Success banner */}
      {installSuccess && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <p className="text-[13px] text-emerald-400">
            <span className="font-medium">{installSuccess}</span> installed successfully. Your agent is being reconfigured.
          </p>
        </div>
      )}

      {/* Most Popular */}
      {category === 'All' && !search && popular.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Zap className="h-4 w-4 text-amber-400" />
            <h2 className="text-[15px] font-semibold text-white/60">Most Popular</h2>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {popular.map((template, i) => (
              <Card
                key={template.id}
                glow={i === 0}
                className="relative overflow-hidden"
              >
                {i === 0 && (
                  <div className="absolute inset-x-0 top-0 h-0.5 bg-white/20" />
                )}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.06]">
                    <Sparkles className="h-5 w-5 text-white/40" />
                  </div>
                  {i === 0 && <Badge variant="accent">Top Pick</Badge>}
                </div>
                <h3 className="text-[15px] font-semibold text-white">{template.name}</h3>
                <p className="mt-1 text-[13px] text-white/40 line-clamp-2 leading-relaxed">{template.description}</p>
                <div className="mt-3 flex items-center justify-between">
                  {renderStars(template.rating)}
                  <span className="text-[12px] text-white/30">{template.installs.toLocaleString()} installs</span>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Template Grid */}
      {loading ? (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-[15px] font-semibold text-white/60">Loading templates...</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="animate-pulse">
                <div className="flex items-start justify-between mb-3">
                  <div className="h-10 w-10 rounded-xl bg-white/[0.06]" />
                  <div className="h-5 w-20 rounded-full bg-white/[0.04]" />
                </div>
                <div className="h-5 w-3/4 rounded bg-white/[0.06] mb-2" />
                <div className="h-4 w-full rounded bg-white/[0.04] mb-1" />
                <div className="h-4 w-2/3 rounded bg-white/[0.04]" />
                <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between">
                  <div className="h-4 w-24 rounded bg-white/[0.04]" />
                  <div className="h-8 w-24 rounded-lg bg-white/[0.06]" />
                </div>
              </Card>
            ))}
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <Card className="py-16">
          <div className="flex flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.06] mb-5">
              <Package className="h-7 w-7 text-white/40" />
            </div>
            <p className="text-[17px] font-semibold text-white">No templates found</p>
            <p className="mt-2 text-[14px] text-white/40 max-w-sm">
              Try a different search or browse all categories. New templates are added by the community every day.
            </p>
          </div>
        </Card>
      ) : (
        <div>
          {category !== 'All' || search ? (
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-[15px] font-semibold text-white/60">
                {filtered.length} template{filtered.length !== 1 ? 's' : ''}
              </h2>
            </div>
          ) : (
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-[15px] font-semibold text-white/60">All Templates</h2>
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((template) => (
              <Card key={template.id} className="flex flex-col justify-between group">
                <div>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.06] group-hover:bg-white/[0.08] transition-colors">
                      <Sparkles className="h-5 w-5 text-white/40" />
                    </div>
                    <Badge variant="default" dot={false}>{template.category}</Badge>
                  </div>
                  <h3 className="text-[15px] font-semibold text-white">{template.name}</h3>
                  <p className="mt-1.5 text-[13px] text-white/40 line-clamp-2 leading-relaxed">{template.description}</p>

                  {template.requiredSkills && template.requiredSkills.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {template.requiredSkills.map((skill) => (
                        <span
                          key={skill.name}
                          className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-medium ${
                            skill.hasIt
                              ? 'bg-emerald-400/10 text-emerald-400'
                              : 'bg-amber-400/10 text-amber-400'
                          }`}
                        >
                          {skill.hasIt ? <Check className="h-2.5 w-2.5" /> : <AlertCircle className="h-2.5 w-2.5" />}
                          {skill.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between">
                  <div>
                    {renderStars(template.rating)}
                    <p className="text-[12px] text-white/30 mt-1">
                      {template.installs.toLocaleString()} installs
                    </p>
                  </div>
                  {template.installed ? (
                    <Button variant="glass" size="sm" disabled>
                      <Check className="h-4 w-4 text-emerald-400" />
                      Installed
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => setInstallModal(template)}
                    >
                      <Download className="h-4 w-4" />
                      Install — Free
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Install Modal */}
      <Modal
        open={!!installModal}
        onClose={() => setInstallModal(null)}
        title={`Install "${installModal?.name}"`}
      >
        {installModal && (
          <div className="space-y-5">
            {/* What it will do */}
            <div>
              <p className="text-[13px] font-medium text-white/60 mb-3">This template will configure your OpenClaw agent:</p>
              <div className="space-y-2">
                {(installModal.setupActions || [
                  'Write agent personality to SOUL.md in your container',
                  'Enable recommended tools and skills in openclaw.json',
                  'Set up scheduled tasks and automations',
                  'Configure budget protection settings',
                ]).map((action, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span className="text-[14px] text-white/70">{action}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Required skills */}
            {installModal.requiredSkills && installModal.requiredSkills.length > 0 && (
              <div>
                <p className="text-[13px] font-medium text-white/60 mb-3">Required skills:</p>
                <div className="space-y-2">
                  {installModal.requiredSkills.map((skill) => (
                    <div key={skill.name} className="flex items-center justify-between">
                      <span className="text-[14px] text-white/70">{skill.name}</span>
                      {skill.hasIt ? (
                        <Badge variant="green">You have this</Badge>
                      ) : (
                        <Badge variant="amber">Needs setup</Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button variant="glass" className="flex-1" onClick={() => setInstallModal(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                onClick={() => handleInstall(installModal)}
                loading={installingId === installModal.id}
              >
                <Download className="h-4 w-4" />
                Install Template
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Share Modal */}
      <Modal
        open={shareModal}
        onClose={() => setShareModal(false)}
        title="Share Your Agent Setup"
      >
        <div className="space-y-4">
          <Input
            label="Template name"
            placeholder="e.g. My Email Assistant"
            value={shareForm.name}
            onChange={(e) => setShareForm((f) => ({ ...f, name: e.target.value }))}
          />
          <Textarea
            label="Description"
            placeholder="Describe what your agent setup does and who it's for..."
            value={shareForm.description}
            onChange={(val) => setShareForm((f) => ({ ...f, description: val }))}
            rows={3}
          />
          <div className="space-y-2">
            <label className="block text-[13px] font-medium text-white/60">Category</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.filter((c) => c.value !== 'All').map((cat) => (
                <button
                  key={cat.value}
                  onClick={() => setShareForm((f) => ({ ...f, category: cat.value }))}
                  className={`rounded-xl px-3.5 py-2 text-[13px] font-medium transition-all ${
                    shareForm.category === cat.value
                      ? 'bg-white/[0.06] text-white border border-white/[0.08]'
                      : 'glass-subtle text-white/50 hover:text-white/70'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="glass" className="flex-1" onClick={() => setShareModal(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              onClick={handleShare}
              loading={sharing}
              disabled={!shareForm.name || !shareForm.description}
            >
              <Share2 className="h-4 w-4" />
              Share Template
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
