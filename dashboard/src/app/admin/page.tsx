'use client';

import { useEffect, useState, useCallback } from 'react';
import api from '@/lib/api';
import {
  Users, Server, Coins, TrendingUp, Activity, Search,
  Shield, Loader2, RefreshCw, ChevronDown, ChevronUp,
  AlertTriangle, CheckCircle, XCircle, Eye, Edit3,
  ArrowUpRight, ArrowDownRight, BarChart3, DollarSign,
  Clock, Zap, HardDrive, LogOut, ChevronLeft, ChevronRight,
} from 'lucide-react';

interface Overview {
  users: {
    total: string; active: string; sleeping: string; paused: string;
    provisioning: string; cancelled: string;
    new_24h: string; new_7d: string; new_30d: string;
  };
  servers: { total: string; total_ram: string; used_ram: string };
  revenue: { month_token_purchases: string; total_token_purchases: string };
  tokens: { total_used: string; total_balance: string; total_purchased: string };
  recentSignups: Array<{ id: string; email: string; plan: string; status: string; created_at: string }>;
  plans: { starter: string; pro: string; business: string };
}

interface AdminUser {
  id: string; email: string; display_name: string | null; plan: string;
  status: string; subdomain: string | null; created_at: string;
  last_active: string | null; is_admin: boolean;
  token_balance: number | null; total_used: number | null; total_purchased: number | null;
  server_ip: string | null; server_hostname: string | null;
}

interface RevenueData {
  monthlyRevenue: Array<{ month: string; total_tokens: string; transaction_count: string }>;
  dailyRevenue: Array<{ day: string; total_tokens: string; transaction_count: string }>;
  topSpenders: Array<{ email: string; plan: string; total_purchased: number; total_used: number; balance: number }>;
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

function formatTokens(n: number | string | null): string {
  const v = Number(n || 0);
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
  if (v >= 1_000) return (v / 1_000).toFixed(0) + 'K';
  return v.toString();
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
  const [authed, setAuthed] = useState<boolean | null>(null);
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
  const [editForm, setEditForm] = useState({ plan: '', status: '', is_admin: false, token_balance: '' });
  const [saving, setSaving] = useState(false);

  const checkAuth = useCallback(async () => {
    try {
      await api.get<any>('/admin/overview');
      setAuthed(true);
    } catch {
      setAuthed(false);
    }
  }, []);

  useEffect(() => { checkAuth(); }, [checkAuth]);

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
    if (!authed) return;
    setLoading(true);
    Promise.all([fetchOverview(), fetchUsers(), fetchRevenue(), fetchServers()])
      .finally(() => setLoading(false));
  }, [authed, fetchOverview, fetchUsers, fetchRevenue, fetchServers]);

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
      token_balance: String(u.token_balance ?? 0),
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
        token_balance: parseInt(editForm.token_balance) || 0,
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

  if (authed === null) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <Shield className="h-12 w-12 text-red-400/50 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-white mb-2">Access Denied</h1>
          <p className="text-sm text-white/40 mb-6">Admin privileges required</p>
          <button onClick={() => window.location.href = '/dashboard'}
            className="text-sm text-white/30 hover:text-white/50 transition-colors">
            Back to Dashboard
          </button>
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

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Top bar */}
      <div className="border-b border-white/[0.06] px-6 py-3 flex items-center justify-between sticky top-0 z-50 bg-black/90 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <Shield className="h-5 w-5 text-red-400" />
          <span className="text-[16px] font-bold text-white">Admin Panel</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={refresh}
            className={`p-2 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-all ${refreshing ? 'animate-spin' : ''}`}>
            <RefreshCw className="h-4 w-4" />
          </button>
          <button onClick={() => window.location.href = '/dashboard'}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] text-white/30 hover:text-white/50 hover:bg-white/[0.06] transition-all">
            <LogOut className="h-3.5 w-3.5" />
            Dashboard
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Tabs */}
        <div className="flex items-center gap-1 mb-6 border-b border-white/[0.06] pb-0">
          {([
            { id: 'overview' as Tab, label: 'Overview', icon: BarChart3 },
            { id: 'users' as Tab, label: 'Users', icon: Users },
            { id: 'revenue' as Tab, label: 'Revenue', icon: DollarSign },
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

        {/* ── OVERVIEW ── */}
        {tab === 'overview' && o && (
          <div className="space-y-6">
            {/* Main stats */}
            <div className="grid grid-cols-4 gap-4">
              <StatCard icon={Users} label="Total Users" value={formatNum(o.users.total)}
                sub={`+${o.users.new_24h} today`} color="blue" />
              <StatCard icon={Activity} label="Active" value={formatNum(o.users.active)}
                sub={`${o.users.sleeping} sleeping`} color="green" />
              <StatCard icon={Coins} label="Tokens Used" value={formatTokens(o.tokens.total_used)}
                sub={`${formatTokens(o.tokens.total_balance)} remaining`} color="purple" />
              <StatCard icon={TrendingUp} label="Month Revenue" value={formatTokens(o.revenue.month_token_purchases) + ' tkns'}
                sub={`Total: ${formatTokens(o.revenue.total_token_purchases)}`} color="amber" />
            </div>

            {/* Plan breakdown + Status */}
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
                <h3 className="text-[14px] font-semibold text-white mb-4">Plans Distribution</h3>
                <div className="space-y-3">
                  {[
                    { name: 'Starter', count: o.plans.starter, color: 'bg-white/20' },
                    { name: 'Pro', count: o.plans.pro, color: 'bg-blue-400' },
                    { name: 'Business', count: o.plans.business, color: 'bg-amber-400' },
                  ].map(p => {
                    const total = Number(o.plans.starter) + Number(o.plans.pro) + Number(o.plans.business);
                    const pct = total > 0 ? (Number(p.count) / total * 100) : 0;
                    return (
                      <div key={p.name}>
                        <div className="flex justify-between text-[13px] mb-1">
                          <span className="text-white/60">{p.name}</span>
                          <span className="text-white/40">{p.count} ({pct.toFixed(0)}%)</span>
                        </div>
                        <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                          <div className={`h-full rounded-full ${p.color}`} style={{ width: `${pct}%` }} />
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
                    <span className="text-white/40">Servers</span>
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

            {/* Recent Signups */}
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

        {/* ── USERS ── */}
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
                    <th className="px-4 py-3 text-left text-[11px] font-medium text-white/30 uppercase tracking-wider">Tokens</th>
                    <th className="px-4 py-3 text-left text-[11px] font-medium text-white/30 uppercase tracking-wider">Server</th>
                    <th className="px-4 py-3 text-left text-[11px] font-medium text-white/30 uppercase tracking-wider">Joined</th>
                    <th className="px-4 py-3 text-right text-[11px] font-medium text-white/30 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
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
                        <p className="text-[12px] text-white/50 tabular-nums">{formatTokens(u.token_balance)}</p>
                        <p className="text-[10px] text-white/20">used: {formatTokens(u.total_used)}</p>
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
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between">
              <p className="text-[12px] text-white/30">
                Showing {userPage * 20 + 1}–{Math.min((userPage + 1) * 20, userTotal)} of {userTotal}
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

        {/* ── REVENUE ── */}
        {tab === 'revenue' && revenueData && (
          <div className="space-y-6">
            {/* Daily activity */}
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
              <h3 className="text-[14px] font-semibold text-white mb-4">Daily Token Purchases (Last 30 days)</h3>
              {revenueData.dailyRevenue.length === 0 ? (
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
                          {formatTokens(d.total_tokens)} ({d.transaction_count})
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Top Spenders */}
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
              <h3 className="text-[14px] font-semibold text-white mb-4">Top Users by Token Purchases</h3>
              <div className="space-y-1">
                {revenueData.topSpenders.map((u, i) => (
                  <div key={u.email} className="flex items-center justify-between py-2.5 border-b border-white/[0.04] last:border-0">
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] text-white/20 w-6">{i + 1}.</span>
                      <div>
                        <p className="text-[13px] text-white/70">{u.email}</p>
                        <p className="text-[11px] text-white/20 capitalize">{u.plan}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[13px] text-white/60 tabular-nums">{formatTokens(u.total_purchased)} purchased</p>
                      <p className="text-[11px] text-white/20">{formatTokens(u.balance)} remaining</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── SERVERS ── */}
        {tab === 'servers' && (
          <div className="space-y-4">
            {servers.length === 0 ? (
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-12 text-center">
                <Server className="h-10 w-10 text-white/10 mx-auto mb-3" />
                <p className="text-[14px] text-white/30">No servers registered</p>
                <p className="text-[12px] text-white/15 mt-1">Register your server using the webhook endpoint</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {servers.map(s => {
                  const ramPct = s.ram_total > 0 ? (s.ram_used / s.ram_total * 100) : 0;
                  return (
                    <div key={s.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <p className="text-[15px] font-medium text-white">{s.hostname || s.ip}</p>
                          <p className="text-[12px] text-white/25 mt-0.5">{s.ip}</p>
                        </div>
                        <div className="flex items-center gap-2">
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

      {/* Edit User Modal */}
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
                  <option value="starter">Starter</option>
                  <option value="pro">Pro</option>
                  <option value="business">Business</option>
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
                <label className="text-[12px] text-white/30 block mb-1">Token Balance</label>
                <input type="number" value={editForm.token_balance}
                  onChange={e => setEditForm({ ...editForm, token_balance: e.target.value })}
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
