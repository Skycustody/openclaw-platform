'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { TrackedDownloadLink } from '@/components/TrackedDownloadLink';
import {
  Download,
  Check,
  ArrowRight,
  ShieldCheck,
  BadgeCheck,
  Terminal,
  MessageSquare,
  Globe,
  Monitor,
  Bot,
  Clock,
  ChevronRight,
  ExternalLink,
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
    quote: "I replaced three different tools with Valnaa Desktop. OpenClaw handles my Telegram bot, research, and files — all from one app.",
    name: 'Marcus R.',
    role: 'Indie Developer',
  },
  {
    quote: "The zero-setup experience is real. Downloaded, signed in, and had OpenClaw and NemoClaw running on my Mac in under two minutes.",
    name: 'Sarah K.',
    role: 'Product Manager',
  },
  {
    quote: "My own API keys and everything local — client data never touches anyone else's servers. That's non-negotiable for consulting.",
    name: 'James L.',
    role: 'Security Consultant',
  },
  {
    quote: "Browser automation from the desktop app is incredibly powerful. Scraping, forms, workflows — all private on my laptop.",
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

const RESEARCH_ROWS = [
  { year: '2026', item: 'Signed macOS & Windows builds', status: 'Shipped' },
  { year: '2026', item: 'NemoClaw + OpenShell dashboard', status: 'Shipped' },
  { year: '2025', item: 'One-click OpenClaw install', status: 'Shipped' },
  { year: '2025', item: 'Browser relay for Chrome', status: 'Shipped' },
  { year: '2024', item: 'Valnaa cloud gateway', status: 'Shipped' },
];

const FEATURE_ROWS = [
  {
    kicker: 'Gateway',
    title: 'OpenClaw Control UI, embedded in the app',
    body: 'Chat with your gateway, manage channels, skills, cron jobs, and sessions — the same dashboard you get in the browser, running inside Valnaa Desktop.',
    link: { href: '/', label: 'Explore Valnaa cloud' },
    reverse: false,
  },
  {
    kicker: 'NemoClaw',
    title: 'Sandboxes, providers, and terminal — locally',
    body: 'Wire NVIDIA NemoClaw with OpenShell: gateways, sandboxes, browser relay, and a full terminal without leaving the window.',
    link: { href: 'https://github.com/Skycustody/valnaa-desktop/releases', label: 'See releases' },
    reverse: true,
  },
];

const APP_TABS = [
  { key: 'chat', label: 'Chat', icon: MessageSquare, src: '/app-screenshots/chat.png' },
  { key: 'dashboard', label: 'Dashboard', icon: Monitor, src: '/app-screenshots/dashboard.png' },
  { key: 'browser', label: 'Browser', icon: Globe, src: '/app-screenshots/browser.png' },
  { key: 'terminal', label: 'Terminal', icon: Terminal, src: '/app-screenshots/terminal.png' },
] as const;

function AppPreview() {
  const [activeTab, setActiveTab] = useState<string>('chat');
  const current = APP_TABS.find((t) => t.key === activeTab) ?? APP_TABS[0];

  return (
    <div className="mx-auto w-full max-w-[1100px] px-6">
      <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c0c0c] shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_24px_80px_-20px_rgba(0,0,0,0.7)]">
        <div className="flex flex-wrap items-center gap-1 border-b border-white/[0.06] bg-[#111] px-3 py-2 sm:px-4">
          {APP_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors',
                activeTab === tab.key
                  ? 'bg-white/[0.08] text-white'
                  : 'text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300'
              )}
            >
              <tab.icon className="size-3.5 opacity-70" />
              {tab.label}
            </button>
          ))}
        </div>
        <div className="relative aspect-[16/10] w-full">
          <Image
            src={current.src}
            alt={`Valnaa Desktop — ${current.label}`}
            fill
            className="object-cover object-top"
            priority
          />
        </div>
      </div>
      <p className="mt-5 text-center text-[13px] text-zinc-500">
        Interactive preview — OpenClaw &amp; NemoClaw running locally
      </p>
    </div>
  );
}

function useMacDownloadUrl() {
  const [url, setUrl] = useState(DOWNLOAD_MAC_ARM);
  useEffect(() => {
    async function detect() {
      try {
        const ua = (navigator as any).userAgentData;
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
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-100 antialiased">
      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#0a0a0a]/80 backdrop-blur-xl">
        <nav className="mx-auto flex h-14 max-w-[1200px] items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-[15px] font-medium text-zinc-100 hover:text-white">
            <Image src="/favicon.png" alt="" width={22} height={22} className="rounded-md" />
            Valnaa
          </Link>
          <div className="flex items-center gap-1 sm:gap-2">
            <Link
              href="/#pricing"
              className="hidden px-3 py-2 text-[14px] text-zinc-400 transition-colors hover:text-white sm:inline"
            >
              Cloud
            </Link>
            <Link href="/auth/login" className="px-3 py-2 text-[14px] text-zinc-400 transition-colors hover:text-white">
              Sign in
            </Link>
            <TrackedDownloadLink href={macUrl} trackEvent="download_click_nav">
              <Button size="sm" className="h-9 rounded-full bg-white px-4 text-[14px] font-medium text-black hover:bg-zinc-200">
                Download
              </Button>
            </TrackedDownloadLink>
          </div>
        </nav>
      </header>

      {/* Hero — Cursor-style large headline + primary / secondary CTAs */}
      <section className="relative border-b border-white/[0.06] px-6 pb-16 pt-20 sm:pb-24 sm:pt-28">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_45%_at_50%_-10%,rgba(255,255,255,0.06),transparent_55%)]"
        />
        <div className="relative mx-auto max-w-[820px] text-center">
          <h1 className="text-balance text-[2.25rem] font-medium leading-[1.12] tracking-[-0.03em] text-white sm:text-5xl sm:leading-[1.08] md:text-6xl md:leading-[1.05]">
            Built to run OpenClaw and NemoClaw on your own machine, Valnaa Desktop is the best way to use them locally.
          </h1>
          <p className="mx-auto mt-6 max-w-lg text-[17px] leading-relaxed text-zinc-400">
            One-click setup. No terminal. Apple Notarized and Microsoft signed. Free trial — no card.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
            <TrackedDownloadLink href={macUrl} trackEvent="download_click_mac" className="group w-full sm:w-auto">
              <Button className="h-12 w-full rounded-full bg-white px-6 text-[15px] font-medium text-black hover:bg-zinc-200 sm:w-auto">
                <AppleLogo className="size-[18px]" />
                Download for macOS
                <Download className="size-4 opacity-60 group-hover:opacity-100" />
              </Button>
            </TrackedDownloadLink>
            <TrackedDownloadLink href={DOWNLOAD_WIN} trackEvent="download_click_win" className="w-full sm:w-auto">
              <Button
                variant="outline"
                className="h-12 w-full rounded-full border-white/15 bg-transparent px-6 text-[15px] font-medium text-white hover:bg-white/[0.06] sm:w-auto"
              >
                <svg className="size-[18px]" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
                </svg>
                Download for Windows
              </Button>
            </TrackedDownloadLink>
          </div>
          <Link
            href="/#pricing"
            className="mt-6 inline-flex items-center gap-1 text-[15px] text-zinc-500 transition-colors hover:text-zinc-300"
          >
            Try hosted OpenClaw instead <ArrowRight className="size-4" />
          </Link>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-[13px] text-zinc-500">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="size-3.5 text-emerald-500/80" />
              Apple Notarized
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="size-3.5 text-sky-500/80" />
              Microsoft signed
            </span>
            <span className="flex items-center gap-1.5">
              <BadgeCheck className="size-3.5" />
              Free trial
            </span>
          </div>
        </div>

        <div className="relative mx-auto mt-20 max-w-[900px]">
          <AppPreview />
        </div>

        {/* Research table — Cursor homepage rhythm */}
        <div className="mx-auto mt-20 max-w-[640px] px-2">
          <p className="mb-6 text-center text-[15px] leading-relaxed text-zinc-500">
            Local AI agents are changing how people work. We ship installers, signing, and updates so you can focus on OpenClaw — not DevOps.
          </p>
          <div className="overflow-hidden rounded-xl border border-white/[0.08]">
            <table className="w-full text-left text-[13px]">
              <tbody>
                {RESEARCH_ROWS.map((row) => (
                  <tr key={row.item} className="border-b border-white/[0.06] last:border-0">
                    <td className="w-16 px-4 py-3 font-mono text-zinc-500">{row.year}</td>
                    <td className="px-2 py-3 text-zinc-300">{row.item}</td>
                    <td className="px-4 py-3 text-right text-zinc-500">{row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section className="border-b border-white/[0.06]">
        <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-0 md:grid-cols-3">
          {[
            { title: 'No terminal', desc: 'Node.js and OpenClaw install automatically' },
            { title: 'Cloud sign-in', desc: 'Use your Valnaa account from the desktop app' },
            { title: 'Runs locally', desc: 'Your stack on your hardware — private and fast' },
          ].map((item, i) => (
            <div
              key={item.title}
              className={cn('px-8 py-12 text-center md:text-left', i > 0 && 'md:border-l md:border-white/[0.06]')}
            >
              <p className="text-[15px] font-medium text-white">{item.title}</p>
              <p className="mt-2 text-[14px] leading-relaxed text-zinc-500">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Trusted heading + feature rows */}
      <section className="border-b border-white/[0.06] px-6 py-24 md:py-32">
        <div className="mx-auto max-w-[1200px]">
          <h2 className="mx-auto max-w-[720px] text-center text-3xl font-medium tracking-[-0.02em] text-white md:text-4xl md:leading-tight lg:text-[2.75rem]">
            Trusted for serious OpenClaw workflows
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-center text-[16px] text-zinc-500">
            Everything you expect from a native shell around the gateway — tabs, terminal, browser relay, and updates.
          </p>

          <div className="mt-20 space-y-28 md:mt-28 md:space-y-36">
            {FEATURE_ROWS.map((row) => (
              <div
                key={row.title}
                className={cn(
                  'grid items-center gap-12 md:grid-cols-2 md:gap-16',
                  row.reverse && 'md:[&>div:first-child]:order-2'
                )}
              >
                <div>
                  <p className="text-[13px] font-medium uppercase tracking-wider text-zinc-500">{row.kicker}</p>
                  <h3 className="mt-3 text-2xl font-medium tracking-[-0.02em] text-white md:text-3xl">{row.title}</h3>
                  <p className="mt-4 text-[16px] leading-relaxed text-zinc-400">{row.body}</p>
                  <Link
                    href={row.link.href}
                    className="mt-6 inline-flex items-center gap-1 text-[15px] text-white hover:text-zinc-300"
                  >
                    {row.link.label}
                    <ExternalLink className="size-3.5 opacity-70" />
                  </Link>
                </div>
                <div className="rounded-2xl border border-white/[0.08] bg-[#0c0c0c] p-8 md:p-10">
                  <div className="space-y-4 font-mono text-[12px] leading-relaxed text-zinc-500">
                    <p className="text-zinc-400">$ valnaa-desktop</p>
                    <p>→ Checking Node… OK</p>
                    <p>→ OpenClaw gateway on <span className="text-emerald-500/90">:18789</span></p>
                    <p>→ NemoClaw sandboxes ready</p>
                    <p className="pt-2 text-zinc-600">// {row.kicker} connected</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Agent tasks */}
      <section className="border-b border-white/[0.06] px-6 py-24 md:py-32">
        <div className="mx-auto max-w-[1200px]">
          <h2 className="text-center text-3xl font-medium tracking-[-0.02em] text-white md:text-4xl">
            Works in the background
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-center text-[16px] text-zinc-500">
            OpenClaw can browse, message, and schedule — while you keep using your Mac or PC.
          </p>
          <div className="mt-16 grid gap-4 md:grid-cols-3">
            {AGENT_TASKS.map((task) => (
              <div
                key={task.title}
                className="rounded-2xl border border-white/[0.08] bg-[#0c0c0c] p-6 transition-colors hover:border-white/[0.12]"
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[11px] font-medium',
                      task.status === 'Completed' && 'bg-emerald-500/10 text-emerald-400',
                      task.status === 'Running' && 'bg-sky-500/10 text-sky-400',
                      task.status === 'Scheduled' && 'bg-amber-500/10 text-amber-400'
                    )}
                  >
                    {task.status}
                  </span>
                  <span className="flex items-center gap-1 text-[11px] text-zinc-500">
                    <Clock className="size-3" />
                    {task.time}
                  </span>
                </div>
                <h3 className="mt-4 text-[15px] font-medium text-white">{task.title}</h3>
                <ul className="mt-4 space-y-2">
                  {task.steps.map((step) => (
                    <li key={step} className="flex items-start gap-2 text-[13px] text-zinc-500">
                      <span className="mt-1.5 size-1 shrink-0 rounded-full bg-zinc-600" />
                      {step}
                    </li>
                  ))}
                </ul>
                <div className="mt-6 flex items-center justify-between border-t border-white/[0.06] pt-4 text-[11px] text-zinc-500">
                  <span>{task.model}</span>
                  <span className="flex items-center gap-0.5">
                    <Bot className="size-3" />
                    OpenClaw
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="border-b border-white/[0.06] px-6 py-24 md:py-32">
        <div className="mx-auto max-w-[1200px]">
          <h2 className="text-center text-3xl font-medium tracking-[-0.02em] text-white md:text-4xl">
            The new way to run local agents
          </h2>
          <div className="mt-16 grid gap-12 sm:grid-cols-2 sm:gap-x-12 sm:gap-y-16">
            {TESTIMONIALS.map((t) => (
              <blockquote key={t.name} className="border-l-2 border-white/10 pl-6">
                <p className="text-[17px] leading-relaxed text-zinc-300 md:text-lg">&ldquo;{t.quote}&rdquo;</p>
                <footer className="mt-6">
                  <p className="text-[14px] font-medium text-white">{t.name}</p>
                  <p className="text-[13px] text-zinc-500">{t.role}</p>
                </footer>
              </blockquote>
            ))}
          </div>
        </div>
      </section>

      {/* Stay on the frontier — models */}
      <section className="border-b border-white/[0.06] px-6 py-24 md:py-32">
        <div className="mx-auto max-w-[720px] text-center">
          <h2 className="text-3xl font-medium tracking-[-0.02em] text-white md:text-4xl">Bring your own models</h2>
          <p className="mt-4 text-[16px] leading-relaxed text-zinc-500">
            Connect OpenClaw to OpenAI, Anthropic, Google, OpenRouter, and more with your own keys — the desktop app does not proxy your prompts.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-2">
            {['GPT-4o', 'Claude', 'Gemini', 'DeepSeek', 'OpenRouter', 'Local'].map((m) => (
              <span
                key={m}
                className="rounded-full border border-white/[0.1] bg-white/[0.03] px-3 py-1.5 text-[13px] text-zinc-400"
              >
                {m}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="border-b border-white/[0.06] px-6 py-24">
        <div className="mx-auto max-w-md">
          <div className="rounded-2xl border border-white/[0.1] bg-[#0c0c0c] p-8 md:p-10">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Desktop license</p>
            <h2 className="mt-2 text-2xl font-medium text-white">Valnaa Desktop</h2>
            <p className="mt-2 text-[14px] text-zinc-500">OpenClaw + NVIDIA NemoClaw on your computer</p>
            <div className="mt-8 flex items-baseline gap-1">
              <span className="text-5xl font-medium tracking-tight text-white">&euro;{BASE_PRICE}</span>
              <span className="text-lg text-zinc-500">/mo</span>
            </div>
            <p className="mt-1 text-[13px] text-zinc-500">
              + 25% VAT = <span className="text-zinc-400">&euro;{TOTAL_PRICE.toFixed(2)}/mo</span>
            </p>
            <ul className="mt-8 space-y-3 border-t border-white/[0.06] pt-8">
              {INCLUDED.map((item) => (
                <li key={item} className="flex gap-3 text-[14px] text-zinc-400">
                  <Check className="mt-0.5 size-4 shrink-0 text-zinc-500" />
                  {item}
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-col gap-2 sm:flex-row">
              <TrackedDownloadLink href={macUrl} trackEvent="download_click_mac" className="flex-1">
                <Button className="h-11 w-full rounded-full bg-white font-medium text-black hover:bg-zinc-200">
                  <AppleLogo className="size-4" /> Mac
                </Button>
              </TrackedDownloadLink>
              <TrackedDownloadLink href={DOWNLOAD_WIN} trackEvent="download_click_win" className="flex-1">
                <Button
                  variant="outline"
                  className="h-11 w-full rounded-full border-white/15 font-medium text-white hover:bg-white/[0.06]"
                >
                  Windows
                </Button>
              </TrackedDownloadLink>
            </div>
            <p className="mt-4 text-center text-[12px] text-zinc-600">1-day trial — no card</p>
          </div>
        </div>
      </section>

      {/* Cloud vs Desktop */}
      <section className="border-b border-white/[0.06] px-6 py-24">
        <div className="mx-auto max-w-[1000px]">
          <h2 className="text-center text-3xl font-medium text-white md:text-4xl">Cloud or desktop</h2>
          <p className="mx-auto mt-3 max-w-md text-center text-zinc-500">Separate subscriptions. Use both if you want.</p>
          <div className="mt-12 grid gap-4 md:grid-cols-2">
            {[
              {
                title: 'Cloud (VPS)',
                price: 'From $15/mo',
                features: [
                  'Runs 24/7 on a server',
                  'Always-on channels',
                  'Managed updates',
                  'Includes AI credits',
                ],
                cta: { label: 'View plans', href: '/#pricing' },
                download: false,
              },
              {
                title: 'Desktop',
                price: `€${TOTAL_PRICE.toFixed(2)}/mo incl. VAT`,
                features: [
                  'Runs on your machine',
                  'Data stays local',
                  'Your API keys',
                  'Terminal & browser relay',
                ],
                cta: { label: 'Download', href: '__MAC__' },
                download: true,
                highlight: true,
              },
            ].map((col) => (
              <div
                key={col.title}
                className={cn(
                  'flex flex-col rounded-2xl border p-8',
                  col.highlight ? 'border-white/20 bg-white/[0.03]' : 'border-white/[0.08] bg-[#0c0c0c]'
                )}
              >
                <h3 className="text-lg font-medium text-white">{col.title}</h3>
                <p className="mt-1 text-[14px] text-zinc-500">{col.price}</p>
                <ul className="mt-6 flex-1 space-y-2">
                  {col.features.map((f) => (
                    <li key={f} className="flex gap-2 text-[14px] text-zinc-400">
                      <Check className="mt-0.5 size-4 shrink-0 text-zinc-600" />
                      {f}
                    </li>
                  ))}
                </ul>
                {col.download ? (
                  <TrackedDownloadLink href={macUrl} trackEvent="download_click_comparison" className="mt-8">
                    <Button className="w-full rounded-full bg-white font-medium text-black hover:bg-zinc-200">
                      {col.cta.label} <ArrowRight className="size-4" />
                    </Button>
                  </TrackedDownloadLink>
                ) : (
                  <Link href={col.cta.href} className="mt-8">
                    <Button variant="outline" className="w-full rounded-full border-white/15 text-white hover:bg-white/[0.06]">
                      {col.cta.label} <ArrowRight className="size-4" />
                    </Button>
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Changelog */}
      <section className="border-b border-white/[0.06] px-6 py-24">
        <div className="mx-auto max-w-[640px]">
          <h2 className="text-3xl font-medium text-white">Changelog</h2>
          <ul className="mt-10 space-y-0 divide-y divide-white/[0.06] border-t border-white/[0.06]">
            {CHANGELOG.map((entry) => (
              <li key={entry.title} className="flex flex-col gap-1 py-5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                <div>
                  <p className="text-[15px] font-medium text-white">{entry.title}</p>
                  <p className="mt-1 text-[14px] text-zinc-500">{entry.desc}</p>
                </div>
                <time className="shrink-0 text-[13px] text-zinc-600">{entry.date}</time>
              </li>
            ))}
          </ul>
          <Link
            href="https://github.com/Skycustody/valnaa-desktop/releases"
            className="mt-8 inline-flex items-center gap-1 text-[14px] text-zinc-500 hover:text-white"
          >
            See all releases <ChevronRight className="size-4" />
          </Link>
        </div>
      </section>

      {/* Security */}
      <section className="border-b border-white/[0.06] px-6 py-24">
        <div className="mx-auto max-w-[900px] text-center">
          <h2 className="text-3xl font-medium text-white md:text-4xl">Signed &amp; notarized</h2>
          <p className="mx-auto mt-4 max-w-lg text-zinc-500">
            macOS builds pass Apple notarization. Windows builds use Azure Trusted Signing.
          </p>
          <div className="mt-12 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/[0.08] bg-[#0c0c0c] p-6 text-left">
              <div className="flex items-center gap-3">
                <AppleLogo className="size-6 text-zinc-400" />
                <div>
                  <p className="font-medium text-white">Apple</p>
                  <p className="text-[13px] text-zinc-500">Developer ID + notary</p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-white/[0.08] bg-[#0c0c0c] p-6 text-left">
              <div className="flex items-center gap-3">
                <svg className="size-6 text-zinc-400" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
                </svg>
                <div>
                  <p className="font-medium text-white">Microsoft</p>
                  <p className="text-[13px] text-zinc-500">Trusted Signing</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-b border-white/[0.06] px-6 py-24">
        <div className="mx-auto max-w-[640px]">
          <h2 className="text-center text-3xl font-medium text-white">Questions</h2>
          <div className="mt-12 divide-y divide-white/[0.06]">
            {[
              {
                q: 'Do I need a cloud subscription?',
                a: 'No. Desktop has its own plan.',
              },
              {
                q: 'After the trial?',
                a: '€5/mo + VAT. Cancel anytime.',
              },
              {
                q: 'API keys?',
                a: 'Yes — bring your own from OpenAI, Anthropic, Google, or OpenRouter.',
              },
              {
                q: 'Both cloud and desktop?',
                a: 'Yes. Separate products; use cloud for 24/7 and desktop for local work.',
              },
              {
                q: 'Platforms?',
                a: 'macOS (Intel & Apple Silicon) and Windows 10/11.',
              },
            ].map((item) => (
              <div key={item.q} className="py-8 first:pt-0">
                <h3 className="text-[15px] font-medium text-white">{item.q}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-zinc-500">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="px-6 py-24">
        <div className="mx-auto max-w-[640px] text-center">
          <h2 className="text-3xl font-medium text-white md:text-4xl">Try Valnaa Desktop</h2>
          <p className="mt-4 text-zinc-500">1-day free trial. Then €{BASE_PRICE}/mo + VAT.</p>
          <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
            <TrackedDownloadLink href={macUrl} trackEvent="download_click_cta_mac">
              <Button className="h-12 rounded-full bg-white px-8 font-medium text-black hover:bg-zinc-200">
                <AppleLogo className="size-4" /> Download for macOS
              </Button>
            </TrackedDownloadLink>
            <TrackedDownloadLink href={DOWNLOAD_WIN} trackEvent="download_click_cta_win">
              <Button
                variant="outline"
                className="h-12 rounded-full border-white/15 px-8 font-medium text-white hover:bg-white/[0.06]"
              >
                Download for Windows
              </Button>
            </TrackedDownloadLink>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/[0.06] px-6 py-16">
        <div className="mx-auto grid max-w-[1200px] gap-10 sm:grid-cols-2 md:grid-cols-4">
          <div>
            <div className="flex items-center gap-2">
              <Image src="/favicon.png" alt="" width={20} height={20} className="rounded-md" />
              <span className="font-medium text-white">Valnaa</span>
            </div>
            <p className="mt-3 text-[13px] text-zinc-500">OpenClaw hosting &amp; desktop.</p>
          </div>
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wider text-zinc-500">Product</p>
            <ul className="mt-4 space-y-2 text-[14px]">
              <li>
                <Link href="/" className="text-zinc-400 hover:text-white">
                  Home
                </Link>
              </li>
              <li>
                <Link href="/desktop" className="text-zinc-400 hover:text-white">
                  Desktop
                </Link>
              </li>
              <li>
                <Link href="/#pricing" className="text-zinc-400 hover:text-white">
                  Cloud pricing
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wider text-zinc-500">Resources</p>
            <ul className="mt-4 space-y-2 text-[14px]">
              <li>
                <a
                  href="https://github.com/Skycustody/valnaa-desktop/releases"
                  className="text-zinc-400 hover:text-white"
                >
                  Releases
                </a>
              </li>
              <li>
                <Link href="/auth/login" className="text-zinc-400 hover:text-white">
                  Sign in
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wider text-zinc-500">Legal</p>
            <ul className="mt-4 space-y-2 text-[14px]">
              <li>
                <Link href="/terms" className="text-zinc-400 hover:text-white">
                  Terms
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="text-zinc-400 hover:text-white">
                  Privacy
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <p className="mx-auto mt-14 max-w-[1200px] text-[13px] text-zinc-600">&copy; {new Date().getFullYear()} Valnaa</p>
      </footer>
    </div>
  );
}
