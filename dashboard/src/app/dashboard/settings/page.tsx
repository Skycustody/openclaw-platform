'use client';

import { Card, CardTitle, CardDescription } from '@/components/ui/Card';
import Link from 'next/link';
import Image from 'next/image';
import {
  Settings, Globe, Store, ArrowRight, Download, MousePointer, FileText, Eye,
} from 'lucide-react';

const EXTENSION_URL = 'https://chromewebstore.google.com/detail/valnaa-browser-relay/placeholder';

export default function SettingsPage() {
  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="animate-fade-up">
        <div className="flex items-center gap-3 mb-1">
          <Settings className="h-6 w-6 text-white/60" />
          <h1 className="text-[26px] font-bold text-white tracking-tight">Settings</h1>
        </div>
        <p className="text-[15px] text-white/60">
          Configure integrations and tools.
        </p>
      </div>

      {/* Browser Relay */}
      <Card className="animate-fade-up">
        <div className="flex items-start justify-between mb-5">
          <div>
            <CardTitle>Valnaa Browser Relay</CardTitle>
            <CardDescription>
              Give your Valnaa agent the ability to browse the web, interact with pages, and extract data — all from your browser.
            </CardDescription>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.06] border border-white/[0.08]">
            <Globe className="h-4 w-4 text-white/60" />
          </div>
        </div>

        <div className="space-y-5">
          {/* Install button */}
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

          {/* How it works */}
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
                  <p className="text-[12px] text-white/40">Navigate pages, click buttons, fill forms, and scroll — hands-free</p>
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
                  <p className="text-[12px] text-white/40">Summaries, scraped data, or completed actions — delivered right to your Valnaa conversation</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Agent Store */}
      <Card className="animate-fade-up">
        <div className="flex items-start justify-between mb-5">
          <div>
            <CardTitle>Agent Store</CardTitle>
            <CardDescription>
              Install pre-built agents for marketing, sales, development, and more.
            </CardDescription>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.06] border border-white/[0.08]">
            <Store className="h-4 w-4 text-white/60" />
          </div>
        </div>

        <Link
          href="/dashboard/agents"
          className="inline-flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-5 py-3 text-[13px] font-medium text-white/70 hover:text-white hover:bg-white/[0.06] hover:border-white/[0.12] transition-all"
        >
          Browse Agent Store
          <ArrowRight className="h-4 w-4" />
        </Link>
      </Card>
    </div>
  );
}
