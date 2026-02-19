'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, GlassPanel } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import api from '@/lib/api';
import { formatTokens, formatDateTime, formatTime } from '@/lib/utils';
import {
  MessageSquare,
  Search,
  Download,
  ChevronDown,
  User,
  Bot,
  Loader2,
  X,
  Eye,
  MessageCircle,
  Hash,
  Phone,
  Zap,
  Clock,
  Cpu,
} from 'lucide-react';

interface Message {
  id: string;
  userMessage: string;
  agentResponse: string;
  model: string;
  tokens: number;
  timestamp: string;
  channel: 'telegram' | 'whatsapp' | 'discord' | 'web' | 'api';
}

interface ConversationGroup {
  label: string;
  conversations: Message[];
}

type DateRange = 'today' | 'week' | 'month' | 'custom';

const channelConfig: Record<string, { icon: typeof MessageCircle; label: string; color: string }> = {
  telegram: { icon: MessageCircle, label: 'Telegram', color: 'text-blue-400' },
  whatsapp: { icon: Phone, label: 'WhatsApp', color: 'text-emerald-400' },
  discord: { icon: Hash, label: 'Discord', color: 'text-indigo-400' },
  web: { icon: MessageSquare, label: 'Web', color: 'text-violet-400' },
  api: { icon: Zap, label: 'API', color: 'text-amber-400' },
};

export default function ConversationsPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState<'json' | 'csv' | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [dateRange, setDateRange] = useState<DateRange>('month');

  const buildQuery = useCallback(
    (p: number) => {
      const params = new URLSearchParams({ page: String(p), limit: '50' });
      if (search) params.set('keyword', search);
      if (channelFilter) params.set('channel', channelFilter);
      if (dateRange === 'today') {
        params.set('from', new Date().toISOString().split('T')[0]);
      } else if (dateRange === 'week') {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        params.set('from', d.toISOString().split('T')[0]);
      } else if (dateRange === 'month') {
        const d = new Date();
        d.setMonth(d.getMonth() - 1);
        params.set('from', d.toISOString().split('T')[0]);
      }
      return params.toString();
    },
    [search, channelFilter, dateRange]
  );

  const fetchMessages = useCallback(
    async (p: number, append = false) => {
      const res = await api.get<{ messages: Message[]; hasMore: boolean }>(
        `/conversations?${buildQuery(p)}`
      );
      setMessages((prev) => (append ? [...prev, ...res.messages] : res.messages));
      setHasMore(res.hasMore);
    },
    [buildQuery]
  );

  useEffect(() => {
    setLoading(true);
    setPage(1);
    fetchMessages(1).catch(() => {}).finally(() => setLoading(false));
  }, [fetchMessages]);

  async function loadMore() {
    const next = page + 1;
    setLoadingMore(true);
    try {
      await fetchMessages(next, true);
      setPage(next);
    } catch {}
    setLoadingMore(false);
  }

  async function handleExport(format: 'json' | 'csv') {
    setExporting(format);
    try {
      const res = await api.get<{ url: string }>(`/conversations/export?format=${format}&${buildQuery(1)}`);
      window.open(res.url, '_blank');
    } catch {}
    setExporting(null);
  }

  function groupByDate(msgs: Message[]): ConversationGroup[] {
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    const groups: Record<string, Message[]> = {};

    msgs.forEach((msg) => {
      const d = new Date(msg.timestamp).toDateString();
      let label: string;
      if (d === today) label = 'Today';
      else if (d === yesterday) label = 'Yesterday';
      else label = 'Older';
      if (!groups[label]) groups[label] = [];
      groups[label].push(msg);
    });

    const order = ['Today', 'Yesterday', 'Older'];
    return order.filter((l) => groups[l]).map((l) => ({ label: l, conversations: groups[l] }));
  }

  const grouped = groupByDate(messages);

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Header */}
      <div className="animate-fade-up">
        <h1 className="text-[28px] font-bold text-white tracking-tight">Conversation History</h1>
        <p className="mt-2 text-[15px] text-white/50 leading-relaxed">
          See everything your agent has been up to. Browse past conversations, search by topic, or export your data.
        </p>
      </div>

      {/* Search & Filters */}
      <div className="space-y-4">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
            <input
              type="text"
              placeholder="Search your conversations..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="glass-input w-full py-3 pl-11 pr-4 text-[14px]"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Channel Filter */}
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-white/40">Channel:</span>
            <div className="flex gap-1.5">
              {[
                { value: '', label: 'All' },
                { value: 'telegram', label: 'Telegram' },
                { value: 'whatsapp', label: 'WhatsApp' },
                { value: 'discord', label: 'Discord' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setChannelFilter(opt.value)}
                  className={`rounded-xl px-3.5 py-1.5 text-[13px] font-medium transition-all ${
                    channelFilter === opt.value
                      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                      : 'glass-subtle text-white/50 hover:text-white/70'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="h-5 w-px bg-white/10" />

          {/* Date Range */}
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-white/40">When:</span>
            <div className="flex gap-1.5">
              {([
                { value: 'today', label: 'Today' },
                { value: 'week', label: 'This Week' },
                { value: 'month', label: 'This Month' },
              ] as { value: DateRange; label: string }[]).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setDateRange(opt.value)}
                  className={`rounded-xl px-3.5 py-1.5 text-[13px] font-medium transition-all ${
                    dateRange === opt.value
                      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                      : 'glass-subtle text-white/50 hover:text-white/70'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="ml-auto flex gap-2">
            <Button
              variant="glass"
              size="sm"
              onClick={() => handleExport('json')}
              loading={exporting === 'json'}
            >
              <Download className="h-3.5 w-3.5" />
              JSON
            </Button>
            <Button
              variant="glass"
              size="sm"
              onClick={() => handleExport('csv')}
              loading={exporting === 'csv'}
            >
              <Download className="h-3.5 w-3.5" />
              CSV
            </Button>
          </div>
        </div>
      </div>

      {/* Conversations */}
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
        </div>
      ) : messages.length === 0 ? (
        <Card className="py-16">
          <div className="flex flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-400/10 mb-5">
              <MessageSquare className="h-7 w-7 text-indigo-400" />
            </div>
            <p className="text-[17px] font-semibold text-white">No conversations yet</p>
            <p className="mt-2 text-[14px] text-white/40 max-w-sm">
              Connect a messaging app and say hello! Your agent is ready and waiting to chat.
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-8">
          {grouped.map((group) => (
            <div key={group.label} className="space-y-3">
              <div className="flex items-center gap-3">
                <h2 className="text-[14px] font-semibold text-white/60">{group.label}</h2>
                <div className="flex-1 h-px bg-white/5" />
                <span className="text-[12px] text-white/30">
                  {group.conversations.length} conversation{group.conversations.length !== 1 ? 's' : ''}
                </span>
              </div>

              <div className="space-y-2">
                {group.conversations.map((msg) => {
                  const config = channelConfig[msg.channel] || channelConfig.web;
                  const ChannelIcon = config.icon;
                  const isExpanded = expandedId === msg.id;

                  return (
                    <GlassPanel
                      key={msg.id}
                      className={`transition-all cursor-pointer hover:bg-white/[0.04] ${
                        isExpanded ? 'ring-1 ring-white/10' : ''
                      }`}
                    >
                      <div onClick={() => setExpandedId(isExpanded ? null : msg.id)}>
                        {/* Header */}
                        <div className="flex items-center gap-3 mb-3">
                          <ChannelIcon className={`h-4 w-4 ${config.color}`} />
                          <span className="text-[12px] font-medium text-white/40">{config.label}</span>
                          <span className="text-[12px] text-white/20">•</span>
                          <Clock className="h-3 w-3 text-white/20" />
                          <span className="text-[12px] text-white/40">{formatTime(msg.timestamp)}</span>
                          <div className="ml-auto">
                            <button className="text-[12px] text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1">
                              <Eye className="h-3 w-3" />
                              {isExpanded ? 'Collapse' : 'View'}
                            </button>
                          </div>
                        </div>

                        {/* User message */}
                        <div className="flex items-start gap-3 mb-2">
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-400/10 mt-0.5">
                            <User className="h-3 w-3 text-indigo-400" />
                          </div>
                          <p className={`text-[14px] text-white/80 leading-relaxed ${!isExpanded ? 'line-clamp-1' : ''}`}>
                            {msg.userMessage}
                          </p>
                        </div>

                        {/* Agent response */}
                        <div className="flex items-start gap-3">
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-400/10 mt-0.5">
                            <Bot className="h-3 w-3 text-emerald-400" />
                          </div>
                          <p className={`text-[14px] text-white/60 leading-relaxed ${!isExpanded ? 'line-clamp-2' : ''}`}>
                            {msg.agentResponse}
                          </p>
                        </div>
                      </div>

                      {/* Expanded details */}
                      {isExpanded && (
                        <div className="mt-4 pt-4 border-t border-white/5 flex items-center gap-4">
                          <div className="flex items-center gap-1.5">
                            <Cpu className="h-3.5 w-3.5 text-white/30" />
                            <span className="text-[12px] text-white/40">Model: <span className="text-white/60">{msg.model}</span></span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Zap className="h-3.5 w-3.5 text-white/30" />
                            <span className="text-[12px] text-white/40">
                              Used {formatTokens(msg.tokens)} tokens
                            </span>
                          </div>
                          <span className="text-[12px] text-white/30">{formatDateTime(msg.timestamp)}</span>
                        </div>
                      )}
                    </GlassPanel>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Load More */}
          {hasMore && (
            <div className="flex justify-center pt-4">
              <Button variant="glass" onClick={loadMore} loading={loadingMore}>
                <ChevronDown className="h-4 w-4" />
                Load More Conversations
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
