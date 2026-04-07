/**
 * OPENCLAW SAAS — Dashboard Layout
 *
 * This dashboard is a UI layer around OpenClaw. It does NOT implement its own
 * chat, AI pipeline, or skills. The home page embeds the OpenClaw Control UI
 * via iframe. All other pages read/write the container's openclaw.json config.
 * See AGENTS.md at the project root.
 */
'use client';
import { Sidebar } from '@/components/dashboard/Sidebar';
import { useStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import api from '@/lib/api';
import { DASHBOARD_ALLOWED_STATUSES } from '@/lib/constants';
import { Loader2, Menu, Mail, RefreshCw } from 'lucide-react';
import Image from 'next/image';

const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'hello@valnaa.com';

function ConfigChangeToast() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handler = () => {
      setVisible(true);
      setTimeout(() => setVisible(false), 6000);
    };
    window.addEventListener('valnaa:config-change', handler);
    return () => window.removeEventListener('valnaa:config-change', handler);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="flex items-center gap-2.5 rounded-xl border border-white/[0.06] bg-[#2a2a28] px-4 py-2.5 shadow-2xl">
        <RefreshCw className="h-3.5 w-3.5 text-amber-400 animate-spin" />
        <span className="text-[13px] text-white/70">Applying changes... your agent will be back in a few seconds</span>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { sidebarOpen, setUser, setMobileSidebarOpen } = useStore();
  const [checking, setChecking] = useState(true);
  const isHome = pathname === '/dashboard' || pathname === '/dashboard/' || (pathname?.startsWith?.('/dashboard') && pathname.replace(/\/$/, '').split('/').length <= 2);

  useEffect(() => {
    const token = api.getToken();
    if (!token && typeof window !== 'undefined') {
      window.location.href = '/auth/login';
      return;
    }

    const refreshTokenSilently = async () => {
      try {
        const res = await api.post<{ token: string }>('/auth/refresh');
        if (res.token) api.setToken(res.token);
      } catch {
        // Token still valid — refresh not needed yet
      }
    };

    refreshTokenSilently();

    api.get<any>('/agent/status')
      .then((data) => {
        const subStatus = data.subscriptionStatus || data.status;
        setUser({
          id: data.userId || '',
          email: data.email || '',
          plan: data.plan || 'starter',
          status: subStatus,
          subdomain: data.subdomain || null,
          isAdmin: data.isAdmin || false,
        });
        const isAdmin = data.isAdmin === true;
        const hasPaid = data.hasPaid === true;
        const statusOk = (DASHBOARD_ALLOWED_STATUSES as readonly string[]).includes(subStatus);
        if (!isAdmin && !statusOk && !hasPaid && typeof window !== 'undefined') {
          window.location.href = '/pricing';
          return;
        }
        // Trial users (pending, no paid) must complete onboarding before dashboard
        const isTrialUser = !hasPaid && subStatus === 'pending';
        const onboardingCompleted = data.onboardingCompleted === true;
        if (!isAdmin && isTrialUser && !onboardingCompleted && typeof window !== 'undefined') {
          window.location.href = '/welcome';
          return;
        }
      })
      .catch(() => {
        if (typeof window !== 'undefined') {
          window.location.href = '/auth/login';
        }
      })
      .finally(() => setChecking(false));
  }, [setUser]);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#30302E]">
        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden bg-[#30302E] text-[#e8e8e8]" style={{ backgroundImage: 'none' }}>
      <ConfigChangeToast />
      <Sidebar />

      {/* Mobile top bar — visible only below md */}
      <header className="fixed top-0 left-0 right-0 z-30 flex h-[56px] items-center gap-3 border-b border-white/[0.06] bg-[#2a2a28] px-4 md:hidden">
        <button
          onClick={() => setMobileSidebarOpen(true)}
          className="rounded-md p-1.5 text-white/50 hover:text-white hover:bg-white/5 transition-colors"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Image src="/favicon.png" alt="Valnaa" width={18} height={18} className="rounded-sm" />
        <span className="text-[15px] font-semibold text-[#e8e8e8] tracking-tight">Valnaa</span>
      </header>

      <main
        className={cn(
          'h-screen transition-all duration-300 flex flex-col',
          sidebarOpen ? 'md:ml-[220px]' : 'md:ml-[68px]',
          'ml-0',
          isHome
            ? 'pt-[56px] md:pt-0 overflow-hidden'
            : 'px-4 pt-[72px] md:px-5 md:pt-6 pb-4 md:pb-5 overflow-y-auto'
        )}
      >
        <div className={cn('flex-1 flex flex-col min-h-0', isHome ? 'overflow-hidden' : 'mx-auto max-w-6xl w-full')}>{children}</div>
        {!isHome && (
          <div className="mx-auto max-w-6xl w-full py-4 flex items-center justify-center">
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="inline-flex items-center gap-1.5 text-[12px] text-white/25 hover:text-white/50 transition-colors"
            >
              <Mail className="h-3 w-3" />
              Need help? {SUPPORT_EMAIL}
            </a>
          </div>
        )}
      </main>
    </div>
  );
}
