'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import api from '@/lib/api';
import { cn, formatTime, timeAgo } from '@/lib/utils';
import {
  MessageSquare, Globe, Mail, ListChecks, ShoppingCart, Activity,
  Loader2, ChevronDown, CheckCircle2, AlertTriangle, XCircle, Sparkles,
} from 'lucide-react';

interface ActivityEntry {
  id: string;
  type: 'message' | 'browsing' | 'email' | 'task' | 'shopping';
  summary: string;
  created_at: string;
  status: 'completed' | 'in_progress' | 'attention' | 'failed';
  channel?: string;
  model_used?: string;
  detail?: string;
}

const filters = [
  { key: 'all', label: 'All' },
  { key: 'message', label: 'Messages' },
  { key: 'browsing', label: 'Browsing' },
  { key: 'email', label: 'Emails' },
  { key: 'task', label: 'Tasks' },
  { key: 'shopping', label: 'Shopping' },
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
  browsing: 'text-blue-400 bg-blue-500/10',
  email: 'text-amber-400 bg-amber-500/10',
  task: 'text-emerald-400 bg-emerald-500/10',
  shopping: 'text-blue-400 bg-blue-500/10',
};

const statusIcons: Record<string, typeof CheckCircle2> = {
  completed: CheckCircle2,
  in_progress: Loader2,
  attention: AlertTriangle,
  failed: XCircle,
};

const statusColors: Record<string, string> = {
  completed: 'text-emerald-400',
  in_progress: 'text-blue-400',
  attention: 'text-amber-400',
  failed: 'text-red-400',
};

function groupByDay(entries: ActivityEntry[]): { label: string; items: ActivityEntry[] }[] {
  const groups: Record<string, ActivityEntry[]> = {};
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();

  for (const entry of entries) {
    const day = new Date(entry.created_at).toDateString();
    const label = day === today ? 'Today' : day === yesterday ? 'Yesterday' : new Date(entry.created_at).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    if (!groups[label]) groups[label] = [];
    groups[label].push(entry);
  }

  return Object.entries(groups).map(([label, items]) => ({ label, items }));
}

const LIMIT = 50;

export default function ActivityFeed() {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [isAgentActive, setIsAgentActive] = useState(false);
  const [currentAction, setCurrentAction] = useState<string | null>(null);

  const fetchEntries = useCallback(async (offset: number, reset: boolean) => {
    const setter = offset === 0 ? setLoading : setLoadingMore;
    setter(true);
    try {
      const res = await api.get<{ activities: ActivityEntry[]; total: number }>(
        `/activity?filter=${filter}&limit=${LIMIT}&offset=${offset}`
      );
      const data = res.activities || [];
      if (reset) {
        setEntries(data);
        if (data.length > 0) {
          const latest = data[0];
          const ageMs = Date.now() - new Date(latest.created_at).getTime();
          if (latest.status === 'in_progress' || (ageMs < 120_000 && latest.status !== 'completed' && latest.status !== 'failed')) {
            setIsAgentActive(true);
            setCurrentAction(latest.summary);
          } else {
            setIsAgentActive(false);
            setCurrentAction(null);
          }
        }
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
  }, [filter]);

  useEffect(() => {
    setEntries([]);
    setHasMore(true);
    fetchEntries(0, true);
    const interval = setInterval(() => fetchEntries(0, true), 10000);
    return () => clearInterval(interval);
  }, [fetchEntries]);

  const loadMore = () => {
    if (!loadingMore && hasMore) {
      fetchEntries(entries.length, false);
    }
  };

  const filtered = filter === 'all' ? entries : entries.filter((e) => e.type === filter);
  const groups = groupByDay(filtered);

  return (
    <div className="space-y-6">
      <div className="animate-fade-up">
        <h1 className="text-[26px] font-bold text-white tracking-tight">Activity Feed</h1>
        <p className="mt-1 text-[15px] text-white/40">See everything your agent has been doing</p>
      </div>

      {/* Filter pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 animate-fade-up">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-medium whitespace-nowrap transition-all',
              filter === f.key
                ? 'bg-white/[0.06] text-white ring-1 ring-white/20'
                : 'text-white/40 hover:text-white/60 hover:bg-white/5'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Right now section */}
      {isAgentActive && currentAction && (
        <Card className="!p-4 border-blue-500/10 bg-blue-500/[0.03]">
          <div className="flex items-center gap-3">
            <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/10">
              <Sparkles className="h-4 w-4 text-blue-400" />
              <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-blue-400 animate-pulse" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium text-blue-400/70 uppercase tracking-wider">Right now</p>
              <p className="text-[14px] text-white/80 mt-0.5">{currentAction}</p>
            </div>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-white/40" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 mb-4">
            <Activity className="h-7 w-7 text-white/20" />
          </div>
          <p className="text-[17px] font-medium text-white/60">Your agent hasn&apos;t done anything yet</p>
          <p className="text-[14px] text-white/30 mt-2 max-w-sm">
            Send it a message to get started! Once your agent begins working, you&apos;ll see everything it does right here.
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
                  const SIcon = statusIcons[entry.status] || CheckCircle2;
                  const sColor = statusColors[entry.status] || 'text-white/40';
                  return (
                    <Card key={entry.id} className="!p-4">
                      <div className="flex items-start gap-3">
                        <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', colorClass)}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[14px] text-white/80 leading-relaxed">{entry.summary}</p>
                          {entry.detail && (
                            <p className="text-[12px] text-white/30 mt-1">{entry.detail}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <SIcon className={cn('h-3.5 w-3.5', sColor, entry.status === 'in_progress' && 'animate-spin')} />
                          <span className="text-[12px] text-white/25 whitespace-nowrap">
                            {formatTime(entry.created_at)}
                          </span>
                        </div>
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
