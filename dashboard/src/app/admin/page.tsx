'use client';

import { useEffect, useState, useCallback } from 'react';
import api from '@/lib/api';
import {
  Users, Server, Coins, TrendingUp, Activity, Search,
  Shield, Loader2, RefreshCw, AlertTriangle, Edit3,
  BarChart3, Zap, HardDrive, LogOut, ChevronLeft, ChevronRight,
  DollarSign, MessageSquare, Star, X, Monitor, Download, Clock, Eye, Globe2,
} from 'lucide-react';

interface PlanDetail {
  count: number;
  priceUsdCents: number;
  revenueUsdCents: number;
  nexosCostUsdCents: number;
  serverCostUsdCents: number;
  totalCostUsdCents: number;
  profitUsdCents: number;
  marginPercent: number;
}

interface Financials {
  currency: string;
  monthlySubscriptionRevenue: number;
  monthlyCreditRevenue: number;
  totalMonthlyRevenue: number;
  monthlyServerCosts: number;
  monthlyServerCostsNet: number;
  monthlyServerCostsVat: number;
  serverCostNetPerMonth: number;
  serverCostVatPerMonth: number;
  serverCostGrossPerMonth: number;
  vatRate: number;
  monthlyNexosCosts: number;
  monthlyCreditCosts: number;
  totalCosts: number;
  monthlyProfit: number;
  profitMarginPercent: number;
  profitMarginTarget: number;
  perPlan: {
    starter: PlanDetail;
    pro: PlanDetail;
    business: PlanDetail;
  };
}

interface Metrics {
  mrr: number;
  arpu: number;
  payingActive: number;
  churnRate: number;
  churned: number;
  totalEverPaid: number;
  conversionRate: number;
  converted: number;
  totalSignups: number;
  ltv: number;
}

interface Overview {
  users: {
    total: string; active: string; sleeping: string; paused: string;
    provisioning: string; cancelled: string; pending: string;
    paid: string; unpaid: string; paying_active: string;
    new_24h: string; new_7d: string; new_30d: string;
  };
  metrics: Metrics;
  servers: { total: string; total_ram: string; used_ram: string };
  revenue: { month_credit_purchases: string; total_credit_purchases: string };
  credits: { total_used: string; total_balance: string; total_purchased: string };
  recentSignups: Array<{ id: string; email: string; plan: string; status: string; created_at: string }>;
  plans: { starter: string; pro: string; business: string };
  financials: Financials;
  desktop: {
    subscribers: number; trialing: number; trialExpired: number;
    total: number; totalSignups: number;
    desktopOnly: number; desktopAndVps: number;
    new24h: number; new7d: number;
    priceEurCents: number; vatRate: number; revenueEurCents: number;
  };
}

interface AdminUser {
  id: string; email: string; display_name: string | null; plan: string;
  status: string; subdomain: string | null; created_at: string;
  last_active: string | null; is_admin: boolean; has_paid: boolean;
  has_desktop: boolean; has_desktop_trial: boolean; has_vps: boolean;
  desktop_subscription_id: string | null; desktop_trial_ends_at: string | null;
  credit_balance: number | null; total_used: number | null; total_purchased: number | null;
  server_ip: string | null; server_hostname: string | null;
}

interface DesktopUser {
  id: string; email: string; display_name: string | null; avatar_url: string | null;
  stripe_customer_id: string | null; desktop_subscription_id: string | null;
  desktop_trial_ends_at: string | null; created_at: string; updated_at: string;
  has_paid: boolean; has_active_trial: boolean;
  total_use_seconds: number | null; last_seen: string | null;
  app_version: string | null; os: string | null;
}

interface DesktopUsageStats {
  active24h: number; active7d: number; totalUseHours: number;
}

interface DownloadStats {
  total: number;
  byAsset: Array<{ name: string; downloads: number }>;
}

interface RevenueData {
  currency: string;
  totalRevenueUsdCents: number;
  totalNexosCostUsdCents: number;
  totalServerCostUsdCents: number;
  totalServerCostNet: number;
  totalServerCostVat: number;
  serverCount: number;
  serverCostNetPerMonth: number;
  serverCostGrossPerMonth: number;
  vatRate: number;
  totalProfitUsdCents: number;
  profitMarginPercent: number;
  profitMarginTarget: number;
  subscriptionRevenue: Record<string, { count: number; revenueUsdCents: number; nexosCostUsdCents: number; profitUsdCents: number }>;
  topUsers: Array<{ email: string; plan: string; status: string; last_active: string | null }>;
  signupsByMonth: Array<{ month: string; signups: string; paid: string; paying_active: string }>;
}

interface FinancialsData {
  currency: string;
  main: { totalRevenueUsdCents: number; totalProfitUsdCents: number; totalAiCostUsdCents: number };
  subscriptions: { revenueUsdCents: number; aiCostUsdCents: number; vpsCostUsdCents: number };
  credits: {
    revenueUsdCents: number;
    monthRevenueUsdCents: number;
    costUsdCents: number;
    monthCostUsdCents: number;
    profitUsdCents: number;
    monthProfitUsdCents: number;
    fromStripe: boolean;
    costBreakdown?: { creditsBaseUsdCents: number; openRouterFeeUsdCents: number; vatUsdCents: number };
  };
  vps: { costUsdCents: number; serverCount: number; costPerServerUsdCents: number };
  openRouterUsageUsdCents: number;
}

interface ServerInfo {
  id: string; ip: string; hostname: string; ram_total: number;
  ram_used: number; status: string; user_count: number;
}

type Tab = 'overview' | 'users' | 'desktop' | 'traffic' | 'revenue' | 'servers' | 'feedback';

interface TrafficData {
  enabled: boolean;
  message?: string;
  viewsToday: number;
  views7d: number;
  views30d: number;
  uniqueVisitors7d: number;
  uniqueVisitors30d: number;
  topPages: Array<{ path: string; views: number; uniques: number }>;
  topReferrers: Array<{ referrer: string; views: number }>;
  devices: Array<{ device: string; views: number }>;
  browsers: Array<{ browser: string; views: number }>;
  countries: Array<{ country: string; views: number }>;
  funnel: {
    homeLanding: number;
    desktopPage: number;
    downloadClick: number;
    appOpened: number;
    desktopSignups: number;
  };
}

interface FeedbackEntry {
  id: string;
  email: string;
  rating: number;
  ease_of_setup: string | null;
  most_useful: string | null;
  biggest_pain: string | null;
  recommend: string | null;
  improvements: string | null;
  comments: string | null;
  created_at: string;
}

interface UserDetail {
  user: {
    id: string;
    email: string;
    display_name: string | null;
    plan: string;
    status: string;
    subdomain: string | null;
    container_name: string | null;
    server_id: string | null;
    stripe_customer_id: string | null;
    referral_code: string | null;
    is_admin: boolean;
    created_at: string;
    last_active: string | null;
    api_budget_addon_usd?: number;
    desktop_subscription_id: string | null;
    desktop_trial_ends_at: string | null;
    desktop_trial_active: boolean;
    has_vps: boolean;
    server_ip: string | null;
    server_hostname: string | null;
  };
  tokens: { balance: number; total_used: number; total_purchased: number } | null;
  activity: Array<Record<string, unknown>>;
  transactions: Array<Record<string, unknown>>;
  creditPurchases: Array<{ id: string; amount_eur_cents: number; credits_usd: number; stripe_session_id: string | null; created_at: string }>;
  nexosUsage: { usedUsd: number; remainingUsd: number; limitUsd: number; displayAmountBought: number } | null;
}

const STATUS_COLORS: Record<string, string> = {
  active: 'text-green-400 bg-green-500/10',
  sleeping: 'text-blue-400 bg-blue-500/10',
  provisioning: 'text-amber-400 bg-amber-500/10',
  paused: 'text-red-400 bg-red-500/10',
  cancelled: 'text-white/30 bg-white/5',
  grace_period: 'text-amber-400 bg-amber-500/10',
};

/** Plan prices in USD (display only — must match backend priceUsdCents / 100) */
const PLAN_PRICE_USD: Record<string, number> = { starter: 15, pro: 25, business: 50 };

function formatNum(n: string | number): string {
  return Number(n).toLocaleString();
}

function formatUsdVal(n: number | string | null): string {
  const v = Number(n || 0);
  return `$${v.toFixed(2)}`;
}

function formatUsd(cents: number): string {
  const usd = cents / 100;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(usd);
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
  const [authState, setAuthState] = useState<'loading' | 'authed' | 'denied'>('loading');
  const [tab, setTab] = useState<Tab>('overview');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [revenueData, setRevenueData] = useState<RevenueData | null>(null);
  const [financialsData, setFinancialsData] = useState<FinancialsData | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [userTotal, setUserTotal] = useState(0);
  const [userPage, setUserPage] = useState(0);
  const [userSearch, setUserSearch] = useState('');
  const [userFilter, setUserFilter] = useState<'all' | 'paid' | 'unpaid' | 'active' | 'paused' | 'pending' | 'cancelled'>('all');
  const [servers, setServers] = useState<ServerInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [editForm, setEditForm] = useState({ plan: '', status: '', is_admin: false, credit_balance: '' });
  const [saving, setSaving] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [feedbackList, setFeedbackList] = useState<FeedbackEntry[]>([]);
  const [desktopUsers, setDesktopUsers] = useState<DesktopUser[]>([]);
  const [desktopTotal, setDesktopTotal] = useState(0);
  const [desktopPage, setDesktopPage] = useState(0);
  const [desktopFilter, setDesktopFilter] = useState<'all' | 'paid' | 'trialing' | 'expired' | 'free'>('all');
  const [desktopSearch, setDesktopSearch] = useState('');
  const [desktopUsage, setDesktopUsage] = useState<DesktopUsageStats | null>(null);
  const [downloadStats, setDownloadStats] = useState<DownloadStats | null>(null);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [userDetail, setUserDetail] = useState<UserDetail | null>(null);
  const [userDetailLoading, setUserDetailLoading] = useState(false);
  const [trafficData, setTrafficData] = useState<TrafficData | null>(null);

  const showMsg = (type: 'success' | 'error', text: string) => {
    setActionMsg({ type, text });
    setTimeout(() => setActionMsg(null), 4000);
  };

  useEffect(() => {
    const tryAuth = (attempt = 0) => {
      api.get<Overview>('/admin/overview')
        .then((data) => {
          setOverview(data);
          setAuthState('authed');
        })
        .catch((err) => {
          if (err.message?.includes('Too many') && attempt < 2) {
            setTimeout(() => tryAuth(attempt + 1), 5000);
          } else {
            setAuthState('denied');
          }
        });
    };
    tryAuth();
  }, []);

  const fetchOverview = useCallback(async () => {
    try {
      const data = await api.get<Overview>('/admin/overview');
      setOverview(data);
    } catch (err: any) {
      console.error('[admin] fetchOverview failed:', err.message);
    }
  }, []);

  const fetchUsers = useCallback(async (page = 0, search = '', filter = 'all') => {
    try {
      const params = new URLSearchParams({ limit: '20', offset: String(page * 20) });
      if (search) params.set('search', search);
      if (filter === 'paid') params.set('paid', 'true');
      else if (filter === 'unpaid') params.set('paid', 'false');
      else if (filter !== 'all') params.set('status', filter);
      const data = await api.get<{ users: AdminUser[]; total: number }>(`/admin/users?${params}`);
      setUsers(data.users);
      setUserTotal(data.total);
    } catch (err: any) {
      console.error('[admin] fetchUsers failed:', err.message);
      showMsg('error', `Failed to load users: ${err.message}`);
    }
  }, []);

  const fetchRevenue = useCallback(async () => {
    try {
      const data = await api.get<RevenueData>('/admin/revenue');
      setRevenueData(data);
    } catch (err: any) {
      console.error('[admin] fetchRevenue failed:', err.message);
      showMsg('error', `Failed to load revenue: ${err.message}`);
    }
  }, []);

  const fetchFinancials = useCallback(async () => {
    try {
      const data = await api.get<FinancialsData>('/admin/financials');
      setFinancialsData(data);
    } catch (err: any) {
      console.error('[admin] fetchFinancials failed:', err.message);
      showMsg('error', `Failed to load financials: ${err.message}`);
    }
  }, []);

  const fetchServers = useCallback(async () => {
    try {
      const data = await api.get<{ servers: ServerInfo[] }>('/admin/servers');
      setServers(data.servers);
    } catch (err: any) {
      console.error('[admin] fetchServers failed:', err.message);
      showMsg('error', `Failed to load servers: ${err.message}`);
    }
  }, []);

  const fetchDesktopUsers = useCallback(async (page = 0, filter = 'all', search = '') => {
    try {
      const params = new URLSearchParams({ limit: '20', offset: String(page * 20) });
      if (filter !== 'all') params.set('filter', filter);
      if (search) params.set('search', search);
      const data = await api.get<{ users: DesktopUser[]; total: number; usage: DesktopUsageStats }>(`/admin/desktop-users?${params}`);
      setDesktopUsers(data.users);
      setDesktopTotal(data.total);
      setDesktopUsage(data.usage);
    } catch (err: any) {
      console.error('[admin] fetchDesktopUsers failed:', err.message);
    }
  }, []);

  const fetchDownloadStats = useCallback(async () => {
    try {
      const resp = await fetch('https://api.github.com/repos/Skycustody/valnaa-desktop/releases');
      if (!resp.ok) return;
      const releases: Array<{ assets: Array<{ name: string; download_count: number }> }> = await resp.json();
      let total = 0;
      const byAsset: Array<{ name: string; downloads: number }> = [];
      for (const rel of releases) {
        for (const a of rel.assets) {
          if (a.name.endsWith('.dmg') || a.name.endsWith('.exe')) {
            total += a.download_count;
            const existing = byAsset.find(x => x.name === a.name);
            if (existing) existing.downloads += a.download_count;
            else byAsset.push({ name: a.name, downloads: a.download_count });
          }
        }
      }
      setDownloadStats({ total, byAsset: byAsset.sort((a, b) => b.downloads - a.downloads) });
    } catch {
      // GitHub API rate limit or network error — non-critical
    }
  }, []);

  const fetchFeedback = useCallback(async () => {
    try {
      const data = await api.get<{ feedback: FeedbackEntry[] }>('/feedback/list');
      setFeedbackList(data.feedback);
    } catch (err: any) {
      console.error('[admin] fetchFeedback failed:', err.message);
    }
  }, []);

  const fetchTraffic = useCallback(async () => {
    try {
      const data = await api.get<TrafficData>('/admin/traffic');
      setTrafficData(data);
    } catch (err: any) {
      console.error('[admin] fetchTraffic failed:', err.message);
    }
  }, []);

  useEffect(() => {
    if (authState !== 'authed') return;
    setLoading(true);
    Promise.all([fetchOverview(), fetchUsers(), fetchRevenue(), fetchFinancials(), fetchServers(), fetchDesktopUsers(), fetchDownloadStats(), fetchFeedback(), fetchTraffic()])
      .finally(() => setLoading(false));
  }, [authState, fetchOverview, fetchUsers, fetchRevenue, fetchFinancials, fetchServers, fetchDesktopUsers, fetchDownloadStats, fetchFeedback, fetchTraffic]);

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchOverview(), fetchUsers(userPage, userSearch, userFilter), fetchRevenue(), fetchFinancials(), fetchServers(), fetchDesktopUsers(desktopPage, desktopFilter, desktopSearch), fetchDownloadStats(), fetchFeedback(), fetchTraffic()]);
    setRefreshing(false);
  };

  const handleUserSearch = () => {
    setUserPage(0);
    fetchUsers(0, userSearch, userFilter);
  };

  const openEdit = (e: React.MouseEvent, u: AdminUser) => {
    e.stopPropagation();
    setEditUser(u);
    setEditForm({
      plan: u.plan,
      status: u.status,
      is_admin: u.is_admin,
      credit_balance: String(u.credit_balance ?? 0),
    });
  };

  const openUserDetail = async (u: AdminUser) => {
    setSelectedUser(u);
    setUserDetail(null);
    setUserDetailLoading(true);
    try {
      const data = await api.get<UserDetail>(`/admin/users/${u.id}`);
      setUserDetail(data);
    } catch (err: unknown) {
      showMsg('error', err instanceof Error ? err.message : 'Failed to load user');
      setSelectedUser(null);
    } finally {
      setUserDetailLoading(false);
    }
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
      showMsg('success', 'User updated');
      fetchUsers(userPage, userSearch);
      fetchOverview();
    } catch (err: any) {
      showMsg('error', err.message || 'Failed to save');
    }
    setSaving(false);
  };

  const handleReprovision = async (userId?: string) => {
    try {
      const data = await api.post<{ results: Array<{ email: string; status: string }> }>('/admin/reprovision', userId ? { userId } : {});
      const ok = data.results?.filter(r => r.status === 'success').length || 0;
      const fail = data.results?.filter(r => r.status !== 'success').length || 0;
      showMsg(fail > 0 ? 'error' : 'success', `Provisioned: ${ok} success, ${fail} failed`);
      fetchUsers(userPage, userSearch);
      fetchOverview();
    } catch (err: any) {
      showMsg('error', err.message || 'Reprovision failed');
    }
  };

  const handleUpdateOpenclaw = async () => {
    if (!confirm('This will rebuild the OpenClaw image on all workers (3-5 min) and restart all containers. Proceed?')) return;
    try {
      await api.post('/admin/update-openclaw', {});
      showMsg('success', 'OpenClaw update started on all workers. Takes 3-5 minutes — check API logs for progress.');
    } catch (err: any) {
      showMsg('error', err.message || 'Failed to start update');
    }
  };

  const handleRemoveServer = async (serverId: string) => {
    if (!confirm('Remove this server? Only works if no active users are on it.')) return;
    try {
      await api.delete(`/admin/servers/${serverId}`);
      showMsg('success', 'Server removed');
      fetchServers();
      fetchOverview();
    } catch (err: any) {
      showMsg('error', err.message || 'Failed to remove server');
    }
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
          <p className="text-sm text-white/40 mb-6">You must be signed in with the admin Google account.</p>
          <a href="/dashboard" className="text-sm text-white/30 hover:text-white/50 transition-colors">
            Back to Dashboard
          </a>
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
          <a href="/dashboard"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] text-white/30 hover:text-white/50 hover:bg-white/[0.06] transition-all">
            <LogOut className="h-3.5 w-3.5" />
            Dashboard
          </a>
        </div>
      </div>

      {actionMsg && (
        <div className={`fixed top-4 right-4 z-[60] rounded-lg border px-4 py-3 text-[13px] shadow-lg transition-all ${
          actionMsg.type === 'success'
            ? 'border-green-500/20 bg-green-500/10 text-green-400'
            : 'border-red-500/20 bg-red-500/10 text-red-400'
        }`}>
          {actionMsg.text}
        </div>
      )}

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        <div className="flex items-center gap-1 border-b border-white/[0.06] pb-0">
          {([
            { id: 'overview' as Tab, label: 'Overview', icon: BarChart3 },
            { id: 'users' as Tab, label: 'Users', icon: Users },
            { id: 'desktop' as Tab, label: 'Desktop', icon: Monitor },
            { id: 'traffic' as Tab, label: 'Traffic', icon: Globe2 },
            { id: 'revenue' as Tab, label: 'Revenue & Costs', icon: DollarSign },
            { id: 'servers' as Tab, label: 'Servers', icon: Server },
            { id: 'feedback' as Tab, label: 'Feedback', icon: MessageSquare },
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
              <StatCard icon={DollarSign} label="Monthly Revenue" value={formatUsd(f.totalMonthlyRevenue)}
                sub={`Subs ${formatUsd(f.monthlySubscriptionRevenue)}${f.monthlyCreditRevenue > 0 ? ` + Credits ${formatUsd(f.monthlyCreditRevenue)}` : ''}`} color="green" />
              <StatCard icon={HardDrive} label="Server Costs" value={formatUsd(f.monthlyServerCosts)}
                sub={`${o.servers.total} server × ${formatUsd(f.serverCostGrossPerMonth)} (incl. ${Math.round(f.vatRate * 100)}% VAT)`} color="red" />
              <StatCard icon={Coins} label="AI Costs" value={formatUsd(f.monthlyCreditCosts)}
                sub={`${formatUsdVal(o.credits.total_used)} used`} color="amber" />
              <StatCard icon={TrendingUp} label="Monthly Profit"
                value={formatUsd(f.monthlyProfit)}
                sub={`${f.profitMarginPercent}% margin (target: ${f.profitMarginTarget}%)`}
                color={f.monthlyProfit >= 0 ? 'green' : 'red'} />
            </div>

            {/* SaaS Metrics */}
            <div className="grid grid-cols-5 gap-4">
              <StatCard icon={DollarSign} label="MRR" value={formatUsd(o.metrics.mrr)}
                sub={`${o.metrics.payingActive} paying user${o.metrics.payingActive !== 1 ? 's' : ''}`} color="green" />
              <StatCard icon={Coins} label="ARPU" value={formatUsd(o.metrics.arpu)}
                sub="avg revenue per user" color="blue" />
              <StatCard icon={TrendingUp} label="Conversion" value={`${o.metrics.conversionRate}%`}
                sub={`${o.metrics.converted} of ${o.metrics.totalSignups} signups`} color="purple" />
              <StatCard icon={AlertTriangle} label="Churn" value={`${o.metrics.churnRate}%`}
                sub={`${o.metrics.churned} of ${o.metrics.totalEverPaid} paid users`} color="red" />
              <StatCard icon={Activity} label="LTV" value={formatUsd(o.metrics.ltv)}
                sub="lifetime value est." color="amber" />
            </div>

            <div className="grid grid-cols-5 gap-4">
              <StatCard icon={Users} label="Total Signups" value={formatNum(o.users.total)}
                sub={`+${o.users.new_24h} today / +${o.users.new_7d} this week`} color="blue" />
              <StatCard icon={Zap} label="Paying Active" value={formatNum(o.users.paying_active)}
                sub={`${o.users.active} active / ${o.users.sleeping} sleeping`} color="green" />
              <StatCard icon={Monitor} label="Desktop Users" value={String(o.desktop?.total ?? 0)}
                sub={`${o.desktop?.subscribers ?? 0} paid · ${o.desktop?.trialing ?? 0} trial · €${((o.desktop?.revenueEurCents ?? 0) / 100).toFixed(2)}/mo`} color="purple" />
              <StatCard icon={Users} label="Unpaid Signups" value={formatNum(o.users.unpaid)}
                sub={`${o.users.pending} pending / never paid`} color="amber" />
              <StatCard icon={AlertTriangle} label="Churned / Paused" value={formatNum(Number(o.users.paused) + Number(o.users.cancelled))}
                sub={`${o.users.paused} paused / ${o.users.cancelled} cancelled`} color="red" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
                <h3 className="text-[14px] font-semibold text-white mb-4">Per-Plan Breakdown (USD/month)</h3>
                <div className="space-y-4">
                  {([
                    { name: 'Starter', data: f.perPlan.starter, color: 'border-white/10' },
                    { name: 'Pro', data: f.perPlan.pro, color: 'border-blue-400/20' },
                    { name: 'Business', data: f.perPlan.business, color: 'border-amber-400/20' },
                  ] as const).map(p => (
                    <div key={p.name} className={`rounded-lg border ${p.color} bg-white/[0.01] p-3`}>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-[13px] font-medium text-white">{p.name} (${PLAN_PRICE_USD[p.name.toLowerCase()] ?? 0}/mo)</span>
                        <span className="text-[12px] text-white/40">{p.data.count} users</span>
                      </div>
                      <div className="grid grid-cols-4 gap-2 text-[11px]">
                        <div>
                          <p className="text-white/25">Revenue</p>
                          <p className="text-green-400 font-medium">{formatUsd(p.data.revenueUsdCents)}</p>
                        </div>
                        <div>
                          <p className="text-white/25">AI Cost</p>
                          <p className="text-red-400/70">{formatUsd(p.data.nexosCostUsdCents)}</p>
                        </div>
                        <div>
                          <p className="text-white/25">Server Cost</p>
                          <p className="text-red-400/70">{formatUsd(p.data.serverCostUsdCents)}</p>
                        </div>
                        <div>
                          <p className="text-white/25">Profit ({p.data.marginPercent}%)</p>
                          <p className={p.data.profitUsdCents >= 0 ? 'text-green-400 font-medium' : 'text-red-400 font-medium'}>
                            {formatUsd(p.data.profitUsdCents)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
                <h3 className="text-[14px] font-semibold text-white mb-4">Infrastructure & Server Costs</h3>
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
                  <div className="border-t border-white/[0.04] my-2" />
                  <div className="flex justify-between text-[13px]">
                    <span className="text-white/40">Cost per Server (net)</span>
                    <span className="text-white">{formatUsd(f.serverCostNetPerMonth)}/mo</span>
                  </div>
                  <div className="flex justify-between text-[13px]">
                    <span className="text-white/40">VAT ({Math.round(f.vatRate * 100)}%)</span>
                    <span className="text-white/50">+{formatUsd(f.serverCostVatPerMonth)}/mo</span>
                  </div>
                  <div className="flex justify-between text-[13px] font-medium">
                    <span className="text-white/60">Cost per Server (gross)</span>
                    <span className="text-white">{formatUsd(f.serverCostGrossPerMonth)}/mo</span>
                  </div>
                  <div className="flex justify-between text-[13px] font-medium">
                    <span className="text-white/60">Total Server Cost</span>
                    <span className="text-red-400">{formatUsd(f.monthlyServerCosts)}/mo</span>
                  </div>
                  <div className="border-t border-white/[0.04] my-2" />
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
                <button onClick={handleUpdateOpenclaw}
                  className="mt-2 w-full text-[12px] text-blue-400 border border-blue-400/20 rounded-lg py-2 hover:bg-blue-400/5 transition-all">
                  Update OpenClaw on all workers
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
              <h3 className="text-[14px] font-semibold text-white mb-4">Profit & Loss Statement (USD/month)</h3>
              <div className="space-y-4">
                <div>
                  <p className="text-[11px] text-green-400/50 uppercase tracking-wider mb-2">Revenue</p>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[13px]">
                      <span className="text-white/50">Subscription Revenue</span>
                      <span className="text-green-400 font-medium">{formatUsd(f.monthlySubscriptionRevenue)}</span>
                    </div>
                    <div className="flex justify-between text-[13px]">
                      <span className="text-white/50">Extra Credit Purchases (this month)</span>
                      <span className="text-green-400/70">{formatUsdVal(o.revenue.month_credit_purchases)}</span>
                    </div>
                    {(o.desktop?.subscribers ?? 0) > 0 && (
                      <div className="flex justify-between text-[13px]">
                        <span className="text-white/50">Desktop Subscriptions ({o.desktop.subscribers}×)</span>
                        <span className="text-green-400/70">€{((o.desktop.revenueEurCents) / 100).toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="border-t border-white/[0.04]" />

                <div>
                  <p className="text-[11px] text-red-400/50 uppercase tracking-wider mb-2">Costs</p>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[13px]">
                      <span className="text-white/50">Servers (net, {o.servers.total}×)</span>
                      <span className="text-red-400/70">-{formatUsd(f.monthlyServerCostsNet)}</span>
                    </div>
                    <div className="flex justify-between text-[13px]">
                      <span className="text-white/50">Server VAT ({Math.round(f.vatRate * 100)}%)</span>
                      <span className="text-red-400/70">-{formatUsd(f.monthlyServerCostsVat)}</span>
                    </div>
                    <div className="flex justify-between text-[13px] font-medium">
                      <span className="text-white/60">Total Server Costs (gross)</span>
                      <span className="text-red-400">-{formatUsd(f.monthlyServerCosts)}</span>
                    </div>
                    <div className="flex justify-between text-[13px]">
                      <span className="text-white/50">AI Provider Costs (OpenRouter)</span>
                      <span className="text-red-400">-{formatUsd(f.monthlyCreditCosts)}</span>
                    </div>
                    <div className="flex justify-between text-[13px] font-medium">
                      <span className="text-white/60">Total Costs</span>
                      <span className="text-red-400">-{formatUsd(f.totalCosts)}</span>
                    </div>
                  </div>
                </div>

                <div className="border-t border-white/[0.06]" />

                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-[11px] text-white/30 uppercase tracking-wider mb-1">Net Profit</p>
                    <p className={`text-[28px] font-bold ${f.monthlyProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {formatUsd(f.monthlyProfit)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-[16px] font-bold ${f.profitMarginPercent >= f.profitMarginTarget ? 'text-green-400' : 'text-amber-400'}`}>
                      {f.profitMarginPercent}% margin
                    </p>
                    <p className="text-[11px] text-white/20">target: {f.profitMarginTarget}%</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
              <h3 className="text-[14px] font-semibold text-white mb-4">Recent Signups</h3>
              <div className="space-y-1">
                {o.recentSignups.map((u: any) => (
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
                      {u.has_paid
                        ? <span className="text-[10px] px-1.5 py-0.5 rounded-full text-green-400 bg-green-500/10">paid</span>
                        : <span className="text-[10px] px-1.5 py-0.5 rounded-full text-white/20 bg-white/5">unpaid</span>
                      }
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

            <div className="flex items-center gap-1.5 overflow-x-auto">
              {([
                { id: 'all' as const, label: 'All' },
                { id: 'paid' as const, label: 'Paid' },
                { id: 'unpaid' as const, label: 'Unpaid' },
                { id: 'active' as const, label: 'Active' },
                { id: 'pending' as const, label: 'Pending' },
                { id: 'paused' as const, label: 'Paused' },
                { id: 'cancelled' as const, label: 'Cancelled' },
              ]).map(f => (
                <button key={f.id}
                  onClick={() => { setUserFilter(f.id); setUserPage(0); fetchUsers(0, userSearch, f.id); }}
                  className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all whitespace-nowrap ${
                    userFilter === f.id
                      ? 'bg-white/10 text-white'
                      : 'text-white/30 hover:text-white/50 hover:bg-white/[0.04]'
                  }`}>
                  {f.label}
                </button>
              ))}
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
                    return (
                      <tr key={u.id}
                        onClick={() => openUserDetail(u)}
                        className="border-b border-white/[0.04] hover:bg-white/[0.06] transition-colors cursor-pointer">
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
                          {u.has_vps
                            ? <span className="text-[12px] text-white/50 capitalize">{u.plan}</span>
                            : <span className="text-[12px] text-white/20">—</span>
                          }
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`text-[11px] px-2 py-0.5 rounded-full ${STATUS_COLORS[u.status] || 'text-white/30 bg-white/5'}`}>
                              {u.status}
                            </span>
                            {u.has_vps && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full text-blue-400 bg-blue-500/10">VPS</span>
                            )}
                            {u.has_desktop && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full text-purple-400 bg-purple-500/10">desktop</span>
                            )}
                            {u.has_desktop_trial && !u.has_desktop && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full text-amber-400 bg-amber-500/10">trial</span>
                            )}
                            {!u.has_vps && !u.has_desktop && !u.has_desktop_trial && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full text-white/20 bg-white/5">unpaid</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-[12px] text-white/50 tabular-nums">{formatUsdVal(u.credit_balance)}</p>
                          <p className="text-[10px] text-white/20">used: {formatUsdVal(u.total_used)}</p>
                        </td>
                        <td className="px-4 py-3">
                          <div>
                            {u.has_vps && <p className="text-[12px] text-green-400/70 tabular-nums">${(PLAN_PRICE_USD[u.plan] ?? 0)}/mo</p>}
                            {u.has_desktop && <p className="text-[11px] text-purple-400/70 tabular-nums">+€5/mo desktop</p>}
                            {!u.has_vps && !u.has_desktop && <p className="text-[12px] text-white/20">—</p>}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-[11px] text-white/30">{u.server_hostname || u.server_ip || '—'}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-[11px] text-white/30">{timeAgo(u.created_at)}</p>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {(u.status === 'provisioning' || u.status === 'paused') && (
                              <button onClick={e => { e.stopPropagation(); handleReprovision(u.id); }}
                                title="Re-provision"
                                className="p-1.5 rounded-lg text-amber-400/40 hover:text-amber-400 hover:bg-amber-400/10 transition-all">
                                <Zap className="h-3.5 w-3.5" />
                              </button>
                            )}
                            <button onClick={e => openEdit(e, u)}
                              title="Edit user"
                              className="p-1.5 rounded-lg text-white/20 hover:text-white/50 hover:bg-white/[0.06] transition-all">
                              <Edit3 className="h-3.5 w-3.5" />
                            </button>
                          </div>
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
                <button onClick={() => { setUserPage(p => Math.max(0, p - 1)); fetchUsers(Math.max(0, userPage - 1), userSearch, userFilter); }}
                  disabled={userPage === 0}
                  className="p-2 rounded-lg text-white/30 hover:text-white/50 hover:bg-white/[0.06] disabled:opacity-20 transition-all">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button onClick={() => { setUserPage(p => p + 1); fetchUsers(userPage + 1, userSearch, userFilter); }}
                  disabled={(userPage + 1) * 20 >= userTotal}
                  className="p-2 rounded-lg text-white/30 hover:text-white/50 hover:bg-white/[0.06] disabled:opacity-20 transition-all">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {tab === 'desktop' && (
          <div className="space-y-6">
            {/* Stats row 1: Users */}
            <div className="grid grid-cols-4 gap-4">
              <StatCard icon={Users} label="Total Signups" value={String(overview?.desktop?.totalSignups ?? 0)}
                sub={`+${overview?.desktop?.new24h ?? 0} today, +${overview?.desktop?.new7d ?? 0} this week`} color="purple" />
              <StatCard icon={DollarSign} label="Paid Subscribers" value={String(overview?.desktop?.subscribers ?? 0)}
                sub={`€${((overview?.desktop?.revenueEurCents ?? 0) / 100).toFixed(2)}/mo revenue`} color="green" />
              <StatCard icon={Activity} label="Active Trials" value={String(overview?.desktop?.trialing ?? 0)}
                sub={`${overview?.desktop?.trialExpired ?? 0} expired`} color="amber" />
              <StatCard icon={Monitor} label="Desktop + VPS" value={String(overview?.desktop?.desktopAndVps ?? 0)}
                sub={`${overview?.desktop?.desktopOnly ?? 0} desktop only`} color="blue" />
            </div>

            {/* Stats row 2: Downloads & Usage */}
            <div className="grid grid-cols-3 gap-4">
              <StatCard icon={Download} label="App Downloads" value={String(downloadStats?.total ?? '—')}
                sub={downloadStats?.byAsset.map(a => `${a.name}: ${a.downloads}`).join(', ') || 'loading...'} color="cyan" />
              <StatCard icon={Clock} label="Total Use Time" value={`${desktopUsage?.totalUseHours ?? 0}h`}
                sub="all users combined" color="orange" />
              <StatCard icon={Eye} label="Active Users" value={String(desktopUsage?.active24h ?? 0)}
                sub={`${desktopUsage?.active7d ?? 0} active this week`} color="green" />
            </div>

            {/* Revenue box */}
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
              <h3 className="text-[14px] font-semibold text-white mb-2">Desktop Revenue Model</h3>
              <p className="text-[12px] text-white/40 mb-3">
                Desktop app: €5/mo + 25% VAT = €6.25/mo per subscriber. Separate from VPS plans.
              </p>
              <div className="grid grid-cols-3 gap-4 text-[12px]">
                <div>
                  <p className="text-white/30">Price</p>
                  <p className="text-white font-medium">€5.00/mo</p>
                </div>
                <div>
                  <p className="text-white/30">Incl. VAT (25%)</p>
                  <p className="text-white font-medium">€6.25/mo</p>
                </div>
                <div>
                  <p className="text-white/30">Monthly Revenue</p>
                  <p className="text-green-400 font-medium">€{((overview?.desktop?.revenueEurCents ?? 0) / 100).toFixed(2)}</p>
                </div>
              </div>
            </div>

            {/* Search and filter */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20" />
                <input
                  type="text"
                  placeholder="Search desktop users..."
                  value={desktopSearch}
                  onChange={e => setDesktopSearch(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { setDesktopPage(0); fetchDesktopUsers(0, desktopFilter, desktopSearch); } }}
                  className="w-full rounded-lg border border-white/[0.06] bg-white/[0.02] pl-10 pr-4 py-2 text-[13px] text-white placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                />
              </div>
              <div className="flex items-center gap-1.5 text-[12px]">
                {(['all', 'paid', 'trialing', 'expired', 'free'] as const).map(f => (
                  <button key={f} onClick={() => { setDesktopFilter(f); setDesktopPage(0); fetchDesktopUsers(0, f, desktopSearch); }}
                    className={`px-3 py-1.5 rounded-lg capitalize transition-all ${desktopFilter === f ? 'bg-purple-500/20 text-purple-400' : 'text-white/30 hover:text-white/50 hover:bg-white/[0.06]'}`}>
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {/* Users table */}
            <div className="rounded-xl border border-white/[0.06] overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                    <th className="px-4 py-3 text-left text-[11px] font-medium text-white/30 uppercase tracking-wider">User</th>
                    <th className="px-4 py-3 text-left text-[11px] font-medium text-white/30 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-left text-[11px] font-medium text-white/30 uppercase tracking-wider">Use Time</th>
                    <th className="px-4 py-3 text-left text-[11px] font-medium text-white/30 uppercase tracking-wider">Last Seen</th>
                    <th className="px-4 py-3 text-left text-[11px] font-medium text-white/30 uppercase tracking-wider">Version / OS</th>
                    <th className="px-4 py-3 text-left text-[11px] font-medium text-white/30 uppercase tracking-wider">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {desktopUsers.map(u => {
                    const useHours = u.total_use_seconds ? Math.round(u.total_use_seconds / 3600) : 0;
                    const useMins = u.total_use_seconds ? Math.round(u.total_use_seconds / 60) : 0;
                    const useDisplay = useHours > 0 ? `${useHours}h` : useMins > 0 ? `${useMins}m` : '—';
                    return (
                    <tr key={u.id}
                      className="border-b border-white/[0.04] hover:bg-white/[0.06] transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {u.avatar_url ? (
                            <img src={u.avatar_url} className="h-7 w-7 rounded-full shrink-0" alt="" />
                          ) : (
                            <div className="h-7 w-7 rounded-full bg-white/5 flex items-center justify-center text-[11px] text-white/30 font-medium shrink-0">
                              {u.email[0].toUpperCase()}
                            </div>
                          )}
                          <div>
                            <p className="text-[13px] text-white/70">{u.email}</p>
                            {u.display_name && <p className="text-[11px] text-white/30">{u.display_name}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {u.has_paid ? (
                            <span className="text-[11px] px-2 py-0.5 rounded-full text-green-400 bg-green-500/10">Paid</span>
                          ) : u.has_active_trial ? (
                            <span className="text-[11px] px-2 py-0.5 rounded-full text-amber-400 bg-amber-500/10">Trial</span>
                          ) : u.desktop_trial_ends_at ? (
                            <span className="text-[11px] px-2 py-0.5 rounded-full text-red-400 bg-red-500/10">Expired</span>
                          ) : (
                            <span className="text-[11px] px-2 py-0.5 rounded-full text-white/30 bg-white/5">Free</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-[12px] text-white/50 tabular-nums">{useDisplay}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-[11px] text-white/30">{u.last_seen ? timeAgo(u.last_seen) : '—'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          {u.app_version && <p className="text-[11px] text-white/40">v{u.app_version}</p>}
                          {u.os && <p className="text-[10px] text-white/20">{u.os}</p>}
                          {!u.app_version && !u.os && <span className="text-[11px] text-white/20">—</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-[11px] text-white/30">{timeAgo(u.created_at)}</p>
                      </td>
                    </tr>
                    );
                  })}
                  {desktopUsers.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center">
                        <Monitor className="h-10 w-10 text-white/10 mx-auto mb-3" />
                        <p className="text-[14px] text-white/30">No desktop users found</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {desktopTotal > 20 && (
              <div className="flex items-center justify-between">
                <p className="text-[12px] text-white/30">
                  Showing {desktopTotal > 0 ? desktopPage * 20 + 1 : 0}–{Math.min((desktopPage + 1) * 20, desktopTotal)} of {desktopTotal}
                </p>
                <div className="flex items-center gap-2">
                  <button onClick={() => { setDesktopPage(p => Math.max(0, p - 1)); fetchDesktopUsers(Math.max(0, desktopPage - 1), desktopFilter, desktopSearch); }}
                    disabled={desktopPage === 0}
                    className="p-2 rounded-lg text-white/30 hover:text-white/50 hover:bg-white/[0.06] disabled:opacity-20 transition-all">
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button onClick={() => { setDesktopPage(p => p + 1); fetchDesktopUsers(desktopPage + 1, desktopFilter, desktopSearch); }}
                    disabled={(desktopPage + 1) * 20 >= desktopTotal}
                    className="p-2 rounded-lg text-white/30 hover:text-white/50 hover:bg-white/[0.06] disabled:opacity-20 transition-all">
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'revenue' && revenueData && (
          <div className="space-y-6">
            {/* Main: General Revenue & Profit */}
            {financialsData && (
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
                <h3 className="text-[14px] font-semibold text-white mb-4">Overview</h3>
                <div className="grid grid-cols-2 gap-4">
                  <StatCard icon={DollarSign} label="Total Revenue" value={formatUsd(financialsData.main.totalRevenueUsdCents)}
                    sub="Subscriptions + Credits" color="green" />
                  <StatCard icon={TrendingUp} label="Total Profit"
                    value={formatUsd(financialsData.main.totalProfitUsdCents)}
                    sub={`AI cost: ${formatUsd(financialsData.main.totalAiCostUsdCents)} (OpenRouter)`}
                    color={financialsData.main.totalProfitUsdCents >= 0 ? 'green' : 'red'} />
                </div>
              </div>
            )}

            {/* Credits: Revenue & Profit from Stripe */}
            {financialsData && (
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
                <h3 className="text-[14px] font-semibold text-white mb-4">Credits {financialsData.credits.fromStripe && <span className="text-[11px] text-green-400/70 font-normal">(from Stripe)</span>}</h3>
                <div className="grid grid-cols-3 gap-4">
                  <StatCard icon={DollarSign} label="Credit Revenue" value={formatUsd(financialsData.credits.revenueUsdCents)}
                    sub={`${formatUsd(financialsData.credits.monthRevenueUsdCents)} this month`} color="green" />
                  <StatCard icon={Coins} label="Credit Cost" value={formatUsd(financialsData.credits.costUsdCents)}
                    sub="Credits (50%) + 6% OR fee + VAT (we absorb)" color="amber" />
                  <StatCard icon={TrendingUp} label="Credit Profit"
                    value={formatUsd(financialsData.credits.profitUsdCents)}
                    sub={`${formatUsd(financialsData.credits.monthProfitUsdCents)} this month`}
                    color={financialsData.credits.profitUsdCents >= 0 ? 'green' : 'red'} />
                </div>
                <div className="mt-4 rounded-lg border border-white/[0.04] bg-white/[0.01] p-3">
                  <p className="text-[12px] font-medium text-white/70 mb-2">Credit model</p>
                  <p className="text-[11px] text-white/40 mb-2">
                    Split: 50% user credits (API limit) · 6% OpenRouter fee · 44% platform margin. Users see what they paid; actual API limit is 50% of that. Consumption scales proportionally.
                  </p>
                  {financialsData.credits.costBreakdown && (
                    <div className="flex flex-wrap gap-4 text-[11px] text-white/30">
                      <span>Credits base: {formatUsd(financialsData.credits.costBreakdown.creditsBaseUsdCents)}</span>
                      <span>OR fee: {formatUsd(financialsData.credits.costBreakdown.openRouterFeeUsdCents)}</span>
                      <span>VAT: {formatUsd(financialsData.credits.costBreakdown.vatUsdCents)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Subscriptions: Revenue, AI Cost, VPS Cost */}
            {financialsData && (
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
                <h3 className="text-[14px] font-semibold text-white mb-4">Subscriptions</h3>
                <div className="grid grid-cols-3 gap-4">
                  <StatCard icon={DollarSign} label="Subscription Revenue" value={formatUsd(financialsData.subscriptions.revenueUsdCents)}
                    sub="Monthly recurring" color="green" />
                  <StatCard icon={Coins} label="AI Cost (Subscriptions)" value={formatUsd(financialsData.subscriptions.aiCostUsdCents)}
                    sub="Plan allocation (OpenRouter)" color="amber" />
                  <StatCard icon={HardDrive} label="VPS Cost" value={formatUsd(financialsData.subscriptions.vpsCostUsdCents)}
                    sub={`${financialsData.vps.serverCount} server${financialsData.vps.serverCount !== 1 ? 's' : ''}`} color="red" />
                </div>
              </div>
            )}

            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
              <h3 className="text-[14px] font-semibold text-white mb-4">Revenue by Plan (USD/month)</h3>
              <div className="space-y-3">
                {Object.entries(revenueData.subscriptionRevenue || {}).map(([plan, data]) => (
                  <div key={plan} className="rounded-lg border border-white/[0.04] bg-white/[0.01] p-3">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[13px] font-medium text-white capitalize">{plan}</span>
                      <span className="text-[12px] text-white/30">{data.count} users</span>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-[11px]">
                      <div>
                        <p className="text-white/25">Revenue</p>
                        <p className="text-green-400 font-medium">{formatUsd(data.revenueUsdCents)}</p>
                      </div>
                      <div>
                        <p className="text-white/25">AI Cost</p>
                        <p className="text-red-400/70">{formatUsd(data.nexosCostUsdCents)}</p>
                      </div>
                      <div>
                        <p className="text-white/25">Profit</p>
                        <p className={data.profitUsdCents >= 0 ? 'text-green-400 font-medium' : 'text-red-400 font-medium'}>
                          {formatUsd(data.profitUsdCents)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
              <h3 className="text-[14px] font-semibold text-white mb-4">Server Cost Breakdown</h3>
              <div className="space-y-2">
                <div className="flex justify-between text-[13px]">
                  <span className="text-white/40">Servers</span>
                  <span className="text-white">{revenueData.serverCount}</span>
                </div>
                <div className="flex justify-between text-[13px]">
                  <span className="text-white/40">Cost per Server (net)</span>
                  <span className="text-white">{formatUsd(revenueData.serverCostNetPerMonth)}/mo</span>
                </div>
                <div className="flex justify-between text-[13px]">
                  <span className="text-white/40">VAT ({Math.round(revenueData.vatRate * 100)}%)</span>
                  <span className="text-white/50">+{formatUsd(Math.round(revenueData.serverCostNetPerMonth * revenueData.vatRate))}/mo</span>
                </div>
                <div className="flex justify-between text-[13px] font-medium">
                  <span className="text-white/60">Cost per Server (gross)</span>
                  <span className="text-white">{formatUsd(revenueData.serverCostGrossPerMonth)}/mo</span>
                </div>
                <div className="border-t border-white/[0.04] my-1" />
                <div className="flex justify-between text-[13px]">
                  <span className="text-white/40">Total Server (net)</span>
                  <span className="text-white">{formatUsd(revenueData.totalServerCostNet)}</span>
                </div>
                <div className="flex justify-between text-[13px]">
                  <span className="text-white/40">Total Server VAT</span>
                  <span className="text-white/50">+{formatUsd(revenueData.totalServerCostVat)}</span>
                </div>
                <div className="flex justify-between text-[13px] font-medium">
                  <span className="text-white/60">Total Server (gross)</span>
                  <span className="text-red-400">{formatUsd(revenueData.totalServerCostUsdCents)}/mo</span>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
              <h3 className="text-[14px] font-semibold text-white mb-4">Signups &rarr; Paid Conversion by Month</h3>
              {(revenueData.signupsByMonth?.length ?? 0) === 0 ? (
                <p className="text-[13px] text-white/30 text-center py-8">No data yet</p>
              ) : (
                <div className="space-y-2">
                  {revenueData.signupsByMonth.map(m => {
                    const signups = Number(m.signups);
                    const paid = Number(m.paid);
                    const convPct = signups > 0 ? Math.round((paid / signups) * 100) : 0;
                    const maxSignups = Math.max(...revenueData.signupsByMonth.map(x => Number(x.signups)));
                    const barPct = maxSignups > 0 ? (signups / maxSignups * 100) : 0;
                    const paidBarPct = maxSignups > 0 ? (paid / maxSignups * 100) : 0;
                    return (
                      <div key={m.month} className="flex items-center gap-3 py-1">
                        <span className="text-[11px] text-white/25 w-20 shrink-0">
                          {new Date(m.month).toLocaleDateString([], { month: 'short', year: 'numeric' })}
                        </span>
                        <div className="flex-1 h-6 rounded bg-white/[0.03] overflow-hidden relative">
                          <div className="absolute inset-y-0 left-0 bg-blue-500/20 rounded" style={{ width: `${barPct}%` }} />
                          <div className="absolute inset-y-0 left-0 bg-green-500/40 rounded" style={{ width: `${paidBarPct}%` }} />
                        </div>
                        <div className="text-right w-40 shrink-0">
                          <span className="text-[11px] text-white/40 tabular-nums">
                            {m.signups} signups &middot; <span className="text-green-400">{m.paid} paid</span> &middot; {convPct}%
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  <div className="flex items-center gap-4 mt-2 text-[10px] text-white/20">
                    <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded bg-blue-500/20 inline-block" /> signups</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded bg-green-500/40 inline-block" /> paid</span>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
              <h3 className="text-[14px] font-semibold text-white mb-4">Active Users</h3>
              <div className="space-y-1">
                {(revenueData.topUsers ?? []).map((u, i) => (
                  <div key={u.email} className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0">
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] text-white/20 w-6">{i + 1}.</span>
                      <div>
                        <p className="text-[13px] text-white/70">{u.email}</p>
                        <p className="text-[11px] text-white/20 capitalize">{u.plan}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full ${STATUS_COLORS[u.status] || 'text-white/30 bg-white/5'}`}>
                        {u.status}
                      </span>
                      <span className="text-[11px] text-white/25">
                        {u.last_active ? timeAgo(u.last_active) : 'never'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'traffic' && (
          <div className="space-y-6">
            {!trafficData ? (
              <div className="flex items-center justify-center gap-2 py-16 text-white/40">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-[13px]">Loading traffic…</span>
              </div>
            ) : (
            <>
            {!trafficData.enabled && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-[13px] text-amber-200/90">
                {trafficData.message || 'Run migration 026_page_analytics.sql on the database, then redeploy the API.'}
              </div>
            )}

            <div className="grid grid-cols-5 gap-4">
              <StatCard icon={Globe2} label="Views (24h)" value={String(trafficData.viewsToday)} sub="page views" color="cyan" />
              <StatCard icon={Activity} label="Views (7d)" value={String(trafficData.views7d)} sub="last week" color="blue" />
              <StatCard icon={BarChart3} label="Views (30d)" value={String(trafficData.views30d)} sub="last month" color="purple" />
              <StatCard icon={Users} label="Unique (7d)" value={String(trafficData.uniqueVisitors7d)} sub="anonymous visitors" color="green" />
              <StatCard icon={Users} label="Unique (30d)" value={String(trafficData.uniqueVisitors30d)} sub="anonymous visitors" color="amber" />
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
              <h3 className="text-[14px] font-semibold text-white mb-1">Conversion funnel (30 days)</h3>
              <p className="text-[11px] text-white/30 mb-4">Approximate unique visitors per step. App &amp; signups are not linked to site visitors.</p>
              {(() => {
                const f = trafficData.funnel;
                const steps: Array<{ label: string; count: number }> = [
                  { label: 'Homepage', count: f.homeLanding },
                  { label: '/desktop page', count: f.desktopPage },
                  { label: 'Download click', count: f.downloadClick },
                  { label: 'App opened (heartbeat)', count: f.appOpened },
                  { label: 'Desktop signup', count: f.desktopSignups },
                ];
                const max = Math.max(...steps.map(s => s.count), 1);
                return (
                  <div className="space-y-3">
                    {steps.map((s, i) => {
                      const prev = i > 0 ? steps[i - 1].count : s.count;
                      const pctOfPrev = prev > 0 ? Math.round((s.count / prev) * 100) : 0;
                      const w = Math.round((s.count / max) * 100);
                      return (
                        <div key={s.label}>
                          <div className="flex justify-between text-[12px] mb-1">
                            <span className="text-white/70">{s.label}</span>
                            <span className="text-white/40 tabular-nums">
                              {s.count.toLocaleString()}
                              {i > 0 && prev > 0 ? ` (${pctOfPrev}% of prev)` : ''}
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                            <div className="h-full rounded-full bg-cyan-500/60" style={{ width: `${Math.max(w, s.count > 0 ? 4 : 0)}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-white/[0.06] overflow-hidden">
                <div className="border-b border-white/[0.06] bg-white/[0.02] px-4 py-3">
                  <h3 className="text-[13px] font-semibold text-white">Top pages (30d)</h3>
                </div>
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-white/[0.06] text-left text-white/30">
                      <th className="px-4 py-2">Path</th>
                      <th className="px-4 py-2 text-right">Views</th>
                      <th className="px-4 py-2 text-right">Uniques</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trafficData.topPages.length === 0 ? (
                      <tr><td colSpan={3} className="px-4 py-8 text-center text-white/25">No data yet</td></tr>
                    ) : trafficData.topPages.map((p) => (
                      <tr key={p.path} className="border-b border-white/[0.04]">
                        <td className="px-4 py-2 text-white/60 font-mono text-[11px] truncate max-w-[200px]">{p.path}</td>
                        <td className="px-4 py-2 text-right text-white/50 tabular-nums">{p.views}</td>
                        <td className="px-4 py-2 text-right text-white/50 tabular-nums">{p.uniques}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="rounded-xl border border-white/[0.06] overflow-hidden">
                <div className="border-b border-white/[0.06] bg-white/[0.02] px-4 py-3">
                  <h3 className="text-[13px] font-semibold text-white">Top referrers (30d)</h3>
                </div>
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-white/[0.06] text-left text-white/30">
                      <th className="px-4 py-2">Source</th>
                      <th className="px-4 py-2 text-right">Views</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trafficData.topReferrers.length === 0 ? (
                      <tr><td colSpan={2} className="px-4 py-8 text-center text-white/25">No data yet</td></tr>
                    ) : trafficData.topReferrers.map((r) => (
                      <tr key={r.referrer} className="border-b border-white/[0.04]">
                        <td className="px-4 py-2 text-white/60 truncate max-w-[280px]" title={r.referrer}>{r.referrer}</td>
                        <td className="px-4 py-2 text-right text-white/50 tabular-nums">{r.views}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                <h3 className="text-[12px] font-semibold text-white/80 mb-3">Device</h3>
                <ul className="space-y-2 text-[12px]">
                  {trafficData.devices.length === 0 ? <li className="text-white/25">No data</li> : trafficData.devices.map((d) => (
                    <li key={d.device} className="flex justify-between text-white/50">
                      <span className="capitalize">{d.device}</span>
                      <span className="tabular-nums">{d.views}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                <h3 className="text-[12px] font-semibold text-white/80 mb-3">Browser</h3>
                <ul className="space-y-2 text-[12px]">
                  {trafficData.browsers.length === 0 ? <li className="text-white/25">No data</li> : trafficData.browsers.map((b) => (
                    <li key={b.browser} className="flex justify-between text-white/50">
                      <span className="capitalize">{b.browser}</span>
                      <span className="tabular-nums">{b.views}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                <h3 className="text-[12px] font-semibold text-white/80 mb-3">Country</h3>
                <ul className="space-y-2 text-[12px]">
                  {trafficData.countries.length === 0 ? <li className="text-white/25">No data (enable CF-IPCountry)</li> : trafficData.countries.map((c) => (
                    <li key={c.country} className="flex justify-between text-white/50">
                      <span>{c.country}</span>
                      <span className="tabular-nums">{c.views}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            </>
            )}
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
                  const f2 = overview?.financials;
                  const serverCost = f2?.serverCostGrossPerMonth || 0;
                  return (
                    <div key={s.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <p className="text-[15px] font-medium text-white">{s.hostname || s.ip}</p>
                          <p className="text-[12px] text-white/25 mt-0.5">{s.ip}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-white/30">{formatUsd(serverCost)}/mo</span>
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
                      {Number(s.user_count) === 0 && (
                        <button onClick={() => handleRemoveServer(s.id)}
                          className="mt-3 w-full text-[12px] text-red-400/60 border border-red-400/20 rounded-lg py-2 hover:bg-red-400/5 hover:text-red-400 transition-all">
                          Remove Server
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === 'feedback' && (
          <div className="space-y-4">
            {feedbackList.length === 0 ? (
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-12 text-center">
                <MessageSquare className="h-10 w-10 text-white/10 mx-auto mb-3" />
                <p className="text-[14px] text-white/30">No feedback yet</p>
                <p className="text-[12px] text-white/15 mt-1">Share <span className="text-white/30">valnaa.com/feedback</span> with users</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-[13px] text-white/40">{feedbackList.length} responses</span>
                  <span className="text-[13px] text-white/40">·</span>
                  <span className="text-[13px] text-white/40">
                    Avg rating: {(feedbackList.reduce((s, f) => s + f.rating, 0) / feedbackList.length).toFixed(1)} / 5
                  </span>
                </div>
                {feedbackList.map((f) => (
                  <div key={f.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-[14px] text-white font-medium">{f.email}</span>
                        <div className="flex gap-0.5">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <Star key={n} className={`h-3.5 w-3.5 ${n <= f.rating ? 'fill-amber-400 text-amber-400' : 'text-white/15'}`} />
                          ))}
                        </div>
                      </div>
                      <span className="text-[11px] text-white/25">{timeAgo(f.created_at)}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-[12px]">
                      {f.ease_of_setup && (
                        <div><span className="text-white/30">Setup:</span> <span className="text-white/60">{f.ease_of_setup}</span></div>
                      )}
                      {f.most_useful && (
                        <div><span className="text-white/30">Most useful:</span> <span className="text-white/60">{f.most_useful}</span></div>
                      )}
                      {f.recommend && (
                        <div><span className="text-white/30">Recommend:</span> <span className="text-white/60">{f.recommend}</span></div>
                      )}
                    </div>

                    {f.biggest_pain && (
                      <div className="text-[12px]">
                        <span className="text-white/30">Biggest pain:</span>
                        <p className="text-white/60 mt-1">{f.biggest_pain}</p>
                      </div>
                    )}
                    {f.improvements && (
                      <div className="text-[12px]">
                        <span className="text-white/30">Improvements:</span>
                        <p className="text-white/60 mt-1">{f.improvements}</p>
                      </div>
                    )}
                    {f.comments && (
                      <div className="text-[12px]">
                        <span className="text-white/30">Comments:</span>
                        <p className="text-white/60 mt-1">{f.comments}</p>
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setSelectedUser(null)}>
          <div className="rounded-2xl border border-white/[0.08] bg-[#111] w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
              <h3 className="text-[16px] font-semibold text-white">
                {selectedUser.email}
                {selectedUser.is_admin && <Shield className="inline h-3.5 w-3.5 text-red-400/60 ml-1.5" />}
              </h3>
              <button onClick={() => setSelectedUser(null)}
                className="p-2 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-all">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {userDetailLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-white/30" />
                </div>
              ) : userDetail ? (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[11px] text-white/30 uppercase tracking-wider mb-1">Plan</p>
                      <p className="text-[13px] text-white capitalize">{userDetail.user.plan}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-white/30 uppercase tracking-wider mb-1">Status</p>
                      <span className={`text-[12px] px-2 py-0.5 rounded-full ${STATUS_COLORS[userDetail.user.status] || 'text-white/30 bg-white/5'}`}>
                        {userDetail.user.status}
                      </span>
                    </div>
                    <div>
                      <p className="text-[11px] text-white/30 uppercase tracking-wider mb-1">Subdomain</p>
                      <p className="text-[13px] text-white/70">{userDetail.user.subdomain || '—'}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-white/30 uppercase tracking-wider mb-1">Server</p>
                      <p className="text-[13px] text-white/70">{userDetail.user.server_hostname || userDetail.user.server_ip || '—'}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-white/30 uppercase tracking-wider mb-1">Joined</p>
                      <p className="text-[13px] text-white/70">{new Date(userDetail.user.created_at).toLocaleDateString()}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-white/30 uppercase tracking-wider mb-1">Last active</p>
                      <p className="text-[13px] text-white/70">{userDetail.user.last_active ? timeAgo(userDetail.user.last_active) : '—'}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-white/30 uppercase tracking-wider mb-1">Desktop</p>
                      <div className="flex flex-wrap gap-1.5">
                        {userDetail.user.desktop_subscription_id ? (
                          <span className="text-[12px] px-2 py-0.5 rounded-full text-purple-400 bg-purple-500/10">Paid</span>
                        ) : userDetail.user.desktop_trial_active ? (
                          <span className="text-[12px] px-2 py-0.5 rounded-full text-amber-400 bg-amber-500/10">
                            Trial (ends {new Date(userDetail.user.desktop_trial_ends_at!).toLocaleDateString()})
                          </span>
                        ) : userDetail.user.desktop_trial_ends_at ? (
                          <span className="text-[12px] px-2 py-0.5 rounded-full text-white/20 bg-white/5">Trial expired</span>
                        ) : (
                          <p className="text-[13px] text-white/30">—</p>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-[11px] text-white/30 uppercase tracking-wider mb-1">Subscriptions</p>
                      <div className="flex flex-wrap gap-1.5">
                        {userDetail.user.has_vps && (
                          <span className="text-[12px] px-2 py-0.5 rounded-full text-blue-400 bg-blue-500/10">
                            VPS {userDetail.user.plan}
                          </span>
                        )}
                        {userDetail.user.desktop_subscription_id && (
                          <span className="text-[12px] px-2 py-0.5 rounded-full text-purple-400 bg-purple-500/10">Desktop €5/mo</span>
                        )}
                        {!userDetail.user.has_vps && !userDetail.user.desktop_subscription_id && (
                          <p className="text-[13px] text-white/30">None</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {userDetail.nexosUsage && (
                    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                      <h4 className="text-[13px] font-medium text-white mb-3">API Spend (OpenRouter)</h4>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <p className="text-[11px] text-white/30">Used</p>
                          <p className="text-[15px] font-semibold text-amber-400 tabular-nums">${userDetail.nexosUsage.usedUsd.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-[11px] text-white/30">Remaining</p>
                          <p className="text-[15px] font-semibold text-green-400 tabular-nums">${userDetail.nexosUsage.remainingUsd.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-[11px] text-white/30">Limit</p>
                          <p className="text-[15px] font-semibold text-white tabular-nums">${userDetail.nexosUsage.limitUsd.toFixed(2)}</p>
                        </div>
                      </div>
                      {userDetail.nexosUsage.displayAmountBought > 0 && (
                        <p className="text-[11px] text-white/30 mt-2">Credit top-ups: ${userDetail.nexosUsage.displayAmountBought.toFixed(2)}</p>
                      )}
                    </div>
                  )}

                  {userDetail.creditPurchases && userDetail.creditPurchases.length > 0 && (
                    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                      <h4 className="text-[13px] font-medium text-white mb-3">Credit purchases</h4>
                      <div className="space-y-2 max-h-40 overflow-y-auto">
                        {userDetail.creditPurchases.map(cp => (
                          <div key={cp.id} className="flex justify-between items-center text-[12px] py-1.5 border-b border-white/[0.04] last:border-0">
                            <span className="text-white/50">{new Date(cp.created_at).toLocaleDateString()}</span>
                            <span className="text-green-400 tabular-nums">+${cp.credits_usd.toFixed(2)} API</span>
                            <span className="text-white/30">${(cp.amount_eur_cents / 100).toFixed(2)} paid</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end">
                    <button onClick={e => openEdit(e, selectedUser)}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 text-[13px] text-white hover:bg-white/15 transition-all">
                      <Edit3 className="h-3.5 w-3.5" />
                      Edit user
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

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
                  <option value="starter">Starter — $15/mo</option>
                  <option value="pro">Pro — $25/mo</option>
                  <option value="business">Business — $50/mo</option>
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
    cyan: 'bg-cyan-500/10 text-cyan-400',
    orange: 'bg-orange-500/10 text-orange-400',
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
