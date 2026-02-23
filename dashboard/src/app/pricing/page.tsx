'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import api from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { Zap, Check, ArrowRight, Loader2, Coins } from 'lucide-react';

type PlanId = 'starter' | 'pro' | 'business';

const PLANS: Array<{
  id: PlanId;
  name: string;
  price: number;
  tokens: string;
  ram: string;
  cpus: string;
  storage: string;
  popular?: boolean;
  features: string[];
}> = [
  {
    id: 'starter',
    name: 'Starter',
    price: 10,
    tokens: '$2',
    ram: '2 GB',
    cpus: '1 vCPU',
    storage: '1 GB',
    features: [
      '$2/mo AI budget included',
      '2 GB RAM dedicated server',
      '1 vCPU · 1 GB storage',
      '1 AI agent · 10 skills',
      '3 scheduled tasks',
      'Telegram channel',
      'Smart AI routing',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 20,
    popular: true,
    tokens: '$7',
    ram: '4 GB',
    cpus: '2 vCPU',
    storage: '5 GB',
    features: [
      '$7/mo AI budget included',
      '4 GB RAM dedicated server',
      '2 vCPU · 5 GB storage',
      '2 AI agents · All 53 skills',
      '20 scheduled tasks',
      'All messaging apps',
      'Full browser access',
      'Smart AI routing',
    ],
  },
  {
    id: 'business',
    name: 'Business',
    price: 50,
    tokens: '$12',
    ram: '8 GB',
    cpus: '4 vCPU',
    storage: '20 GB',
    features: [
      '$12/mo AI budget included',
      '8 GB RAM dedicated server',
      '4 vCPU · 20 GB storage',
      '4 AI agents · All 53 skills',
      '100 scheduled tasks',
      'All messaging apps',
      'Full browser access',
      'Smart AI routing',
      'Direct support line',
    ],
  },
];

function PricingContent() {
  const searchParams = useSearchParams();
  const referralCode = useMemo(
    () => searchParams.get('ref') || '',
    [searchParams]
  );

  const [submittingPlan, setSubmittingPlan] = useState<PlanId | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!api.getToken()) {
      window.location.href = '/auth/signup';
      return;
    }

    (async () => {
      try {
        const overview = await api.get<{ status: string }>('/billing');
        if (
          overview?.status === 'active' ||
          overview?.status === 'grace_period'
        ) {
          window.location.href = '/dashboard';
        }
      } catch {
        // allow user to proceed
      }
    })();
  }, []);

  const startCheckout = async (plan: PlanId) => {
    setSubmittingPlan(plan);
    setError('');
    try {
      const res = await api.post<{ checkoutUrl: string }>(
        '/billing/checkout',
        {
          plan,
          referralCode: referralCode || undefined,
        }
      );
      window.location.href = res.checkoutUrl;
    } catch (e: any) {
      setError(e?.message || 'Unable to start checkout. Please try again.');
      setSubmittingPlan(null);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <nav className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5 rounded-md p-1">
            <Zap className="h-4 w-4" />
            <span className="text-sm font-semibold tracking-tight">
              Valnaa
            </span>
          </Link>
          <Link
            href="/dashboard/billing"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Billing
          </Link>
        </div>
      </nav>

      <section className="mx-auto max-w-5xl px-6 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            <Coins className="size-3" />
            Choose your plan
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Choose your plan
          </h1>
          <p className="mt-3 text-base text-muted-foreground">
            You&apos;ll be redirected to Stripe to complete payment.
          </p>
          {referralCode && (
            <p className="mt-2 text-[13px] text-green-400">
              Referral applied — 50% off your first month
            </p>
          )}
        </div>

        {error && (
          <div className="mx-auto mt-10 max-w-2xl rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-[13px] text-red-400">
            {error}
          </div>
        )}

        <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
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
              <p className="mt-2 text-[12px] text-muted-foreground">
                {plan.ram} RAM · {plan.cpus} · {plan.storage} storage · {plan.tokens}/mo AI
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

              <Button
                onClick={() => startCheckout(plan.id)}
                disabled={!!submittingPlan}
                variant={plan.popular ? 'default' : 'outline'}
                className="mt-8 w-full"
                size="lg"
              >
                {submittingPlan === plan.id ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Redirecting…
                  </>
                ) : (
                  <>
                    Continue <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function PricingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <PricingContent />
    </Suspense>
  );
}
