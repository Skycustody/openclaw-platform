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
  Brain,
  MessageSquare,
  Globe,
  MousePointerClick,
  Box,
  Layers,
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
    icon: Box,
    title: 'Powered by NemoClaw',
    desc: 'NemoClaw provisions a full AI sandbox on your machine. Your own local Kubernetes cluster, managed automatically.',
  },
  {
    icon: MousePointerClick,
    title: 'Zero terminal interaction',
    desc: 'Everything happens through the app. No commands to type, no config files to edit, no dependencies to install manually.',
  },
  {
    icon: Shield,
    title: 'Private by default',
    desc: 'Your data, conversations, and files stay on your computer. Nothing leaves your machine unless you choose to connect a channel.',
  },
  {
    icon: Brain,
    title: '20+ AI models',
    desc: 'Connect GPT-4o, Claude, Gemini, DeepSeek, and local models. Bring your own API keys or run fully offline.',
  },
  {
    icon: MessageSquare,
    title: 'Messaging channels',
    desc: 'Connect Telegram, Discord, Slack, and WhatsApp. Your agent responds around the clock while the app is running.',
  },
  {
    icon: Globe,
    title: 'Built-in browser agent',
    desc: 'Your agent can browse websites, fill forms, take screenshots, and extract data using a real Chrome instance.',
  },
];

const INCLUDED = [
  'One-click install with NemoClaw',
  'No terminal or command line needed',
  'Automatic sandbox provisioning',
  'Built-in model provider setup',
  'Browser extension for web agent',
  'All OpenClaw skills and tools',
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
            Your AI agent, running locally
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
            Valnaa Desktop gives you a full OpenClaw agent on your own computer.
            Powered by NemoClaw, everything sets up automatically. No terminal, no config files, no hassle.
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

      {/* How NemoClaw works */}
      <section className="mx-auto max-w-5xl border-t border-border px-6 py-16">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            <Box className="size-3" />
            NemoClaw
          </div>
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Setup that does everything for you</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            NemoClaw handles the entire setup. You pick a name, choose your AI provider, and the app does the rest.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-3">
          {[
            {
              step: '1',
              title: 'Download and open',
              desc: 'Install Valnaa, sign in with your account. NemoClaw detects your system and starts setup.',
            },
            {
              step: '2',
              title: 'Pick your sandbox name',
              desc: 'Choose a name for your AI workspace. NemoClaw provisions a private sandbox on your machine.',
            },
            {
              step: '3',
              title: 'Select your AI model',
              desc: 'Pick from available providers and paste your API key. Your agent is ready to use.',
            },
          ].map((item) => (
            <div key={item.step} className="rounded-xl border border-border bg-card/30 p-6">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground text-sm font-bold text-background">
                {item.step}
              </div>
              <h3 className="mt-4 text-sm font-semibold">{item.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{item.desc}</p>
            </div>
          ))}
        </div>
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
                Full AI agent on your computer, powered by NemoClaw
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
                1-day free trial, no credit card needed. Separate from cloud plans.
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
            Choose what fits you, or use both. They are separate subscriptions.
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
                'Managed and auto-updated',
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
                'NemoClaw handles all setup',
                'No terminal interaction required',
                'Full privacy, data stays local',
                'Bring your own API keys',
              ].map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-foreground/70">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-400" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <a href={DOWNLOAD_WIN} className="mt-6 block">
              <Button className="w-full" size="sm">Download and try free</Button>
            </a>
          </div>
        </div>
      </section>

      {/* Features grid */}
      <section className="mx-auto max-w-5xl border-t border-border px-6 py-16">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            <Layers className="size-3" />
            What you get
          </div>
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Everything included, nothing to configure</h2>
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
                q: 'Do I need to use the terminal at all?',
                a: 'No. Valnaa Desktop handles everything through the app interface. NemoClaw sets up your sandbox, installs dependencies, and configures your agent automatically. You never need to open a terminal.',
              },
              {
                q: 'What is NemoClaw?',
                a: 'NemoClaw is the engine that provisions and manages your local AI sandbox. It creates an isolated environment on your machine where your OpenClaw agent runs. Think of it as a one-click local cloud.',
              },
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
                a: 'Yes. The desktop app runs your agent locally, so you bring your own API keys from OpenAI, Anthropic, Google, or other providers. You pay the AI providers directly.',
              },
              {
                q: 'Can I use both cloud and desktop?',
                a: 'Yes. They are separate products with separate subscriptions. Use the cloud for always-on agents and the desktop for private, local work.',
              },
              {
                q: 'What operating systems are supported?',
                a: 'macOS (Intel and Apple Silicon) and Windows 10/11. Linux support is planned.',
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
