'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { Zap, ArrowRight } from 'lucide-react';

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

  const handleGoogleResponse = useCallback(async (response: any) => {
    setGoogleLoading(true);
    setError('');
    try {
      const data = await api.post<{ token: string; isNewUser: boolean }>('/auth/google', {
        credential: response.credential,
      });

      api.setToken(data.token);
      router.push(data.isNewUser ? '/pricing' : '/dashboard');
    } catch (err: any) {
      setError(err.message || 'Google sign-in failed. Please try again.');
    } finally {
      setGoogleLoading(false);
    }
  }, [router]);

  useEffect(() => {
    window.handleGoogleSignIn = handleGoogleResponse;

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
    };
    document.head.appendChild(script);

    return () => { window.handleGoogleSignIn = undefined; };
  }, [handleGoogleResponse]);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await api.post<{ token: string; user: any }>('/auth/login', { email, password });
      api.setToken(data.token);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-black px-4">
      <div className="w-full max-w-[400px] animate-fade-up">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 flex h-10 w-10 items-center justify-center rounded-xl">
            <Zap className="h-5 w-5 text-white" />
          </div>
          <h1 className="text-[22px] font-bold text-white tracking-tight">Welcome back</h1>
          <p className="mt-1.5 text-[14px] text-white/40">Sign in to your dashboard</p>
        </div>

        <div className="border border-white/[0.08] rounded-xl p-6 space-y-5">
          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-[13px] text-red-400">
              {error}
            </div>
          )}

          {googleLoading && (
            <div className="flex items-center justify-center gap-3 py-4">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
              <span className="text-[14px] text-white/50">Signing in with Google...</span>
            </div>
          )}

          <div className="flex justify-center">
            <div id="google-signin-button" className="flex justify-center" />
          </div>

          <div className="flex items-center gap-4">
            <div className="flex-1 h-px bg-white/[0.06]" />
            <span className="text-[12px] text-white/25 uppercase tracking-wider">or</span>
            <div className="flex-1 h-px bg-white/[0.06]" />
          </div>

          <form onSubmit={handleEmailSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-[13px] font-medium text-white/50">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-transparent border border-white/10 rounded-lg px-4 py-2.5 text-[14px] text-white placeholder:text-white/25 focus:border-white/30 focus:outline-none transition-colors"
                placeholder="you@example.com"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-[13px] font-medium text-white/50">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-transparent border border-white/10 rounded-lg px-4 py-2.5 text-[14px] text-white placeholder:text-white/25 focus:border-white/30 focus:outline-none transition-colors"
                placeholder="Your password"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-2.5 text-[14px] font-medium flex items-center justify-center gap-2 rounded-lg disabled:opacity-50"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black" />
                  Signing in...
                </span>
              ) : (
                <>Sign In <ArrowRight className="h-4 w-4" /></>
              )}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-[14px] text-white/30">
          Don&apos;t have an account?{' '}
          <Link href="/auth/signup" className="text-white hover:text-white/80 underline underline-offset-4 transition-colors">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
