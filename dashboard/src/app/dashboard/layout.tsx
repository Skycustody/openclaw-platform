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
import { Loader2 } from 'lucide-react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { sidebarOpen, setUser } = useStore();
  const [checking, setChecking] = useState(true);
  const isHome = pathname === '/dashboard' || pathname === '/dashboard/' || (pathname?.startsWith?.('/dashboard') && pathname.replace(/\/$/, '').split('/').length <= 2);

  useEffect(() => {
    const token = api.getToken();
    if (!token && typeof window !== 'undefined') {
      window.location.href = '/auth/login';
      return;
    }

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
        const allowed = ['active', 'sleeping', 'grace_period', 'provisioning'];
        if (!allowed.includes(subStatus) && typeof window !== 'undefined') {
          window.location.href = '/pricing';
          return;
        }
      })
      .catch(() => {
        if (typeof window !== 'undefined') {
          window.location.href = '/pricing';
        }
      })
      .finally(() => setChecking(false));
  }, [setUser]);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden bg-black text-white" style={{ backgroundImage: 'none' }}>
      <Sidebar />
      <main
        className={cn(
          'h-screen transition-all duration-300 flex flex-col',
          sidebarOpen ? 'ml-[220px]' : 'ml-[68px]',
          isHome ? 'p-0 overflow-hidden' : 'p-5 pt-6 overflow-y-auto'
        )}
      >
        <div className={cn('flex-1 flex flex-col min-h-0', isHome ? 'overflow-hidden' : 'mx-auto max-w-6xl w-full')}>{children}</div>
      </main>
    </div>
  );
}
