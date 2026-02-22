'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardTitle, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Textarea } from '@/components/ui/Input';
import { Toggle } from '@/components/ui/Toggle';
import { Modal } from '@/components/ui/Modal';
import api from '@/lib/api';
import { cn, timeAgo } from '@/lib/utils';
import {
  Brain, Search, Plus, X, Download, AlertTriangle,
  Loader2, Pin, User, Heart, Users, Briefcase, Sparkles,
} from 'lucide-react';

interface Memory {
  id: string;
  content: string;
  type: 'about_you' | 'preference' | 'people' | 'work';
  pinned: boolean;
  createdAt: string;
}

const typeConfig: Record<string, { label: string; variant: 'default' | 'green' | 'amber' | 'red' | 'blue' | 'accent'; icon: typeof User }> = {
  about_you: { label: 'About You', variant: 'accent', icon: User },
  preference: { label: 'Preference', variant: 'blue', icon: Heart },
  people: { label: 'People', variant: 'green', icon: Users },
  work: { label: 'Work', variant: 'amber', icon: Briefcase },
};

export default function MemoryPage() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [newContent, setNewContent] = useState('');
  const [newPinned, setNewPinned] = useState(false);
  const [adding, setAdding] = useState(false);

  const fetchMemories = useCallback(async () => {
    try {
      const res = await api.get<any>('/memories');
      const data = Array.isArray(res) ? res : (res.memories || []);
      setMemories(data);
    } catch {
      setMemories([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMemories();
  }, [fetchMemories]);

  const filtered = memories.filter(
    (m) => !search || m.content.toLowerCase().includes(search.toLowerCase())
  );

  const pinnedMemories = filtered.filter((m) => m.pinned);
  const recentMemories = filtered.filter((m) => !m.pinned);

  const addMemory = async () => {
    if (!newContent.trim()) return;
    setAdding(true);
    try {
      await api.post('/memories', { content: newContent.trim(), pinned: newPinned });
      await fetchMemories();
    } catch {
      // memory creation failed
    } finally {
      setNewContent('');
      setNewPinned(false);
      setShowAddModal(false);
      setAdding(false);
    }
  };

  const deleteMemory = async (id: string) => {
    setDeleting(id);
    try {
      await api.delete(`/memories/${id}`);
    } catch {
      // proceed anyway
    } finally {
      setMemories((prev) => prev.filter((m) => m.id !== id));
      setDeleting(null);
    }
  };

  const clearAll = async () => {
    setClearing(true);
    try {
      await api.delete('/memories');
    } catch {
      // proceed anyway
    } finally {
      setMemories([]);
      setShowClearConfirm(false);
      setClearing(false);
    }
  };

  const exportMemories = async () => {
    setExporting(true);
    try {
      const data = await api.get<{ memories: Memory[] }>('/memories/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'memories-export.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      const blob = new Blob([JSON.stringify(memories, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'memories-export.json';
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
      </div>
    );
  }

  const renderMemoryItem = (memory: Memory) => {
    const cfg = typeConfig[memory.type] || typeConfig.about_you;
    const Icon = cfg.icon;
    return (
      <Card key={memory.id} className="!p-4 group">
        <div className="flex items-start gap-3">
          <div className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
            memory.type === 'about_you' && 'bg-white/[0.06] text-white/40',
            memory.type === 'preference' && 'bg-blue-500/10 text-blue-400',
            memory.type === 'people' && 'bg-emerald-500/10 text-emerald-400',
            memory.type === 'work' && 'bg-amber-500/10 text-amber-400',
          )}>
            <Icon className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant={cfg.variant} dot={false}>{cfg.label}</Badge>
              {memory.pinned && (
                <Pin className="h-3 w-3 text-amber-400/60" />
              )}
            </div>
            <p className="text-[14px] text-white/75 leading-relaxed">{memory.content}</p>
            <p className="text-[12px] text-white/25 mt-1.5">Learned {timeAgo(memory.createdAt)}</p>
          </div>
          <button
            onClick={() => deleteMemory(memory.id)}
            disabled={deleting === memory.id}
            className="shrink-0 rounded-lg p-1.5 text-white/15 opacity-0 group-hover:opacity-100 hover:text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-50"
          >
            {deleting === memory.id ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <X className="h-4 w-4" />
            )}
          </button>
        </div>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between animate-fade-up">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-[26px] font-bold text-white tracking-tight">What Your Agent Remembers</h1>
            <Badge variant="accent" dot={false}>{memories.length}</Badge>
          </div>
          <p className="text-[15px] text-white/40">
            Facts, preferences, and context your agent has learned about you
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="primary" size="sm" onClick={() => setShowAddModal(true)}>
            <Plus className="h-4 w-4" />
            Add Memory
          </Button>
          <Button
            variant="glass"
            size="sm"
            onClick={exportMemories}
            loading={exporting}
            disabled={memories.length === 0}
          >
            <Download className="h-4 w-4" />
            Export
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => setShowClearConfirm(true)}
            disabled={memories.length === 0}
          >
            Clear All
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md animate-fade-up">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/25" />
        <input
          placeholder="Search memories..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="glass-input w-full pl-10 pr-4 py-2.5 text-[14px]"
        />
      </div>

      {/* Add memory modal */}
      <Modal
        open={showAddModal}
        onClose={() => { setShowAddModal(false); setNewContent(''); setNewPinned(false); }}
        title="Add a Memory"
      >
        <div className="space-y-5">
          <Textarea
            value={newContent}
            onChange={setNewContent}
            placeholder="e.g. My wife's name is Sarah, or Never book morning meetings before 10am"
            rows={3}
          />

          <Toggle
            enabled={newPinned}
            onChange={setNewPinned}
            label="Pin this memory"
            description="Pinned memories are always kept and never forgotten"
          />

          <div className="glass-subtle p-4 space-y-2">
            <p className="text-[12px] font-medium text-white/40 uppercase tracking-wider">Example memories</p>
            <p className="text-[13px] text-white/30">&quot;My wife&apos;s name is Sarah&quot;</p>
            <p className="text-[13px] text-white/30">&quot;Never book morning meetings before 10am&quot;</p>
            <p className="text-[13px] text-white/30">&quot;I&apos;m allergic to peanuts&quot;</p>
            <p className="text-[13px] text-white/30">&quot;Use casual tone in emails, not formal&quot;</p>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="glass" size="md" onClick={() => { setShowAddModal(false); setNewContent(''); setNewPinned(false); }}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={addMemory}
              loading={adding}
              disabled={!newContent.trim()}
            >
              <Plus className="h-4 w-4" />
              Save Memory
            </Button>
          </div>
        </div>
      </Modal>

      {/* Clear confirmation modal */}
      <Modal
        open={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        title="Clear all memories?"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/5 border border-red-500/10">
            <AlertTriangle className="h-5 w-5 shrink-0 text-red-400 mt-0.5" />
            <div>
              <p className="text-[14px] font-medium text-red-400">This can&apos;t be undone</p>
              <p className="text-[13px] text-white/40 mt-1">
                All {memories.length} memories will be permanently deleted. Consider exporting them first.
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="glass" size="md" onClick={() => setShowClearConfirm(false)}>
              Keep memories
            </Button>
            <Button variant="danger" size="md" onClick={clearAll} loading={clearing}>
              Delete everything
            </Button>
          </div>
        </div>
      </Modal>

      {/* Memory list */}
      {filtered.length === 0 && !search ? (
        <Card className="flex flex-col items-center justify-center py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 mb-4">
            <Brain className="h-7 w-7 text-white/20" />
          </div>
          <p className="text-[17px] font-medium text-white/60">Your agent doesn&apos;t know much about you yet</p>
          <p className="text-[14px] text-white/30 mt-2 max-w-sm">
            The more you chat, the smarter it gets! You can also add memories manually to teach it about yourself.
          </p>
          <Button variant="primary" size="md" className="mt-6" onClick={() => setShowAddModal(true)}>
            <Plus className="h-4 w-4" />
            Add your first memory
          </Button>
        </Card>
      ) : filtered.length === 0 && search ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <Search className="h-8 w-8 text-white/15 mb-3" />
          <p className="text-[15px] text-white/50">No memories match &quot;{search}&quot;</p>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Pinned */}
          {pinnedMemories.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3 px-1">
                <Pin className="h-3.5 w-3.5 text-amber-400/50" />
                <p className="text-[13px] font-medium text-white/30 uppercase tracking-wider">Always Remember (Pinned)</p>
              </div>
              <div className="space-y-2">
                {pinnedMemories.map(renderMemoryItem)}
              </div>
            </div>
          )}

          {/* Recent */}
          {recentMemories.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3 px-1">
                <Sparkles className="h-3.5 w-3.5 text-white/40" />
                <p className="text-[13px] font-medium text-white/30 uppercase tracking-wider">Recently Learned</p>
              </div>
              <div className="space-y-2">
                {recentMemories.map(renderMemoryItem)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
