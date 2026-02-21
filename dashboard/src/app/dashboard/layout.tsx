'use client';
import { Sidebar } from '@/components/dashboard/Sidebar';
import { useStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { Loader2 } from 'lucide-react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { sidebarOpen, setUser } = useStore();
  const [checking, setChecking] = useState(true);

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
    <div className="min-h-screen bg-black text-white" style={{ backgroundImage: 'none' }}>
      <Sidebar />
      <main
        className={cn(
          'min-h-screen transition-all duration-300 p-5 pt-6',
          sidebarOpen ? 'ml-[220px]' : 'ml-[68px]'
        )}
      >
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
