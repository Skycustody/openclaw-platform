'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardTitle, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import api from '@/lib/api';
import { timeAgo } from '@/lib/utils';
import {
  Globe, ExternalLink, Loader2, CheckCircle, XCircle,
  Send, Eye, Activity, ArrowRight, AlertTriangle, Link2,
} from 'lucide-react';

interface ToolStatus {
  name: string;
  enabled: boolean;
}

interface BrowseActivity {
  id: string;
  summary: string;
  created_at: string;
  type: string;
  status?: string;
}

export default function BrowserPage() {
  const [browserEnabled, setBrowserEnabled] = useState<boolean | null>(null);
  const [recentActivity, setRecentActivity] = useState<BrowseActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [urlInput, setUrlInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const [skillsRes, activityRes] = await Promise.allSettled([
        api.get<{ tools: ToolStatus[] }>('/skills'),
        api.get<{ activities: BrowseActivity[] }>('/activity?limit=20&offset=0'),
      ]);

      if (skillsRes.status === 'fulfilled') {
        const tools = skillsRes.value.tools || [];
        const browserTool = tools.find((t: any) => t.name === 'browser');
        setBrowserEnabled(browserTool?.enabled ?? false);
      }

      if (activityRes.status === 'fulfilled') {
        const activities = activityRes.value.activities || [];
        const browsing = activities.filter(
          (a: any) => a.type === 'browsing' || a.summary?.toLowerCase().includes('brows') ||
            a.summary?.toLowerCase().includes('navigat') || a.summary?.toLowerCase().includes('screenshot') ||
            a.summary?.toLowerCase().includes('web page') || a.summary?.toLowerCase().includes('website')
        );
        setRecentActivity(browsing.slice(0, 10));
      }
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const handleBrowse = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = urlInput.trim();
    if (!url || sending) return;

    setSending(true);
    setError(null);
    setSent(false);

    try {
      const message = `Open ${url} in the browser and describe what you see on the page. Include any key information, headings, and notable content.`;
      await api.stream('/agent/chat', { message });
      setSent(true);
      setUrlInput('');
      setTimeout(() => setSent(false), 5000);
    } catch (err: any) {
      setError(err.message || 'Failed to send browse command');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="animate-fade-up">
        <h1 className="text-[26px] font-bold text-white tracking-tight">Browser Agent</h1>
        <p className="mt-1 text-[15px] text-white/40">
          Control your agent&apos;s web browsing capabilities
        </p>
      </div>

      {/* Browser Tool Status */}
      <Card className="!p-5 animate-fade-up">
        <div className="flex items-start gap-4">
          <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.08] ${
            browserEnabled ? 'bg-green-500/10' : 'bg-white/5'
          }`}>
            <Globe className={`h-6 w-6 ${browserEnabled ? 'text-green-400' : 'text-white/20'}`} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <CardTitle>Browser Tool</CardTitle>
              {browserEnabled !== null && (
                <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${
                  browserEnabled
                    ? 'bg-green-500/10 text-green-400'
                    : 'bg-red-500/10 text-red-400'
                }`}>
                  {browserEnabled
                    ? <><CheckCircle className="h-3 w-3" /> Active</>
                    : <><XCircle className="h-3 w-3" /> Disabled</>
                  }
                </span>
              )}
            </div>
            <CardDescription>
              {browserEnabled
                ? 'Your agent can browse the web, take screenshots, and interact with web pages using Browserless.'
                : 'Enable the browser tool in Skills settings to allow your agent to browse the web.'
              }
            </CardDescription>
            {!browserEnabled && (
              <Button variant="primary" size="sm" className="mt-3"
                onClick={() => window.location.href = '/dashboard/skills'}>
                Enable in Skills <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Browse URL Input */}
      {browserEnabled && (
        <Card className="!p-5 animate-fade-up">
          <div className="flex items-center gap-2 mb-4">
            <Link2 className="h-4 w-4 text-white/30" />
            <p className="text-[14px] font-medium text-white">Browse a URL</p>
          </div>
          <p className="text-[13px] text-white/40 mb-4">
            Enter a URL and your agent will navigate to it, analyze the page, and report back.
          </p>

          {error && (
            <div className="flex items-center gap-2 mb-3 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2">
              <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0" />
              <p className="text-[12px] text-red-400">{error}</p>
            </div>
          )}

          {sent && (
            <div className="flex items-center gap-2 mb-3 rounded-lg border border-green-500/20 bg-green-500/5 px-3 py-2">
              <CheckCircle className="h-3.5 w-3.5 text-green-400 shrink-0" />
              <p className="text-[12px] text-green-400">
                Browse command sent! Check the chat for results.
              </p>
            </div>
          )}

          <form onSubmit={handleBrowse} className="flex items-center gap-2">
            <div className="flex-1 relative">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20" />
              <input
                type="text"
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                placeholder="https://example.com"
                disabled={sending}
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] pl-10 pr-4 py-2.5 text-[14px] text-white placeholder:text-white/20 focus:border-white/20 focus:outline-none transition-colors disabled:opacity-40"
              />
            </div>
            <Button type="submit" variant="primary" size="sm" loading={sending} disabled={!urlInput.trim() || sending}>
              <Send className="h-3.5 w-3.5" /> Browse
            </Button>
          </form>
        </Card>
      )}

      {/* Recent Browser Activity */}
      <Card className="!p-0 overflow-hidden animate-fade-up">
        <div className="px-5 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-white/30" />
            <p className="text-[14px] font-medium text-white">Recent Browser Activity</p>
          </div>
        </div>
        <div className="max-h-[400px] overflow-y-auto">
          {recentActivity.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Eye className="h-8 w-8 text-white/10 mb-2" />
              <p className="text-[13px] text-white/30">No recent browser activity</p>
              <p className="text-[11px] text-white/15 mt-1">
                {browserEnabled
                  ? 'Ask your agent to browse a website to see activity here'
                  : 'Enable the browser tool to get started'}
              </p>
            </div>
          ) : (
            <div className="p-3 space-y-1">
              {recentActivity.map(entry => (
                <div key={entry.id} className="flex items-start gap-3 rounded-lg px-3 py-2.5 hover:bg-white/[0.03] transition-colors">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-purple-500/10 mt-0.5">
                    <Globe className="h-3.5 w-3.5 text-purple-400/60" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-white/70 leading-relaxed">{entry.summary}</p>
                    <span className="text-[11px] text-white/20">{timeAgo(entry.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* Info card */}
      <Card className="!p-4 animate-fade-up">
        <div className="flex items-center gap-3 text-[13px] text-white/30">
          <Globe className="h-4 w-4 text-white/15 shrink-0" />
          <span>
            Pro and Business plans include Browserless access. The browser tool runs inside your
            OpenClaw container and can navigate pages, fill forms, take screenshots, and extract data.
          </span>
        </div>
      </Card>
    </div>
  );
}
