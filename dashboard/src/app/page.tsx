'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Header } from '@/components/ui/header';
import { LogoCloud } from '@/components/ui/logo-cloud';
import {
  Zap,
  MessageSquare,
  Globe,
  Shield,
  Coins,
  ArrowRight,
  Check,
  Sparkles,
  Bot,
  Cpu,
  HardDrive,
  Terminal,
  Brain,
} from 'lucide-react';
import { GlowingEffect } from '@/components/ui/glowing-effect';
import Image from 'next/image';
import dynamic from 'next/dynamic';

const DotScreenShader = dynamic(
  () => import('@/components/ui/dot-shader-background').then((m) => m.DotScreenShader),
  { ssr: false }
);

const features = [
  {
    icon: Zap,
    title: '1-Click Deploy',
    desc: 'Pick a plan, pay, and your OpenClaw instance is live on a dedicated VPS in under 2 minutes. No terminal needed.',
  },
  {
    icon: Brain,
    title: 'Smart AI Routing',
    desc: 'Our router picks the cheapest model that can handle each task. Simple chat uses a $0.10 model, complex coding gets Claude or GPT-4o. You save 50-80% automatically.',
  },
  {
    icon: Globe,
    title: 'Built-in Browser',
    desc: 'Your agent browses the web, fills forms, scrapes data, and researches topics — all from inside OpenClaw.',
  },
  {
    icon: MessageSquare,
    title: 'All Messaging Apps',
    desc: 'Telegram, WhatsApp, Discord, Slack — connect any channel. Your agent responds 24/7.',
  },
  {
    icon: Shield,
    title: 'Isolated & Secure',
    desc: 'Each user gets their own container with private storage. No other user can access your data or your agent.',
  },
  {
    icon: Coins,
    title: 'Bring Your Own Key',
    desc: 'Want unlimited usage? Plug in your own OpenRouter API key and use any model directly, no platform limits.',
  },
];

const howItWorks = [
  { step: '1', title: 'Pick a plan', desc: 'Choose the VPS size you need. Pay in 30 seconds.' },
  { step: '2', title: 'OpenClaw deploys', desc: 'We provision a dedicated VPS with OpenClaw pre-installed and configured.' },
  { step: '3', title: 'Use the dashboard', desc: 'Chat with your agent, connect messaging apps, configure skills — all from the web.' },
  { step: '4', title: 'Save on AI costs', desc: 'Smart routing and cost optimization work automatically. Or bring your own API key.' },
];

const plans = [
  {
    name: 'Starter',
    price: 15,
    tokens: '$2',
    ram: '2 GB',
    cpus: '1 vCPU',
    storage: '10 GB',
    features: [
      '$2 of AI credits every month',
      '2 GB RAM · 1 vCPU',
      '1 AI agent',
      'Smart AI routing & cost optimization',
      '20+ AI models (Claude, GPT-4o, Gemini…)',
      'All skills & tools',
      'All messaging apps',
      'Web browser & file storage',
    ],
  },
  {
    name: 'Pro',
    price: 25,
    popular: true,
    tokens: '$3',
    ram: '4 GB',
    cpus: '2 vCPU',
    storage: '50 GB',
    features: [
      '$3 of AI credits every month',
      '4 GB RAM · 2 vCPU',
      '2 AI agents',
      'Smart AI routing & cost optimization',
      '20+ AI models (Claude, GPT-4o, Gemini…)',
      'All skills & tools',
      'All messaging apps',
      'Web browser & file storage',
    ],
  },
  {
    name: 'Business',
    price: 50,
    popular: false,
    tokens: '$10',
    ram: '8 GB',
    cpus: '4 vCPU',
    storage: '100 GB',
    features: [
      '$10 of AI credits every month',
      '8 GB RAM · 4 vCPU',
      '4 AI agents',
      'Smart AI routing & cost optimization',
      '20+ AI models (Claude, GPT-4o, Gemini…)',
      'All skills & tools',
      'All messaging apps',
      'Web browser & file storage',
    ],
  },
];

const logos = [
  { src: 'https://storage.efferd.com/logo/openai-wordmark.svg', alt: 'OpenAI' },
  { src: 'https://storage.efferd.com/logo/claude-wordmark.svg', alt: 'Claude AI' },
  { src: 'https://storage.efferd.com/logo/github-wordmark.svg', alt: 'GitHub' },
  { src: 'https://storage.efferd.com/logo/vercel-wordmark.svg', alt: 'Vercel' },
  { src: 'https://storage.efferd.com/logo/supabase-wordmark.svg', alt: 'Supabase' },
  { src: 'https://storage.efferd.com/logo/nvidia-wordmark.svg', alt: 'Nvidia' },
];

export default function LandingPage() {
  return (
    <div className="relative flex w-full flex-col">
      <div className="pointer-events-none fixed inset-0 z-0 h-screen w-full">
        <DotScreenShader />
      </div>
      <div className="relative z-10">
        <Header />
        <main className="grow">
          <HeroSection />
          <LogosSection />
          <WhatIsItSection />
          <FeaturesSection />
          <HowItWorksSection />
          <PricingSection />
          <CTASection />
        </main>
        <Footer />
      </div>
    </div>
  );
}

function HeroSection() {
  return (
    <section className="relative mx-auto w-full max-w-5xl">
      <div className="relative flex flex-col items-center justify-center gap-5 px-4 pt-32 pb-30">
        <div
          className={cn(
            'mx-auto flex w-fit items-center gap-2 rounded-full border bg-card px-3 py-1 shadow',
            'fade-in slide-in-from-bottom-10 animate-in fill-mode-backwards transition-all delay-500 duration-500 ease-out'
          )}
        >
          <Bot className="size-3 text-muted-foreground" />
          <span className="text-xs">OpenClaw hosting — instant setup</span>
        </div>

        <h1
          className={cn(
            'fade-in slide-in-from-bottom-10 animate-in text-balance fill-mode-backwards text-center text-4xl font-bold tracking-tight delay-100 duration-500 ease-out md:text-5xl lg:text-6xl'
          )}
        >
          OpenClaw in 1 Click
          <br />
          <span className="text-muted-foreground">Your Own VPS, Instantly</span>
        </h1>

        <p className="fade-in slide-in-from-bottom-10 mx-auto max-w-lg animate-in fill-mode-backwards text-center text-base tracking-wider text-foreground/70 delay-200 duration-500 ease-out sm:text-lg">
          Get a dedicated VPS running OpenClaw in under 2 minutes. Smart AI routing picks
          the best model for each task and cuts your costs automatically.
        </p>

        <div className="fade-in slide-in-from-bottom-10 flex animate-in flex-row flex-wrap items-center justify-center gap-3 fill-mode-backwards pt-2 delay-300 duration-500 ease-out">
          <Link href="#pricing">
            <Button className="rounded-full" size="lg" variant="secondary">
              See Plans
            </Button>
          </Link>
          <Link href="/auth/signup">
            <Button className="rounded-full" size="lg">
              Deploy OpenClaw
              <ArrowRight className="size-4" />
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}

function LogosSection() {
  return (
    <section className="relative space-y-4 border-t border-border pt-6 pb-10">
      <h2 className="text-center text-lg font-medium tracking-tight text-muted-foreground md:text-xl">
        Powered by <span className="text-foreground">leading AI models</span>
      </h2>
      <div className="relative z-10 mx-auto max-w-4xl">
        <LogoCloud logos={logos} />
      </div>
    </section>
  );
}

function WhatIsItSection() {
  return (
    <section className="relative mx-auto max-w-5xl border-t border-border px-6 py-20">
      <div className="mx-auto max-w-3xl">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 md:items-center">
          <div>
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              Hosted OpenClaw
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              Valnaa is an OpenClaw SaaS. We give you a dedicated VPS with OpenClaw pre-installed
              and ready to go — no server setup, no Docker, no config files.
            </p>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              On top of that, we add smart AI routing that automatically picks the cheapest model
              that can handle each task, so you get great results without burning through credits.
            </p>
          </div>
          <div className="space-y-4">
            {[
              { icon: Terminal, label: 'Your own VPS', desc: 'Dedicated container with guaranteed RAM, CPU, and isolated storage' },
              { icon: Coins, label: 'Optimized AI costs', desc: 'Smart routing picks cheap models for simple tasks, powerful ones only when needed' },
              { icon: Cpu, label: '20+ AI models', desc: 'Claude, GPT-4o, Gemini, DeepSeek, Llama — all available, auto-selected' },
            ].map(item => (
              <div key={item.label} className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary">
                  <item.icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{item.label}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function FeaturesSection() {
  return (
    <section id="features" className="relative mx-auto max-w-5xl border-t border-border px-6 py-24">
      <div className="mx-auto max-w-2xl text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
          <Sparkles className="size-3" />
          Capabilities
        </div>
        <h2 className="text-3xl font-bold tracking-tight md:text-4xl">What you get</h2>
        <p className="mt-3 text-base text-muted-foreground">
          Everything included. No server setup, no DevOps, no coding.
        </p>
      </div>

      <div className="mt-16 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => (
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
  );
}

function HowItWorksSection() {
  return (
    <section className="relative mx-auto max-w-5xl border-t border-border px-6 py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight md:text-4xl">How it works</h2>
        <p className="mt-3 text-base text-muted-foreground">From sign-up to working agent in under 2 minutes.</p>
      </div>

      <div className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {howItWorks.map((s) => (
          <div key={s.step} className="relative flex flex-col items-start rounded-xl border border-border bg-card p-6">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground text-lg font-bold text-background">
              {s.step}
            </span>
            <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{s.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function PricingSection() {
  return (
    <section id="pricing" className="relative mx-auto max-w-5xl border-t border-border px-6 py-24">
      <div className="mx-auto max-w-2xl text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
          <Coins className="size-3" />
          Pricing
        </div>
        <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Pick your plan</h2>
        <p className="mt-3 text-base text-muted-foreground">
          Every plan includes a dedicated server, smart routing, and AI credits starting at $3/mo.
        </p>
      </div>

      <div className="mt-16 grid grid-cols-1 gap-5 sm:grid-cols-3">
        {plans.map((plan) => (
          <div key={plan.name} className="min-h-[24rem]">
            <div className="relative h-full rounded-[1.25rem] border-[0.75px] border-border p-2 md:rounded-[1.5rem] md:p-3">
              <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} borderWidth={3} />
              <div
                className={cn(
                  'relative flex h-full flex-col rounded-xl border-[0.75px] p-7 bg-background',
                  plan.popular
                    ? 'border-foreground bg-foreground/[0.03] shadow-[0_0_30px_rgba(250,250,250,0.04)]'
                    : 'border-border'
                )}
              >
                {plan.popular && (
                  <span className="absolute -top-3 left-6 rounded-full bg-foreground px-3 py-0.5 text-[11px] font-semibold text-background">
                    Most Popular
                  </span>
                )}
                <h3 className="text-lg font-semibold">{plan.name}</h3>
                <p className="mt-3">
                  <span className="text-4xl font-bold tracking-tight">${plan.price}</span>
                  <span className="text-sm text-muted-foreground">/month</span>
                </p>
                <div className="mt-2 flex items-center gap-3 text-[13px] text-muted-foreground">
                  <span className="flex items-center gap-1"><HardDrive className="h-3 w-3" /> {plan.ram} RAM</span>
                  <span className="flex items-center gap-1"><Cpu className="h-3 w-3" /> {plan.cpus}</span>
                  <span className="flex items-center gap-1"><Coins className="h-3 w-3" /> {plan.tokens}</span>
                </div>

                <ul className="mt-6 flex-1 space-y-2.5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-foreground/70">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <Link href="/auth/signup" className="mt-8">
                  <Button variant={plan.popular ? 'default' : 'outline'} className="w-full" size="lg">
                    Get Started <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mx-auto mt-10 max-w-xl rounded-xl border border-border bg-card p-6 text-center">
        <p className="text-sm font-medium text-foreground">All plans include</p>
        <p className="mt-2 text-sm text-muted-foreground">
          All messaging apps (Telegram, Discord, Slack, WhatsApp) · Web browser · Smart AI routing ·
          All skills & tools · Scheduled tasks · Persistent memory · File storage
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          Need more AI credits? Add credits anytime, or bring your own OpenRouter API key for unlimited usage.
        </p>
      </div>
    </section>
  );
}

function CTASection() {
  return (
    <section id="about" className="mx-auto max-w-3xl px-6 py-24">
      <div className="relative rounded-[1.25rem] border-[0.75px] border-border p-2 md:rounded-[1.5rem] md:p-3">
        <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} borderWidth={3} />
        <div className="relative overflow-hidden rounded-xl border-[0.75px] border-border bg-card p-12 text-center">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(250,250,250,0.04),transparent_70%)]" />
          <div className="relative">
            <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-secondary">
              <Bot className="h-6 w-6" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight md:text-3xl">Ready to deploy OpenClaw?</h2>
            <p className="mt-3 text-base text-muted-foreground">
              From payment to a live OpenClaw instance in under 2 minutes. No setup, no terminal, no hassle.
            </p>
            <Link href="/auth/signup">
              <Button size="lg" className="mt-8 rounded-full">
                Get Started Now <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
        <div className="flex items-center gap-2">
          <Image src="/favicon.png" alt="Valnaa" width={18} height={18} className="rounded-sm" />
          <span className="text-sm text-muted-foreground">Valnaa — Hosted OpenClaw, smart routing, your server</span>
        </div>
        <div className="flex items-center gap-6">
          <a href="#features" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Features</a>
          <a href="#pricing" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Pricing</a>
          {process.env.NEXT_PUBLIC_SUPPORT_EMAIL && (
            <a href={`mailto:${process.env.NEXT_PUBLIC_SUPPORT_EMAIL}`} className="text-sm text-muted-foreground transition-colors hover:text-foreground">Contact</a>
          )}
          <Link href="/auth/login" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Sign In</Link>
        </div>
      </div>
    </footer>
  );
}
