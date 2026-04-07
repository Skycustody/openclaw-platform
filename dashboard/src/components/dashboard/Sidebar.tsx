'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, Smartphone, Clock,
  Cpu, CreditCard, LogOut, ChevronLeft, HelpCircle, Settings,
  Store, Terminal, Globe,
} from 'lucide-react';
import Image from 'next/image';
import { useStore } from '@/lib/store';
import { useEffect } from 'react';

const navItems = [
  { href: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { href: '/dashboard/agents', label: 'Agents', icon: Cpu },
  { href: '/dashboard/channels', label: 'Channels', icon: Smartphone },
  { href: '/dashboard/cron', label: 'Schedule', icon: Clock },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
  { href: '/dashboard/billing', label: 'Billing', icon: CreditCard },
  { href: '/dashboard/agent-store', label: 'Agent Store', icon: Store },
  { href: '/dashboard/claude', label: 'Claude CLI', icon: Terminal },
  { href: '/dashboard/browser-relay', label: 'Browser Relay', icon: Globe },
];

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarOpen, toggleSidebar, mobileSidebarOpen, setMobileSidebarOpen } = useStore();

  useEffect(() => {
    if (mobileSidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [mobileSidebarOpen]);

  const showLabel = sidebarOpen;

  return (
    <>
      {/* Backdrop for mobile drawer */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      <aside
        className={cn(
          'fixed left-0 top-0 z-50 flex h-screen flex-col bg-[#2a2a28] border-r border-white/[0.06] transition-all duration-300',
          // Desktop: always visible, width depends on sidebarOpen
          'max-md:w-[260px]',
          sidebarOpen ? 'md:w-[220px]' : 'md:w-[68px]',
          // Mobile: off-screen by default, slide in when open
          mobileSidebarOpen ? 'max-md:translate-x-0' : 'max-md:-translate-x-full',
        )}
      >
        <div className="flex h-[56px] items-center gap-3 px-4 border-b border-white/[0.06]">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
            <Image src="/favicon.png" alt="Valnaa" width={18} height={18} className="rounded-sm" />
          </div>
          {(showLabel || mobileSidebarOpen) && (
            <span className="text-[15px] font-semibold text-white/85 tracking-tight">Valnaa</span>
          )}
          {/* Desktop: collapse toggle */}
          <button
            onClick={toggleSidebar}
            className="ml-auto rounded-md p-1.5 text-white/20 hover:text-white/50 hover:bg-white/[0.04] transition-colors hidden md:block"
          >
            <ChevronLeft className={cn('h-4 w-4 transition-transform duration-300', !sidebarOpen && 'rotate-180')} />
          </button>
          {/* Mobile: close button */}
          <button
            onClick={() => setMobileSidebarOpen(false)}
            className="ml-auto rounded-md p-1.5 text-white/20 hover:text-white/50 hover:bg-white/[0.04] transition-colors md:hidden"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileSidebarOpen(false)}
                className={cn(
                  'relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors',
                  isActive
                    ? 'bg-white/[0.06] text-white/85'
                    : 'text-white/40 hover:text-white/60 hover:bg-white/[0.04]'
                )}
                title={!showLabel && !mobileSidebarOpen ? item.label : undefined}
              >
                <item.icon className={cn('h-[18px] w-[18px] shrink-0', isActive ? 'text-white/70' : 'text-white/40')} />
                {(showLabel || mobileSidebarOpen) && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/[0.06] p-2 space-y-0.5">
          <Link
            href="/help"
            onClick={() => setMobileSidebarOpen(false)}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] text-white/30 hover:text-white/50 hover:bg-white/[0.04] transition-colors"
          >
            <HelpCircle className="h-[18px] w-[18px] shrink-0" />
            {(showLabel || mobileSidebarOpen) && <span>Help</span>}
          </Link>
          <button
            onClick={() => {
              localStorage.removeItem('token');
              window.location.href = '/auth/login';
            }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] text-white/30 hover:text-red-400/70 hover:bg-white/[0.04] transition-colors"
          >
            <LogOut className="h-[18px] w-[18px] shrink-0" />
            {(showLabel || mobileSidebarOpen) && <span>Sign Out</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
