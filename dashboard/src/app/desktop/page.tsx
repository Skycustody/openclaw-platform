'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import {
  Monitor,
  Apple,
  Download,
  Check,
  ArrowRight,
  Shield,
  Wifi,
  WifiOff,
  Terminal,
  Brain,
  MessageSquare,
  Zap,
  Globe,
} from 'lucide-react';

const DOWNLOAD_BASE = 'https://github.com/Skycustody/valnaa-desktop/releases/latest';
const DOWNLOAD_MAC_ARM = `${DOWNLOAD_BASE}/download/Valnaa-arm64.dmg`;
const DOWNLOAD_MAC_INTEL = `${DOWNLOAD_BASE}/download/Valnaa-x64.dmg`;
const DOWNLOAD_WIN = `${DOWNLOAD_BASE}/download/Valnaa-Setup.exe`;

const BASE_PRICE = 5;
const VAT_RATE = 0.25;
const VAT_AMOUNT = BASE_PRICE * VAT_RATE;
const TOTAL_PRICE = BASE_PRICE + VAT_AMOUNT;

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

export default function DesktopPage() {

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-lg supports-[backdrop-filter]:bg-background/50">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2.5 rounded-md p-2 hover:bg-accent">
            <Image src="/favicon.png" alt="Valnaa" width={20} height={20} className="rounded-sm" />
            <span className="text-sm font-semibold tracking-tight">Valnaa</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/#pricing" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              Cloud Plans
            </Link>
            <Link href="/auth/login">
              <Button variant="outline" size="sm">Sign In</Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="mx-auto max-w-5xl px-6 pt-24 pb-16">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            <Monitor className="size-3" />
            Desktop App
          </div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            OpenClaw on your machine
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
            Download Valnaa Desktop and run a full AI agent locally.
            Private, fast, and always available — no cloud server needed.
          </p>
        </div>

        {/* Download buttons */}
        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <a href={DOWNLOAD_MAC_ARM} className="group w-full sm:w-auto">
            <Button size="lg" className="w-full gap-3 rounded-full sm:w-auto">
              <Apple className="size-5" />
              Mac (Apple Silicon)
              <Download className="size-4 opacity-50 transition-opacity group-hover:opacity-100" />
            </Button>
          </a>
          <a href={DOWNLOAD_MAC_INTEL} className="group w-full sm:w-auto">
            <Button size="lg" variant="outline" className="w-full gap-3 rounded-full sm:w-auto">
              <Apple className="size-5" />
              Mac (Intel)
              <Download className="size-4 opacity-50 transition-opacity group-hover:opacity-100" />
            </Button>
          </a>
          <a href={DOWNLOAD_WIN} className="group w-full sm:w-auto">
            <Button size="lg" variant="outline" className="w-full gap-3 rounded-full sm:w-auto">
              <svg className="size-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
              </svg>
              Windows
              <Download className="size-4 opacity-50 transition-opacity group-hover:opacity-100" />
            </Button>
          </a>
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Requires a Desktop subscription or active trial.{' '}
          <a href={DOWNLOAD_BASE} className="underline underline-offset-2 hover:text-foreground" target="_blank" rel="noopener noreferrer">
            All releases
          </a>
        </p>
      </section>

      {/* Pricing Card */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="mx-auto max-w-lg">
          <div className={cn(
            'relative rounded-2xl border p-8',
            'border-foreground bg-foreground/[0.02] shadow-[0_0_40px_rgba(250,250,250,0.04)]'
          )}>
            <span className="absolute -top-3 left-6 rounded-full bg-foreground px-3 py-0.5 text-[11px] font-semibold text-background">
              Desktop License
            </span>

            <div className="text-center">
              <h2 className="text-2xl font-bold">Valnaa Desktop</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Run OpenClaw on your own computer
              </p>
            </div>

            <div className="mt-6 text-center">
              <div className="flex items-baseline justify-center gap-1">
                <span className="text-5xl font-bold tracking-tight">
                  &euro;{BASE_PRICE}
                </span>
                <span className="text-lg text-muted-foreground">/mo</span>
              </div>
              <p className="mt-1.5 text-sm text-muted-foreground">
                + 25% VAT = <span className="font-medium text-foreground/70">&euro;{TOTAL_PRICE.toFixed(2)}/mo</span>
              </p>
            </div>

            <ul className="mt-8 space-y-3">
              {INCLUDED.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-foreground/80">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-400" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <div className="mt-8 space-y-3">
              <p className="text-center text-sm text-muted-foreground">
                Download the app, sign in with Google, and your free trial starts automatically.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
                <a href={DOWNLOAD_MAC_ARM}>
                  <Button size="lg" className="w-full gap-2 sm:w-auto">
                    <Apple className="size-4" /> Mac (Apple Silicon)
                  </Button>
                </a>
                <a href={DOWNLOAD_WIN}>
                  <Button size="lg" variant="outline" className="w-full gap-2 sm:w-auto">
                    <svg className="size-4" viewBox="0 0 24 24" fill="currentColor"><path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" /></svg>
                    Windows
                  </Button>
                </a>
              </div>
              <p className="text-center text-xs text-muted-foreground">
                1-day free trial &mdash; no credit card needed. Separate from cloud VPS plans.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Cloud vs Desktop comparison */}
      <section className="mx-auto max-w-5xl border-t border-border px-6 py-16">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Cloud vs Desktop</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Choose what fits you — or use both. They are separate subscriptions.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-card/50 p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
                <Wifi className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Cloud (VPS)</h3>
                <p className="text-xs text-muted-foreground">From $15/mo</p>
              </div>
            </div>
            <ul className="mt-5 space-y-2.5">
              {[
                'Runs 24/7 on a dedicated server',
                'Always-on messaging channels',
                'No local resources needed',
                'Managed & auto-updated',
                'Includes AI credits',
              ].map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-foreground/70">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Link href="/#pricing" className="mt-6 block">
              <Button variant="outline" className="w-full" size="sm">View cloud plans</Button>
            </Link>
          </div>

          <div className="rounded-xl border border-foreground/30 bg-foreground/[0.02] p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
                <Monitor className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Desktop</h3>
                <p className="text-xs text-muted-foreground">&euro;{TOTAL_PRICE.toFixed(2)}/mo incl. VAT</p>
              </div>
            </div>
            <ul className="mt-5 space-y-2.5">
              {[
                'Runs on your own computer',
                'Full privacy — data stays local',
                'Works offline with local models',
                'Bring your own API keys',
                'Interactive terminal & browser',
              ].map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-foreground/70">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-400" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <a href={DOWNLOAD_WIN} className="mt-6 block">
              <Button className="w-full" size="sm">Download &amp; try free</Button>
            </a>
          </div>
        </div>
      </section>

      {/* Features grid */}
      <section className="mx-auto max-w-5xl border-t border-border px-6 py-16">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            <Zap className="size-3" />
            Features
          </div>
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Everything you need, locally</h2>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-xl border border-border bg-card/30 p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-background">
                <f.icon className="h-5 w-5 text-muted-foreground" />
              </div>
              <h3 className="mt-4 text-sm font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-5xl border-t border-border px-6 py-16">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">Questions</h2>
          <div className="mt-10 space-y-6">
            {[
              {
                q: 'Do I need a cloud subscription to use the desktop app?',
                a: 'No. The desktop app has its own separate subscription. You don\'t need a cloud VPS plan, and a cloud plan doesn\'t include desktop access.',
              },
              {
                q: 'What happens after the free trial?',
                a: 'Your 1-day trial lets you test everything. After that, subscribe at \u20AC5/mo + VAT to keep using the app. You can cancel anytime.',
              },
              {
                q: 'Do I need my own API keys?',
                a: 'Yes. The desktop app runs OpenClaw locally, so you bring your own API keys from OpenAI, Anthropic, Google, or OpenRouter. You pay the AI providers directly.',
              },
              {
                q: 'Can I use both cloud and desktop?',
                a: 'Yes. They are separate products with separate subscriptions. Use the cloud for always-on agents and the desktop for private, local work.',
              },
              {
                q: 'What operating systems are supported?',
                a: 'macOS (Intel & Apple Silicon) and Windows 10/11. Linux support is coming soon.',
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
      <section className="mx-auto max-w-3xl px-6 py-16">
        <div className="rounded-2xl border border-border bg-card/50 p-10 text-center">
          <h2 className="text-2xl font-bold tracking-tight">Ready to try it?</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            1-day free trial. &euro;{BASE_PRICE}/mo + VAT after that. Cancel anytime.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a href={DOWNLOAD_MAC_ARM}>
              <Button size="lg" className="rounded-full">
                <Apple className="mr-2 size-4" /> Download for Mac <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </a>
            <a href={DOWNLOAD_WIN}>
              <Button variant="outline" size="lg" className="rounded-full">
                <svg className="mr-2 size-4" viewBox="0 0 24 24" fill="currentColor"><path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" /></svg>
                Download for Windows
              </Button>
            </a>
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
