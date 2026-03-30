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
  BookOpen,
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
  'One click install of OpenClaw and NemoClaw on your machine',
  'Dependencies (e.g. Node) handled for you, no manual terminal setup',
  'Gateway and Control UI always available in the app',
  'Sandbox and NemoClaw views (dashboard, providers, sandboxes)',
  'Integrated terminal, OpenTerm, and shell stay open for NemoClaw permission prompts and log output',
  'Browser relay setup for Chrome and the agent',
  'In app command guide for OpenClaw and NemoClaw',
  'Sign in with Valnaa, updates, 1 day free trial',
];

const ALWAYS_OPEN_PANELS = [
  {
    title: 'Gateway & Control UI',
    icon: MessageSquare,
    points: [
      'OpenClaw gateway stays reachable from the app',
      'Control UI tabs: chat, overview, channels, instances, sessions, usage, cron, agents, skills, nodes',
    ],
  },
  {
    title: 'Sandbox & NemoClaw',
    icon: Monitor,
    points: [
      'NemoClaw dashboard: gateways, providers, sandboxes',
      'Health and status without juggling extra windows',
    ],
  },
  {
    title: 'Terminal, shell & logs',
    icon: Terminal,
    points: [
      'Integrated terminal, OpenTerm, and shell always available',
      'Where NemoClaw surfaces permission prompts',
      'Watch stdout and errors for setup and runtime issues',
    ],
  },
  {
    title: 'Browser relay & command guide',
    icon: BookOpen,
    points: [
      'Browser relay walkthrough (Chrome extension, policy, localhost)',
      'Quick reference for OpenClaw and NemoClaw commands in one place',
    ],
  },
];

const TESTIMONIALS = [
  {
    quote: "It really is one click. OpenClaw and NemoClaw were on my machine without me opening Terminal once. The app did the boring parts.",
    name: 'Marcus R.',
    role: 'Indie Developer',
  },
  {
    quote: "I live in the integrated terminal when NemoClaw asks for permissions or something fails. Logs are right there instead of hunting through folders.",
    name: 'Sarah K.',
    role: 'Product Manager',
  },
  {
    quote: "Browser relay setup was the part I always messed up. Having it guided inside the same window as the gateway sold me.",
    name: 'James L.',
    role: 'Security Consultant',
  },
  {
    quote: "The command guide saves me from tabbing to docs. Gateway, sandbox, terminal: one app, no extra layer pretending to be the agent.",
    name: 'Elena M.',
    role: 'Platform Engineer',
  },
];

const CHANGELOG = [
  { date: 'Mar 25, 2026', title: 'WSL auto setup improvements', desc: 'Better detection, fewer UAC flashes' },
  { date: 'Mar 19, 2026', title: 'Browser relay setup polish', desc: 'Clearer steps for Chrome extension and policy' },
  { date: 'Mar 11, 2026', title: 'Terminal & log focus', desc: 'Easier to keep shell open for NemoClaw prompts' },
  { date: 'Mar 5, 2026', title: 'One click install path', desc: 'OpenClaw + NemoClaw dependency fixes' },
];

const RESEARCH_ROWS = [
  { year: '2026', item: 'Signed macOS & Windows desktop installers', status: 'Shipped' },
  { year: '2026', item: 'Always on terminal for permissions & log tailing', status: 'Shipped' },
  { year: '2025', item: 'One click OpenClaw + NemoClaw local install', status: 'Shipped' },
  { year: '2025', item: 'In app browser relay setup flow', status: 'Shipped' },
  { year: '2025', item: 'OpenClaw and NemoClaw command guide in the shell', status: 'Shipped' },
];

const FEATURE_ROWS = [
  {
    kicker: 'Install',
    title: 'One click. OpenClaw and NemoClaw on your computer.',
    body: 'Valnaa Desktop does not replace OpenClaw or NemoClaw. It installs them, wires dependencies, and opens the tools you need. No separate product on top; no pretending the app is the agent.',
    link: { href: 'https://github.com/Skycustody/valnaa-desktop/releases', label: 'Release notes' },
    reverse: false,
  },
  {
    kicker: 'Operate',
    title: 'Gateway, sandbox, terminal, relay, always in one window.',
    body: 'Keep the Control UI, NemoClaw sandbox views, integrated shell (OpenTerm and terminal), and browser relay instructions available while you work. The terminal stays open so NemoClaw permission prompts and error logs are visible when something needs attention.',
    link: { href: '/', label: 'Valnaa cloud (optional)' },
    reverse: true,
  },
];

const APP_TABS = [
  { key: 'chat', label: 'Chat', icon: MessageSquare, src: '/app-screenshots/chat.png' },
  { key: 'dashboard', label: 'Dashboard', icon: Monitor, src: '/app-screenshots/dashboard.png' },
  { key: 'browser', label: 'Browser', icon: Globe, src: '/app-screenshots/browser.png' },
  { key: 'terminal', label: 'Terminal', icon: Terminal, src: '/app-screenshots/terminal.png' },
] as const;

function AppPreview({ className }: { className?: string }) {
  const [activeTab, setActiveTab] = useState<string>('chat');
  const current = APP_TABS.find((t) => t.key === activeTab) ?? APP_TABS[0];

  return (
    <div className={cn('relative mx-auto w-full max-w-[1100px]', className)}>
      <div className="overflow-hidden rounded-2xl border border-white/[0.12] bg-[#0a0a0a] shadow-[0_32px_120px_-24px_rgba(0,0,0,0.9)] ring-1 ring-white/[0.06]">
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
            alt={`Valnaa Desktop, ${current.label}`}
            fill
            className="object-cover object-top"
            priority
          />
        </div>
      </div>
      <p className="mt-5 text-center text-[13px] text-zinc-500">
        Gateway, sandbox, browser relay, and terminal: same app you get after one click install
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
    <div className="min-h-screen bg-black text-zinc-100 antialiased">
      <header className="sticky top-0 z-50 border-b border-white/[0.08] bg-black/75 backdrop-blur-xl">
        <nav className="relative mx-auto grid h-14 max-w-[1400px] grid-cols-2 items-center px-6 md:grid-cols-3 md:h-16">
          <Link
            href="/"
            className="flex items-center gap-2 justify-self-start text-[13px] font-semibold uppercase tracking-[0.2em] text-white hover:text-zinc-200"
          >
            <Image src="/favicon.png" alt="" width={22} height={22} className="rounded-md" />
            Valnaa
          </Link>
          <div className="hidden items-center justify-center gap-10 text-[14px] text-zinc-500 md:flex">
            <Link href="/#pricing" className="transition-colors hover:text-white">
              Cloud
            </Link>
            <Link href="/pricing" className="transition-colors hover:text-white">
              Pricing
            </Link>
            <Link href="/help" className="transition-colors hover:text-white">
              Help
            </Link>
          </div>
          <div className="flex items-center justify-end gap-1 sm:gap-2">
            <Link href="/auth/login" className="px-2 py-2 text-[14px] text-zinc-400 transition-colors hover:text-white sm:px-3">
              Sign in
            </Link>
            <TrackedDownloadLink href={macUrl} trackEvent="download_click_nav">
              <Button size="sm" className="h-9 rounded-full bg-white px-5 text-[14px] font-medium text-black hover:bg-zinc-200">
                Download
              </Button>
            </TrackedDownloadLink>
          </div>
        </nav>
      </header>

      {/* Hero: Cursor style left aligned copy, large preview below */}
      <section className="relative border-b border-white/[0.08] pb-20 pt-12 sm:pb-28 sm:pt-16 md:pt-20">
        <div className="relative mx-auto max-w-[1400px] px-6">
          <div className="max-w-[min(100%,42rem)] text-left">
            <h1 className="text-[2rem] font-medium leading-[1.08] tracking-[-0.035em] text-white sm:text-[2.75rem] sm:leading-[1.06] md:text-5xl lg:text-[3.25rem] lg:leading-[1.05]">
              Built to install OpenClaw and NemoClaw in one click, Valnaa Desktop is your native gateway shell.
            </h1>
            <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-zinc-500 sm:text-base">
              Gateway, sandbox, terminal, and browser relay in one window. Terminal stays open for NemoClaw permissions and logs. Apple Notarized and Microsoft signed. Free trial, no card.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:mt-10 sm:flex-row sm:items-center sm:gap-4">
              <TrackedDownloadLink href={macUrl} trackEvent="download_click_mac" className="group w-fit">
                <Button className="h-11 rounded-full bg-white px-6 text-[15px] font-medium text-black hover:bg-zinc-200">
                  <AppleLogo className="size-[18px]" />
                  Download for macOS
                  <Download className="size-4 opacity-60 group-hover:opacity-100" />
                </Button>
              </TrackedDownloadLink>
              <TrackedDownloadLink href={DOWNLOAD_WIN} trackEvent="download_click_win" className="w-fit">
                <Button
                  variant="outline"
                  className="h-11 rounded-full border-white/20 bg-transparent px-6 text-[15px] font-medium text-white hover:bg-white/[0.06]"
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
              className="mt-6 inline-flex items-center gap-1 text-[14px] text-zinc-500 transition-colors hover:text-zinc-300"
            >
              Try hosted OpenClaw instead <ArrowRight className="size-4" />
            </Link>
            <div className="mt-8 flex flex-wrap gap-x-8 gap-y-2 text-[13px] text-zinc-600">
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

          <div className="relative mx-auto mt-14 max-w-[1200px] md:mt-20">
            <div
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-1/2 h-[min(90vw,720px)] w-[min(95vw,1100px)] -translate-x-1/2 -translate-y-1/2 rounded-[50%] bg-[radial-gradient(ellipse_at_center,rgba(59,130,246,0.12),rgba(139,92,246,0.06)_40%,transparent_70%)] blur-3xl"
            />
            <AppPreview className="relative z-10" />
          </div>
        </div>

        {/* Research table */}
        <div className="mx-auto mt-24 max-w-[640px] px-6">
          <p className="mb-6 text-left text-[15px] leading-relaxed text-zinc-500 sm:text-center">
            We focus on packaging, signing, and a stable window around the stack so you spend time in OpenClaw and NemoClaw, not fighting setup.
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
            { title: 'One click install', desc: 'OpenClaw and NemoClaw land on your machine with dependencies handled' },
            { title: 'Valnaa sign in', desc: 'Unlock the app with your account; updates ship through the same channel' },
            { title: 'Always open tools', desc: 'Gateway, sandbox views, shell, relay setup, not a separate browser only workflow' },
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
            Install once. Everything you need stays in one window.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-center text-[16px] text-zinc-500">
            After install, the app is the frame around OpenClaw and NemoClaw: Control UI, sandboxes, terminal for permissions and logs, browser relay setup, and a command guide.
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
                    {row.kicker === 'Install' ? (
                      <>
                        <p className="text-zinc-400">Valnaa Desktop</p>
                        <p>→ Install OpenClaw … OK</p>
                        <p>→ Install NemoClaw … OK</p>
                        <p>→ Open gateway <span className="text-emerald-500/90">:18789</span></p>
                        <p className="pt-2 text-zinc-600">// no extra runtime beyond the stack</p>
                      </>
                    ) : (
                      <>
                        <p className="text-zinc-400">Tabs</p>
                        <p>→ Control UI · Sandbox · Terminal</p>
                        <p>→ Browser relay · Command guide</p>
                        <p>→ Shell tail for <span className="text-sky-500/90">permissions and errors</span></p>
                        <p className="pt-2 text-zinc-600">// terminal stays open on purpose</p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What stays open in the app */}
      <section className="border-b border-white/[0.06] px-6 py-24 md:py-32">
        <div className="mx-auto max-w-[1200px]">
          <h2 className="text-center text-3xl font-medium tracking-[-0.02em] text-white md:text-4xl">
            Always available after install
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-[16px] text-zinc-500">
            The desktop app keeps OpenClaw and NemoClaw surfaces in reach: gateway UI, sandbox management, a terminal for permissions and logs, and browser relay setup. Not a separate &ldquo;AI product&rdquo; layer.
          </p>
          <div className="mt-16 grid gap-4 sm:grid-cols-2">
            {ALWAYS_OPEN_PANELS.map((panel) => (
              <div
                key={panel.title}
                className="rounded-2xl border border-white/[0.08] bg-[#0c0c0c] p-6 transition-colors hover:border-white/[0.12]"
              >
                <div className="flex items-center gap-2">
                  <div className="flex size-9 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04]">
                    <panel.icon className="size-4 text-zinc-400" />
                  </div>
                  <h3 className="text-[15px] font-medium text-white">{panel.title}</h3>
                </div>
                <ul className="mt-4 space-y-2">
                  {panel.points.map((pt) => (
                    <li key={pt} className="flex items-start gap-2 text-[13px] leading-relaxed text-zinc-500">
                      <span className="mt-2 size-1 shrink-0 rounded-full bg-zinc-600" />
                      {pt}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="border-b border-white/[0.06] px-6 py-24 md:py-32">
        <div className="mx-auto max-w-[1200px]">
          <h2 className="text-center text-3xl font-medium tracking-[-0.02em] text-white md:text-4xl">
            Built for people who want the real stack locally
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

      {/* Keys and models */}
      <section className="border-b border-white/[0.06] px-6 py-24 md:py-32">
        <div className="mx-auto max-w-[720px] text-center">
          <h2 className="text-3xl font-medium tracking-[-0.02em] text-white md:text-4xl">Keys and models stay in OpenClaw</h2>
          <p className="mt-4 text-[16px] leading-relaxed text-zinc-500">
            Valnaa Desktop installs and hosts the shell around OpenClaw and NemoClaw. Provider keys, models, and agent behavior are configured in OpenClaw and NemoClaw as usual. This app does not replace or proxy that layer.
          </p>
          <p className="mt-6 text-[14px] text-zinc-600">
            Examples you configure in OpenClaw: OpenAI, Anthropic, Google, OpenRouter, local endpoints, same as upstream docs.
          </p>
        </div>
      </section>

      {/* Pricing */}
      <section className="border-b border-white/[0.06] px-6 py-24">
        <div className="mx-auto max-w-md">
          <div className="rounded-2xl border border-white/[0.1] bg-[#0c0c0c] p-8 md:p-10">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Desktop license</p>
            <h2 className="mt-2 text-2xl font-medium text-white">Valnaa Desktop</h2>
            <p className="mt-2 text-[14px] text-zinc-500">One click installer plus gateway, sandbox, terminal, relay, and guides</p>
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
            <p className="mt-4 text-center text-[12px] text-zinc-600">1 day trial, no card</p>
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
                  'Always on channels',
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
                  'One click OpenClaw + NemoClaw install',
                  'Gateway & sandbox UI in the app',
                  'Terminal for permissions & logs',
                  'Browser relay setup & command guide',
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
                q: 'What does Valnaa Desktop actually do?',
                a: 'It installs OpenClaw and NemoClaw on your computer in one click and keeps the gateway, sandbox views, integrated terminal (for NemoClaw permissions and log output), browser relay setup, and an OpenClaw and NemoClaw command guide in one native app. It is not a separate AI product on top.',
              },
              {
                q: 'Do I need a cloud subscription?',
                a: 'No. Desktop billing is separate from hosted Valnaa.',
              },
              {
                q: 'After the trial?',
                a: '€5/mo + VAT. Cancel anytime.',
              },
              {
                q: 'Where do API keys and models live?',
                a: 'In your OpenClaw and NemoClaw configuration as always. The desktop app does not replace that.',
              },
              {
                q: 'Both cloud and desktop?',
                a: 'Yes. Use cloud for a managed gateway; use desktop when you want the stack on your own hardware.',
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
          <p className="mt-4 text-zinc-500">1 day free trial. Then €{BASE_PRICE}/mo + VAT.</p>
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
            <p className="mt-3 text-[13px] text-zinc-500">Hosted OpenClaw plus a one click local installer shell.</p>
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
