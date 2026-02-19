'use client';
import { Sidebar } from '@/components/dashboard/Sidebar';
import { useStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { useEffect } from 'react';
import api from '@/lib/api';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { sidebarOpen, setUser } = useStore();

  useEffect(() => {
    const token = api.getToken();
    if (!token && typeof window !== 'undefined') {
      window.location.href = '/auth/login';
      return;
    }

    api.get<any>('/agent/status')
      .then((data) => {
        setUser({
          id: '',
          email: '',
          plan: data.plan,
          status: data.status,
          subdomain: data.subdomain,
        });
      })
      .catch(() => {});
  }, [setUser]);

  return (
    <div className="min-h-screen bg-mesh text-white">
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
