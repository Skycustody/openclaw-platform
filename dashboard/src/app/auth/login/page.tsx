'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { Zap, ArrowRight, Mail } from 'lucide-react';

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
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleGoogleResponse = useCallback(async (response: any) => {
    setGoogleLoading(true);
    setError('');
    try {
      const data = await api.post<{ token?: string; checkoutUrl?: string; isNewUser: boolean; user?: any }>('/auth/google', {
        credential: response.credential,
      });

      if (data.token) {
        api.setToken(data.token);
        router.push('/dashboard');
      } else if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      }
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
          width: 380,
          text: 'signin_with',
          shape: 'pill',
          logo_alignment: 'left',
        }
      );
    };
    document.head.appendChild(script);

    return () => {
      window.handleGoogleSignIn = undefined;
    };
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
    <div className="flex min-h-screen items-center justify-center bg-mesh px-4">
      <div className="fixed top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] rounded-full bg-indigo-500/8 blur-[120px] pointer-events-none" />

      <div className="relative w-full max-w-[420px] animate-fade-up">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-[18px] bg-gradient-to-br from-indigo-500 to-purple-500 shadow-xl shadow-indigo-500/25">
            <Zap className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-[24px] font-bold text-white tracking-tight">Welcome back</h1>
          <p className="mt-2 text-[15px] text-white/40">Sign in to your dashboard</p>
        </div>

        <div className="glass-strong p-7 space-y-5">
          {error && (
            <div className="rounded-xl bg-red-400/10 border border-red-400/20 p-3.5 text-[13px] text-red-400">
              {error}
            </div>
          )}

          {googleLoading && (
            <div className="flex items-center justify-center gap-3 py-4">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-indigo-400" />
              <span className="text-[14px] text-white/50">Signing in with Google...</span>
            </div>
          )}

          {/* Google Sign-In Button */}
          <div className="flex justify-center">
            <div id="google-signin-button" className="flex justify-center" />
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
                Sign in with email
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
                    placeholder="Your password"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary w-full py-3 text-[14px] font-medium flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Signing in...
                    </span>
                  ) : (
                    <>Sign In <ArrowRight className="h-4 w-4" /></>
                  )}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-[14px] text-white/30">
          Don&apos;t have an account?{' '}
          <Link href="/auth/signup" className="text-indigo-400 hover:text-indigo-300 transition-colors">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
