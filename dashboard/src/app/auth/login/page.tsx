'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Zap, ArrowRight, Loader2 } from 'lucide-react';

declare global {
  interface Window {
    google?: any;
    handleGoogleSignIn?: (response: any) => void;
  }
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const handleGoogleResponse = useCallback(
    async (response: any) => {
      setGoogleLoading(true);
      setError('');
      try {
        const data = await api.post<{ token: string; isNewUser: boolean }>(
          '/auth/google',
          { credential: response.credential }
        );

        api.setToken(data.token);
        if (data.isNewUser) {
          router.push('/pricing');
        } else {
          try {
            const billing = await api.get<{ status: string }>('/billing');
            const active = ['active', 'sleeping', 'grace_period'];
            router.push(
              active.includes(billing.status) ? '/dashboard' : '/pricing'
            );
          } catch {
            router.push('/pricing');
          }
        }
      } catch (err: any) {
        setError(err.message || 'Google sign-in failed. Please try again.');
      } finally {
        setGoogleLoading(false);
      }
    },
    [router]
  );

  useEffect(() => {
    window.handleGoogleSignIn = handleGoogleResponse;

    const initGoogle = () => {
      const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
      if (!clientId || !window.google) return;

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleGoogleResponse,
        auto_select: false,
        cancel_on_tap_outside: true,
      });

      window.google.accounts.id.renderButton(
        document.getElementById('google-signin-button'),
        {
          type: 'standard',
          theme: 'filled_black',
          size: 'large',
          width: 360,
          text: 'signin_with',
          shape: 'rectangular',
          logo_alignment: 'left',
        }
      );
      setGoogleReady(true);
    };

    if (window.google?.accounts) {
      initGoogle();
    } else {
      const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
      if (existing) {
        existing.addEventListener('load', initGoogle);
      } else {
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.onload = initGoogle;
        document.head.appendChild(script);
      }
    }

    return () => {
      window.handleGoogleSignIn = undefined;
    };
  }, [handleGoogleResponse]);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await api.post<{ token: string; user: any }>(
        '/auth/login',
        { email, password }
      );
      api.setToken(data.token);
      const activeStatuses = ['active', 'sleeping', 'grace_period'];
      router.push(
        activeStatuses.includes(data.user?.status) ? '/dashboard' : '/pricing'
      );
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`relative flex min-h-screen items-center justify-center bg-background px-4 transition-opacity duration-500 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
      {/* Background glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(250,250,250,0.04),transparent_50%)]"
      />

      <div className="relative w-full max-w-[420px]">
        <div className="mb-8 text-center">
          <Link
            href="/"
            className="mx-auto mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-card"
          >
            <Zap className="h-5 w-5" />
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Sign in to your dashboard
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card/50 p-6 shadow-lg shadow-black/20">
          <div className="space-y-5">
            {error && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-[13px] text-red-400">
                {error}
              </div>
            )}

            {googleLoading && (
              <div className="flex items-center justify-center gap-3 py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  Signing in with Google...
                </span>
              </div>
            )}

            <div className="flex justify-center" style={{ minHeight: 44 }}>
              {!googleReady && (
                <div className="flex h-[44px] w-[360px] max-w-full items-center justify-center rounded-md border border-border bg-card">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              )}
              <div id="google-signin-button" className={`flex justify-center transition-opacity duration-300 ${googleReady ? 'opacity-100' : 'opacity-0 absolute'}`} />
            </div>

            <div className="flex items-center gap-4">
              <div className="h-px flex-1 bg-border" />
              <span className="text-[12px] uppercase tracking-wider text-muted-foreground">
                or
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-[13px] font-medium text-muted-foreground">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 transition-colors focus:border-foreground/30 focus:outline-none"
                  placeholder="you@example.com"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[13px] font-medium text-muted-foreground">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 transition-colors focus:border-foreground/30 focus:outline-none"
                  placeholder="Your password"
                  required
                />
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full"
                size="lg"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Signing in...
                  </span>
                ) : (
                  <>
                    Sign In <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </form>
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{' '}
          <Link
            href="/auth/signup"
            className="text-foreground underline underline-offset-4 transition-colors hover:text-foreground/80"
          >
            Sign up
          </Link>
        </p>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          By signing in, you agree to our{' '}
          <Link href="/terms" className="underline underline-offset-2 hover:text-foreground/80">Terms of Service</Link>
          {' '}and{' '}
          <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground/80">Privacy Policy</Link>.
        </p>
      </div>
    </div>
  );
}
