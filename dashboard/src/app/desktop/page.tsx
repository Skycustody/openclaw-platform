'use client';

/**
 * Desktop landing: layout and visual rhythm modeled on cursor.com marketing pages.
 * Valnaa copy and assets only. Not affiliated with Cursor.
 */

import { useState, useEffect, type SVGProps } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TrackedDownloadLink } from '@/components/TrackedDownloadLink';
import {
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
  FileText,
  Settings,
} from 'lucide-react';

const BG = '#14120b';
const TEXT = '#f0efea';
const TEXT_SEC = '#9c9a94';

/** Windows four-pane mark (geometric; not an official Microsoft asset file). */
function WindowsLogo({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg className={className} viewBox="0 0 88 88" fill="currentColor" aria-hidden {...props}>
      <path d="M0 0h42v42H0V0zm46 0h42v42H46V0zM0 46h42v42H0V46zm46 0h42v42H46V46z" />
    </svg>
  );
}

function AppleLogo({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg className={className} viewBox="0 0 814 1000" fill="currentColor" {...props}>
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
    title: 'Gateway chat',
    icon: MessageSquare,
    points: [
      'Send messages to your agent through the OpenClaw gateway',
      'Switch models, manage sessions, and see responses as they come in',
    ],
  },
  {
    title: 'Sandbox dashboard',
    icon: Monitor,
    points: [
      'View gateway health, inference providers, and sandbox status',
      'Monitor everything from one place instead of multiple browser tabs',
    ],
  },
  {
    title: 'Terminal and logs',
    icon: Terminal,
    points: [
      'Open a shell into the sandbox or run local commands inside the app',
      'See NemoClaw permission prompts and approve them on the spot',
      'Watch live logs to spot errors during setup or while the agent runs',
    ],
  },
  {
    title: 'Browser relay and commands',
    icon: BookOpen,
    points: [
      'Follow the steps to install the Chrome extension and connect the relay',
      'Look up any OpenClaw or NemoClaw command in the built in reference',
    ],
  },
];

const TESTIMONIALS = [
  {
    quote: "Spent two hours trying to get NemoClaw running manually. k3d kept failing, ports were conflicting, Docker was eating all my RAM. Downloaded Valnaa, clicked NemoClaw, went to make coffee, came back and it was running.",
    name: '',
  },
  {
    quote: "I wanted to try NemoClaw but the setup has like six steps and I kept getting stuck on the OpenShell sidecar part. The app just did all of it. Docker, OpenShell, the sandbox, the gateway. I did nothing.",
    name: '',
  },
  {
    quote: "Every time I updated something the sandbox would break and I would have to redo the whole onboard. Valnaa handles all of that now. I just open the app and it connects.",
    name: '',
  },
  {
    quote: "The OpenShell terminal tab is where I live now. NemoClaw asks for permissions constantly and I used to miss them because they were in some other window. Now I see them right away and just hit y.",
    name: '',
  },
];

const CHANGELOG = [
  { date: 'Apr 3, 2026', title: 'Runtime switch reliability', desc: 'Switch between OpenClaw and NemoClaw without re onboarding or port conflicts' },
  { date: 'Apr 2, 2026', title: 'Performance improvements', desc: 'Faster tab switching, async Docker checks, non blocking UI' },
  { date: 'Mar 25, 2026', title: 'WSL auto setup improvements', desc: 'Better detection, fewer UAC flashes on Windows' },
  { date: 'Mar 19, 2026', title: 'Browser relay setup polish', desc: 'Clearer steps for Chrome extension and policy' },
  { date: 'Mar 11, 2026', title: 'Terminal and log focus', desc: 'Easier to keep shell open for NemoClaw prompts' },
  { date: 'Mar 5, 2026', title: 'One click install path', desc: 'OpenClaw and NemoClaw dependency fixes' },
];

const RESEARCH_ROWS = [
  { year: '2026', item: 'Signed macOS & Windows desktop installers', status: 'Shipped' },
  { year: '2026', item: 'Always on terminal for permissions & log tailing', status: 'Shipped' },
  { year: '2026', item: 'One click OpenClaw + NemoClaw local install', status: 'Shipped' },
  { year: '2026', item: 'In app browser relay setup flow', status: 'Shipped' },
  { year: '2026', item: 'OpenClaw and NemoClaw command guide in the shell', status: 'Shipped' },
];

const CLOUD_DESKTOP_COMPARISON = [
  {
    variant: 'link' as const,
    title: 'Cloud (VPS)',
    price: 'From $15/mo',
    features: ['Runs 24/7 on a server', 'Always on channels', 'Managed updates', 'Includes AI credits'],
    ctaLabel: 'View plans',
    href: '/#pricing',
    highlight: false,
  },
  {
    variant: 'download' as const,
    title: 'Desktop',
    price: `€${TOTAL_PRICE.toFixed(2)}/mo incl. VAT`,
    features: [
      'One click OpenClaw + NemoClaw install',
      'Gateway & sandbox UI in the app',
      'Terminal for permissions & logs',
      'Browser relay setup & command guide',
    ],
    ctaLabel: 'Download',
    highlight: true,
  },
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

/** All seven screens mapped to left view tabs (3) + right toolbar buttons (4). */
const ALL_SCREENS: { key: string; label: string; src: string; src2x: string; icon: LucideIcon }[] = [
  { key: 'chat', label: 'Gateway chat', src: '/app-screenshots/01-gateway-chat.png', src2x: '/app-screenshots/01-gateway-chat@2x.png', icon: MessageSquare },
  { key: 'dashboard', label: 'NemoClaw dashboard', src: '/app-screenshots/02-nemoclaw-dashboard.png', src2x: '/app-screenshots/02-nemoclaw-dashboard@2x.png', icon: Monitor },
  { key: 'browser', label: 'Browser relay', src: '/app-screenshots/03-browser-relay.png', src2x: '/app-screenshots/03-browser-relay@2x.png', icon: Globe },
  { key: 'terminal', label: 'Terminal', src: '/app-screenshots/04-terminal.png', src2x: '/app-screenshots/04-terminal@2x.png', icon: Terminal },
  { key: 'commands', label: 'Command reference', src: '/app-screenshots/05-command-reference.png', src2x: '/app-screenshots/05-command-reference@2x.png', icon: Monitor },
  { key: 'logs', label: 'Gateway logs', src: '/app-screenshots/06-gateway-logs.png', src2x: '/app-screenshots/06-gateway-logs@2x.png', icon: FileText },
  { key: 'settings', label: 'Settings', src: '/app-screenshots/07-settings.png', src2x: '/app-screenshots/07-settings@2x.png', icon: Settings },
];

const LEFT_TABS = ALL_SCREENS.slice(0, 3);
const RIGHT_TABS = ALL_SCREENS.slice(3);

function AppPreview({ className }: { className?: string }) {
  const [activeKey, setActiveKey] = useState<string>('chat');
  const current = ALL_SCREENS.find((s) => s.key === activeKey) ?? ALL_SCREENS[0];
  const [broken, setBroken] = useState<Record<string, boolean>>({});

  function tabBtn(screen: typeof ALL_SCREENS[number]) {
    const selected = activeKey === screen.key;
    return (
      <button
        key={screen.key}
        type="button"
        role="tab"
        aria-selected={selected}
        aria-label={screen.label}
        title={screen.label}
        onClick={() => setActiveKey(screen.key)}
        className={cn(
          'flex size-9 items-center justify-center rounded-md transition-colors',
          selected ? 'bg-white/[0.08] text-[#e8e6e1]' : 'text-[#6f6d68] hover:text-[#a8a6a0]'
        )}
      >
        <screen.icon className="size-[17px]" strokeWidth={1.6} />
      </button>
    );
  }

  return (
    <div className={cn('relative mx-auto w-full max-w-[1040px]', className)}>
      <div
        className="overflow-hidden rounded-[10px] border border-white/[0.1] bg-[#111]"
        style={{ boxShadow: '0 28px 70px rgba(0,0,0,0.4), 0 14px 32px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.06)' }}
      >
        {/* Top bar: traffic lights | 3 left tabs | NemoClaw | 4 right tabs */}
        <div
          className="relative flex h-11 items-center border-b border-[#2a2a2a] px-2.5"
          style={{ backgroundColor: '#111' }}
        >
          <div className="flex shrink-0 items-center gap-[6px] pr-3">
            <span className="inline-block size-[11px] rounded-full bg-[#ff5f57]" />
            <span className="inline-block size-[11px] rounded-full bg-[#febc2e]" />
            <span className="inline-block size-[11px] rounded-full bg-[#28c840]" />
          </div>

          <div role="tablist" aria-label="Left views" className="flex shrink-0 items-center">
            {LEFT_TABS.map(tabBtn)}
          </div>

          <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[13px] font-semibold tracking-tight text-[#b8b6b1]">
            NemoClaw
          </span>

          <div role="tablist" aria-label="Right views" className="ml-auto flex shrink-0 items-center">
            {RIGHT_TABS.map(tabBtn)}
          </div>
        </div>

        {/* Screenshot */}
        <div style={{ backgroundColor: '#0a0a0a' }}>
          {!broken[current.key] ? (
            // eslint-disable-next-line @next/next/no-img-element -- original PNGs, no recompression
            <img
              key={current.key}
              src={current.src2x}
              srcSet={`${current.src} 1x, ${current.src2x} 2x`}
              alt={`Valnaa Desktop — ${current.label}`}
              width={2048}
              height={1108}
              className="block w-full"
              style={{ height: 'auto' }}
              loading={current.key === 'chat' ? 'eager' : 'lazy'}
              decoding="async"
              onError={() => setBroken((prev) => ({ ...prev, [current.key]: true }))}
            />
          ) : (
            <div className="flex h-[400px] items-center justify-center text-[13px]" style={{ color: TEXT_SEC }}>
              {current.label}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex h-9 items-center justify-between border-t border-[#2a2a2a] px-3 text-[11px]"
          style={{ backgroundColor: '#161616', color: TEXT_SEC }}
        >
          <span className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-[#22c55e]" />
            <span className="text-[#b0aea8]">Running on :18789</span>
          </span>
          <div className="flex items-center gap-1.5">
            {['Start', 'Stop', 'Restart', 'Refresh'].map((label) => (
              <span
                key={label}
                className={cn(
                  'rounded border px-2 py-0.5 text-[10px]',
                  label === 'Start'
                    ? 'border-white/[0.06] bg-[#141414] text-[#5c5a55]'
                    : 'border-white/[0.1] bg-[#222] text-[#c8c6c0]'
                )}
                aria-hidden
              >
                {label}
              </span>
            ))}
            <span className="pl-1 text-[10px] text-[#5c5a55] tabular-nums">v33.4.11</span>
          </div>
        </div>
      </div>
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

function btnPrimaryClass(extra?: string) {
  return cn(
    'inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-2.5 text-[15px] font-medium text-black transition-colors hover:bg-neutral-200',
    extra
  );
}

function btnWindowsOutlineClass(extra?: string) {
  return cn(
    'inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-transparent px-5 py-2.5 text-[15px] font-medium text-[#f0efea] transition-colors hover:border-white/30 hover:bg-white/[0.06]',
    extra
  );
}

function btnGhostNavClass() {
  return 'rounded-md px-3 py-2 text-[14px] text-[#9c9a94] transition-colors hover:bg-white/[0.04] hover:text-white';
}

export default function DesktopPage() {
  const macUrl = useMacDownloadUrl();

  return (
    <div className="min-h-screen antialiased" style={{ backgroundColor: BG, color: TEXT }}>
      <header className="fixed top-0 z-50 h-14 w-full border-b border-white/[0.06] bg-[#14120b]/90 backdrop-blur-md">
        <div className="relative mx-auto flex h-full max-w-[1280px] items-center justify-between px-5">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-[15px] font-semibold tracking-tight text-[#f0efea] hover:opacity-90"
          >
            <Image
              src="/valnaa-app-icon.png"
              alt=""
              width={20}
              height={20}
              className="size-5 shrink-0 rounded-[5px] object-cover"
              priority
            />
            <span>Valnaa</span>
          </Link>

          <nav
            className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-8 text-[14px] lg:flex"
            style={{ color: TEXT_SEC }}
          >
            <Link href="/#pricing" className="transition-colors hover:text-white">
              Cloud
            </Link>
            <Link href="#pricing" className="transition-colors hover:text-white">
              Pricing
            </Link>
            <Link href="#faq" className="transition-colors hover:text-white">
              Resources
            </Link>
          </nav>

          <div className="flex items-center gap-1">
            <Link href="/auth/login" className={btnGhostNavClass()}>
              Sign in
            </Link>
            <Link href="/feedback" className={cn('hidden xl:inline-flex', btnGhostNavClass())}>
              Contact
            </Link>
            <TrackedDownloadLink href={macUrl} trackEvent="download_click_nav" className={btnPrimaryClass('py-2 text-[14px]')}>
              Download
            </TrackedDownloadLink>
          </div>
        </div>
      </header>

      <main id="main" className="pt-14">
        {/* Hero + media stack (cursor.com homepage structure) */}
        <section style={{ backgroundColor: BG }}>
          <div className="mx-auto max-w-[1280px] px-5 pt-10 pb-4 md:pt-14 md:pb-2">
            <div className="max-w-[min(36rem,100%)] text-left">
              <h1 className="mb-5 max-w-[40rem] text-balance text-[clamp(1.25rem,2.15vw,1.875rem)] font-medium leading-[1.2] tracking-[-0.025em] text-[#f5f4ef]">
                Built to make AI simple, Valnaa is the best way to install and use OpenClaw and NemoClaw.
              </h1>
              <div className="flex flex-wrap items-center gap-3">
                <TrackedDownloadLink href={macUrl} trackEvent="download_click_mac" className={btnPrimaryClass()}>
                  <AppleLogo className="size-[18px]" />
                  Download for macOS
                  <span className="text-lg leading-none" aria-hidden>
                    ⤓
                  </span>
                </TrackedDownloadLink>
                <TrackedDownloadLink href={DOWNLOAD_WIN} trackEvent="download_click_win" className={btnWindowsOutlineClass()}>
                  <WindowsLogo className="size-[18px]" />
                  Download for Windows
                  <span className="text-lg leading-none" aria-hidden>
                    ⤓
                  </span>
                </TrackedDownloadLink>
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px]" style={{ color: TEXT_SEC }}>
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="size-3.5 shrink-0 text-emerald-500/70" />
                  Apple signed and notarized
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="size-3.5 shrink-0 text-sky-500/70" />
                  Microsoft Azure Trusted Signing
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <BadgeCheck className="size-3.5 shrink-0 opacity-70" />
                  Free trial, no credit card needed
                </span>
              </div>
            </div>
          </div>

          <div className="relative w-full overflow-hidden">
            <div
              className="absolute inset-0"
              style={{
                background:
                  'linear-gradient(168deg, #24303d 0%, #2a2520 30%, #1a2822 58%, #14120b 100%)',
              }}
            />
            <div
              className="absolute inset-0 opacity-90"
              style={{
                background:
                  'radial-gradient(ellipse 85% 55% at 50% 42%, rgba(130, 150, 170, 0.14), transparent 62%)',
              }}
            />
            <div className="relative flex min-h-[min(720px,72vh)] w-full items-center justify-center px-4 py-14 md:min-h-[680px] md:py-20">
              <AppPreview />
            </div>
          </div>

          <div className="mx-auto max-w-[1280px] px-5 py-16">
            <p className="mx-auto mb-6 max-w-lg text-center text-[15px] leading-relaxed" style={{ color: TEXT_SEC }}>
              We focus on packaging, signing, and a stable window around the stack so you spend time in OpenClaw and NemoClaw, not fighting setup.
            </p>
            <div className="mx-auto max-w-xl overflow-hidden rounded-lg border border-white/[0.08]">
              <table className="w-full text-left text-[13px]">
                <tbody>
                  {RESEARCH_ROWS.map((row) => (
                    <tr key={row.item} className="border-b border-white/[0.06] last:border-0">
                      <td className="w-14 px-4 py-3 font-mono" style={{ color: TEXT_SEC }}>
                        {row.year}
                      </td>
                      <td className="px-2 py-3 text-[#d8d6d0]">{row.item}</td>
                      <td className="px-4 py-3 text-right" style={{ color: TEXT_SEC }}>
                        {row.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="border-t border-white/[0.06]" style={{ backgroundColor: BG }}>
          <div className="mx-auto grid max-w-[1280px] grid-cols-1 md:grid-cols-3">
            {[
              { title: 'One click install', desc: 'OpenClaw and NemoClaw land on your machine with dependencies handled' },
              { title: 'Valnaa sign in', desc: 'Unlock the app with your account; updates ship through the same channel' },
              { title: 'Always open tools', desc: 'Gateway, sandbox views, shell, relay setup, not a separate browser only workflow' },
            ].map((item, i) => (
              <div
                key={item.title}
                className={cn('px-8 py-12 md:px-10', i > 0 && 'md:border-l md:border-white/[0.06]')}
              >
                <p className="text-[15px] font-medium text-[#f0efea]">{item.title}</p>
                <p className="mt-2 text-[14px] leading-relaxed" style={{ color: TEXT_SEC }}>
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-white/[0.06] px-5 py-20 md:py-28" style={{ backgroundColor: BG }}>
          <div className="mx-auto max-w-[1280px]">
            <h2 className="mx-auto max-w-[40rem] text-center text-[clamp(1.5rem,2.2vw,2.25rem)] font-medium leading-tight tracking-[-0.02em] text-[#f0efea]">
              Trusted for serious OpenClaw workflows
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-center text-[16px] leading-relaxed" style={{ color: TEXT_SEC }}>
              After install, the app is the frame around OpenClaw and NemoClaw: Control UI, sandboxes, terminal for permissions and logs, browser relay setup, and a command guide.
            </p>

            <div className="mt-16 space-y-24 md:mt-24 md:space-y-32">
              {FEATURE_ROWS.map((row) => (
                <div
                  key={row.title}
                  className={cn(
                    'grid items-start gap-12 md:gap-16',
                    row.reverse ? 'md:grid-cols-[1.4fr_1fr]' : 'md:grid-cols-[1fr_1.4fr]',
                    row.reverse && 'md:[&>div:first-child]:order-2'
                  )}
                >
                  <div className="flex flex-col justify-center md:py-10">
                    <p className="text-[12px] font-medium uppercase tracking-[0.12em]" style={{ color: TEXT_SEC }}>
                      {row.kicker}
                    </p>
                    <h3 className="mt-3 text-2xl font-medium tracking-[-0.02em] text-[#f0efea] md:text-3xl">{row.title}</h3>
                    <p className="mt-4 text-[16px] leading-relaxed" style={{ color: TEXT_SEC }}>
                      {row.body}
                    </p>
                    <Link
                      href={row.link.href}
                      className="mt-6 inline-flex items-center gap-1 text-[15px] text-[#f0efea] hover:underline"
                    >
                      {row.link.label}
                      <ExternalLink className="size-3.5 opacity-70" />
                    </Link>
                  </div>
                  <div>
                    <p className="mb-3 text-center text-[11px] font-medium uppercase tracking-[0.15em] text-white/[0.25]">
                      {row.kicker === 'Install' ? 'NemoClaw' : 'OpenClaw'}
                    </p>
                    <div className="overflow-hidden rounded-[10px]" style={{ boxShadow: '0 28px 70px rgba(0,0,0,0.4), 0 14px 32px rgba(0,0,0,0.25)' }}>
                      <video
                        autoPlay
                        muted
                        loop
                        playsInline
                        className="block w-full rounded-[10px]"
                        style={{ height: 'auto' }}
                      >
                        <source src={`/app-screenshots/${row.kicker === 'Install' ? 'install' : 'operate'}-video.mp4`} type="video/mp4" />
                      </video>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-white/[0.06] px-5 py-20 md:py-28" style={{ backgroundColor: BG }}>
          <div className="mx-auto max-w-[1280px]">
            <h2 className="text-center text-[clamp(1.5rem,2.2vw,2.25rem)] font-medium tracking-[-0.02em] text-[#f0efea]">
              Always available after install
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-center text-[16px] leading-relaxed" style={{ color: TEXT_SEC }}>
              The desktop app keeps OpenClaw and NemoClaw surfaces in reach: gateway UI, sandbox management, a terminal for permissions and logs, and browser relay setup. Not a separate &ldquo;AI product&rdquo; layer.
            </p>
            <div className="mt-14 grid gap-3 sm:grid-cols-2">
              {ALWAYS_OPEN_PANELS.map((panel) => (
                <div
                  key={panel.title}
                  className="rounded-xl border border-white/[0.08] bg-[#1a1916] p-6 transition-colors hover:border-white/[0.12]"
                >
                  <div className="flex items-center gap-2">
                    <div className="flex size-9 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03]">
                      <panel.icon className="size-4" style={{ color: TEXT_SEC }} />
                    </div>
                    <h3 className="text-[15px] font-medium text-[#f0efea]">{panel.title}</h3>
                  </div>
                  <ul className="mt-4 space-y-2">
                    {panel.points.map((pt) => (
                      <li key={pt} className="flex items-start gap-2 text-[13px] leading-relaxed" style={{ color: TEXT_SEC }}>
                        <span className="mt-2 size-1 shrink-0 rounded-full bg-[#5c5a55]" />
                        {pt}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Claude Code CLI Section */}
        <section className="border-t border-white/[0.06] px-5 py-20 md:py-28" style={{ backgroundColor: BG }}>
          <div className="mx-auto max-w-[1280px]">
            <div className="grid items-center gap-12 md:grid-cols-2 md:gap-16">
              <div className="flex flex-col justify-center md:py-10">
                <p className="text-[12px] font-medium uppercase tracking-[0.12em]" style={{ color: TEXT_SEC }}>
                  AI Model
                </p>
                <h3 className="mt-3 text-2xl font-medium tracking-[-0.02em] text-[#f0efea] md:text-3xl">
                  Use Claude Code as your AI model
                </h3>
                <p className="mt-4 text-[16px] leading-relaxed" style={{ color: TEXT_SEC }}>
                  Connect your Claude Code CLI directly to Valnaa with one click. Your agents run on Claude Sonnet 4 or Opus through a local proxy that translates requests automatically. No API keys to manage, no provider configuration. Just connect and go.
                </p>
                <ul className="mt-6 space-y-3">
                  {[
                    'One-click connect from Settings',
                    'Supports Sonnet 4, Opus, and Haiku models',
                    'Thinking effort control (low, medium, high)',
                    'Add other providers like Anthropic API, OpenAI, Google',
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-2 text-[14px]" style={{ color: TEXT_SEC }}>
                      <Check className="size-4 shrink-0 text-emerald-500" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="aspect-square overflow-hidden rounded-[12px] border border-white/[0.08]" style={{ boxShadow: '0 28px 70px rgba(0,0,0,0.4), 0 14px 32px rgba(0,0,0,0.25)' }}>
                  <Image
                    src="/app-screenshots/claude-code-settings.png"
                    alt="Claude Code connected as AI model in Valnaa settings"
                    width={2304}
                    height={2304}
                    quality={95}
                    className="block h-full w-full object-cover object-[70%_0%] rounded-[12px]"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Agent Store Section */}
        <section className="border-t border-white/[0.06] px-5 py-20 md:py-28" style={{ backgroundColor: BG }}>
          <div className="mx-auto max-w-[1280px]">
            <div className="grid items-center gap-12 md:grid-cols-2 md:gap-16">
              <div>
                <div className="aspect-square overflow-hidden rounded-[12px] border border-white/[0.08]" style={{ boxShadow: '0 28px 70px rgba(0,0,0,0.4), 0 14px 32px rgba(0,0,0,0.25)' }}>
                  <Image
                    src="/app-screenshots/agent-store.png"
                    alt="Agent Store showing 28 installable AI employees"
                    width={2304}
                    height={2304}
                    quality={95}
                    className="block h-full w-full object-cover object-[50%_30%] rounded-[12px]"
                  />
                </div>
              </div>
              <div className="flex flex-col justify-center md:py-10">
                <p className="text-[12px] font-medium uppercase tracking-[0.12em]" style={{ color: TEXT_SEC }}>
                  AI Employees
                </p>
                <h3 className="mt-3 text-2xl font-medium tracking-[-0.02em] text-[#f0efea] md:text-3xl">
                  28 agents that work on autopilot
                </h3>
                <p className="mt-4 text-[16px] leading-relaxed" style={{ color: TEXT_SEC }}>
                  Install AI employees from the Agent Store. Each agent comes with 20 skills, 7 scheduled tasks, and integrations with tools like GitHub, Notion, Slack, Google, Figma, and Canva. They run cron jobs, send emails, review PRs, manage social media, and research the web while you sleep.
                </p>
                <div className="mt-6 grid grid-cols-2 gap-3">
                  {[
                    { name: 'Research Assistant', cat: 'Productivity' },
                    { name: 'GitHub PR Reviewer', cat: 'Development' },
                    { name: 'Social Media Manager', cat: 'Marketing' },
                    { name: 'Self Healing Server', cat: 'DevOps' },
                    { name: 'Video Editor', cat: 'Creative' },
                    { name: 'Sales Assistant', cat: 'Business' },
                  ].map((agent) => (
                    <div key={agent.name} className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2">
                      <p className="text-[13px] font-medium text-[#e0e0e0]">{agent.name}</p>
                      <p className="text-[11px]" style={{ color: TEXT_SEC }}>{agent.cat}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-20 text-center">
              <h3 className="text-xl font-medium tracking-[-0.02em] text-[#f0efea]">
                How agents work
              </h3>
              <p className="mx-auto mt-3 max-w-2xl text-[15px] leading-relaxed" style={{ color: TEXT_SEC }}>
                Every agent has a SOUL (personality and rules), scheduled cron jobs that run automatically, and skills that connect to real APIs and tools. Install one, configure its API keys in the Setup panel, and it starts working.
              </p>
              <div className="mx-auto mt-10 grid max-w-3xl gap-4 md:grid-cols-3">
                {[
                  { step: '1', title: 'Install', desc: 'Pick an agent from the store. One click installs its SOUL, skills, and cron schedule.' },
                  { step: '2', title: 'Configure', desc: 'Add API keys for integrations like Notion, GitHub, or Google. Shared across all agents.' },
                  { step: '3', title: 'It works', desc: 'The agent runs its scheduled tasks, responds in chat, and uses your browser for research.' },
                ].map((s) => (
                  <div key={s.step} className="rounded-xl border border-white/[0.08] bg-[#1a1916] p-6 text-left">
                    <div className="mb-3 flex size-8 items-center justify-center rounded-full border border-white/[0.1] text-[13px] font-semibold text-[#f0efea]">
                      {s.step}
                    </div>
                    <p className="text-[15px] font-medium text-[#f0efea]">{s.title}</p>
                    <p className="mt-2 text-[13px] leading-relaxed" style={{ color: TEXT_SEC }}>{s.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-white/[0.06] px-5 py-20 md:py-28" style={{ backgroundColor: BG }}>
          <div className="mx-auto max-w-[1280px]">
            <h2 className="text-center text-[clamp(1.5rem,2.2vw,2.25rem)] font-medium tracking-[-0.02em] text-[#f0efea]">
              The new way to install your agent
            </h2>
            <div className="mt-14 grid gap-14 sm:grid-cols-2 sm:gap-x-12 sm:gap-y-16">
              {TESTIMONIALS.map((t) => (
                <blockquote key={t.name}>
                  <p className="text-[17px] leading-relaxed text-[#d4d2cc] md:text-lg">&ldquo;{t.quote}&rdquo;</p>
                  <footer className="mt-6">
                    {t.name && <p className="text-[13px]" style={{ color: TEXT_SEC }}>{t.name}</p>}
                  </footer>
                </blockquote>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-white/[0.06] px-5 py-20 md:py-28" style={{ backgroundColor: BG }}>
          <div className="mx-auto max-w-[36rem] text-center">
            <h2 className="text-[clamp(1.5rem,2.2vw,2.25rem)] font-medium tracking-[-0.02em] text-[#f0efea]">Just the installer. Nothing else.</h2>
            <p className="mt-4 text-[16px] leading-relaxed" style={{ color: TEXT_SEC }}>
              Valnaa installs OpenClaw and NemoClaw on your computer and gives you a window to use them. It does not change how they work. Your models, API keys, agent settings, and everything else stay exactly where OpenClaw and NemoClaw put them. When they release updates you get the same features as everyone else.
            </p>
            <p className="mt-5 text-[14px]" style={{ color: '#6f6d68' }}>
              All configuration happens in OpenClaw and NemoClaw directly. Valnaa just makes it easier to get there.
            </p>
          </div>
        </section>

        <section id="pricing" className="border-t border-white/[0.06] px-5 py-20" style={{ backgroundColor: BG }}>
          <div className="mx-auto max-w-md">
            <div className="rounded-xl border border-white/[0.1] bg-[#1a1916] p-8 md:p-10">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: TEXT_SEC }}>
                Desktop license
              </p>
              <h2 className="mt-2 text-2xl font-medium text-[#f0efea]">Valnaa Desktop</h2>
              <p className="mt-2 text-[14px]" style={{ color: TEXT_SEC }}>
                One click installer plus gateway, sandbox, terminal, relay, and guides
              </p>
              <div className="mt-8 flex items-baseline gap-1">
                <span className="text-5xl font-medium tracking-tight text-[#f0efea]">&euro;{BASE_PRICE}</span>
                <span className="text-lg" style={{ color: TEXT_SEC }}>
                  /mo
                </span>
              </div>
              <p className="mt-1 text-[13px]" style={{ color: TEXT_SEC }}>
                + 25% VAT = <span className="text-[#c8c6c0]">&euro;{TOTAL_PRICE.toFixed(2)}/mo</span>
              </p>
              <ul className="mt-8 space-y-3 border-t border-white/[0.06] pt-8">
                {INCLUDED.map((item) => (
                  <li key={item} className="flex gap-3 text-[14px]" style={{ color: TEXT_SEC }}>
                    <Check className="mt-0.5 size-4 shrink-0 opacity-60" />
                    {item}
                  </li>
                ))}
              </ul>
              <div className="mt-8 flex flex-col gap-2 sm:flex-row">
                <TrackedDownloadLink href={macUrl} trackEvent="download_click_mac" className={cn(btnPrimaryClass('h-11 w-full'))}>
                  <AppleLogo className="size-4" /> Mac
                </TrackedDownloadLink>
                <TrackedDownloadLink
                  href={DOWNLOAD_WIN}
                  trackEvent="download_click_win"
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-white/15 text-[15px] font-medium text-[#f0efea] hover:bg-white/[0.06]"
                >
                  <WindowsLogo className="size-4" /> Windows
                </TrackedDownloadLink>
              </div>
              <p className="mt-4 text-center text-[12px]" style={{ color: '#6f6d68' }}>
                1 day trial, no card
              </p>
            </div>
          </div>
        </section>

        <section className="border-t border-white/[0.06] px-5 py-20" style={{ backgroundColor: BG }}>
          <div className="mx-auto max-w-[1000px]">
            <h2 className="text-center text-[clamp(1.5rem,2.2vw,2.25rem)] font-medium text-[#f0efea]">Cloud or desktop</h2>
            <p className="mx-auto mt-3 max-w-md text-center" style={{ color: TEXT_SEC }}>
              Separate subscriptions. Use both if you want.
            </p>
            <div className="mt-12 grid gap-4 md:grid-cols-2">
              {CLOUD_DESKTOP_COMPARISON.map((col) => (
                <div
                  key={col.title}
                  className={cn(
                    'flex flex-col rounded-xl border p-8',
                    col.highlight ? 'border-white/15 bg-white/[0.03]' : 'border-white/[0.08] bg-[#1a1916]'
                  )}
                >
                  <h3 className="text-lg font-medium text-[#f0efea]">{col.title}</h3>
                  <p className="mt-1 text-[14px]" style={{ color: TEXT_SEC }}>
                    {col.price}
                  </p>
                  <ul className="mt-6 flex-1 space-y-2">
                    {col.features.map((f) => (
                      <li key={f} className="flex gap-2 text-[14px]" style={{ color: TEXT_SEC }}>
                        <Check className="mt-0.5 size-4 shrink-0 opacity-50" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  {col.variant === 'download' ? (
                    <TrackedDownloadLink href={macUrl} trackEvent="download_click_comparison" className={cn(btnPrimaryClass('mt-8 w-full'))}>
                      {col.ctaLabel}
                      <ArrowRight className="size-4" />
                    </TrackedDownloadLink>
                  ) : (
                    <Link href={col.href} className="mt-8">
                      <span className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-white/15 text-[15px] font-medium hover:bg-white/[0.06]">
                        {col.ctaLabel}
                        <ArrowRight className="size-4" />
                      </span>
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-white/[0.06] px-5 py-20" style={{ backgroundColor: BG }}>
          <div className="mx-auto max-w-xl">
            <h2 className="text-2xl font-medium text-[#f0efea]">Changelog</h2>
            <ul className="mt-8 divide-y divide-white/[0.06] border-t border-white/[0.06]">
              {CHANGELOG.map((entry) => (
                <li key={entry.title} className="flex flex-col gap-1 py-5 sm:flex-row sm:items-baseline sm:justify-between">
                  <div>
                    <p className="text-[15px] font-medium text-[#f0efea]">{entry.title}</p>
                    <p className="mt-1 text-[14px]" style={{ color: TEXT_SEC }}>
                      {entry.desc}
                    </p>
                  </div>
                  <time className="shrink-0 text-[13px]" style={{ color: '#6f6d68' }}>
                    {entry.date}
                  </time>
                </li>
              ))}
            </ul>
            <Link
              href="https://github.com/Skycustody/valnaa-desktop/releases"
              className="mt-8 inline-flex items-center gap-1 text-[14px] transition-colors hover:text-white"
              style={{ color: TEXT_SEC }}
            >
              See all releases
              <ChevronRight className="size-4" />
            </Link>
          </div>
        </section>

        <section className="border-t border-white/[0.06] px-5 py-20" style={{ backgroundColor: BG }}>
          <div className="mx-auto max-w-[900px] text-center">
            <h2 className="text-[clamp(1.5rem,2.2vw,2.25rem)] font-medium text-[#f0efea]">Signed &amp; notarized</h2>
            <p className="mx-auto mt-4 max-w-lg" style={{ color: TEXT_SEC }}>
              macOS builds pass Apple notarization. Windows builds use Azure Trusted Signing.
            </p>
            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-white/[0.08] bg-[#1a1916] p-6 text-left">
                <div className="flex items-center gap-3">
                  <AppleLogo className="size-6" style={{ color: TEXT_SEC }} />
                  <div>
                    <p className="font-medium text-[#f0efea]">Apple</p>
                    <p className="text-[13px]" style={{ color: TEXT_SEC }}>
                      Developer ID + notary
                    </p>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-white/[0.08] bg-[#1a1916] p-6 text-left">
                <div className="flex items-center gap-3">
                  <svg className="size-6" style={{ color: TEXT_SEC }} viewBox="0 0 24 24" fill="currentColor">
                    <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
                  </svg>
                  <div>
                    <p className="font-medium text-[#f0efea]">Microsoft</p>
                    <p className="text-[13px]" style={{ color: TEXT_SEC }}>
                      Trusted Signing
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-white/[0.06] px-5 py-20" style={{ backgroundColor: BG }}>
          <div className="mx-auto max-w-xl">
            <h2 id="faq" className="text-center text-2xl font-medium text-[#f0efea]">Questions</h2>
            <div className="mt-10 divide-y divide-white/[0.06]">
              {[
                {
                  q: 'What is Valnaa Desktop?',
                  a: 'An app that installs OpenClaw or NemoClaw on your computer and puts everything you need in one window. The gateway, a terminal, sandbox views, browser relay setup, and a command reference. You pick a runtime, the app sets it up, and you start using the agent.',
                },
                {
                  q: 'Does it change how OpenClaw or NemoClaw works?',
                  a: 'No. Your agent, your models, your API keys, your config. Valnaa just installs them and gives you a place to use them. Everything works the same as if you set it up yourself in the terminal.',
                },
                {
                  q: 'What does it cost?',
                  a: 'Free trial to start. After that it is 5 euros a month plus VAT. You can cancel anytime.',
                },
                {
                  q: 'Do I need a cloud account?',
                  a: 'No. The desktop app is a separate subscription. You do not need Valnaa cloud to use it.',
                },
                {
                  q: 'Can I use both OpenClaw and NemoClaw?',
                  a: 'Yes. You pick one when you start, and you can switch between them anytime from the settings page. The app handles the setup for both.',
                },
                {
                  q: 'What computers does it run on?',
                  a: 'macOS with Intel or Apple Silicon, and Windows 10 or 11.',
                },
                {
                  q: 'Need help?',
                  a: 'Email us at hello@valnaa.com and we will get back to you.',
                },
              ].map((item) => (
                <div key={item.q} className="py-8 first:pt-0">
                  <h3 className="text-[15px] font-medium text-[#f0efea]">{item.q}</h3>
                  <p className="mt-2 text-[14px] leading-relaxed" style={{ color: TEXT_SEC }}>
                    {item.a.includes('hello@valnaa.com') ? (
                      <>Email us at <a href="mailto:hello@valnaa.com" className="text-[#f0efea] underline">hello@valnaa.com</a> and we will get back to you.</>
                    ) : item.a}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-white/[0.06] px-5 py-24" style={{ backgroundColor: BG }}>
          <div className="mx-auto max-w-xl text-center">
            <h2 className="text-[clamp(1.5rem,2.2vw,2.25rem)] font-medium text-[#f0efea]">Try Valnaa Desktop</h2>
            <p className="mt-4" style={{ color: TEXT_SEC }}>
              1 day free trial. Then €{BASE_PRICE}/mo + VAT.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <TrackedDownloadLink href={macUrl} trackEvent="download_click_cta_mac" className={btnPrimaryClass('h-12 px-8')}>
                <AppleLogo className="size-4" /> Download for macOS
              </TrackedDownloadLink>
              <TrackedDownloadLink
                href={DOWNLOAD_WIN}
                trackEvent="download_click_cta_win"
                className="inline-flex h-12 items-center justify-center rounded-full border border-white/15 px-8 text-[15px] font-medium hover:bg-white/[0.06]"
              >
                Download for Windows
              </TrackedDownloadLink>
            </div>
          </div>
        </section>

        <footer className="border-t border-white/[0.06] px-5 py-16" style={{ backgroundColor: BG }}>
          <div className="mx-auto grid max-w-[1280px] gap-12 sm:grid-cols-2 lg:grid-cols-5">
            <div className="lg:col-span-2">
              <div className="inline-flex items-center gap-1.5">
                <Image
                  src="/valnaa-app-icon.png"
                  alt=""
                  width={20}
                  height={20}
                  className="size-5 shrink-0 rounded-[5px] object-cover"
                />
                <span className="font-semibold text-[#f0efea]">Valnaa</span>
              </div>
              <p className="mt-3 max-w-xs text-[13px] leading-relaxed" style={{ color: TEXT_SEC }}>
                Hosted OpenClaw plus a one click local installer shell.
              </p>
            </div>
            <div>
              <p className="text-[12px] font-medium uppercase tracking-[0.1em]" style={{ color: TEXT_SEC }}>
                Product
              </p>
              <ul className="mt-4 space-y-2 text-[14px]" style={{ color: TEXT_SEC }}>
                <li>
                  <Link href="/" className="hover:text-white">
                    Home
                  </Link>
                </li>
                <li>
                  <Link href="/desktop" className="hover:text-white">
                    Desktop
                  </Link>
                </li>
                <li>
                  <Link href="/#pricing" className="hover:text-white">
                    Cloud pricing
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <p className="text-[12px] font-medium uppercase tracking-[0.1em]" style={{ color: TEXT_SEC }}>
                Resources
              </p>
              <ul className="mt-4 space-y-2 text-[14px]" style={{ color: TEXT_SEC }}>
                <li>
                  <a href="https://github.com/Skycustody/valnaa-desktop/releases" className="hover:text-white">
                    Releases
                  </a>
                </li>
                <li>
                  <Link href="/auth/login" className="hover:text-white">
                    Sign in
                  </Link>
                </li>
                <li>
                  <Link href="/help" className="hover:text-white">
                    Help
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <p className="text-[12px] font-medium uppercase tracking-[0.1em]" style={{ color: TEXT_SEC }}>
                Legal
              </p>
              <ul className="mt-4 space-y-2 text-[14px]" style={{ color: TEXT_SEC }}>
                <li>
                  <Link href="/terms" className="hover:text-white">
                    Terms
                  </Link>
                </li>
                <li>
                  <Link href="/privacy" className="hover:text-white">
                    Privacy
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          <p className="mx-auto mt-14 max-w-[1280px] text-[13px]" style={{ color: '#6f6d68' }}>
            &copy; {new Date().getFullYear()} Valnaa
          </p>
        </footer>
      </main>
    </div>
  );
}
