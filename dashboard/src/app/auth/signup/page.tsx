'use client';
import { useState, useEffect, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import api from '@/lib/api';
import { Zap, Check, ArrowRight, Loader2, Mail } from 'lucide-react';

declare global {
  interface Window {
    google?: any;
  }
}

const plans = [
  {
    id: 'starter', name: 'Starter', price: '$10', tokens: '500K tokens/month',
    features: ['Personal AI agent', '10 skills', 'Telegram', '1GB storage'],
  },
  {
    id: 'pro', name: 'Pro', price: '$20', popular: true, tokens: '1.5M tokens/month',
    features: ['All 53 skills', 'All messaging apps', 'Browser access', '5GB storage'],
  },
  {
    id: 'business', name: 'Business', price: '$50', tokens: '5M tokens/month',
    features: ['Maximum power', 'Community templates', '100 scheduled tasks', '20GB storage'],
  },
];

export default function SignupPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-mesh">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
      </div>
    }>
      <SignupContent />
    </Suspense>
  );
}

function SignupContent() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedPlan, setSelectedPlan] = useState(searchParams.get('plan') || 'pro');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const referralCode = searchParams.get('ref') || '';

  const handleGoogleResponse = useCallback(async (response: any) => {
    setGoogleLoading(true);
    setError('');
    try {
      const data = await api.post<{ token?: string; checkoutUrl?: string; isNewUser: boolean }>('/auth/google', {
        credential: response.credential,
        plan: selectedPlan,
        referralCode: referralCode || undefined,
      });

      if (data.token) {
        api.setToken(data.token);
        window.location.href = '/dashboard';
      } else if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      }
    } catch (err: any) {
      setError(err.message || 'Google sign-in failed. Please try again.');
    } finally {
      setGoogleLoading(false);
    }
  }, [selectedPlan, referralCode]);

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
      if (!clientId || !window.google) return;

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleGoogleResponse,
        auto_select: false,
      });

      window.google.accounts.id.renderButton(
        document.getElementById('google-signup-button'),
        {
          type: 'standard',
          theme: 'filled_black',
          size: 'large',
          width: 380,
          text: 'signup_with',
          shape: 'pill',
          logo_alignment: 'left',
        }
      );
    };
    document.head.appendChild(script);
  }, [handleGoogleResponse]);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await api.post<{ checkoutUrl: string }>('/auth/signup', {
        email, password, plan: selectedPlan,
        referralCode: referralCode || undefined,
      });
      window.location.href = data.checkoutUrl;
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-mesh px-4 py-12">
      <div className="fixed top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full bg-indigo-500/6 blur-[120px] pointer-events-none" />

      <div className="relative w-full max-w-[640px] animate-fade-up">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-[18px] bg-gradient-to-br from-indigo-500 to-purple-500 shadow-xl shadow-indigo-500/25">
            <Zap className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-[24px] font-bold text-white tracking-tight">Get your AI agent</h1>
          <p className="mt-2 text-[15px] text-white/40">Choose a plan and start in 60 seconds</p>
          {referralCode && (
            <p className="mt-2 text-[13px] text-emerald-400">You&apos;ll get 50% off your first month!</p>
          )}
        </div>

        {/* Plan Selection */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {plans.map((plan) => (
            <button
              key={plan.id}
              onClick={() => setSelectedPlan(plan.id)}
              className={`relative glass p-5 text-left transition-all duration-300 ${
                selectedPlan === plan.id
                  ? 'ring-1 ring-indigo-500/40 glow-accent'
                  : 'glass-hover'
              }`}
            >
              {plan.popular && (
                <span className="absolute -top-2.5 left-4 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 px-2.5 py-0.5 text-[10px] font-semibold text-white">
                  Popular
                </span>
              )}
              <p className="text-[13px] text-white/40">{plan.name}</p>
              <p className="mt-1 text-[24px] font-bold text-white">
                {plan.price}<span className="text-[13px] font-normal text-white/30">/mo</span>
              </p>
              <p className="mt-1 text-[12px] text-white/30">{plan.tokens}</p>
              <ul className="mt-3 space-y-1.5">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-[12px] text-white/50">
                    <Check className="h-3 w-3 text-indigo-400 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            </button>
          ))}
        </div>

        {/* Auth Card */}
        <div className="glass-strong p-7 space-y-5">
          {error && (
            <div className="rounded-xl bg-red-400/10 border border-red-400/20 p-3.5 text-[13px] text-red-400">
              {error}
            </div>
          )}

          {googleLoading && (
            <div className="flex items-center justify-center gap-3 py-4">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-indigo-400" />
              <span className="text-[14px] text-white/50">Setting up with Google...</span>
            </div>
          )}

          {/* Google Sign-Up Button */}
          <div className="flex justify-center">
            <div id="google-signup-button" className="flex justify-center" />
          </div>

          {/* Divider */}
          {!showEmailForm && (
            <>
              <div className="flex items-center gap-4">
                <div className="flex-1 h-px bg-white/8" />
                <span className="text-[12px] text-white/25 uppercase tracking-wider">or</span>
                <div className="flex-1 h-px bg-white/8" />
              </div>

              <button
                onClick={() => setShowEmailForm(true)}
                className="btn-glass w-full py-3 text-[14px] flex items-center justify-center gap-2"
              >
                <Mail className="h-4 w-4 text-white/40" />
                Sign up with email
              </button>
            </>
          )}

          {/* Email + Password Form */}
          {showEmailForm && (
            <>
              <div className="flex items-center gap-4">
                <div className="flex-1 h-px bg-white/8" />
                <span className="text-[12px] text-white/25 uppercase tracking-wider">or use email</span>
                <div className="flex-1 h-px bg-white/8" />
              </div>

              <form onSubmit={handleEmailSubmit} className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-[13px] font-medium text-white/50">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="glass-input w-full px-4 py-3 text-[14px]"
                    placeholder="you@example.com"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-[13px] font-medium text-white/50">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="glass-input w-full px-4 py-3 text-[14px]"
                    placeholder="At least 8 characters"
                    minLength={8}
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary w-full py-3.5 text-[14px] font-medium flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Setting up...
                    </span>
                  ) : (
                    <>Continue with {plans.find((p) => p.id === selectedPlan)?.name} <ArrowRight className="h-4 w-4" /></>
                  )}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-[14px] text-white/30">
          Already have an account?{' '}
          <Link href="/auth/login" className="text-indigo-400 hover:text-indigo-300 transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
