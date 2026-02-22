'use client';

import { Card, CardDescription, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Globe, ExternalLink } from 'lucide-react';

/**
 * Browser agent activity is handled inside the OpenClaw container.
 * The container uses Browserless (or local Puppeteer) for web browsing.
 * Activity is visible through the OpenClaw Control UI or agent logs.
 */
export default function BrowserPage() {
  return (
    <div className="space-y-6">
      <div className="animate-fade-up">
        <h1 className="text-[26px] font-bold text-white tracking-tight">Browser Agent</h1>
        <p className="mt-1 text-[15px] text-white/40">
          Your OpenClaw agent uses the browser tool when you ask it to search or browse the web.
        </p>
      </div>

      <Card className="animate-fade-up">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="rounded-2xl bg-white/5 p-5 mb-5">
            <Globe className="h-10 w-10 text-white/20" />
          </div>
          <p className="text-[16px] font-medium text-white/60 mb-2">Browser runs inside OpenClaw</p>
          <p className="text-[14px] text-white/30 max-w-md leading-relaxed">
            When your agent needs to browse the web, it uses the browser tool inside its container.
            Ask your agent to search for something and browsing activity will appear in the activity feed.
          </p>
          <div className="flex gap-3 mt-6">
            <Button variant="glass" onClick={() => window.location.href = '/dashboard'}>
              Chat with Agent
            </Button>
            <Button variant="glass" onClick={() => window.location.href = '/dashboard/activity'}>
              View Activity
            </Button>
          </div>
        </div>
      </Card>

      <Card className="!p-4 animate-fade-up">
        <div className="flex items-center gap-3 text-[13px] text-white/30">
          <Globe className="h-4 w-4 text-white/15 shrink-0" />
          <span>
            Pro and Business plans include Browserless access. The browser tool is enabled in your
            OpenClaw container via Skills settings.
          </span>
        </div>
      </Card>
    </div>
  );
}
