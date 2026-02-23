'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, Activity, Smartphone, Puzzle, Brain, Clock,
  Globe, Coins, Cpu, User, Shield, MessageSquare, FileText,
  CreditCard, Store, LogOut, ChevronLeft, Zap, HelpCircle,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { GlowingEffect } from '@/components/ui/glowing-effect';

const navItems = [
  { href: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { href: '/dashboard/mission-control', label: 'Control', icon: Zap },
  { href: '/dashboard/agents', label: 'Agents', icon: Cpu },
  { href: '/dashboard/activity', label: 'Activity', icon: Activity },
  { href: '/dashboard/channels', label: 'Connect', icon: Smartphone },
  { href: '/dashboard/skills', label: 'Skills', icon: Puzzle },
  { href: '/dashboard/memories', label: 'Memory', icon: Brain },
  { href: '/dashboard/cron', label: 'Schedule', icon: Clock },
  { href: '/dashboard/browser', label: 'Browser', icon: Globe },
  { href: '/dashboard/tokens', label: 'Credits', icon: Coins },
  { href: '/dashboard/router', label: 'Auto', icon: LayoutDashboard },
  { href: '/dashboard/personality', label: 'Persona', icon: User },
  { href: '/dashboard/protection', label: 'Shield', icon: Shield },
  { href: '/dashboard/conversations', label: 'History', icon: MessageSquare },
  { href: '/dashboard/files', label: 'Files', icon: FileText },
  { href: '/dashboard/billing', label: 'Billing', icon: CreditCard },
  { href: '/dashboard/templates', label: 'Templates', icon: Store },
];

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarOpen, toggleSidebar, user } = useStore();

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 flex h-screen flex-col bg-black border-r border-white/[0.06] transition-all duration-300',
        sidebarOpen ? 'w-[220px]' : 'w-[68px]'
      )}
    >
      <div className="flex h-[56px] items-center gap-3 px-4 border-b border-white/[0.06]">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
          <Zap className="h-4 w-4 text-white" />
        </div>
        {sidebarOpen && (
          <span className="text-[15px] font-semibold text-white tracking-tight">Valnaa</span>
        )}
        <button
          onClick={toggleSidebar}
          className="ml-auto rounded-md p-1.5 text-white/20 hover:text-white/60 hover:bg-white/5 transition-colors"
        >
          <ChevronLeft className={cn('h-4 w-4 transition-transform duration-300', !sidebarOpen && 'rotate-180')} />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors border-l-2 border-transparent',
                isActive
                  ? 'bg-white/10 text-white border-white'
                  : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04]'
              )}
              title={!sidebarOpen ? item.label : undefined}
            >
              {isActive && (
                <GlowingEffect
                  spread={40}
                  glow={true}
                  disabled={false}
                  proximity={80}
                  inactiveZone={0.01}
                  borderWidth={2}
                />
              )}
              <item.icon className={cn('h-[18px] w-[18px] shrink-0', isActive && 'text-white')} />
              {sidebarOpen && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/[0.06] p-2 space-y-0.5">
        {user?.isAdmin && (
          <Link
            href="/dashboard/admin"
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors',
              pathname === '/dashboard/admin'
                ? 'bg-red-500/10 text-red-400'
                : 'text-red-400/40 hover:text-red-400/70 hover:bg-red-400/5'
            )}
          >
            <Shield className="h-[18px] w-[18px] shrink-0" />
            {sidebarOpen && <span>Admin</span>}
          </Link>
        )}
        <Link
          href="/help"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] text-white/30 hover:text-white/60 hover:bg-white/[0.04] transition-colors"
        >
          <HelpCircle className="h-[18px] w-[18px] shrink-0" />
          {sidebarOpen && <span>Help</span>}
        </Link>
        <button
          onClick={() => {
            localStorage.removeItem('token');
            window.location.href = '/auth/login';
          }}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] text-white/30 hover:text-red-400 hover:bg-red-400/5 transition-colors"
        >
          <LogOut className="h-[18px] w-[18px] shrink-0" />
          {sidebarOpen && <span>Sign Out</span>}
        </button>
      </div>
    </aside>
  );
}
