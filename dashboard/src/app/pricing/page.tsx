'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import api from '@/lib/api';
import { Zap, Check, ArrowRight, Loader2 } from 'lucide-react';

type PlanId = 'starter' | 'pro' | 'business';

const PLANS: Array<{
  id: PlanId;
  name: string;
  price: number;
  tokens: string;
  popular?: boolean;
  features: string[];
}> = [
  { id: 'starter', name: 'Starter', price: 10, tokens: '500K', features: ['Personal AI agent', '500K tokens/month', '10 skills', 'Telegram only', 'Email support'] },
  { id: 'pro', name: 'Pro', price: 20, popular: true, tokens: '1.5M', features: ['Everything in Starter', '1.5M tokens/month', 'All 53 skills', 'All messaging apps', 'Browser access', 'Priority support'] },
  { id: 'business', name: 'Business', price: 50, tokens: '5M', features: ['Everything in Pro', '5M tokens/month', 'Community templates', 'Maximum agent power', '100 scheduled tasks', 'Direct support line'] },
];

function PricingContent() {
  const searchParams = useSearchParams();
  const referralCode = useMemo(() => searchParams.get('ref') || '', [searchParams]);

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
        if (overview?.status === 'active' || overview?.status === 'grace_period') {
          window.location.href = '/dashboard';
        }
      } catch {
        // ignore — if billing isn't ready yet, allow user to proceed to checkout
      }
    })();
  }, []);

  const startCheckout = async (plan: PlanId) => {
    setSubmittingPlan(plan);
    setError('');
    try {
      const res = await api.post<{ checkoutUrl: string }>('/billing/checkout', {
        plan,
        referralCode: referralCode || undefined,
      });
      window.location.href = res.checkoutUrl;
    } catch (e: any) {
      setError(e?.message || 'Unable to start checkout. Please try again.');
      setSubmittingPlan(null);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <nav className="border-b border-white/[0.06]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg">
              <Zap className="h-4 w-4 text-white" />
            </div>
            <span className="text-[16px] font-semibold tracking-tight">OpenClaw</span>
          </Link>
          <Link href="/dashboard/billing" className="text-[14px] text-white/50 hover:text-white transition-colors">
            Billing
          </Link>
        </div>
      </nav>

      <section className="mx-auto max-w-5xl px-6 py-20">
        <div className="text-center">
          <h1 className="text-[32px] sm:text-[40px] font-bold tracking-tight">Choose your plan</h1>
          <p className="mt-3 text-[15px] text-white/40">You'll be redirected to Stripe to complete payment.</p>
          {referralCode && (
            <p className="mt-2 text-[13px] text-green-400">Referral applied — 50% off your first month</p>
          )}
        </div>

        {error && (
          <div className="mx-auto mt-10 max-w-2xl rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-[13px] text-red-400">
            {error}
          </div>
        )}

        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`relative border rounded-xl p-7 transition-colors ${
                plan.popular ? 'border-white bg-white/[0.03]' : 'border-white/[0.06] hover:border-white/[0.12]'
              }`}
            >
              {plan.popular && (
                <span className="absolute -top-3 left-6 rounded-full bg-white text-black px-3 py-0.5 text-[11px] font-semibold">
                  Most Popular
                </span>
              )}

              <h3 className="text-[17px] font-semibold">{plan.name}</h3>
              <p className="mt-3">
                <span className="text-[36px] font-bold tracking-tight">${plan.price}</span>
                <span className="text-[14px] text-white/40">/month</span>
              </p>
              <p className="mt-1 text-[13px] text-white/40">{plan.tokens} tokens included</p>

              <ul className="mt-6 space-y-3">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-[14px] text-white/60">
                    <Check className="h-4 w-4 text-white/40 shrink-0 mt-0.5" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => startCheckout(plan.id)}
                disabled={!!submittingPlan}
                className={`mt-8 w-full py-3 text-center text-[14px] font-medium rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 ${
                  plan.popular ? 'btn-primary' : 'btn-glass'
                }`}
              >
                {submittingPlan === plan.id ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Redirecting…
                  </>
                ) : (
                  <>
                    Continue <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function PricingPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen bg-black">
        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
      </div>
    }>
      <PricingContent />
    </Suspense>
  );
}
