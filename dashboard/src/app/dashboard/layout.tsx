/**
 * OPENCLAW SAAS — Dashboard Layout
 *
 * Claude.ai-style collapsible sidebar with icon + text navigation.
 */
'use client';
import { useStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { useEffect, useState, useRef } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import { DASHBOARD_ALLOWED_STATUSES } from '@/lib/constants';
import {
  Loader2, Mail, RefreshCw, MessageSquare, Bot,
  Radio, KeyRound, Settings, CreditCard, HelpCircle,
  LogOut, PanelLeftClose, PanelLeft,
} from 'lucide-react';

const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'hello@valnaa.com';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Chat', icon: MessageSquare },
  { href: '/dashboard/agents', label: 'Agents', icon: Bot },
  { href: '/dashboard/channels', label: 'Channels', icon: Radio },
  { href: '/dashboard/api-keys', label: 'API Keys', icon: KeyRound },
];

function ConfigChangeToast() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const handler = () => { setVisible(true); setTimeout(() => setVisible(false), 6000); };
    window.addEventListener('valnaa:config-change', handler);
    return () => window.removeEventListener('valnaa:config-change', handler);
  }, []);
  if (!visible) return null;
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="flex items-center gap-2.5 rounded-xl border border-white/[0.06] bg-[#2a2a28] px-4 py-2.5 shadow-2xl">
        <RefreshCw className="h-3.5 w-3.5 text-amber-400 animate-spin" />
        <span className="text-[13px] text-white/70">Applying changes...</span>
      </div>
    </div>
  );
}

function Sidebar() {
  const pathname = usePathname();
  const { user } = useStore();
  const isHome = pathname === '/dashboard' || pathname === '/dashboard/';
  const [expanded, setExpanded] = useState(!isHome);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setUserMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const initials = user?.email ? user.email.slice(0, 2).toUpperCase() : '??';
  const displayName = user?.email?.split('@')[0] || 'User';

  return (
    <div
      className={cn(
        'h-full flex flex-col bg-[#2a2a28] border-r border-white/[0.06] transition-all duration-200 shrink-0',
        expanded ? 'w-[220px]' : 'w-[60px]'
      )}
    >
      {/* Header: Logo + collapse toggle */}
      <div className={cn('flex items-center h-[52px] px-3', expanded ? 'justify-between' : 'justify-center')}>
        {expanded && (
          <span className="text-[15px] font-semibold text-white/85 tracking-tight pl-1">Valnaa</span>
        )}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center justify-center h-8 w-8 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-colors"
          title={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {expanded ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
        </button>
      </div>

      {/* Nav items */}
      <nav className="flex-1 flex flex-col gap-0.5 px-2 pt-2">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === '/dashboard'
              ? pathname === '/dashboard' || pathname === '/dashboard/'
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={!expanded ? item.label : undefined}
              className={cn(
                'flex items-center gap-3 rounded-lg transition-colors',
                expanded ? 'px-3 py-2' : 'justify-center px-0 py-2.5',
                isActive
                  ? 'bg-white/[0.06] text-white/85'
                  : 'text-white/40 hover:text-white/60 hover:bg-white/[0.04]'
              )}
            >
              <item.icon className={cn('shrink-0', expanded ? 'h-[18px] w-[18px]' : 'h-5 w-5')} />
              {expanded && <span className="text-[13px] font-medium">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Bottom: Help + User */}
      <div className="px-2 pb-3 flex flex-col gap-0.5">
        <Link
          href="/help"
          title={!expanded ? 'Help' : undefined}
          className={cn(
            'flex items-center gap-3 rounded-lg text-white/30 hover:text-white/50 hover:bg-white/[0.04] transition-colors',
            expanded ? 'px-3 py-2' : 'justify-center px-0 py-2.5'
          )}
        >
          <HelpCircle className={cn('shrink-0', expanded ? 'h-[18px] w-[18px]' : 'h-5 w-5')} />
          {expanded && <span className="text-[13px] font-medium">Help</span>}
        </Link>

        {/* User avatar + menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            title={!expanded ? displayName : undefined}
            className={cn(
              'flex items-center gap-3 rounded-lg w-full text-white/50 hover:bg-white/[0.04] transition-colors',
              expanded ? 'px-3 py-2' : 'justify-center px-0 py-2.5'
            )}
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.08] border border-white/[0.1] text-[11px] font-semibold text-white/60">
              {initials}
            </div>
            {expanded && (
              <div className="flex-1 text-left overflow-hidden">
                <p className="text-[13px] font-medium text-white/60 truncate">{displayName}</p>
                <p className="text-[11px] text-white/25 truncate">{user?.plan || 'Free'}</p>
              </div>
            )}
          </button>

          {userMenuOpen && (
            <div className={cn(
              'absolute bottom-full mb-1.5 w-[180px] rounded-xl border border-white/[0.08] bg-[#2a2a28] shadow-2xl py-1.5 z-50',
              expanded ? 'left-2' : 'left-0'
            )}>
              {user?.email && (
                <div className="px-3 py-2 border-b border-white/[0.06] mb-1">
                  <p className="text-[12px] text-white/30 truncate">{user.email}</p>
                </div>
              )}
              <Link
                href="/dashboard/settings"
                onClick={() => setUserMenuOpen(false)}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-[13px] text-white/50 hover:text-white/70 hover:bg-white/[0.06] transition-colors"
              >
                <Settings className="h-4 w-4" />
                Settings
              </Link>
              <Link
                href="/dashboard/billing"
                onClick={() => setUserMenuOpen(false)}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-[13px] text-white/50 hover:text-white/70 hover:bg-white/[0.06] transition-colors"
              >
                <CreditCard className="h-4 w-4" />
                Billing
              </Link>
              <div className="border-t border-white/[0.06] mt-1 pt-1">
                <button
                  onClick={() => { localStorage.removeItem('token'); window.location.href = '/auth/login'; }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-[13px] text-white/50 hover:text-red-400/70 hover:bg-white/[0.06] transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { setUser, agentUrl } = useStore();
  const [checking, setChecking] = useState(true);
  const isHome = pathname === '/dashboard' || pathname === '/dashboard/' || (pathname?.startsWith?.('/dashboard') && pathname.replace(/\/$/, '').split('/').length <= 2);

  useEffect(() => {
    const token = api.getToken();
    if (!token && typeof window !== 'undefined') { window.location.href = '/auth/login'; return; }

    const refreshTokenSilently = async () => {
      try { const res = await api.post<{ token: string }>('/auth/refresh'); if (res.token) api.setToken(res.token); } catch {}
    };
    refreshTokenSilently();

    api.get<any>('/agent/status')
      .then((data) => {
        const subStatus = data.subscriptionStatus || data.status;
        setUser({ id: data.userId || '', email: data.email || '', plan: data.plan || 'starter', status: subStatus, subdomain: data.subdomain || null, isAdmin: data.isAdmin || false });
        const isAdmin = data.isAdmin === true;
        const hasPaid = data.hasPaid === true;
        const statusOk = (DASHBOARD_ALLOWED_STATUSES as readonly string[]).includes(subStatus);
        if (!isAdmin && !statusOk && !hasPaid && typeof window !== 'undefined') { window.location.href = '/pricing'; return; }
        const isTrialUser = !hasPaid && subStatus === 'pending';
        const onboardingCompleted = data.onboardingCompleted === true;
        if (!isAdmin && isTrialUser && !onboardingCompleted && typeof window !== 'undefined') { window.location.href = '/welcome'; return; }
      })
      .catch(() => { if (typeof window !== 'undefined') window.location.href = '/auth/login'; })
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
    <div className="h-screen overflow-hidden bg-[#30302E] text-[#e8e8e8] flex" style={{ backgroundImage: 'none' }}>
      <ConfigChangeToast />
      <Sidebar />

      {/* Persistent iframe — stays mounted, shown/hidden via CSS */}
      {agentUrl && (
        <iframe
          src={agentUrl}
          className="border-0 flex-1 min-h-0"
          style={{ display: isHome ? 'block' : 'none' }}
          allow="clipboard-write; microphone"
          title="OpenClaw Control UI"
        />
      )}

      <main
        className={cn(
          'flex-1 min-h-0 flex flex-col transition-all duration-300',
          isHome ? 'overflow-hidden' : 'px-4 md:px-5 pt-6 pb-4 md:pb-5 overflow-y-auto'
        )}
        style={{ display: (isHome && agentUrl) ? 'none' : undefined }}
      >
        <div className={cn('flex-1 flex flex-col min-h-0', isHome ? 'overflow-hidden' : 'mx-auto max-w-5xl w-full')}>{children}</div>
        {!isHome && (
          <div className="mx-auto max-w-5xl w-full py-4 flex items-center justify-center">
            <a href={`mailto:${SUPPORT_EMAIL}`} className="inline-flex items-center gap-1.5 text-[12px] text-white/25 hover:text-white/50 transition-colors">
              <Mail className="h-3 w-3" />
              Need help? {SUPPORT_EMAIL}
            </a>
          </div>
        )}
      </main>
    </div>
  );
}
