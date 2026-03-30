'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { TrackedDownloadLink } from '@/components/TrackedDownloadLink';
import { GlowingEffect } from '@/components/ui/glowing-effect';
import {
  Download,
  Check,
  ArrowRight,
  Shield,
  ShieldCheck,
  BadgeCheck,
  WifiOff,
  Terminal,
  Brain,
  MessageSquare,
  Globe,
  Monitor,
  Zap,
  Sparkles,
  Bot,
  Clock,
  FileText,
  Search,
  Code,
  Send,
  ChevronRight,
} from 'lucide-react';

function AppleLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 814 1000" fill="currentColor">
      <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57.8-155.5-127.4c-58.3-81.3-105.9-207.5-105.9-328.1 0-193 125.5-295.3 249.1-295.3 65.6 0 120.3 43.1 161.5 43.1 39.2 0 100.2-45.7 174.5-45.7 28.2 0 129.6 2.6 196.4 99.4zm-141.1-136.3c31.2-36.9 53.4-88.1 53.4-139.3 0-7.1-.6-14.3-1.9-20.1-50.9 1.9-110.8 33.8-147.1 75.8-28.9 32.5-57.8 83.8-57.8 135.6 0 7.8.6 15.6 1.3 18.2 2.6.6 6.4 1.3 10.2 1.3 45.7 0 103.1-30.4 141.9-71.5z" />
    </svg>
  );
}

const DOWNLOAD_BASE = 'https://github.com/Skycustody/valnaa-desktop/releases/latest';
const DOWNLOAD_MAC_ARM = `${DOWNLOAD_BASE}/download/Valnaa-arm64.dmg`;
const DOWNLOAD_MAC_INTEL = `${DOWNLOAD_BASE}/download/Valnaa-x64.dmg`;
const DOWNLOAD_WIN = `${DOWNLOAD_BASE}/download/Valnaa-Setup.exe`;

const BASE_PRICE = 5;
const VAT_RATE = 0.25;
const TOTAL_PRICE = BASE_PRICE + BASE_PRICE * VAT_RATE;

const FEATURES = [
  {
    icon: Terminal,
    title: 'Full OpenClaw locally',
    desc: 'Run the complete OpenClaw agent on your own machine — same power as the cloud version.',
  },
  {
    icon: Shield,
    title: 'Private & secure',
    desc: 'Everything stays on your computer. No data leaves your machine unless you want it to.',
  },
  {
    icon: WifiOff,
    title: 'Works offline',
    desc: 'Use local models or cached responses without an internet connection.',
  },
  {
    icon: Brain,
    title: '20+ AI models',
    desc: 'Connect to GPT-4o, Claude, Gemini, DeepSeek, and more via your own API keys.',
  },
  {
    icon: MessageSquare,
    title: 'All messaging apps',
    desc: 'Connect Telegram, Discord, Slack, and WhatsApp — your agent responds 24/7.',
  },
  {
    icon: Globe,
    title: 'Built-in browser',
    desc: 'Your agent can browse the web, fill forms, and scrape data locally.',
  },
];

const INCLUDED = [
  'One-click install — no terminal needed',
  'Automatic Node.js & OpenClaw setup',
  'Built-in interactive terminal',
  'Browser extension for web agent',
  'All OpenClaw skills & tools',
  'Automatic updates',
  '1-day free trial',
];

const AGENT_TASKS = [
  {
    title: 'Research competitor pricing',
    status: 'Completed',
    time: '3m 12s',
    steps: ['Searched 8 websites', 'Extracted pricing tables', 'Generated comparison spreadsheet'],
    model: 'GPT-4o',
  },
  {
    title: 'Monitor Hacker News for mentions',
    status: 'Running',
    time: '24/7',
    steps: ['Watching front page', 'Filtering for keywords', 'Sending Telegram alerts'],
    model: 'Claude Sonnet',
  },
  {
    title: 'Summarize daily emails',
    status: 'Scheduled',
    time: 'Every 8am',
    steps: ['Read inbox via IMAP', 'Categorize by priority', 'Send digest to Slack'],
    model: 'Gemini Pro',
  },
];

const TESTIMONIALS = [
  {
    quote: "I replaced three different tools with Valnaa Desktop. The local agent handles my Telegram bot, does research, and manages files — all from one app.",
    name: 'Marcus R.',
    role: 'Indie Developer',
  },
  {
    quote: "The zero-setup experience is real. Downloaded, signed in, and had an AI agent running on my Mac in under 2 minutes. No terminal, no Docker, nothing.",
    name: 'Sarah K.',
    role: 'Product Manager',
  },
  {
    quote: "Being able to use my own API keys and run everything locally means my client data never touches anyone else's servers. That's a dealbreaker for consulting.",
    name: 'James L.',
    role: 'Security Consultant',
  },
  {
    quote: "The built-in browser automation is incredibly powerful. My agent scrapes data, fills forms, and navigates complex workflows — all running privately on my laptop.",
    name: 'Elena M.',
    role: 'Data Analyst',
  },
];

const CHANGELOG = [
  { date: 'Mar 25, 2026', title: 'WSL auto-setup improvements', desc: 'Better detection, no UAC flash' },
  { date: 'Mar 19, 2026', title: 'Browser automation v2', desc: 'Faster page loads, form filling' },
  { date: 'Mar 11, 2026', title: 'Multi-model support', desc: 'Switch models mid-conversation' },
  { date: 'Mar 5, 2026', title: 'Scheduled tasks', desc: 'Cron-style recurring agent runs' },
];

function useMacDownloadUrl() {
  const [url, setUrl] = useState(DOWNLOAD_MAC_ARM);
  useEffect(() => {
    async function detect() {
      try {
        const ua = navigator.userAgentData;
        if (ua?.getHighEntropyValues) {
          const { architecture } = await ua.getHighEntropyValues(['architecture']);
          if (architecture === 'x86') setUrl(DOWNLOAD_MAC_INTEL);
          return;
        }
      } catch {}
      if (/Intel Mac/i.test(navigator.userAgent)) {
        setUrl(DOWNLOAD_MAC_INTEL);
      }
    }
    if (/Mac/i.test(navigator.userAgent)) detect();
  }, []);
  return url;
}

export default function DesktopPage() {
  const macUrl = useMacDownloadUrl();
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-transparent bg-background/80 backdrop-blur-lg supports-[backdrop-filter]:bg-background/50">
        <nav className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2.5 rounded-md p-2 hover:bg-accent">
            <Image src="/favicon.png" alt="Valnaa" width={20} height={20} className="rounded-sm" />
            <span className="text-sm font-semibold tracking-tight">Valnaa</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/#pricing" className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline">
              Cloud Plans
            </Link>
            <Link href="/auth/login">
              <Button variant="outline" size="sm">Sign In</Button>
            </Link>
            <TrackedDownloadLink href={macUrl} trackEvent="download_click_nav">
              <Button size="sm">Download</Button>
            </TrackedDownloadLink>
          </div>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative mx-auto max-w-5xl overflow-hidden">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(250,250,250,0.04),transparent_60%)]" />
        <div className="relative flex flex-col items-center justify-center gap-6 px-4 pt-28 pb-20 sm:pt-36 sm:pb-24">
          <div
            className={cn(
              'mx-auto flex w-fit items-center gap-2 rounded-full border bg-card px-3 py-1 shadow',
              'fade-in slide-in-from-bottom-10 animate-in fill-mode-backwards transition-all delay-500 duration-500 ease-out'
            )}
          >
            <Monitor className="size-3 text-muted-foreground" />
            <span className="text-xs">Desktop App — runs locally on your machine</span>
          </div>

          <h1 className="fade-in slide-in-from-bottom-10 animate-in max-w-3xl text-balance fill-mode-backwards text-center text-4xl font-bold tracking-tight delay-100 duration-500 ease-out sm:text-5xl lg:text-[3.5rem] lg:leading-[1.1]">
            OpenClaw + NemoClaw,{' '}
            <span className="text-muted-foreground">running on your computer</span>
          </h1>

          <p className="fade-in slide-in-from-bottom-10 mx-auto max-w-xl animate-in fill-mode-backwards text-center text-base leading-relaxed tracking-wide text-foreground/60 delay-200 duration-500 ease-out sm:text-lg">
            One-click install. Private, fast, and always available.
            No terminal needed — everything is automatic.
          </p>

          <div className="fade-in slide-in-from-bottom-10 flex animate-in flex-row flex-wrap items-center justify-center gap-3 fill-mode-backwards pt-2 delay-300 duration-500 ease-out">
            <TrackedDownloadLink href={macUrl} trackEvent="download_click_mac" className="group">
              <Button className="rounded-full" size="lg">
                <AppleLogo className="size-5" />
                Download for Mac
                <Download className="size-4 opacity-50 transition-opacity group-hover:opacity-100" />
              </Button>
            </TrackedDownloadLink>
            <TrackedDownloadLink href={DOWNLOAD_WIN} trackEvent="download_click_win" className="group">
              <Button className="rounded-full" size="lg" variant="secondary">
                <svg className="size-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
                </svg>
                Download for Windows
              </Button>
            </TrackedDownloadLink>
          </div>

          <div className="fade-in animate-in flex flex-wrap items-center justify-center gap-5 fill-mode-backwards pt-1 delay-500 duration-500 ease-out">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5 text-green-400" />
              <span>Apple Notarized</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5 text-blue-400" />
              <span>Microsoft Signed</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <BadgeCheck className="size-3.5 text-muted-foreground" />
              <span>Free trial — no card needed</span>
            </div>
          </div>
        </div>
      </section>

      {/* Product demo / App preview */}
      <section className="relative mx-auto max-w-5xl px-6 pb-24">
        <div className="fade-in animate-in fill-mode-backwards delay-700 duration-700 ease-out">
          <div className="relative rounded-[1.25rem] border-[0.75px] border-border p-2 md:rounded-[1.5rem] md:p-3">
            <GlowingEffect spread={60} glow={true} disabled={false} proximity={80} inactiveZone={0.01} borderWidth={2} />
            <div className="relative overflow-hidden rounded-xl border-[0.75px] border-border bg-[#0a0a0a]">
              {/* Window chrome */}
              <div className="flex items-center gap-2 border-b border-border/50 bg-[#111] px-4 py-3">
                <div className="flex gap-1.5">
                  <div className="h-3 w-3 rounded-full bg-[#ff5f57]" />
                  <div className="h-3 w-3 rounded-full bg-[#febc2e]" />
                  <div className="h-3 w-3 rounded-full bg-[#28c840]" />
                </div>
                <div className="ml-4 flex-1 rounded-md bg-[#1a1a1a] px-3 py-1">
                  <span className="text-xs text-muted-foreground/60">Valnaa Desktop</span>
                </div>
              </div>
              {/* App mockup content */}
              <div className="grid grid-cols-1 md:grid-cols-[240px_1fr]">
                {/* Sidebar */}
                <div className="hidden border-r border-border/30 bg-[#0d0d0d] p-4 md:block">
                  <div className="mb-6 flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-foreground/20 to-foreground/5" />
                    <div>
                      <p className="text-xs font-medium text-foreground/80">My Agent</p>
                      <p className="text-[10px] text-muted-foreground">Running · GPT-4o</p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    {['Chat', 'Skills', 'Channels', 'Browser', 'Terminal', 'Settings'].map((item, i) => (
                      <div
                        key={item}
                        className={cn(
                          'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs',
                          i === 0 ? 'bg-foreground/10 text-foreground' : 'text-muted-foreground'
                        )}
                      >
                        {i === 0 && <MessageSquare className="size-3" />}
                        {i === 1 && <Zap className="size-3" />}
                        {i === 2 && <Send className="size-3" />}
                        {i === 3 && <Globe className="size-3" />}
                        {i === 4 && <Terminal className="size-3" />}
                        {i === 5 && <Code className="size-3" />}
                        {item}
                      </div>
                    ))}
                  </div>
                  <div className="mt-6 rounded-lg border border-border/30 bg-[#111] p-3">
                    <p className="text-[10px] font-medium text-muted-foreground">Connected</p>
                    <div className="mt-2 space-y-1.5">
                      {['Telegram', 'Discord', 'Slack'].map((ch) => (
                        <div key={ch} className="flex items-center gap-1.5">
                          <div className="h-1.5 w-1.5 rounded-full bg-green-400" />
                          <span className="text-[10px] text-foreground/60">{ch}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                {/* Main chat area */}
                <div className="flex flex-col p-6">
                  <div className="space-y-4">
                    <div className="flex gap-3">
                      <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-foreground/10">
                        <Bot className="size-3.5 text-foreground/60" />
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm text-foreground/80">I&apos;ll research competitor pricing for you. Let me browse their websites and compile the data.</p>
                        <div className="rounded-lg border border-border/30 bg-[#111] p-3">
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                            <Search className="size-3" />
                            <span>Browsing competitor-a.com/pricing...</span>
                          </div>
                          <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
                            <Search className="size-3" />
                            <span>Browsing competitor-b.com/pricing...</span>
                          </div>
                          <div className="mt-2 flex items-center gap-2 text-[10px] text-green-400/70">
                            <Check className="size-3" />
                            <span>Found pricing data from 5 competitors</span>
                          </div>
                        </div>
                        <div className="rounded-lg border border-border/30 bg-[#111] p-3">
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                            <FileText className="size-3" />
                            <span>Generated comparison_report.csv</span>
                          </div>
                        </div>
                        <p className="text-sm text-foreground/80">Done! I found pricing from 5 competitors. Here&apos;s the breakdown — Competitor A is 40% more expensive for the same features.</p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-8 flex items-center gap-2 rounded-xl border border-border/30 bg-[#111] px-4 py-3">
                    <span className="flex-1 text-sm text-muted-foreground/40">Ask your agent anything...</span>
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-foreground/10">
                      <ArrowRight className="size-3.5 text-foreground/40" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground/50">
          Valnaa Desktop running an OpenClaw agent locally
        </p>
      </section>

      {/* Trust badges */}
      <section className="border-t border-border">
        <div className="mx-auto grid max-w-4xl grid-cols-1 gap-0 divide-border sm:grid-cols-3 sm:divide-x">
          {[
            { title: 'No terminal', desc: 'Installs Node.js and OpenClaw automatically' },
            { title: 'Cloud auth', desc: 'Sign in with your Valnaa account' },
            { title: 'Runs locally', desc: 'Your agent on your machine — private and fast' },
          ].map((item) => (
            <div key={item.title} className="px-8 py-8 text-center">
              <p className="text-sm font-semibold text-foreground">{item.title}</p>
              <p className="mt-1.5 text-sm text-muted-foreground">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Agent workflows — like Cursor's agent task cards */}
      <section className="relative mx-auto max-w-5xl border-t border-border px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            <Bot className="size-3" />
            Agent in action
          </div>
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Runs tasks autonomously</h2>
          <p className="mt-3 text-base text-muted-foreground">
            Give your agent a task and it handles everything — browsing, files, messaging, scheduling.
          </p>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-4 md:grid-cols-3">
          {AGENT_TASKS.map((task) => (
            <div key={task.title} className="min-h-[16rem]">
              <div className="relative h-full rounded-[1.25rem] border-[0.75px] border-border p-2 md:rounded-[1.5rem] md:p-3">
                <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} borderWidth={3} />
                <div className="relative flex h-full flex-col overflow-hidden rounded-xl border-[0.75px] border-border bg-background p-5">
                  <div className="flex items-center justify-between">
                    <span className={cn(
                      'rounded-full px-2 py-0.5 text-[10px] font-medium',
                      task.status === 'Completed' && 'bg-green-500/10 text-green-400',
                      task.status === 'Running' && 'bg-blue-500/10 text-blue-400',
                      task.status === 'Scheduled' && 'bg-amber-500/10 text-amber-400',
                    )}>
                      {task.status}
                    </span>
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Clock className="size-2.5" />
                      {task.time}
                    </span>
                  </div>

                  <h3 className="mt-3 text-sm font-semibold leading-snug">{task.title}</h3>

                  <div className="mt-4 flex-1 space-y-2">
                    {task.steps.map((step, i) => (
                      <div key={step} className="flex items-start gap-2">
                        <div className={cn(
                          'mt-1 h-1.5 w-1.5 shrink-0 rounded-full',
                          task.status === 'Completed' ? 'bg-green-400/60' :
                          task.status === 'Running' && i < 2 ? 'bg-blue-400/60' : 'bg-muted-foreground/30'
                        )} />
                        <span className="text-xs text-muted-foreground">{step}</span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-border/50 pt-3">
                    <span className="text-[10px] text-muted-foreground">{task.model}</span>
                    <div className="flex items-center gap-1 text-[10px] text-foreground/40">
                      <span>View details</span>
                      <ChevronRight className="size-2.5" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Features grid */}
      <section className="relative mx-auto max-w-5xl border-t border-border px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            <Sparkles className="size-3" />
            Capabilities
          </div>
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Everything you need, locally</h2>
          <p className="mt-3 text-base text-muted-foreground">
            Full OpenClaw power on your own machine. No server, no Docker, no config files.
          </p>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="min-h-[14rem] list-none">
              <div className="relative h-full rounded-[1.25rem] border-[0.75px] border-border p-2 md:rounded-[1.5rem] md:p-3">
                <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} borderWidth={3} />
                <div className="relative flex h-full flex-col justify-between gap-6 overflow-hidden rounded-xl border-[0.75px] bg-background p-6 shadow-sm dark:shadow-[0px_0px_27px_0px_rgba(45,45,45,0.3)]">
                  <div className="relative flex flex-1 flex-col justify-between gap-3">
                    <div className="w-fit rounded-lg border-[0.75px] border-border bg-muted p-2">
                      <f.icon className="h-4 w-4" />
                    </div>
                    <div className="space-y-3">
                      <h3 className="pt-0.5 text-xl font-semibold leading-[1.375rem] tracking-[-0.04em] text-balance text-foreground md:text-2xl md:leading-[1.875rem]">
                        {f.title}
                      </h3>
                      <p className="text-sm leading-[1.125rem] text-muted-foreground md:text-base md:leading-[1.375rem]">
                        {f.desc}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Testimonials — like Cursor's quote carousel */}
      <section className="relative mx-auto max-w-5xl border-t border-border px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Loved by developers</h2>
          <p className="mt-3 text-base text-muted-foreground">
            Real people running real agents on their own machines.
          </p>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {TESTIMONIALS.map((t) => (
            <div key={t.name} className="relative rounded-[1.25rem] border-[0.75px] border-border p-2 md:rounded-[1.5rem] md:p-3">
              <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
              <div className="relative flex h-full flex-col rounded-xl border-[0.75px] border-border bg-background p-6">
                <p className="flex-1 text-sm leading-relaxed text-foreground/70 italic">
                  &ldquo;{t.quote}&rdquo;
                </p>
                <div className="mt-5 flex items-center gap-3 border-t border-border/50 pt-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground/10 text-xs font-semibold text-foreground/60">
                    {t.name.split(' ').map((n) => n[0]).join('')}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-foreground/80">{t.name}</p>
                    <p className="text-[10px] text-muted-foreground">{t.role}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="relative mx-auto max-w-5xl border-t border-border px-6 py-24">
        <div className="mx-auto max-w-lg">
          <div className="relative rounded-[1.25rem] border-[0.75px] border-border p-2 md:rounded-[1.5rem] md:p-3">
            <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} borderWidth={3} />
            <div className={cn(
              'relative flex flex-col rounded-xl border-[0.75px] p-8 bg-background',
              'border-foreground bg-foreground/[0.03] shadow-[0_0_30px_rgba(250,250,250,0.04)]'
            )}>
              <span className="absolute -top-3 left-6 rounded-full bg-foreground px-3 py-0.5 text-[11px] font-semibold text-background">
                Desktop License
              </span>

              <div className="text-center">
                <h2 className="text-2xl font-bold tracking-tight">Valnaa Desktop</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  OpenClaw + NVIDIA NemoClaw on your own computer
                </p>
              </div>

              <div className="mt-6 text-center">
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-5xl font-bold tracking-tight">&euro;{BASE_PRICE}</span>
                  <span className="text-lg text-muted-foreground">/mo</span>
                </div>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  + 25% VAT = <span className="font-medium text-foreground/70">&euro;{TOTAL_PRICE.toFixed(2)}/mo</span>
                </p>
              </div>

              <ul className="mt-8 space-y-3">
                {INCLUDED.map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-foreground/80">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-8 space-y-3">
                <p className="text-center text-sm text-muted-foreground">
                  Download the app, sign in with Google, and your free trial starts automatically.
                </p>
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
                  <TrackedDownloadLink href={macUrl} trackEvent="download_click_mac">
                    <Button size="lg" className="w-full gap-2 sm:w-auto">
                      <AppleLogo className="size-4" /> Download for Mac
                    </Button>
                  </TrackedDownloadLink>
                  <TrackedDownloadLink href={DOWNLOAD_WIN} trackEvent="download_click_win">
                    <Button size="lg" variant="outline" className="w-full gap-2 sm:w-auto">
                      <svg className="size-4" viewBox="0 0 24 24" fill="currentColor"><path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" /></svg>
                      Download for Windows
                    </Button>
                  </TrackedDownloadLink>
                </div>
                <p className="text-center text-xs text-muted-foreground">
                  1-day free trial &mdash; no credit card needed
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Cloud vs Desktop */}
      <section className="relative mx-auto max-w-5xl border-t border-border px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Cloud vs Desktop</h2>
          <p className="mt-3 text-base text-muted-foreground">
            Choose what fits you — or use both. Separate subscriptions.
          </p>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-5 md:grid-cols-2">
          {[
            {
              title: 'Cloud (VPS)',
              price: 'From $15/mo',
              highlight: false,
              features: [
                'Runs 24/7 on a dedicated server',
                'Always-on messaging channels',
                'No local resources needed',
                'Managed & auto-updated',
                'Includes AI credits',
              ],
              cta: { label: 'View cloud plans', href: '/#pricing' },
            },
            {
              title: 'Desktop',
              price: `€${TOTAL_PRICE.toFixed(2)}/mo incl. VAT`,
              highlight: true,
              features: [
                'Runs on your own computer',
                'Full privacy — data stays local',
                'Works offline with local models',
                'Bring your own API keys',
                'Interactive terminal & browser',
              ],
              cta: { label: 'Download & try free', href: '__MAC__', download: true },
            },
          ].map((col) => (
            <div key={col.title} className="min-h-[20rem]">
              <div className="relative h-full rounded-[1.25rem] border-[0.75px] border-border p-2 md:rounded-[1.5rem] md:p-3">
                <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} borderWidth={3} />
                <div className={cn(
                  'relative flex h-full flex-col rounded-xl border-[0.75px] p-7 bg-background',
                  col.highlight
                    ? 'border-foreground bg-foreground/[0.03] shadow-[0_0_30px_rgba(250,250,250,0.04)]'
                    : 'border-border'
                )}>
                  {col.highlight && (
                    <span className="absolute -top-3 left-6 rounded-full bg-foreground px-3 py-0.5 text-[11px] font-semibold text-background">
                      Recommended
                    </span>
                  )}
                  <h3 className="text-lg font-semibold">{col.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{col.price}</p>
                  <ul className="mt-6 flex-1 space-y-2.5">
                    {col.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-sm text-foreground/70">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  {col.cta.download ? (
                    <TrackedDownloadLink href={col.cta.href === '__MAC__' ? macUrl : col.cta.href} trackEvent="download_click_comparison" className="mt-8">
                      <Button variant={col.highlight ? 'default' : 'outline'} className="w-full" size="lg">
                        {col.cta.label} <ArrowRight className="h-4 w-4" />
                      </Button>
                    </TrackedDownloadLink>
                  ) : (
                    <Link href={col.cta.href} className="mt-8">
                      <Button variant="outline" className="w-full" size="lg">
                        {col.cta.label} <ArrowRight className="h-4 w-4" />
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Changelog */}
      <section className="relative mx-auto max-w-5xl border-t border-border px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Changelog</h2>
          <p className="mt-3 text-base text-muted-foreground">
            We ship fast. Here&apos;s what&apos;s new.
          </p>
        </div>

        <div className="mx-auto mt-12 max-w-2xl space-y-0">
          {CHANGELOG.map((entry, i) => (
            <div key={entry.title} className="group relative flex gap-6 pb-8">
              {/* Timeline line */}
              {i < CHANGELOG.length - 1 && (
                <div className="absolute top-5 left-[7px] h-full w-px bg-border" />
              )}
              {/* Dot */}
              <div className="relative mt-1.5 h-[15px] w-[15px] shrink-0">
                <div className="absolute inset-0 rounded-full border border-border bg-background" />
                <div className={cn(
                  'absolute inset-[3px] rounded-full',
                  i === 0 ? 'bg-foreground' : 'bg-muted-foreground/30'
                )} />
              </div>
              {/* Content */}
              <div className="flex-1 pb-4">
                <p className="text-xs text-muted-foreground">{entry.date}</p>
                <h3 className="mt-1 text-sm font-semibold">{entry.title}</h3>
                <p className="mt-0.5 text-sm text-muted-foreground">{entry.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 text-center">
          <Link href="https://github.com/Skycustody/valnaa-desktop/releases" className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
            See all releases <ArrowRight className="size-3" />
          </Link>
        </div>
      </section>

      {/* Signed & Notarized */}
      <section className="mx-auto max-w-5xl border-t border-border px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-green-500/20 bg-green-500/5 px-3 py-1 text-xs text-green-400">
            <ShieldCheck className="size-3" />
            Signed &amp; Notarized
          </div>
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Trusted by Apple &amp; Microsoft</h2>
          <p className="mt-3 text-base text-muted-foreground">
            Every release is cryptographically signed. Your OS trusts it out of the box.
          </p>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-5 sm:grid-cols-2">
          {[
            {
              Icon: AppleLogo,
              title: 'Apple Notarized',
              sub: 'macOS Gatekeeper trusted',
              color: 'text-green-400',
              items: [
                'Signed with Developer ID certificate',
                "Submitted to Apple's notary service",
                'Scanned for malware by Apple',
                'No "unidentified developer" warning',
                'Installs cleanly — just drag & drop',
              ],
              code: '✔ accepted\nsource=Notarized Developer ID\norigin=Developer ID Application:\nMac-Bride Nana Zemkwe (3K5P6R49A5)',
            },
            {
              Icon: ({ className }: { className?: string }) => (
                <svg className={className} viewBox="0 0 24 24" fill="currentColor">
                  <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
                </svg>
              ),
              title: 'Microsoft Signed',
              sub: 'Azure Trusted Signing',
              color: 'text-blue-400',
              items: [
                'Signed via Azure Trusted Signing',
                'Verified publisher identity',
                'No SmartScreen warning',
                'Trusted by Windows Defender',
                'Clean install — no security blocks',
              ],
              code: '✔ signed\npublisher=Nana Zemkwe Mac-Bride\nmethod=Azure Trusted Signing\nprofile=valnaa-signing',
            },
          ].map((col) => (
            <div key={col.title} className="min-h-[20rem]">
              <div className="relative h-full rounded-[1.25rem] border-[0.75px] border-border p-2 md:rounded-[1.5rem] md:p-3">
                <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} borderWidth={3} />
                <div className="relative flex h-full flex-col overflow-hidden rounded-xl border-[0.75px] border-border bg-background p-6 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-muted">
                      <col.Icon className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold">{col.title}</h3>
                      <p className="text-xs text-muted-foreground">{col.sub}</p>
                    </div>
                  </div>
                  <ul className="mt-5 space-y-2.5">
                    {col.items.map((item) => (
                      <li key={item} className="flex items-start gap-2 text-sm text-foreground/70">
                        <Check className={cn('mt-0.5 h-4 w-4 shrink-0', col.color)} />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-5 rounded-lg border border-border bg-background/50 p-3">
                    <p className="whitespace-pre font-mono text-[11px] leading-relaxed text-muted-foreground">
                      <span className={col.color}>{col.code.split('\n')[0]}</span>
                      {'\n' + col.code.split('\n').slice(1).join('\n')}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          Verify signing yourself:{' '}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">codesign -dvv Valnaa.app</code> on Mac or right-click → Properties → Digital Signatures on Windows.
        </p>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-5xl border-t border-border px-6 py-24">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-center text-3xl font-bold tracking-tight md:text-4xl">Questions</h2>
          <div className="mt-12 space-y-4">
            {[
              {
                q: 'Do I need a cloud subscription?',
                a: 'No. The desktop app has its own separate subscription. You don\'t need a cloud VPS plan.',
              },
              {
                q: 'What happens after the free trial?',
                a: 'Your 1-day trial lets you test everything. After that, subscribe at €5/mo + VAT. Cancel anytime.',
              },
              {
                q: 'Do I need my own API keys?',
                a: 'Yes. The desktop app runs OpenClaw locally. Bring your own keys from OpenAI, Anthropic, Google, or OpenRouter.',
              },
              {
                q: 'Can I use both cloud and desktop?',
                a: 'Yes. They are separate products. Use the cloud for always-on agents and the desktop for private, local work.',
              },
              {
                q: 'What operating systems are supported?',
                a: 'macOS (Intel & Apple Silicon) and Windows 10/11. Linux support is coming soon.',
              },
              {
                q: 'Is the app safe to install?',
                a: 'Yes. macOS builds are Apple Notarized. Windows builds are signed via Azure Trusted Signing. No security warnings.',
              },
            ].map((item) => (
              <div key={item.q} className="rounded-xl border border-border bg-card/30 p-5">
                <h3 className="text-sm font-semibold">{item.q}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="mx-auto max-w-3xl px-6 py-24">
        <div className="relative rounded-[1.25rem] border-[0.75px] border-border p-2 md:rounded-[1.5rem] md:p-3">
          <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} borderWidth={3} />
          <div className="relative overflow-hidden rounded-xl border-[0.75px] border-border bg-card p-12 text-center">
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(250,250,250,0.04),transparent_70%)]" />
            <div className="relative">
              <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-secondary">
                <Zap className="h-6 w-6" />
              </div>
              <h2 className="text-2xl font-bold tracking-tight md:text-3xl">Ready to try it?</h2>
              <p className="mt-3 text-base text-muted-foreground">
                1-day free trial. &euro;{BASE_PRICE}/mo + VAT after that. Cancel anytime.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <TrackedDownloadLink href={macUrl} trackEvent="download_click_cta_mac">
                  <Button size="lg" className="rounded-full">
                    <AppleLogo className="size-4" /> Download for Mac <ArrowRight className="h-4 w-4" />
                  </Button>
                </TrackedDownloadLink>
                <TrackedDownloadLink href={DOWNLOAD_WIN} trackEvent="download_click_cta_win">
                  <Button variant="outline" size="lg" className="rounded-full">
                    <svg className="size-4" viewBox="0 0 24 24" fill="currentColor"><path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" /></svg>
                    Download for Windows
                  </Button>
                </TrackedDownloadLink>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
          <div className="flex items-center gap-2">
            <Image src="/favicon.png" alt="Valnaa" width={18} height={18} className="rounded-sm" />
            <span className="text-sm text-muted-foreground">Valnaa Desktop</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Home</Link>
            <Link href="/#pricing" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Cloud Plans</Link>
            <Link href="/terms" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Terms</Link>
            <Link href="/privacy" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
