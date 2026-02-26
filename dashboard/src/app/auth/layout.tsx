'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import Script from 'next/script';
import api from '@/lib/api';
import Image from 'next/image';
import { Button } from '@/components/ui/Button';
import { ArrowRight, Loader2 } from 'lucide-react';

declare global {
  interface Window {
    google?: any;
  }
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isLogin = pathname === '/auth/login';
  const referralCode = searchParams.get('ref') || '';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    setError('');
  }, [pathname]);

  const navigateTo = (path: string) => {
    setError('');
    setEmail('');
    setPassword('');
    router.push(path);
  };

  const handlePostAuth = useCallback(
    async (token: string, isNewUser: boolean) => {
      api.setToken(token);
      if (isNewUser) {
        window.location.href = `/pricing${referralCode ? `?ref=${encodeURIComponent(referralCode)}` : ''}`;
        return;
      }
      try {
        const billing = await api.get<{ status: string }>('/billing');
        const active = ['active', 'sleeping', 'grace_period'];
        window.location.href = active.includes(billing.status) ? '/dashboard' : '/pricing';
      } catch {
        window.location.href = '/pricing';
      }
    },
    [referralCode]
  );

  const handleGoogleClick = useCallback(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId || !window.google) {
      setError('Google sign-in is not available right now. Please use email.');
      return;
    }
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: async (response: any) => {
        setGoogleLoading(true);
        setError('');
        try {
          const data = await api.post<{ token: string; isNewUser: boolean }>(
            '/auth/google',
            {
              credential: response.credential,
              referralCode: referralCode || undefined,
            }
          );
          await handlePostAuth(data.token, data.isNewUser);
        } catch (err: any) {
          setError(err.message || 'Google sign-in failed. Please try again.');
        } finally {
          setGoogleLoading(false);
        }
      },
    });
    window.google.accounts.id.prompt();
  }, [referralCode, handlePostAuth]);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isLogin) {
        const data = await api.post<{ token: string; user: any }>('/auth/login', { email, password });
        api.setToken(data.token);
        const active = ['active', 'sleeping', 'grace_period'];
        window.location.href = active.includes(data.user?.status) ? '/dashboard' : '/pricing';
      } else {
        const data = await api.post<{ token: string }>('/auth/signup', {
          email,
          password,
          referralCode: referralCode || undefined,
        });
        api.setToken(data.token);
        window.location.href = `/pricing${referralCode ? `?ref=${encodeURIComponent(referralCode)}` : ''}`;
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(250,250,250,0.04),transparent_50%)]"
      />
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" />

      <div className="relative w-full max-w-[420px]">
        <div className="mb-8 text-center">
          <Link
            href="/"
            className="mx-auto mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-card overflow-hidden"
          >
            <Image src="/favicon.png" alt="Valnaa" width={28} height={28} />
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">
            {isLogin ? 'Welcome back' : 'Create your account'}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {isLogin ? 'Sign in to your dashboard' : 'Get your AI agent in 60 seconds'}
          </p>
          {!isLogin && referralCode && (
            <p className="mt-2 text-[13px] text-green-400">
              You&apos;ll get 50% off your first month
            </p>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card/50 p-6 shadow-lg shadow-black/20">
          <div className="space-y-5">
            {error && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-[13px] text-red-400">
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={handleGoogleClick}
              disabled={googleLoading}
              className="flex w-full items-center justify-center gap-3 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
            >
              {googleLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
              )}
              {googleLoading
                ? (isLogin ? 'Signing in...' : 'Setting up...')
                : 'Continue with Google'}
            </button>

            <div className="flex items-center gap-4">
              <div className="h-px flex-1 bg-border" />
              <span className="text-[12px] uppercase tracking-wider text-muted-foreground">or</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-[13px] font-medium text-muted-foreground">Email</label>
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
                <label className="block text-[13px] font-medium text-muted-foreground">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 transition-colors focus:border-foreground/30 focus:outline-none"
                  placeholder={isLogin ? 'Your password' : 'At least 8 characters'}
                  minLength={isLogin ? undefined : 8}
                  required
                />
              </div>
              <Button type="submit" disabled={loading} className="w-full" size="lg">
                {loading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {isLogin ? 'Signing in...' : 'Setting up...'}
                  </span>
                ) : (
                  <>
                    {isLogin ? 'Sign In' : 'Create Account'}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </form>

            {!isLogin && (
              <p className="text-center text-xs text-muted-foreground">
                You&apos;ll choose a plan on the next step
              </p>
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {isLogin ? (
            <>
              Don&apos;t have an account?{' '}
              <button
                onClick={() => navigateTo('/auth/signup')}
                className="text-foreground underline underline-offset-4 transition-colors hover:text-foreground/80"
              >
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                onClick={() => navigateTo('/auth/login')}
                className="text-foreground underline underline-offset-4 transition-colors hover:text-foreground/80"
              >
                Sign in
              </button>
            </>
          )}
        </p>
        <p className="mt-8 text-center text-xs text-muted-foreground">
          By {isLogin ? 'signing in' : 'creating an account'}, you agree to our{' '}
          <Link href="/terms" className="underline underline-offset-2 hover:text-foreground/80">Terms of Service</Link>
          {' '}and{' '}
          <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground/80">Privacy Policy</Link>.
        </p>
      </div>

      {/* page.tsx children are empty — kept for Next.js routing */}
      <div className="hidden">{children}</div>
    </div>
  );
}
