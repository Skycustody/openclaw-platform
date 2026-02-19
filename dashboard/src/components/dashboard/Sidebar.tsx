'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, Activity, Smartphone, Puzzle, Brain, Clock,
  Globe, Coins, Cpu, User, Shield, MessageSquare, FileText,
  CreditCard, Gift, Store, LogOut, ChevronLeft, Zap, HelpCircle,
} from 'lucide-react';
import { useStore } from '@/lib/store';

const navItems = [
  { href: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { href: '/dashboard/activity', label: 'Activity', icon: Activity },
  { href: '/dashboard/channels', label: 'Connect', icon: Smartphone },
  { href: '/dashboard/skills', label: 'Skills', icon: Puzzle },
  { href: '/dashboard/memories', label: 'Memory', icon: Brain },
  { href: '/dashboard/cron', label: 'Schedule', icon: Clock },
  { href: '/dashboard/browser', label: 'Browser', icon: Globe },
  { href: '/dashboard/tokens', label: 'Tokens', icon: Coins },
  { href: '/dashboard/router', label: 'Brain', icon: Cpu },
  { href: '/dashboard/personality', label: 'Persona', icon: User },
  { href: '/dashboard/protection', label: 'Shield', icon: Shield },
  { href: '/dashboard/conversations', label: 'History', icon: MessageSquare },
  { href: '/dashboard/files', label: 'Files', icon: FileText },
  { href: '/dashboard/referrals', label: 'Refer', icon: Gift },
  { href: '/dashboard/billing', label: 'Billing', icon: CreditCard },
  { href: '/dashboard/templates', label: 'Templates', icon: Store },
];

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarOpen, toggleSidebar, user } = useStore();

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 flex h-screen flex-col glass-strong transition-all duration-300 border-r-0',
        sidebarOpen ? 'w-[220px]' : 'w-[68px]'
      )}
      style={{ borderRadius: '0 20px 20px 0' }}
    >
      {/* Logo */}
      <div className="flex h-[60px] items-center gap-3 px-4 border-b border-white/5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-gradient-to-br from-indigo-500 to-purple-500 shadow-lg shadow-indigo-500/20">
          <Zap className="h-4.5 w-4.5 text-white" />
        </div>
        {sidebarOpen && (
          <span className="text-[16px] font-bold text-white tracking-tight">OpenClaw</span>
        )}
        <button
          onClick={toggleSidebar}
          className="ml-auto rounded-lg p-1.5 text-white/20 hover:text-white/60 hover:bg-white/5 transition-all"
        >
          <ChevronLeft className={cn('h-4 w-4 transition-transform duration-300', !sidebarOpen && 'rotate-180')} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-0.5">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-[13px] font-medium transition-all duration-200',
                isActive
                  ? 'bg-white/10 text-white shadow-sm'
                  : 'text-white/40 hover:text-white/70 hover:bg-white/5'
              )}
              title={!sidebarOpen ? item.label : undefined}
            >
              <item.icon className={cn('h-[18px] w-[18px] shrink-0', isActive && 'text-indigo-400')} />
              {sidebarOpen && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-white/5 p-2.5 space-y-1">
        <Link
          href="/help"
          className="flex items-center gap-3 rounded-[12px] px-3 py-2 text-[13px] text-white/30 hover:text-white/60 hover:bg-white/5 transition-all"
        >
          <HelpCircle className="h-[18px] w-[18px] shrink-0" />
          {sidebarOpen && <span>Help</span>}
        </Link>
        <button
          onClick={() => {
            localStorage.removeItem('token');
            window.location.href = '/auth/login';
          }}
          className="flex w-full items-center gap-3 rounded-[12px] px-3 py-2 text-[13px] text-white/30 hover:text-red-400 hover:bg-red-400/5 transition-all"
        >
          <LogOut className="h-[18px] w-[18px] shrink-0" />
          {sidebarOpen && <span>Sign Out</span>}
        </button>
      </div>
    </aside>
  );
}
