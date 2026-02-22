'use client';

import { useEffect, useState, useRef } from 'react';
import { Card, CardTitle, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Textarea } from '@/components/ui/Input';
import { Toggle } from '@/components/ui/Toggle';
import { Slider } from '@/components/ui/Slider';
import { Modal } from '@/components/ui/Modal';
import api from '@/lib/api';
import { cn, formatUsd, formatDollars, timeAgo } from '@/lib/utils';
import {
  Plus, Clock, CalendarClock, MoreVertical, Pencil, Pause,
  Play, Trash2, CheckCircle2, XCircle, AlertTriangle,
  Loader2, Zap, Timer,
} from 'lucide-react';

interface CronTask {
  id: string;
  name: string;
  description: string;
  scheduleLabel: string;
  enabled: boolean;
  nextRun: string;
  lastRun?: {
    timestamp: string;
    status: 'success' | 'error';
    costUsd: number;
    message?: string;
  };
  budgetUsd: number;
}

const FREQ_OPTIONS = [
  { value: 'daily', label: 'Once a day' },
  { value: 'multiple', label: 'Multiple times a day' },
  { value: 'weekly', label: 'Once a week' },
  { value: 'custom', label: 'Custom' },
];

const BEHAVIOR_OPTIONS = [
  { value: 'stop', label: 'Stop and notify me', description: 'If something goes wrong, pause and let you know' },
  { value: 'continue', label: 'Continue anyway', description: 'Keep going even if there are minor issues' },
];

function getTimeUntil(dateStr: string) {
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff < 0) return 'Overdue';
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  if (hours > 24) return `in ${Math.floor(hours / 24)} days, ${hours % 24} hours`;
  if (hours > 0) return `in ${hours} hours, ${minutes} minutes`;
  return `in ${minutes} minutes`;
}

export default function SchedulePage() {
  const [tasks, setTasks] = useState<CronTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const [newDescription, setNewDescription] = useState('');
  const [newFrequency, setNewFrequency] = useState('daily');
  const [newTime, setNewTime] = useState('08:00');
  const [newBudgetUsd, setNewBudgetUsd] = useState(1.00);
  const [newBehavior, setNewBehavior] = useState('stop');

  useEffect(() => {
    fetchTasks();
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  async function fetchTasks() {
    try {
      const res = await api.get<{ jobs: CronTask[] }>('/cron');
      setTasks(res.jobs || []);
    } catch {
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!newDescription.trim()) return;
    setCreating(true);
    try {
      const res = await api.post<{ job: CronTask }>('/cron', {
        description: newDescription.trim(),
        frequency: newFrequency,
        time: newTime,
        tokenBudget: newBudgetUsd,
        behavior: newBehavior,
      });
      if (res.job) setTasks((prev) => [...prev, res.job]);
    } catch {
      // task creation failed
    } finally {
      setCreating(false);
      setShowCreate(false);
      setNewDescription('');
      setNewFrequency('daily');
      setNewTime('08:00');
      setNewBudgetUsd(1.00);
      setNewBehavior('stop');
    }
  }

  async function handleToggle(id: string, enabled: boolean) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, enabled } : t)));
    try {
      await api.put(`/cron/${id}`, { enabled });
    } catch {
      // keep optimistic update
    }
  }

  async function handleRunNow(id: string) {
    setRunningId(id);
    setOpenMenuId(null);
    try {
      await api.post(`/cron/${id}/run`);
    } catch {
      // handled
    } finally {
      setRunningId(null);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    setOpenMenuId(null);
    try {
      await api.delete(`/cron/${id}`);
    } catch {
      // proceed
    } finally {
      setTasks((prev) => prev.filter((t) => t.id !== id));
      setDeletingId(null);
    }
  }

  const costHint = `~${formatUsd(newBudgetUsd)} per run`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between animate-fade-up">
        <div>
          <h1 className="text-[26px] font-bold text-white tracking-tight">Scheduled Tasks</h1>
          <p className="mt-1 text-[15px] text-white/40">Automate things your agent does on a schedule</p>
        </div>
        <Button variant="primary" size="md" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" />
          New Task
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-white/40" />
        </div>
      ) : tasks.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 mb-4">
            <CalendarClock className="h-7 w-7 text-white/20" />
          </div>
          <p className="text-[17px] font-medium text-white/60">No scheduled tasks yet</p>
          <p className="text-[14px] text-white/30 mt-2 max-w-md">
            Create one to automate daily briefings, price alerts, email summaries, or anything else your agent can do!
          </p>
          <Button variant="primary" size="md" className="mt-6" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" />
            Create your first task
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <Card key={task.id} className={cn('relative', !task.enabled && 'opacity-50')}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1.5">
                    <h3 className="text-[16px] font-semibold text-white truncate">{task.name}</h3>
                    <Badge variant={task.enabled ? 'green' : 'red'}>
                      {task.enabled ? 'Active' : 'Paused'}
                    </Badge>
                  </div>
                  <p className="text-[14px] text-white/45 leading-relaxed mb-3">{task.description}</p>

                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
                    <div className="flex items-center gap-1.5 text-white/35">
                      <Clock className="h-3.5 w-3.5" />
                      <span>{task.scheduleLabel}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-white/35">
                      <Zap className="h-3.5 w-3.5" />
                      <span>Budget: <span className="text-white">{formatUsd(task.budgetUsd)}</span></span>
                    </div>
                    {task.enabled && (
                      <div className="flex items-center gap-1.5 text-white/35">
                        <Timer className="h-3.5 w-3.5" />
                        <span>Next run <span className="text-emerald-400">{getTimeUntil(task.nextRun)}</span></span>
                      </div>
                    )}
                  </div>

                  {/* Last run result */}
                  {task.lastRun && (
                    <div className="mt-3 pt-3 border-t border-white/5">
                      <div className="flex items-center gap-3 text-[13px]">
                        {task.lastRun.status === 'success' ? (
                          <div className="flex items-center gap-1.5 text-emerald-400">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>Completed {timeAgo(task.lastRun.timestamp)}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-red-400">
                            <XCircle className="h-3.5 w-3.5" />
                            <span>Failed {timeAgo(task.lastRun.timestamp)}</span>
                          </div>
                        )}
                        <span className="text-white/20">·</span>
                        <span className="text-white/30">Cost {formatUsd(task.lastRun.costUsd)}</span>
                      </div>
                      {task.lastRun.status === 'error' && task.lastRun.message && (
                        <div className="flex items-start gap-2 mt-2 p-2.5 rounded-xl bg-red-500/5 border border-red-500/10">
                          <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
                          <p className="text-[12px] text-red-400/80">{task.lastRun.message}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Toggle
                    enabled={task.enabled}
                    onChange={(val) => handleToggle(task.id, val)}
                  />
                  <div className="relative" ref={openMenuId === task.id ? menuRef : null}>
                    <button
                      onClick={() => setOpenMenuId(openMenuId === task.id ? null : task.id)}
                      className="rounded-lg p-2 text-white/30 hover:text-white hover:bg-white/5 transition-all"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>
                    {openMenuId === task.id && (
                      <div className="absolute right-0 top-full mt-1 z-10 w-44 glass-strong p-1.5 shadow-2xl animate-fade-in">
                        <button
                          onClick={() => { setOpenMenuId(null); }}
                          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-white/60 hover:text-white hover:bg-white/5 transition-all"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </button>
                        <button
                          onClick={() => handleToggle(task.id, !task.enabled)}
                          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-white/60 hover:text-white hover:bg-white/5 transition-all"
                        >
                          <Pause className="h-3.5 w-3.5" />
                          {task.enabled ? 'Pause' : 'Resume'}
                        </button>
                        <button
                          onClick={() => handleRunNow(task.id)}
                          disabled={runningId === task.id}
                          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-white/60 hover:text-white hover:bg-white/5 transition-all"
                        >
                          {runningId === task.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Play className="h-3.5 w-3.5" />
                          )}
                          Run Now
                        </button>
                        <hr className="glass-divider my-1" />
                        <button
                          onClick={() => handleDelete(task.id)}
                          disabled={deletingId === task.id}
                          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-red-400 hover:bg-red-500/10 transition-all"
                        >
                          {deletingId === task.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create task modal */}
      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Create a Scheduled Task"
        className="max-w-2xl"
      >
        <div className="space-y-6">
          {/* Task description */}
          <div className="space-y-2">
            <Textarea
              label="What should your agent do?"
              value={newDescription}
              onChange={setNewDescription}
              placeholder="e.g. Every morning, check my email and Slack, then send me a summary of what needs my attention today"
              rows={3}
            />
            <div className="glass-subtle p-3 space-y-1">
              <p className="text-[12px] font-medium text-white/30 uppercase tracking-wider">Ideas</p>
              <p className="text-[12px] text-white/25">📰 &quot;Send me a daily news briefing about AI and tech&quot;</p>
              <p className="text-[12px] text-white/25">💰 &quot;Check prices on my Amazon watchlist and alert me about drops&quot;</p>
              <p className="text-[12px] text-white/25">📧 &quot;Draft a weekly summary email from my team&apos;s Slack messages&quot;</p>
            </div>
          </div>

          {/* Frequency */}
          <div className="space-y-2">
            <label className="block text-[13px] font-medium text-white/60">How often?</label>
            <div className="grid grid-cols-2 gap-2">
              {FREQ_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setNewFrequency(opt.value)}
                  className={cn(
                    'rounded-xl px-4 py-3 text-[14px] text-left transition-all border',
                    newFrequency === opt.value
                      ? 'bg-white/[0.06] border-white/[0.08] text-white'
                      : 'bg-white/[0.02] border-white/5 text-white/50 hover:border-white/10'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Time picker */}
          {(newFrequency === 'daily' || newFrequency === 'weekly') && (
            <div className="space-y-2">
              <label className="block text-[13px] font-medium text-white/60">What time?</label>
              <input
                type="time"
                value={newTime}
                onChange={(e) => setNewTime(e.target.value)}
                className="glass-input px-4 py-3 text-[14px] w-40"
              />
            </div>
          )}

          {/* Budget per run */}
          <Slider
            label="Budget per run"
            valueLabel={formatUsd(newBudgetUsd)}
            value={newBudgetUsd}
            onChange={setNewBudgetUsd}
            min={0.10}
            max={5.00}
            step={0.10}
            hint="Higher budgets let your agent do more complex work per run"
          />

          {/* Behavior */}
          <div className="space-y-2">
            <label className="block text-[13px] font-medium text-white/60">If something goes wrong</label>
            <div className="space-y-2">
              {BEHAVIOR_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setNewBehavior(opt.value)}
                  className={cn(
                    'w-full rounded-xl px-4 py-3 text-left transition-all border flex items-start gap-3',
                    newBehavior === opt.value
                      ? 'bg-white/[0.06] border-white/[0.08]'
                      : 'bg-white/[0.02] border-white/5 hover:border-white/10'
                  )}
                >
                  <div className={cn(
                    'mt-0.5 h-4 w-4 rounded-full border-2 shrink-0 flex items-center justify-center',
                    newBehavior === opt.value ? 'border-white' : 'border-white/20'
                  )}>
                    {newBehavior === opt.value && (
                      <div className="h-2 w-2 rounded-full bg-white" />
                    )}
                  </div>
                  <div>
                    <p className={cn('text-[14px] font-medium', newBehavior === opt.value ? 'text-white' : 'text-white/60')}>
                      {opt.label}
                    </p>
                    <p className="text-[12px] text-white/30 mt-0.5">{opt.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <hr className="glass-divider" />

          <div className="flex justify-end gap-2">
            <Button variant="glass" size="md" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={handleCreate}
              loading={creating}
              disabled={!newDescription.trim()}
            >
              <Plus className="h-4 w-4" />
              Create Task
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
