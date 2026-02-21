'use client';

import { useEffect, useState } from 'react';
import { Card, CardTitle, CardDescription, GlassPanel } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import api from '@/lib/api';
import { timeAgo, formatTokens } from '@/lib/utils';
import {
  Globe,
  Monitor,
  MousePointerClick,
  Eye,
  Loader2,
  Scroll,
  Type,
  Navigation,
  CircleDot,
  Zap,
} from 'lucide-react';

interface BrowserAction {
  id: string;
  type: 'navigate' | 'click' | 'type' | 'scroll' | 'screenshot' | 'extract';
  description: string;
  url: string;
  timestamp: string;
  status: 'success' | 'error';
}

interface BrowserStats {
  sessionsToday: number;
  pagesVisited: number;
  tokensUsed: number;
  currentUrl: string | null;
  isActive: boolean;
}

const ACTION_ICONS: Record<string, React.ElementType> = {
  navigate: Navigation,
  click: MousePointerClick,
  type: Type,
  scroll: Scroll,
  screenshot: Monitor,
  extract: Eye,
};

const ACTION_LABELS: Record<string, string> = {
  navigate: 'Opened page',
  click: 'Clicked',
  type: 'Typed',
  scroll: 'Scrolled',
  screenshot: 'Took screenshot',
  extract: 'Read page content',
};

export default function BrowserPage() {
  const [actions, setActions] = useState<BrowserAction[]>([]);
  const [stats, setStats] = useState<BrowserStats>({
    sessionsToday: 0,
    pagesVisited: 0,
    tokensUsed: 0,
    currentUrl: null,
    isActive: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBrowserData();
  }, []);

  async function fetchBrowserData() {
    try {
      const [actionsRes, statsRes] = await Promise.all([
        api.get<any>('/browser/actions'),
        api.get<any>('/browser/stats'),
      ]);
      setActions(actionsRes.actions || (Array.isArray(actionsRes) ? actionsRes : []));
      setStats(statsRes.stats || statsRes || {
        sessionsToday: 0, pagesVisited: 0, tokensUsed: 0, currentUrl: null, isActive: false,
      });
    } catch {
      setStats({
        sessionsToday: 0,
        pagesVisited: 0,
        tokensUsed: 0,
        currentUrl: null,
        isActive: false,
      });
      setActions([]);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
      </div>
    );
  }

  const hostname = stats.currentUrl
    ? (() => { try { return new URL(stats.currentUrl).hostname.replace('www.', ''); } catch { return stats.currentUrl; } })()
    : null;

  return (
    <div className="space-y-8">
      <div className="animate-fade-up">
        <h1 className="text-[28px] font-bold text-white tracking-tight">Browser Agent</h1>
        <p className="mt-1.5 text-[15px] text-white/50">
          Your agent browses the web for you — searching, checking prices, and gathering info.
        </p>
      </div>

      {stats.isActive && hostname ? (
        <Card className="animate-fade-up" glow>
          <div className="flex items-center gap-3 mb-5">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500" />
            </span>
            <span className="text-[15px] font-medium text-white">
              Currently browsing <span className="text-blue-400">{hostname}</span>
            </span>
          </div>

          <div className="glass-subtle flex items-center justify-center h-72 rounded-xl">
            <div className="text-center">
              <Monitor className="h-14 w-14 text-white/10 mx-auto mb-3" />
              <p className="text-[15px] font-medium text-white/30">Live Preview</p>
              <p className="text-[13px] text-white/20 mt-1">Screenshot updates while browsing</p>
            </div>
          </div>
        </Card>
      ) : (
        <Card className="animate-fade-up">
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="rounded-2xl bg-white/5 p-5 mb-5">
              <Globe className="h-10 w-10 text-white/20" />
            </div>
            <p className="text-[16px] font-medium text-white/60 mb-2">Browser is idle</p>
            <p className="text-[14px] text-white/30 max-w-md leading-relaxed">
              Your agent uses the browser when you ask it to search, check prices, or browse websites.
            </p>
          </div>
        </Card>
      )}

      {actions.length > 0 && (
        <Card className="animate-fade-up">
          <CardTitle>What happened</CardTitle>
          <CardDescription>Step-by-step timeline of your agent&apos;s browsing</CardDescription>

          <div className="mt-5 space-y-0.5">
            {actions.map((action, idx) => {
              const Icon = (ACTION_ICONS[action.type] || Globe) as React.ComponentType<{ className?: string }>;
              const isError = action.status === 'error';
              return (
                <div key={action.id} className="flex items-start gap-4 group">
                  <div className="flex flex-col items-center">
                    <div
                      className={`rounded-xl p-2.5 transition-colors ${
                        isError
                          ? 'bg-red-500/10'
                          : 'bg-white/5 group-hover:bg-white/8'
                      }`}
                    >
                      <Icon
                        className={`h-4 w-4 ${
                          isError ? 'text-red-400' : 'text-white/40'
                        }`}
                      />
                    </div>
                    {idx < actions.length - 1 && (
                      <div className="w-px h-5 bg-white/6 my-0.5" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0 pb-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className={`text-[14px] ${isError ? 'text-red-400' : 'text-white/80'}`}>
                        {action.description}
                      </p>
                      <span className="text-[12px] text-white/25 whitespace-nowrap shrink-0">
                        {timeAgo(action.timestamp)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-fade-up">
        <GlassPanel>
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-white/[0.06] p-2.5">
              <Globe className="h-5 w-5 text-white/40" />
            </div>
            <div>
              <p className="text-[22px] font-bold text-white">{stats.sessionsToday}</p>
              <p className="text-[13px] text-white/40">Sessions today</p>
            </div>
          </div>
        </GlassPanel>
        <GlassPanel>
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-emerald-500/10 p-2.5">
              <Eye className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-[22px] font-bold text-white">{stats.pagesVisited}</p>
              <p className="text-[13px] text-white/40">Pages visited</p>
            </div>
          </div>
        </GlassPanel>
        <GlassPanel>
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-amber-500/10 p-2.5">
              <Zap className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <p className="text-[22px] font-bold text-white">{formatTokens(stats.tokensUsed)}</p>
              <p className="text-[13px] text-white/40">Tokens used on browsing</p>
            </div>
          </div>
        </GlassPanel>
      </div>
    </div>
  );
}
