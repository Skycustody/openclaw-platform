'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import api from '@/lib/api';
import { timeAgo } from '@/lib/utils';
import {
  MessageSquare, Search, Loader2, ChevronDown, ChevronUp,
  Bot, User as UserIcon, Download, Filter, X,
} from 'lucide-react';

interface Conversation {
  id: string;
  channel: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model_used: string | null;
  tokens_used: number | null;
  created_at: string;
  metadata: any;
}

const CHANNEL_LABELS: Record<string, { label: string; color: string }> = {
  dashboard:  { label: 'Dashboard',  color: 'bg-blue-500/10 text-blue-400' },
  telegram:   { label: 'Telegram',   color: 'bg-sky-500/10 text-sky-400' },
  discord:    { label: 'Discord',    color: 'bg-indigo-500/10 text-indigo-400' },
  whatsapp:   { label: 'WhatsApp',   color: 'bg-green-500/10 text-green-400' },
  slack:      { label: 'Slack',      color: 'bg-purple-500/10 text-purple-400' },
  web:        { label: 'Web',        color: 'bg-white/10 text-white/60' },
  auto:       { label: 'Auto',       color: 'bg-amber-500/10 text-amber-400' },
  cron:       { label: 'Scheduled',  color: 'bg-emerald-500/10 text-emerald-400' },
};

interface ConversationGroup {
  date: string;
  messages: Conversation[];
}

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [channelFilter, setChannelFilter] = useState<string>('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [offset, setOffset] = useState(0);
  const limit = 100;

  const fetchConversations = useCallback(async (reset = false) => {
    const currentOffset = reset ? 0 : offset;
    if (reset) setLoading(true);
    else setLoadingMore(true);

    try {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      params.set('offset', String(currentOffset));
      if (search) params.set('search', search);
      if (channelFilter) params.set('channel', channelFilter);

      const data = await api.get<{ conversations: Conversation[]; total: number }>(
        `/conversations?${params.toString()}`
      );

      if (reset) {
        setConversations(data.conversations || []);
        setOffset(limit);
      } else {
        setConversations(prev => [...prev, ...(data.conversations || [])]);
        setOffset(currentOffset + limit);
      }
      setTotal(data.total || 0);
    } catch {} finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [offset, search, channelFilter]);

  useEffect(() => {
    fetchConversations(true);
  }, [search, channelFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput.trim());
  };

  const toggleExpanded = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleExport = async () => {
    try {
      const data = await api.get<{ conversations: Conversation[] }>('/conversations/export?format=json');
      const blob = new Blob([JSON.stringify(data.conversations, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'conversations.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch {}
  };

  const grouped = groupByDate(conversations);
  const hasMore = conversations.length < total;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between animate-fade-up">
        <div>
          <h1 className="text-[26px] font-bold text-white tracking-tight">History</h1>
          <p className="mt-1 text-[15px] text-white/40">
            {total > 0 ? `${total} messages across all channels` : 'Review previous conversations'}
          </p>
        </div>
        <Button variant="glass" size="sm" onClick={handleExport}>
          <Download className="h-3.5 w-3.5" /> Export
        </Button>
      </div>

      {/* Search & Filters */}
      <div className="flex items-center gap-3 animate-fade-up">
        <form onSubmit={handleSearch} className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20" />
          <input
            type="text"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Search conversations..."
            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] pl-10 pr-4 py-2.5 text-[14px] text-white placeholder:text-white/20 focus:border-white/20 focus:outline-none transition-colors"
          />
          {search && (
            <button
              type="button"
              onClick={() => { setSearch(''); setSearchInput(''); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/40"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </form>

        <div className="flex items-center gap-1.5">
          <Filter className="h-3.5 w-3.5 text-white/20" />
          {['', 'dashboard', 'telegram', 'discord', 'whatsapp', 'slack'].map(ch => (
            <button
              key={ch}
              onClick={() => setChannelFilter(ch)}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                channelFilter === ch
                  ? 'bg-white/10 text-white'
                  : 'text-white/30 hover:text-white/50 hover:bg-white/[0.04]'
              }`}
            >
              {ch === '' ? 'All' : (CHANNEL_LABELS[ch]?.label || ch)}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-white/40" />
        </div>
      )}

      {/* Empty State */}
      {!loading && conversations.length === 0 && (
        <Card className="flex flex-col items-center justify-center py-16 text-center animate-fade-up">
          <MessageSquare className="h-12 w-12 text-white/10 mb-4" />
          <p className="text-[16px] font-medium text-white/50">
            {search ? 'No conversations match your search' : 'No conversations yet'}
          </p>
          <p className="text-[13px] text-white/25 mt-1 max-w-sm">
            {search
              ? 'Try a different search term'
              : 'Start chatting with your agent and conversations will appear here'}
          </p>
        </Card>
      )}

      {/* Conversation Groups */}
      {!loading && grouped.map(group => (
        <div key={group.date} className="animate-fade-up">
          <p className="text-[11px] font-medium text-white/20 uppercase tracking-wider mb-3 px-1">
            {group.date}
          </p>
          <div className="space-y-1">
            {group.messages.map(msg => {
              const isExpanded = expandedIds.has(msg.id);
              const isLong = msg.content.length > 200;
              const channel = CHANNEL_LABELS[msg.channel] || CHANNEL_LABELS.web;
              const isUser = msg.role === 'user';

              return (
                <div
                  key={msg.id}
                  className="rounded-xl border border-white/[0.06] bg-white/[0.015] hover:bg-white/[0.03] transition-colors overflow-hidden"
                >
                  <button
                    onClick={() => isLong && toggleExpanded(msg.id)}
                    className="w-full text-left px-4 py-3 flex items-start gap-3"
                  >
                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg mt-0.5 ${
                      isUser ? 'bg-white/[0.08]' : 'bg-white/[0.04]'
                    }`}>
                      {isUser
                        ? <UserIcon className="h-3.5 w-3.5 text-white/50" />
                        : <Bot className="h-3.5 w-3.5 text-white/40" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[12px] font-medium text-white/50">
                          {isUser ? 'You' : 'Agent'}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${channel.color}`}>
                          {channel.label}
                        </span>
                        {msg.model_used && (
                          <span className="text-[10px] text-white/15">{msg.model_used}</span>
                        )}
                        <span className="text-[10px] text-white/15 ml-auto shrink-0">
                          {timeAgo(msg.created_at)}
                        </span>
                      </div>
                      <p className="text-[13px] text-white/60 leading-relaxed whitespace-pre-wrap break-words">
                        {isLong && !isExpanded ? msg.content.slice(0, 200) + '...' : msg.content}
                      </p>
                    </div>
                    {isLong && (
                      <div className="shrink-0 mt-1">
                        {isExpanded
                          ? <ChevronUp className="h-3.5 w-3.5 text-white/20" />
                          : <ChevronDown className="h-3.5 w-3.5 text-white/20" />
                        }
                      </div>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Load More */}
      {!loading && hasMore && (
        <div className="flex justify-center pt-2 animate-fade-up">
          <Button variant="glass" size="sm" onClick={() => fetchConversations(false)} loading={loadingMore}>
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}

function groupByDate(messages: Conversation[]): ConversationGroup[] {
  const groups: Record<string, Conversation[]> = {};

  for (const msg of messages) {
    const date = new Date(msg.created_at);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let label: string;
    if (date.toDateString() === today.toDateString()) {
      label = 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      label = 'Yesterday';
    } else {
      label = date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    }

    if (!groups[label]) groups[label] = [];
    groups[label].push(msg);
  }

  return Object.entries(groups).map(([date, messages]) => ({ date, messages }));
}
