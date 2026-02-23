'use client';

import { useEffect, useState, useCallback } from 'react';
import api from '@/lib/api';
import {
  Users, Server, Coins, TrendingUp, Activity, Search,
  Shield, Loader2, RefreshCw, AlertTriangle, Edit3,
  BarChart3, Zap, HardDrive, LogOut, ChevronLeft, ChevronRight,
  Lock, Euro,
} from 'lucide-react';

interface Financials {
  currency: string;
  monthlySubscriptionRevenue: number;
  monthlyServerCosts: number;
  monthlyCreditCosts: number;
  monthlyProfit: number;
  perPlan: {
    starter: { count: number; revenueEurCents: number };
    pro: { count: number; revenueEurCents: number };
    business: { count: number; revenueEurCents: number };
  };
}

interface Overview {
  users: {
    total: string; active: string; sleeping: string; paused: string;
    provisioning: string; cancelled: string;
    new_24h: string; new_7d: string; new_30d: string;
  };
  servers: { total: string; total_ram: string; used_ram: string };
  revenue: { month_credit_purchases: string; total_credit_purchases: string };
  credits: { total_used: string; total_balance: string; total_purchased: string };
  recentSignups: Array<{ id: string; email: string; plan: string; status: string; created_at: string }>;
  plans: { starter: string; pro: string; business: string };
  financials: Financials;
}

interface AdminUser {
  id: string; email: string; display_name: string | null; plan: string;
  status: string; subdomain: string | null; created_at: string;
  last_active: string | null; is_admin: boolean;
  credit_balance: number | null; total_used: number | null; total_purchased: number | null;
  server_ip: string | null; server_hostname: string | null;
}

interface RevenueData {
  currency: string;
  monthlyRevenue: Array<{ month: string; total_tokens: string; transaction_count: string }>;
  dailyRevenue: Array<{ day: string; total_tokens: string; transaction_count: string }>;
  topSpenders: Array<{ email: string; plan: string; total_purchased: number; total_used: number; balance: number }>;
  extraCreditPurchases: { count: number; totalCredits: number };
  subscriptionRevenue: Record<string, number>;
  totalSubscriptionRevenueEurCents: number;
}

interface ServerInfo {
  id: string; ip: string; hostname: string; ram_total: number;
  ram_used: number; status: string; user_count: number;
}

type Tab = 'overview' | 'users' | 'revenue' | 'servers';

const STATUS_COLORS: Record<string, string> = {
  active: 'text-green-400 bg-green-500/10',
  sleeping: 'text-blue-400 bg-blue-500/10',
  provisioning: 'text-amber-400 bg-amber-500/10',
  paused: 'text-red-400 bg-red-500/10',
  cancelled: 'text-white/30 bg-white/5',
  grace_period: 'text-amber-400 bg-amber-500/10',
};

function formatNum(n: string | number): string {
  return Number(n).toLocaleString();
}

function formatUsdVal(n: number | string | null): string {
  const v = Number(n || 0);
  return `$${v.toFixed(2)}`;
}

function formatEur(cents: number): string {
  const eur = cents / 100;
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(eur);
}

function timeAgo(d: string): string {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}

export default function AdminPanel() {
  const [adminPassword, setAdminPassword] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [authState, setAuthState] = useState<'loading' | 'needs_password' | 'authed' | 'denied'>('loading');
  const [authError, setAuthError] = useState('');
  const [tab, setTab] = useState<Tab>('overview');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [revenueData, setRevenueData] = useState<RevenueData | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [userTotal, setUserTotal] = useState(0);
  const [userPage, setUserPage] = useState(0);
  const [userSearch, setUserSearch] = useState('');
  const [servers, setServers] = useState<ServerInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [editForm, setEditForm] = useState({ plan: '', status: '', is_admin: false, credit_balance: '' });
  const [saving, setSaving] = useState(false);

  const tryAuth = useCallback(async (pw: string) => {
    api.setHeader('x-admin-password', pw);
    try {
      const data = await api.get<Overview>('/admin/overview');
      setAdminPassword(pw);
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('_ap', pw);
      }
      setAuthState('authed');
      setOverview(data);
      return true;
    } catch (err: any) {
      api.removeHeader('x-admin-password');
      const msg = err.message || '';
      if (msg.includes('Admin password') || msg.includes('Invalid admin')) {
        setAuthState('needs_password');
        setAuthError(pw ? 'Invalid admin password' : '');
      } else if (msg.includes('Admin access') || msg.includes('Access denied')) {
        setAuthState('denied');
      } else if (msg.includes('Session expired')) {
        setAuthState('denied');
      } else {
        setAuthState('needs_password');
        setAuthError(msg);
      }
      return false;
    }
  }, []);

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? sessionStorage.getItem('_ap') : null;
    if (saved) {
      tryAuth(saved);
    } else {
      tryAuth('');
    }
  }, [tryAuth]);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordInput.trim()) return;
    setAuthError('');
    const ok = await tryAuth(passwordInput.trim());
    if (!ok) setPasswordInput('');
  };

  const fetchOverview = useCallback(async () => {
    try {
      const data = await api.get<Overview>('/admin/overview');
      setOverview(data);
    } catch {}
  }, []);

  const fetchUsers = useCallback(async (page = 0, search = '') => {
    try {
      const params = new URLSearchParams({ limit: '20', offset: String(page * 20) });
      if (search) params.set('search', search);
      const data = await api.get<{ users: AdminUser[]; total: number }>(`/admin/users?${params}`);
      setUsers(data.users);
      setUserTotal(data.total);
    } catch {}
  }, []);

  const fetchRevenue = useCallback(async () => {
    try {
      const data = await api.get<RevenueData>('/admin/revenue');
      setRevenueData(data);
    } catch {}
  }, []);

  const fetchServers = useCallback(async () => {
    try {
      const data = await api.get<{ servers: ServerInfo[] }>('/admin/servers');
      setServers(data.servers);
    } catch {}
  }, []);

  useEffect(() => {
    if (authState !== 'authed') return;
    setLoading(true);
    Promise.all([fetchOverview(), fetchUsers(), fetchRevenue(), fetchServers()])
      .finally(() => setLoading(false));
  }, [authState, fetchOverview, fetchUsers, fetchRevenue, fetchServers]);

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchOverview(), fetchUsers(userPage, userSearch), fetchRevenue(), fetchServers()]);
    setRefreshing(false);
  };

  const handleUserSearch = () => {
    setUserPage(0);
    fetchUsers(0, userSearch);
  };

  const openEdit = (u: AdminUser) => {
    setEditUser(u);
    setEditForm({
      plan: u.plan,
      status: u.status,
      is_admin: u.is_admin,
      credit_balance: String(u.credit_balance ?? 0),
    });
  };

  const saveEdit = async () => {
    if (!editUser) return;
    setSaving(true);
    try {
      await api.put(`/admin/users/${editUser.id}`, {
        plan: editForm.plan,
        status: editForm.status,
        is_admin: editForm.is_admin,
        token_balance: parseInt(editForm.credit_balance) || 0,
      });
      setEditUser(null);
      fetchUsers(userPage, userSearch);
      fetchOverview();
    } catch {}
    setSaving(false);
  };

  const handleReprovision = async (userId?: string) => {
    try {
      await api.post('/admin/reprovision', userId ? { userId } : {});
      fetchUsers(userPage, userSearch);
      fetchOverview();
    } catch {}
  };

  const handleLogout = () => {
    api.removeHeader('x-admin-password');
    sessionStorage.removeItem('_ap');
    setAuthState('needs_password');
    setAdminPassword('');
    setPasswordInput('');
  };

  if (authState === 'loading') {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
      </div>
    );
  }

  if (authState === 'denied') {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <Shield className="h-12 w-12 text-red-400/50 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-white mb-2">Access Denied</h1>
          <p className="text-sm text-white/40 mb-6">Admin privileges required. You must be logged in as an admin user.</p>
          <a href="/dashboard" className="text-sm text-white/30 hover:text-white/50 transition-colors">
            Back to Dashboard
          </a>
        </div>
      </div>
    );
  }

  if (authState === 'needs_password') {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-2 mb-4">
              <Lock className="h-8 w-8 text-red-400/60" />
              <Shield className="h-8 w-8 text-red-400/60" />
            </div>
            <h1 className="text-xl font-bold text-white mb-2">Admin Authentication</h1>
            <p className="text-sm text-white/30">Enter your admin password to continue</p>
          </div>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <input
                type="password"
                value={passwordInput}
                onChange={e => setPasswordInput(e.target.value)}
                placeholder="Admin password"
                autoFocus
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-[14px] text-white placeholder:text-white/20 focus:border-red-400/40 focus:outline-none focus:ring-1 focus:ring-red-400/20"
              />
            </div>
            {authError && (
              <div className="flex items-center gap-2 text-red-400 text-[13px]">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {authError}
              </div>
            )}
            <button type="submit"
              className="w-full rounded-xl bg-red-500/20 border border-red-400/20 py-3 text-[14px] font-medium text-red-300 hover:bg-red-500/30 transition-all">
              Authenticate
            </button>
          </form>
          <div className="mt-6 text-center">
            <a href="/dashboard" className="text-[12px] text-white/20 hover:text-white/40 transition-colors">
              Back to Dashboard
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
      </div>
    );
  }

  const o = overview;
  const f = o?.financials;

  return (
    <div className="min-h-screen bg-black">
      <div className="border-b border-white/[0.06] px-6 py-3 flex items-center justify-between sticky top-0 z-50 bg-black/90 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <Shield className="h-5 w-5 text-red-400" />
          <span className="text-[16px] font-bold text-white">Admin Panel</span>
          <span className="text-[10px] text-red-400/40 bg-red-400/10 px-2 py-0.5 rounded-full">SECURED</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={refresh}
            className={`p-2 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-all ${refreshing ? 'animate-spin' : ''}`}>
            <RefreshCw className="h-4 w-4" />
          </button>
          <button onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] text-red-400/50 hover:text-red-400 hover:bg-red-400/5 transition-all">
            <Lock className="h-3.5 w-3.5" />
            Lock
          </button>
          <a href="/dashboard"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] text-white/30 hover:text-white/50 hover:bg-white/[0.06] transition-all">
            <LogOut className="h-3.5 w-3.5" />
            Dashboard
          </a>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        <div className="flex items-center gap-1 border-b border-white/[0.06] pb-0">
          {([
            { id: 'overview' as Tab, label: 'Overview', icon: BarChart3 },
            { id: 'users' as Tab, label: 'Users', icon: Users },
            { id: 'revenue' as Tab, label: 'Revenue & Costs', icon: Euro },
            { id: 'servers' as Tab, label: 'Servers', icon: Server },
          ]).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium border-b-2 -mb-[1px] transition-all ${
                tab === t.id ? 'border-white text-white' : 'border-transparent text-white/30 hover:text-white/50'
              }`}>
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'overview' && o && f && (
          <div className="space-y-6">
            <div className="grid grid-cols-4 gap-4">
              <StatCard icon={Euro} label="Monthly Revenue" value={formatEur(f.monthlySubscriptionRevenue)}
                sub="Subscriptions" color="green" />
              <StatCard icon={HardDrive} label="Server Costs" value={formatEur(f.monthlyServerCosts)}
                sub={`${o.servers.total} server${Number(o.servers.total) !== 1 ? 's' : ''}`} color="red" />
              <StatCard icon={Coins} label="AI Costs" value={formatEur(f.monthlyCreditCosts)}
                sub={`${formatUsdVal(o.credits.total_used)} used`} color="amber" />
              <StatCard icon={TrendingUp} label="Monthly Profit"
                value={formatEur(f.monthlyProfit)}
                sub={f.monthlyProfit >= 0 ? 'Profitable' : 'Loss'}
                color={f.monthlyProfit >= 0 ? 'green' : 'red'} />
            </div>

            <div className="grid grid-cols-4 gap-4">
              <StatCard icon={Users} label="Total Users" value={formatNum(o.users.total)}
                sub={`+${o.users.new_24h} today`} color="blue" />
              <StatCard icon={Activity} label="Active" value={formatNum(o.users.active)}
                sub={`${o.users.sleeping} sleeping`} color="green" />
              <StatCard icon={Coins} label="Balance Remaining" value={formatUsdVal(o.credits.total_balance)}
                sub={`${formatUsdVal(o.credits.total_purchased)} purchased total`} color="purple" />
              <StatCard icon={Zap} label="New (30d)" value={formatNum(o.users.new_30d)}
                sub={`${o.users.new_7d} this week`} color="amber" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
                <h3 className="text-[14px] font-semibold text-white mb-4">Revenue by Plan (EUR/month)</h3>
                <div className="space-y-3">
                  {[
                    { name: 'Starter', data: f.perPlan.starter, price: '€10', color: 'bg-white/20' },
                    { name: 'Pro', data: f.perPlan.pro, price: '€20', color: 'bg-blue-400' },
                    { name: 'Business', data: f.perPlan.business, price: '€50', color: 'bg-amber-400' },
                  ].map(p => {
                    const totalRevenue = f.monthlySubscriptionRevenue || 1;
                    const pct = (p.data.revenueEurCents / totalRevenue * 100) || 0;
                    return (
                      <div key={p.name}>
                        <div className="flex justify-between text-[13px] mb-1">
                          <span className="text-white/60">{p.name} ({p.price}/mo)</span>
                          <span className="text-white/40">{p.data.count} users = {formatEur(p.data.revenueEurCents)}/mo</span>
                        </div>
                        <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                          <div className={`h-full rounded-full ${p.color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
                <h3 className="text-[14px] font-semibold text-white mb-4">Infrastructure</h3>
                <div className="space-y-3">
                  <div className="flex justify-between text-[13px]">
                    <span className="text-white/40">Worker Servers</span>
                    <span className="text-white">{o.servers.total}</span>
                  </div>
                  <div className="flex justify-between text-[13px]">
                    <span className="text-white/40">Total RAM</span>
                    <span className="text-white">{(Number(o.servers.total_ram) / 1024).toFixed(1)} GB</span>
                  </div>
                  <div className="flex justify-between text-[13px]">
                    <span className="text-white/40">RAM Used</span>
                    <span className="text-white">{(Number(o.servers.used_ram) / 1024).toFixed(1)} GB</span>
                  </div>
                  <div className="flex justify-between text-[13px]">
                    <span className="text-white/40">RAM Available</span>
                    <span className="text-white">{((Number(o.servers.total_ram) - Number(o.servers.used_ram)) / 1024).toFixed(1)} GB</span>
                  </div>
                  <div className="flex justify-between text-[13px]">
                    <span className="text-white/40">Cost per Server</span>
                    <span className="text-white">{formatEur(Number(f.monthlyServerCosts) / Math.max(Number(o.servers.total), 1))}/mo</span>
                  </div>
                  <div className="flex justify-between text-[13px]">
                    <span className="text-white/40">Provisioning</span>
                    <span className="text-amber-400">{o.users.provisioning} stuck</span>
                  </div>
                </div>
                {Number(o.users.provisioning) > 0 && (
                  <button onClick={() => handleReprovision()}
                    className="mt-3 w-full text-[12px] text-amber-400 border border-amber-400/20 rounded-lg py-2 hover:bg-amber-400/5 transition-all">
                    Re-provision stuck users
                  </button>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
              <h3 className="text-[14px] font-semibold text-white mb-4">Profit & Loss Summary (EUR)</h3>
              <div className="grid grid-cols-3 gap-6">
                <div>
                  <p className="text-[12px] text-white/30 mb-1">Revenue</p>
                  <div className="space-y-2">
                    <div className="flex justify-between text-[13px]">
                      <span className="text-white/50">Subscriptions</span>
                      <span className="text-green-400">{formatEur(f.monthlySubscriptionRevenue)}</span>
                    </div>
                    <div className="flex justify-between text-[13px]">
                      <span className="text-white/50">Extra Top-Up Purchases</span>
                      <span className="text-green-400">{formatUsdVal(o.revenue.month_credit_purchases)}</span>
                    </div>
                  </div>
                </div>
                <div>
                  <p className="text-[12px] text-white/30 mb-1">Costs</p>
                  <div className="space-y-2">
                    <div className="flex justify-between text-[13px]">
                      <span className="text-white/50">Servers</span>
                      <span className="text-red-400">-{formatEur(f.monthlyServerCosts)}</span>
                    </div>
                    <div className="flex justify-between text-[13px]">
                      <span className="text-white/50">AI Provider Costs</span>
                      <span className="text-red-400">-{formatEur(f.monthlyCreditCosts)}</span>
                    </div>
                  </div>
                </div>
                <div>
                  <p className="text-[12px] text-white/30 mb-1">Net Profit</p>
                  <p className={`text-[24px] font-bold ${f.monthlyProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {formatEur(f.monthlyProfit)}
                  </p>
                  <p className="text-[11px] text-white/20 mt-1">per month (estimated)</p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
              <h3 className="text-[14px] font-semibold text-white mb-4">Recent Signups</h3>
              <div className="space-y-1">
                {o.recentSignups.map(u => (
                  <div key={u.id} className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-white/5 flex items-center justify-center text-[12px] text-white/30 font-medium">
                        {u.email[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="text-[13px] text-white/70">{u.email}</p>
                        <p className="text-[11px] text-white/20">{timeAgo(u.created_at)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full ${STATUS_COLORS[u.status] || 'text-white/30 bg-white/5'}`}>
                        {u.status}
                      </span>
                      <span className="text-[11px] text-white/30 capitalize">{u.plan}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'users' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20" />
                <input
                  type="text"
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleUserSearch()}
                  placeholder="Search by email, name, or subdomain..."
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] pl-10 pr-4 py-2.5 text-[13px] text-white placeholder:text-white/20 focus:border-white/20 focus:outline-none"
                />
              </div>
              <button onClick={handleUserSearch}
                className="px-4 py-2.5 rounded-lg bg-white/[0.06] text-[13px] text-white/50 hover:text-white hover:bg-white/[0.1] transition-all">
                Search
              </button>
              <span className="text-[12px] text-white/30">{userTotal} total</span>
            </div>

            <div className="rounded-xl border border-white/[0.06] overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                    <th className="px-4 py-3 text-left text-[11px] font-medium text-white/30 uppercase tracking-wider">User</th>
                    <th className="px-4 py-3 text-left text-[11px] font-medium text-white/30 uppercase tracking-wider">Plan</th>
                    <th className="px-4 py-3 text-left text-[11px] font-medium text-white/30 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-left text-[11px] font-medium text-white/30 uppercase tracking-wider">Balance</th>
                    <th className="px-4 py-3 text-left text-[11px] font-medium text-white/30 uppercase tracking-wider">Revenue</th>
                    <th className="px-4 py-3 text-left text-[11px] font-medium text-white/30 uppercase tracking-wider">Server</th>
                    <th className="px-4 py-3 text-left text-[11px] font-medium text-white/30 uppercase tracking-wider">Joined</th>
                    <th className="px-4 py-3 text-right text-[11px] font-medium text-white/30 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => {
                    const planPrice: Record<string, number> = { starter: 1000, pro: 2000, business: 5000 };
                    return (
                      <tr key={u.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-7 w-7 rounded-full bg-white/5 flex items-center justify-center text-[11px] text-white/30 font-medium shrink-0">
                              {u.email[0].toUpperCase()}
                            </div>
                            <div>
                              <p className="text-[13px] text-white/70">{u.email}</p>
                              {u.subdomain && <p className="text-[10px] text-white/20">{u.subdomain}</p>}
                            </div>
                            {u.is_admin && <Shield className="h-3 w-3 text-red-400/60" />}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-[12px] text-white/50 capitalize">{u.plan}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-[11px] px-2 py-0.5 rounded-full ${STATUS_COLORS[u.status] || 'text-white/30 bg-white/5'}`}>
                            {u.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-[12px] text-white/50 tabular-nums">{formatUsdVal(u.credit_balance)}</p>
                          <p className="text-[10px] text-white/20">used: {formatUsdVal(u.total_used)}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-[12px] text-green-400/70 tabular-nums">{formatEur(planPrice[u.plan] || 0)}/mo</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-[11px] text-white/30">{u.server_hostname || u.server_ip || '—'}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-[11px] text-white/30">{timeAgo(u.created_at)}</p>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => openEdit(u)}
                            className="p-1.5 rounded-lg text-white/20 hover:text-white/50 hover:bg-white/[0.06] transition-all">
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-[12px] text-white/30">
                Showing {userTotal > 0 ? userPage * 20 + 1 : 0}–{Math.min((userPage + 1) * 20, userTotal)} of {userTotal}
              </p>
              <div className="flex items-center gap-2">
                <button onClick={() => { setUserPage(p => Math.max(0, p - 1)); fetchUsers(Math.max(0, userPage - 1), userSearch); }}
                  disabled={userPage === 0}
                  className="p-2 rounded-lg text-white/30 hover:text-white/50 hover:bg-white/[0.06] disabled:opacity-20 transition-all">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button onClick={() => { setUserPage(p => p + 1); fetchUsers(userPage + 1, userSearch); }}
                  disabled={(userPage + 1) * 20 >= userTotal}
                  className="p-2 rounded-lg text-white/30 hover:text-white/50 hover:bg-white/[0.06] disabled:opacity-20 transition-all">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {tab === 'revenue' && revenueData && (
          <div className="space-y-6">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
              <h3 className="text-[14px] font-semibold text-white mb-4">Subscription Revenue (EUR/month)</h3>
              <div className="grid grid-cols-4 gap-4">
                {Object.entries(revenueData.subscriptionRevenue || {}).map(([plan, cents]) => (
                  <div key={plan} className="rounded-lg border border-white/[0.04] bg-white/[0.01] p-3">
                    <p className="text-[11px] text-white/30 capitalize mb-1">{plan}</p>
                    <p className="text-[18px] font-bold text-green-400">{formatEur(cents as number)}</p>
                  </div>
                ))}
                <div className="rounded-lg border border-green-400/20 bg-green-400/5 p-3">
                  <p className="text-[11px] text-green-400/60 mb-1">Total</p>
                  <p className="text-[18px] font-bold text-green-400">{formatEur(revenueData.totalSubscriptionRevenueEurCents)}</p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
              <h3 className="text-[14px] font-semibold text-white mb-4">Extra Top-Up Purchases</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg border border-white/[0.04] bg-white/[0.01] p-3">
                  <p className="text-[11px] text-white/30 mb-1">Total Purchases</p>
                  <p className="text-[18px] font-bold text-white">{revenueData.extraCreditPurchases?.count ?? 0}</p>
                </div>
                <div className="rounded-lg border border-white/[0.04] bg-white/[0.01] p-3">
                  <p className="text-[11px] text-white/30 mb-1">Budget Added</p>
                  <p className="text-[18px] font-bold text-white">{formatUsdVal(revenueData.extraCreditPurchases?.totalCredits)}</p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
              <h3 className="text-[14px] font-semibold text-white mb-4">Daily Top-Up Purchases (Last 30 days)</h3>
              {(revenueData.dailyRevenue?.length ?? 0) === 0 ? (
                <p className="text-[13px] text-white/30 text-center py-8">No purchase data yet</p>
              ) : (
                <div className="space-y-1">
                  {revenueData.dailyRevenue.map(d => {
                    const maxTokens = Math.max(...revenueData.dailyRevenue.map(x => Number(x.total_tokens)));
                    const pct = maxTokens > 0 ? (Number(d.total_tokens) / maxTokens * 100) : 0;
                    return (
                      <div key={d.day} className="flex items-center gap-3 py-1">
                        <span className="text-[11px] text-white/25 w-20 shrink-0">
                          {new Date(d.day).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                        </span>
                        <div className="flex-1 h-5 rounded bg-white/[0.03] overflow-hidden">
                          <div className="h-full bg-green-500/30 rounded" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[11px] text-white/40 w-20 text-right tabular-nums">
                          {formatUsdVal(d.total_tokens)} ({d.transaction_count})
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
              <h3 className="text-[14px] font-semibold text-white mb-4">Top Users by Purchases</h3>
              <div className="space-y-1">
                {(revenueData.topSpenders ?? []).map((u, i) => (
                  <div key={u.email} className="flex items-center justify-between py-2.5 border-b border-white/[0.04] last:border-0">
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] text-white/20 w-6">{i + 1}.</span>
                      <div>
                        <p className="text-[13px] text-white/70">{u.email}</p>
                        <p className="text-[11px] text-white/20 capitalize">{u.plan}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[13px] text-white/60 tabular-nums">{formatUsdVal(u.total_purchased)} purchased</p>
                      <p className="text-[11px] text-white/20">{formatUsdVal(u.balance)} remaining</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'servers' && (
          <div className="space-y-4">
            {servers.length === 0 ? (
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-12 text-center">
                <Server className="h-10 w-10 text-white/10 mx-auto mb-3" />
                <p className="text-[14px] text-white/30">No worker servers registered</p>
                <p className="text-[12px] text-white/15 mt-1">Register a worker server using the webhook endpoint</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {servers.map(s => {
                  const ramPct = s.ram_total > 0 ? (s.ram_used / s.ram_total * 100) : 0;
                  const serverCost = Number(overview?.financials?.monthlyServerCosts || 0) / Math.max(servers.length, 1);
                  return (
                    <div key={s.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <p className="text-[15px] font-medium text-white">{s.hostname || s.ip}</p>
                          <p className="text-[12px] text-white/25 mt-0.5">{s.ip}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-white/30">{formatEur(serverCost)}/mo</span>
                          <span className={`text-[11px] px-2 py-0.5 rounded-full ${STATUS_COLORS[s.status] || 'text-white/30 bg-white/5'}`}>
                            {s.status}
                          </span>
                          <span className="text-[12px] text-white/30">{s.user_count} users</span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between text-[12px]">
                          <span className="text-white/40">RAM</span>
                          <span className="text-white/60">{(s.ram_used / 1024).toFixed(1)} / {(s.ram_total / 1024).toFixed(1)} GB ({ramPct.toFixed(0)}%)</span>
                        </div>
                        <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                          <div className={`h-full rounded-full ${ramPct > 85 ? 'bg-red-400' : ramPct > 60 ? 'bg-amber-400' : 'bg-green-400'}`}
                            style={{ width: `${ramPct}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {editUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setEditUser(null)}>
          <div className="rounded-2xl border border-white/[0.08] bg-[#111] p-6 w-[420px] max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-[16px] font-semibold text-white mb-4">Edit User</h3>
            <p className="text-[13px] text-white/40 mb-5">{editUser.email}</p>

            <div className="space-y-4">
              <div>
                <label className="text-[12px] text-white/30 block mb-1">Plan</label>
                <select value={editForm.plan} onChange={e => setEditForm({ ...editForm, plan: e.target.value })}
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[13px] text-white focus:border-white/20 focus:outline-none">
                  <option value="starter">Starter (€10/mo)</option>
                  <option value="pro">Pro (€20/mo)</option>
                  <option value="business">Business (€50/mo)</option>
                </select>
              </div>
              <div>
                <label className="text-[12px] text-white/30 block mb-1">Status</label>
                <select value={editForm.status} onChange={e => setEditForm({ ...editForm, status: e.target.value })}
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[13px] text-white focus:border-white/20 focus:outline-none">
                  <option value="provisioning">Provisioning</option>
                  <option value="active">Active</option>
                  <option value="sleeping">Sleeping</option>
                  <option value="paused">Paused</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="grace_period">Grace Period</option>
                </select>
              </div>
              <div>
                <label className="text-[12px] text-white/30 block mb-1">AI Balance ($)</label>
                <input type="number" value={editForm.credit_balance}
                  onChange={e => setEditForm({ ...editForm, credit_balance: e.target.value })}
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[13px] text-white focus:border-white/20 focus:outline-none"
                />
              </div>
              <div className="flex items-center gap-3">
                <input type="checkbox" checked={editForm.is_admin}
                  onChange={e => setEditForm({ ...editForm, is_admin: e.target.checked })}
                  className="rounded border-white/20" />
                <label className="text-[13px] text-white/50">Admin access</label>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setEditUser(null)}
                className="px-4 py-2 rounded-lg text-[13px] text-white/40 hover:text-white/60 transition-colors">
                Cancel
              </button>
              <button onClick={saveEdit} disabled={saving}
                className="px-4 py-2 rounded-lg bg-white/10 text-[13px] text-white hover:bg-white/15 transition-all disabled:opacity-40">
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: any; label: string; value: string; sub: string; color: string;
}) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-500/10 text-blue-400',
    green: 'bg-green-500/10 text-green-400',
    purple: 'bg-purple-500/10 text-purple-400',
    amber: 'bg-amber-500/10 text-amber-400',
    red: 'bg-red-500/10 text-red-400',
  };
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${colors[color]}`}>
          <Icon className="h-4 w-4" />
        </div>
        <span className="text-[12px] text-white/30">{label}</span>
      </div>
      <p className="text-[24px] font-bold text-white tabular-nums">{value}</p>
      <p className="text-[11px] text-white/20 mt-0.5">{sub}</p>
    </div>
  );
}
