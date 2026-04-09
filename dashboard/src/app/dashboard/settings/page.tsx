'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardTitle, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import api from '@/lib/api';
import Link from 'next/link';
import Image from 'next/image';
import {
  Settings, Globe, Download, MousePointer, FileText, Eye,
  Bell, Clock, Shield, Mail, FileText as FileTextIcon,
  ChevronRight, Save, CheckCircle, Loader2, Database,
} from 'lucide-react';

const EXTENSION_URL = 'https://chromewebstore.google.com/detail/valnaa-browser-relay/placeholder';
const SUPPORT_EMAIL = 'hello@valnaa.com';

const TIMEZONES = [
  { value: 'auto', label: 'Auto-detect' },
  { value: 'America/New_York', label: 'Eastern Time (US)' },
  { value: 'America/Chicago', label: 'Central Time (US)' },
  { value: 'America/Denver', label: 'Mountain Time (US)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (US)' },
  { value: 'Europe/London', label: 'London (GMT)' },
  { value: 'Europe/Paris', label: 'Central Europe (CET)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Asia/Shanghai', label: 'Shanghai (CST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST)' },
];

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`
        relative inline-flex h-[22px] w-[40px] shrink-0 cursor-pointer items-center rounded-full border border-white/[0.08] transition-colors
        ${checked ? 'bg-white/20' : 'bg-white/[0.06]'}
      `}
    >
      <span className={`pointer-events-none inline-block h-[16px] w-[16px] rounded-full bg-white/80 shadow transition-transform ${checked ? 'translate-x-[20px]' : 'translate-x-[2px]'}`} />
    </button>
  );
}

export default function SettingsPage() {
  const [emailNotifs, setEmailNotifs] = useState(true);
  const [agentNotifs, setAgentNotifs] = useState(true);
  const [timezone, setTimezone] = useState('auto');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSavePreferences = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await api.put('/settings', {
        email_notifications: emailNotifs,
        agent_notifications: agentNotifs,
        timezone,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {}
    setSaving(false);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="animate-fade-up">
        <div className="flex items-center gap-3 mb-1">
          <Settings className="h-6 w-6 text-white/60" />
          <h1 className="text-[26px] font-bold text-white tracking-tight">Settings</h1>
        </div>
        <p className="text-[15px] text-white/60">
          Configure integrations, preferences, and tools.
        </p>
      </div>

      {/* Browser Relay */}
      <Card className="animate-fade-up">
        <div className="flex items-start justify-between mb-5">
          <div>
            <CardTitle>Valnaa Browser Relay</CardTitle>
            <CardDescription>
              Give your Valnaa agent the ability to browse the web, interact with pages, and extract data from your browser.
            </CardDescription>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.06] border border-white/[0.08]">
            <Globe className="h-4 w-4 text-white/60" />
          </div>
        </div>

        <div className="space-y-5">
          <a
            href={EXTENSION_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-xl border border-white/[0.1] bg-white/[0.04] px-5 py-3.5 hover:bg-white/[0.07] hover:border-white/[0.15] transition-all group"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.06] group-hover:bg-white/[0.1] transition-colors overflow-hidden">
              <Image src="/valnaa-app-icon.png" alt="Valnaa" width={28} height={28} className="rounded-lg" />
            </div>
            <div className="flex-1">
              <p className="text-[14px] font-medium text-white/90 group-hover:text-white transition-colors">Install Valnaa Browser Extension</p>
              <p className="text-[12px] text-white/50">Add Valnaa to Chrome to enable browser automation</p>
            </div>
            <Download className="h-4 w-4 text-white/40 group-hover:text-white/70 transition-colors" />
          </a>

          <div className="space-y-3">
            <p className="text-[12px] font-medium text-white/60 uppercase tracking-wider">How it works</p>
            <div className="grid gap-2.5">
              <div className="flex items-start gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] mt-0.5">
                  <Download className="h-3.5 w-3.5 text-white/50" />
                </div>
                <div>
                  <p className="text-[13px] text-white/80">Install the Valnaa extension</p>
                  <p className="text-[12px] text-white/40">One-click install from the Chrome Web Store</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] mt-0.5">
                  <MousePointer className="h-3.5 w-3.5 text-white/50" />
                </div>
                <div>
                  <p className="text-[13px] text-white/80">Extension controls your browser</p>
                  <p className="text-[12px] text-white/40">Navigate pages, click buttons, fill forms, and scroll automatically</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] mt-0.5">
                  <Eye className="h-3.5 w-3.5 text-white/50" />
                </div>
                <div>
                  <p className="text-[13px] text-white/80">See what the extension sees</p>
                  <p className="text-[12px] text-white/40">The extension reads page content, extracts data, and takes screenshots to complete tasks</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] mt-0.5">
                  <FileText className="h-3.5 w-3.5 text-white/50" />
                </div>
                <div>
                  <p className="text-[13px] text-white/80">Get results back in chat</p>
                  <p className="text-[12px] text-white/40">Summaries, scraped data, or completed actions delivered right to your Valnaa conversation</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Notifications */}
      <Card className="animate-fade-up">
        <div className="flex items-start justify-between mb-5">
          <div>
            <CardTitle>Notifications</CardTitle>
            <CardDescription>Control how Valnaa keeps you updated.</CardDescription>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.06] border border-white/[0.08]">
            <Bell className="h-4 w-4 text-white/60" />
          </div>
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[13px] text-white/80">Email notifications</p>
              <p className="text-[12px] text-white/40">Billing updates, security alerts, and product news</p>
            </div>
            <Toggle checked={emailNotifs} onChange={setEmailNotifs} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[13px] text-white/80">Agent activity alerts</p>
              <p className="text-[12px] text-white/40">Get notified when cron jobs or scheduled tasks complete</p>
            </div>
            <Toggle checked={agentNotifs} onChange={setAgentNotifs} />
          </div>
        </div>
      </Card>

      {/* Timezone */}
      <Card className="animate-fade-up">
        <div className="flex items-start justify-between mb-5">
          <div>
            <CardTitle>Timezone</CardTitle>
            <CardDescription>Used for cron schedules and activity timestamps.</CardDescription>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.06] border border-white/[0.08]">
            <Clock className="h-4 w-4 text-white/60" />
          </div>
        </div>
        <div className="space-y-4">
          <select
            value={timezone}
            onChange={e => setTimezone(e.target.value)}
            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-[14px] text-white focus:border-white/[0.15] focus:outline-none transition-colors appearance-none"
          >
            {TIMEZONES.map(tz => (
              <option key={tz.value} value={tz.value} className="bg-[#2a2a28]">{tz.label}</option>
            ))}
          </select>
          <div className="flex items-center justify-end">
            <Button variant="primary" size="sm" onClick={handleSavePreferences} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <CheckCircle className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
              {saved ? 'Saved' : 'Save Preferences'}
            </Button>
          </div>
        </div>
      </Card>

      {/* Data & Export */}
      <Card className="animate-fade-up">
        <div className="flex items-start justify-between mb-5">
          <div>
            <CardTitle>Data & Export</CardTitle>
            <CardDescription>Download or manage your conversation history and agent data.</CardDescription>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.06] border border-white/[0.08]">
            <Database className="h-4 w-4 text-white/60" />
          </div>
        </div>
        <div className="space-y-2">
          <button className="flex items-center justify-between w-full rounded-lg px-4 py-3 text-left hover:bg-white/[0.04] transition-colors group">
            <div>
              <p className="text-[13px] text-white/80">Export conversations</p>
              <p className="text-[12px] text-white/40">Download all chat history as JSON</p>
            </div>
            <ChevronRight className="h-4 w-4 text-white/30 group-hover:text-white/50 transition-colors" />
          </button>
          <button className="flex items-center justify-between w-full rounded-lg px-4 py-3 text-left hover:bg-white/[0.04] transition-colors group">
            <div>
              <p className="text-[13px] text-white/80">Export agent configurations</p>
              <p className="text-[12px] text-white/40">Download SOUL.md files and settings for all agents</p>
            </div>
            <ChevronRight className="h-4 w-4 text-white/30 group-hover:text-white/50 transition-colors" />
          </button>
        </div>
      </Card>

      {/* Links */}
      <Card className="animate-fade-up">
        <div className="space-y-1">
          <Link href="/privacy" className="flex items-center justify-between rounded-lg px-4 py-3 hover:bg-white/[0.04] transition-colors group">
            <div className="flex items-center gap-3">
              <Shield className="h-4 w-4 text-white/50" />
              <span className="text-[13px] text-white/80">Privacy Policy</span>
            </div>
            <ChevronRight className="h-4 w-4 text-white/30 group-hover:text-white/50 transition-colors" />
          </Link>
          <Link href="/terms" className="flex items-center justify-between rounded-lg px-4 py-3 hover:bg-white/[0.04] transition-colors group">
            <div className="flex items-center gap-3">
              <FileTextIcon className="h-4 w-4 text-white/50" />
              <span className="text-[13px] text-white/80">Terms of Service</span>
            </div>
            <ChevronRight className="h-4 w-4 text-white/30 group-hover:text-white/50 transition-colors" />
          </Link>
          <a href={`mailto:${SUPPORT_EMAIL}`} className="flex items-center justify-between rounded-lg px-4 py-3 hover:bg-white/[0.04] transition-colors group">
            <div className="flex items-center gap-3">
              <Mail className="h-4 w-4 text-white/50" />
              <span className="text-[13px] text-white/80">Contact Support</span>
            </div>
            <ChevronRight className="h-4 w-4 text-white/30 group-hover:text-white/50 transition-colors" />
          </a>
        </div>
      </Card>
    </div>
  );
}
