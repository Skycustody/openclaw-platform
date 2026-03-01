'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import api from '@/lib/api';
import { cn, formatTime, timeAgo } from '@/lib/utils';
import {
  MessageSquare, Globe, Mail, ListChecks, ShoppingCart, Activity,
  Loader2, ChevronDown, CheckCircle2, XCircle, Sparkles,
  Terminal, FileEdit, Search, Wrench, Play, CircleDot,
} from 'lucide-react';

interface ToolEntry {
  name: string;
  action: string;
}

interface ActivityEntry {
  id: string;
  type: 'message' | 'browsing' | 'email' | 'task' | 'shopping';
  summary: string;
  created_at: string;
  status: 'completed' | 'in_progress' | 'attention' | 'failed';
  channel?: string;
  model_used?: string;
  tokens_used?: number;
  userRequest?: string;
  taskSummary?: string;
  lastAction?: string;
  stepCount?: number;
  tools?: ToolEntry[];
}

interface Counts {
  byType: Record<string, number>;
  byStatus: Record<string, number>;
}

const typeFilters = [
  { key: 'all', label: 'All', icon: Activity },
  { key: 'task', label: 'Tasks', icon: ListChecks },
  { key: 'message', label: 'Messages', icon: MessageSquare },
  { key: 'browsing', label: 'Browsing', icon: Globe },
  { key: 'email', label: 'Emails', icon: Mail },
] as const;

const statusFilters = [
  { key: 'all', label: 'All' },
  { key: 'in_progress', label: 'Running', color: 'text-blue-400' },
  { key: 'completed', label: 'Completed', color: 'text-emerald-400' },
  { key: 'failed', label: 'Failed', color: 'text-red-400' },
] as const;

const typeIcons: Record<string, typeof MessageSquare> = {
  message: MessageSquare,
  browsing: Globe,
  email: Mail,
  task: ListChecks,
  shopping: ShoppingCart,
};

const typeColors: Record<string, string> = {
  message: 'text-blue-400 bg-blue-500/10',
  browsing: 'text-purple-400 bg-purple-500/10',
  email: 'text-amber-400 bg-amber-500/10',
  task: 'text-emerald-400 bg-emerald-500/10',
  shopping: 'text-cyan-400 bg-cyan-500/10',
};

const statusConfig: Record<string, { icon: typeof CheckCircle2; color: string; label: string }> = {
  completed: { icon: CheckCircle2, color: 'text-emerald-400', label: 'Done' },
  in_progress: { icon: Loader2, color: 'text-blue-400', label: 'Running' },
  attention: { icon: CircleDot, color: 'text-amber-400', label: 'Attention' },
  failed: { icon: XCircle, color: 'text-red-400', label: 'Failed' },
};

function toolIcon(name: string) {
  const lower = name.toLowerCase();
  if (/bash|shell|exec/.test(lower)) return Terminal;
  if (/write|edit|create|str_replace/.test(lower)) return FileEdit;
  if (/search|grep|glob/.test(lower)) return Search;
  if (/browser|navigate|click|snapshot/.test(lower)) return Globe;
  return Wrench;
}

function groupByDay(entries: ActivityEntry[]): { label: string; items: ActivityEntry[] }[] {
  const groups: Record<string, ActivityEntry[]> = {};
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();

  for (const entry of entries) {
    const day = new Date(entry.created_at).toDateString();
    const label =
      day === today ? 'Today' :
      day === yesterday ? 'Yesterday' :
      new Date(entry.created_at).toLocaleDateString('en-US', {
        weekday: 'long', month: 'short', day: 'numeric',
      });
    if (!groups[label]) groups[label] = [];
    groups[label].push(entry);
  }

  return Object.entries(groups).map(([label, items]) => ({ label, items }));
}

const LIMIT = 50;

export default function ActivityFeed() {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [counts, setCounts] = useState<Counts>({ byType: {}, byStatus: {} });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const fetchEntries = useCallback(async (offset: number, reset: boolean) => {
    const setter = offset === 0 ? setLoading : setLoadingMore;
    setter(true);
    try {
      const params = new URLSearchParams({
        limit: String(LIMIT),
        offset: String(offset),
      });
      if (typeFilter !== 'all') params.set('filter', typeFilter);
      if (statusFilter !== 'all') params.set('status', statusFilter);

      const res = await api.get<{
        activities: ActivityEntry[];
        total: number;
        counts: Counts;
      }>(`/activity?${params}`);

      const data = res.activities || [];
      if (reset) {
        setEntries(data);
        if (res.counts) setCounts(res.counts);
      } else {
        setEntries((prev) => [...prev, ...data]);
      }
      setHasMore(data.length === LIMIT);
    } catch {
      if (reset) setEntries([]);
      setHasMore(false);
    } finally {
      setter(false);
    }
  }, [typeFilter, statusFilter]);

  useEffect(() => {
    setEntries([]);
    setHasMore(true);
    fetchEntries(0, true);
    const interval = setInterval(() => fetchEntries(0, true), 8000);
    return () => clearInterval(interval);
  }, [fetchEntries]);

  const loadMore = () => {
    if (!loadingMore && hasMore) fetchEntries(entries.length, false);
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const groups = groupByDay(entries);
  const runningEntries = entries.filter(e => e.status === 'in_progress');

  return (
    <div className="space-y-6">
      <div className="animate-fade-up">
        <h1 className="text-[26px] font-bold text-white tracking-tight">Activity Feed</h1>
        <p className="mt-1 text-[15px] text-white/40">
          Real-time view of what your agent is doing
        </p>
      </div>

      {/* Type filter tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 animate-fade-up">
        {typeFilters.map((f) => {
          const count = f.key === 'all'
            ? (counts.byType.all || 0)
            : (counts.byType[f.key] || 0);
          const Icon = f.icon;
          return (
            <button
              key={f.key}
              onClick={() => setTypeFilter(f.key)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-medium whitespace-nowrap transition-all',
                typeFilter === f.key
                  ? 'bg-white/[0.08] text-white ring-1 ring-white/20'
                  : 'text-white/40 hover:text-white/60 hover:bg-white/5'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {f.label}
              {count > 0 && (
                <span className={cn(
                  'ml-1 text-[11px] tabular-nums',
                  typeFilter === f.key ? 'text-white/60' : 'text-white/25'
                )}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Status filter pills */}
      <div className="flex items-center gap-1.5 animate-fade-up">
        <span className="text-[12px] text-white/30 mr-1">Status:</span>
        {statusFilters.map((f) => {
          const count = f.key === 'all'
            ? (counts.byStatus.all || 0)
            : (counts.byStatus[f.key] || 0);
          return (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={cn(
                'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[12px] font-medium transition-all',
                statusFilter === f.key
                  ? 'bg-white/[0.08] text-white ring-1 ring-white/15'
                  : 'text-white/35 hover:text-white/55 hover:bg-white/5'
              )}
            >
              {f.label}
              {count > 0 && (
                <span className="text-[10px] tabular-nums opacity-60">{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Running now banner */}
      {runningEntries.length > 0 && (
        <Card className="!p-4 border-blue-500/15 bg-blue-500/[0.04]">
          <div className="flex items-center gap-3">
            <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/10">
              <Play className="h-4 w-4 text-blue-400" />
              <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-blue-400 animate-pulse" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium text-blue-400/70 uppercase tracking-wider">
                Running now
                {runningEntries.length > 1 && ` (${runningEntries.length} tasks)`}
              </p>
              <p className="text-[14px] text-white/80 mt-0.5 truncate">
                {runningEntries[0].summary}
              </p>
              {runningEntries[0].stepCount && runningEntries[0].stepCount > 0 && (
                <p className="text-[11px] text-blue-400/50 mt-0.5">
                  {runningEntries[0].stepCount} steps completed
                </p>
              )}
            </div>
            {runningEntries[0].model_used && (
              <span className="text-[11px] text-white/20 shrink-0">
                {runningEntries[0].model_used.split('/').pop()}
              </span>
            )}
          </div>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-white/40" />
        </div>
      ) : entries.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 mb-4">
            <Activity className="h-7 w-7 text-white/20" />
          </div>
          <p className="text-[17px] font-medium text-white/60">
            {statusFilter !== 'all' || typeFilter !== 'all'
              ? 'No matching activity'
              : 'No activity yet'}
          </p>
          <p className="text-[14px] text-white/30 mt-2 max-w-sm">
            {statusFilter !== 'all' || typeFilter !== 'all'
              ? 'Try changing the filters above.'
              : 'Send your agent a message to get started. All actions will appear here.'}
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.label}>
              <p className="text-[13px] font-medium text-white/30 uppercase tracking-wider mb-3 px-1">
                {group.label}
              </p>
              <div className="space-y-2">
                {group.items.map((entry) => {
                  const Icon = typeIcons[entry.type] || Activity;
                  const colorClass = typeColors[entry.type] || 'text-white/40 bg-white/5';
                  const sc = statusConfig[entry.status] || statusConfig.completed;
                  const SIcon = sc.icon;
                  const isExpanded = expanded.has(entry.id);
                  const hasTools = entry.tools && entry.tools.length > 0;

                  return (
                    <Card
                      key={entry.id}
                      className={cn(
                        '!p-4 transition-colors cursor-pointer hover:bg-white/[0.02]',
                        entry.status === 'in_progress' && 'border-blue-500/10',
                        entry.status === 'failed' && 'border-red-500/10',
                      )}
                      onClick={() => hasTools && toggleExpand(entry.id)}
                    >
                      <div className="flex items-start gap-3">
                        <div className={cn(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                          colorClass,
                        )}>
                          <Icon className="h-4 w-4" />
                        </div>

                        <div className="min-w-0 flex-1">
                          {/* Summary line */}
                          <p className="text-[14px] text-white/80 leading-relaxed">
                            {entry.summary}
                          </p>

                          {/* User request (shown when different from summary) */}
                          {entry.userRequest && entry.userRequest !== entry.summary && (
                            <p className="text-[12px] text-white/30 mt-0.5 truncate">
                              Request: {entry.userRequest}
                            </p>
                          )}

                          {/* Step count + model */}
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <span className={cn(
                              'inline-flex items-center gap-1 text-[11px] font-medium',
                              sc.color,
                            )}>
                              <SIcon className={cn(
                                'h-3 w-3',
                                entry.status === 'in_progress' && 'animate-spin',
                              )} />
                              {sc.label}
                            </span>

                            {entry.stepCount && entry.stepCount > 0 && (
                              <span className="text-[11px] text-white/20">
                                {entry.stepCount} steps
                              </span>
                            )}

                            {entry.model_used && (
                              <span className="text-[11px] text-white/15">
                                {entry.model_used.split('/').pop()}
                              </span>
                            )}

                            {hasTools && (
                              <span className="text-[11px] text-white/20">
                                {isExpanded ? 'hide details' : `${entry.tools!.length} tool calls`}
                              </span>
                            )}
                          </div>

                          {/* Expanded tool call list */}
                          {isExpanded && hasTools && (
                            <div className="mt-3 space-y-1 border-t border-white/5 pt-2">
                              {entry.tools!.map((tool, i) => {
                                const TIcon = toolIcon(tool.name);
                                return (
                                  <div key={i} className="flex items-center gap-2 py-0.5">
                                    <TIcon className="h-3 w-3 text-white/20 shrink-0" />
                                    <span className="text-[12px] text-white/50 truncate">
                                      {tool.action}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        <span className="text-[12px] text-white/25 whitespace-nowrap shrink-0">
                          {timeAgo(entry.created_at)}
                        </span>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}

          {hasMore && (
            <div className="flex justify-center pt-2">
              <Button variant="glass" size="md" onClick={loadMore} loading={loadingMore}>
                <ChevronDown className="h-4 w-4" />
                Load more
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
