'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Header } from '@/components/ui/header';
import { LogoCloud } from '@/components/ui/logo-cloud';
import {
  Box,
  Lock,
  Search,
  Settings,
  Zap,
  Coins,
  ArrowRight,
  Check,
  RocketIcon,
  PhoneCallIcon,
  Sparkles,
  Bot,
  BrainCircuit,
} from 'lucide-react';
import { GlowingEffect } from '@/components/ui/glowing-effect';

const features = [
  {
    icon: Box,
    title: 'Do things the right way',
    desc: "Running out of copy so I'll write anything.",
    area: 'md:[grid-area:1/1/2/7] xl:[grid-area:1/1/2/5]',
  },
  {
    icon: Settings,
    title: 'The best AI code editor ever.',
    desc: "Yes, it's true. I'm not even kidding. Ask my mom if you don't believe me.",
    area: 'md:[grid-area:1/7/2/13] xl:[grid-area:2/1/3/5]',
  },
  {
    icon: Lock,
    title: 'You should buy Aceternity UI Pro',
    desc: "It's the best money you'll ever spend",
    area: 'md:[grid-area:2/1/3/7] xl:[grid-area:1/5/3/8]',
  },
  {
    icon: Sparkles,
    title: 'This card is also built by Cursor',
    desc: "I'm not even kidding. Ask my mom if you don't believe me.",
    area: 'md:[grid-area:2/7/3/13] xl:[grid-area:1/8/2/13]',
  },
  {
    icon: Search,
    title: 'Coming soon on Aceternity UI',
    desc: "I'm writing the code as I record this, no shit.",
    area: 'md:[grid-area:3/1/4/13] xl:[grid-area:2/8/3/13]',
  },
];

const plans = [
  {
    name: 'Starter',
    price: 10,
    tokens: '500K',
    features: [
      'Personal AI agent',
      '500K tokens/month',
      '10 skills',
      'Telegram only',
      'Email support',
    ],
  },
  {
    name: 'Pro',
    price: 20,
    popular: true,
    tokens: '1.5M',
    features: [
      'Everything in Starter',
      '1.5M tokens/month',
      'All 53 skills',
      'All messaging apps',
      'Browser access',
      'Priority support',
    ],
  },
  {
    name: 'Business',
    price: 50,
    tokens: '5M',
    features: [
      'Everything in Pro',
      '5M tokens/month',
      'Community templates',
      'Maximum agent power',
      '100 scheduled tasks',
      'Direct support line',
    ],
  },
];

const logos = [
  {
    src: 'https://storage.efferd.com/logo/nvidia-wordmark.svg',
    alt: 'Nvidia Logo',
  },
  {
    src: 'https://storage.efferd.com/logo/supabase-wordmark.svg',
    alt: 'Supabase Logo',
  },
  {
    src: 'https://storage.efferd.com/logo/openai-wordmark.svg',
    alt: 'OpenAI Logo',
  },
  {
    src: 'https://storage.efferd.com/logo/turso-wordmark.svg',
    alt: 'Turso Logo',
  },
  {
    src: 'https://storage.efferd.com/logo/vercel-wordmark.svg',
    alt: 'Vercel Logo',
  },
  {
    src: 'https://storage.efferd.com/logo/github-wordmark.svg',
    alt: 'GitHub Logo',
  },
  {
    src: 'https://storage.efferd.com/logo/claude-wordmark.svg',
    alt: 'Claude AI Logo',
  },
  {
    src: 'https://storage.efferd.com/logo/clerk-wordmark.svg',
    alt: 'Clerk Logo',
  },
];

export default function LandingPage() {
  return (
    <div className="flex w-full flex-col">
      <Header />
      <main className="grow">
        <HeroSection />
        <LogosSection />
        <FeaturesSection />
        <PricingSection />
        <CTASection />
      </main>
      <Footer />
    </div>
  );
}

function HeroSection() {
  return (
    <section className="relative mx-auto w-full max-w-5xl">
      {/* Radial glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 isolate hidden overflow-hidden lg:block"
      >
        <div className="absolute inset-0 -top-14 isolate -z-10 bg-[radial-gradient(35%_80%_at_49%_0%,rgba(250,250,250,0.08),transparent)]" />
      </div>

      {/* Vertical border lines */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 mx-auto hidden min-h-screen w-full max-w-5xl lg:block"
      >
        <div className="absolute inset-y-0 left-0 z-10 h-full w-px bg-foreground/15 [mask-image:linear-gradient(to_bottom,transparent,black_80%,transparent)]" />
        <div className="absolute inset-y-0 right-0 z-10 h-full w-px bg-foreground/15 [mask-image:linear-gradient(to_bottom,transparent,black_80%,transparent)]" />
      </div>

      <div className="relative flex flex-col items-center justify-center gap-5 px-4 pt-32 pb-30">
        {/* Inner decorative lines */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-1 size-full overflow-hidden"
        >
          <div className="absolute inset-y-0 left-4 w-px bg-gradient-to-b from-transparent via-border to-border md:left-8" />
          <div className="absolute inset-y-0 right-4 w-px bg-gradient-to-b from-transparent via-border to-border md:right-8" />
          <div className="absolute inset-y-0 left-8 w-px bg-gradient-to-b from-transparent via-border/50 to-border/50 md:left-12" />
          <div className="absolute inset-y-0 right-8 w-px bg-gradient-to-b from-transparent via-border/50 to-border/50 md:right-12" />
        </div>

        <a
          className={cn(
            'group mx-auto flex w-fit items-center gap-3 rounded-full border bg-card px-3 py-1 shadow',
            'fade-in slide-in-from-bottom-10 animate-in fill-mode-backwards transition-all delay-500 duration-500 ease-out'
          )}
          href="#features"
        >
          <RocketIcon className="size-3 text-muted-foreground" />
          <span className="text-xs">Open-source & self-hostable</span>
          <span className="block h-5 border-l" />
          <ArrowRight className="size-3 duration-150 ease-out group-hover:translate-x-1" />
        </a>

        <h1
          className={cn(
            'fade-in slide-in-from-bottom-10 animate-in text-balance fill-mode-backwards text-center text-4xl font-bold tracking-tight delay-100 duration-500 ease-out md:text-5xl lg:text-6xl'
          )}
        >
          Your Personal AI
          <br />
          <span className="text-muted-foreground">Ready in 60 Seconds</span>
        </h1>

        <p className="fade-in slide-in-from-bottom-10 mx-auto max-w-md animate-in fill-mode-backwards text-center text-base tracking-wider text-foreground/70 delay-200 duration-500 ease-out sm:text-lg md:text-xl">
          The most powerful open-source AI agent,
          <br />
          hosted for you. Zero setup.
        </p>

        <div className="fade-in slide-in-from-bottom-10 flex animate-in flex-row flex-wrap items-center justify-center gap-5 fill-mode-backwards pt-2 delay-300 duration-500 ease-out">
          <Link href="#pricing" className="relative rounded-full">
            <GlowingEffect
              spread={50}
              glow={true}
              disabled={false}
              proximity={100}
              inactiveZone={0.01}
              borderWidth={2}
              blur={3}
            />
            <Button className="relative rounded-full" size="lg" variant="secondary">
              <PhoneCallIcon className="mr-2 size-4" />
              View Pricing
            </Button>
          </Link>
          <Link href="/auth/signup" className="relative rounded-full">
            <GlowingEffect
              spread={50}
              glow={true}
              disabled={false}
              proximity={100}
              inactiveZone={0.01}
              borderWidth={2}
              blur={3}
            />
            <Button className="relative rounded-full" size="lg">
              Get Your AI Agent
              <ArrowRight className="ms-2 size-4" />
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
        Powered by technology from{' '}
        <span className="text-foreground">industry leaders</span>
      </h2>
      <div className="relative z-10 mx-auto max-w-4xl">
        <LogoCloud logos={logos} />
      </div>
    </section>
  );
}

function FeaturesSection() {
  return (
    <section
      id="features"
      className="relative mx-auto max-w-5xl border-t border-border px-6 py-24"
    >
      <div className="mx-auto max-w-2xl text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
          <Sparkles className="size-3" />
          Capabilities
        </div>
        <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
          Everything your agent can do
        </h2>
        <p className="mt-3 text-base text-muted-foreground">
          No coding. No technical knowledge needed.
        </p>
      </div>

      <ul className="mt-16 grid grid-cols-1 grid-rows-none gap-4 md:grid-cols-12 md:grid-rows-3 lg:gap-4 xl:grid-rows-2">
        {features.map((f) => (
          <li
            key={f.title}
            className={cn('min-h-[14rem] list-none', f.area)}
          >
            <div className="relative h-full rounded-[1.25rem] border-[0.75px] border-border p-2 md:rounded-[1.5rem] md:p-3">
              <GlowingEffect
                spread={40}
                glow={true}
                disabled={false}
                proximity={64}
                inactiveZone={0.01}
                borderWidth={3}
              />
              <div className="relative flex h-full flex-col justify-between gap-6 overflow-hidden rounded-xl border-[0.75px] bg-background p-6 shadow-sm dark:shadow-[0px_0px_27px_0px_rgba(45,45,45,0.3)] md:p-6">
                <div className="relative flex flex-1 flex-col justify-between gap-3">
                  <div className="w-fit rounded-lg border-[0.75px] border-border bg-muted p-2">
                    <f.icon className="h-4 w-4 text-foreground/70" />
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
          </li>
        ))}
      </ul>
    </section>
  );
}

function PricingSection() {
  return (
    <section
      id="pricing"
      className="relative mx-auto max-w-5xl border-t border-border px-6 py-24"
    >
      <div className="mx-auto max-w-2xl text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
          <Coins className="size-3" />
          Pricing
        </div>
        <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
          Simple, transparent pricing
        </h2>
        <p className="mt-3 text-base text-muted-foreground">
          Start with what you need. Upgrade anytime. Cancel anytime.
        </p>
      </div>

      <div className="mt-16 grid grid-cols-1 gap-5 sm:grid-cols-3">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className={cn(
              'relative flex flex-col rounded-xl border p-7 transition-all duration-300',
              plan.popular
                ? 'border-foreground bg-foreground/[0.03] shadow-[0_0_30px_rgba(250,250,250,0.04)]'
                : 'border-border hover:border-foreground/20'
            )}
          >
            {plan.popular && (
              <span className="absolute -top-3 left-6 rounded-full bg-foreground px-3 py-0.5 text-[11px] font-semibold text-background">
                Most Popular
              </span>
            )}
            <h3 className="text-lg font-semibold">{plan.name}</h3>
            <p className="mt-3">
              <span className="text-4xl font-bold tracking-tight">
                ${plan.price}
              </span>
              <span className="text-sm text-muted-foreground">/month</span>
            </p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {plan.tokens} tokens included
            </p>
            <ul className="mt-6 flex-1 space-y-3">
              {plan.features.map((f) => (
                <li
                  key={f}
                  className="flex items-start gap-2.5 text-sm text-foreground/70"
                >
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Link href="/auth/signup" className="relative mt-8 block rounded-md">
              <GlowingEffect
                spread={50}
                glow={true}
                disabled={false}
                proximity={100}
                inactiveZone={0.01}
                borderWidth={2}
                blur={3}
              />
              <Button
                variant={plan.popular ? 'default' : 'outline'}
                className="relative w-full"
                size="lg"
              >
                Get Started
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}

function CTASection() {
  return (
    <section id="about" className="mx-auto max-w-3xl px-6 py-24">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-12 text-center">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(250,250,250,0.04),transparent_70%)]"
        />
        <div className="relative">
          <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-secondary">
            <Bot className="h-6 w-6" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight md:text-3xl">
            Ready to meet your AI agent?
          </h2>
          <p className="mt-3 text-base text-muted-foreground">
            From payment to working agent in under 60 seconds. Open-source and
            self-hostable.
          </p>
          <Link href="/auth/signup" className="relative mt-8 inline-block rounded-full">
            <GlowingEffect
              spread={50}
              glow={true}
              disabled={false}
              proximity={100}
              inactiveZone={0.01}
              borderWidth={2}
              blur={3}
            />
            <Button size="lg" className="relative rounded-full">
              Get Started Now
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
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
          <Zap className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            Valnaa — Powered by open-source AI
          </span>
        </div>
        <div className="flex items-center gap-6">
          <a
            href="#features"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Features
          </a>
          <a
            href="#pricing"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Pricing
          </a>
          <Link
            href="/auth/login"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Sign In
          </Link>
        </div>
      </div>
    </footer>
  );
}
