'use client';

import { useEffect, useState } from 'react';
import { Card, CardTitle, CardDescription, GlassPanel } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Toggle } from '@/components/ui/Toggle';
import { Modal } from '@/components/ui/Modal';
import api from '@/lib/api';
import { formatTokens } from '@/lib/utils';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  Coins,
  Sparkles,
  Loader2,
  Check,
  AlertTriangle,
  TrendingDown,
  Receipt,
  CreditCard,
  ExternalLink,
  FileText,
  Clock,
  ArrowUpRight,
} from 'lucide-react';

interface TokenBalance {
  balance: number;
  dailyRate: number;
  totalPurchased: number;
  totalUsed: number;
}

interface DailyUsage {
  date: string;
  tokens: number;
}

interface ModelUsage {
  model: string;
  friendlyName: string;
  tokens: number;
  percentage: number;
}

interface TokenPackage {
  id: string;
  price: number;
  tokens: number;
  bestValue?: boolean;
}

interface Transaction {
  id: string;
  amount: number;
  type: string;
  description: string;
  created_at: string;
}

interface BillingInfo {
  plan: string;
  status: string;
  tokenSpendThisMonth: number;
}

interface Invoice {
  id: string;
  amount_due: number;
  status: string;
  created: number;
  hosted_invoice_url?: string;
}

const MODEL_NAMES: Record<string, string> = {
  'gpt-4o-mini': 'Fast model',
  'gpt-4o': 'Smart model',
  'claude-3.5': 'Powerful',
  'claude-3-opus': 'Most Powerful',
};

const CHART_TOOLTIP_STYLE = {
  backgroundColor: 'rgba(0,0,0,0.9)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '12px',
  color: '#fff',
  fontSize: '13px',
  padding: '8px 12px',
};

type TabId = 'overview' | 'usage' | 'billing';

export default function TokensPage() {
  const [balance, setBalance] = useState<TokenBalance | null>(null);
  const [dailyUsage, setDailyUsage] = useState<DailyUsage[]>([]);
  const [modelUsage, setModelUsage] = useState<ModelUsage[]>([]);
  const [packages, setPackages] = useState<TokenPackage[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [billingInfo, setBillingInfo] = useState<BillingInfo | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchaseModal, setPurchaseModal] = useState<TokenPackage | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [autoTopUp, setAutoTopUp] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  useEffect(() => {
    fetchTokenData();
  }, []);

  async function fetchTokenData() {
    try {
      const [balRes, dailyRes, modelsRes, packsRes, txRes, billRes, invRes] = await Promise.allSettled([
        api.get<any>('/tokens/balance'),
        api.get<any>('/tokens/usage/daily'),
        api.get<any>('/tokens/usage/models'),
        api.get<any>('/tokens/packages'),
        api.get<any>('/tokens/transactions?limit=20'),
        api.get<any>('/billing'),
        api.get<any>('/billing/invoices'),
      ]);

      if (balRes.status === 'fulfilled') {
        setBalance({
          balance: balRes.value.balance ?? 0,
          dailyRate: balRes.value.dailyRate ?? balRes.value.daysRemaining ?? 0,
          totalPurchased: balRes.value.totalPurchased ?? 0,
          totalUsed: balRes.value.totalUsed ?? 0,
        });
        setAutoTopUp(balRes.value.autoTopup ?? false);
      } else {
        setBalance({ balance: 0, dailyRate: 0, totalPurchased: 0, totalUsed: 0 });
      }

      if (dailyRes.status === 'fulfilled') setDailyUsage(dailyRes.value.usage || dailyRes.value || []);
      if (modelsRes.status === 'fulfilled') setModelUsage(modelsRes.value.models || modelsRes.value || []);

      if (packsRes.status === 'fulfilled') {
        const raw = (packsRes.value.packages || packsRes.value || []).map((p: any) => ({
          id: p.id,
          price: p.price_cents ?? p.priceCents ?? p.price ?? 0,
          tokens: p.tokens ?? 0,
          bestValue: p.bestValue ?? p.best_value,
        }));
        const seen = new Set<number>();
        const deduped = raw.filter((p: TokenPackage) => {
          if (seen.has(p.tokens)) return false;
          seen.add(p.tokens);
          return true;
        });
        setPackages(deduped);
      }

      if (txRes.status === 'fulfilled') setTransactions(txRes.value.transactions || []);
      if (billRes.status === 'fulfilled') setBillingInfo(billRes.value);
      if (invRes.status === 'fulfilled') setInvoices(invRes.value.invoices || []);
    } catch {
      setBalance({ balance: 0, dailyRate: 0, totalPurchased: 0, totalUsed: 0 });
    } finally {
      setLoading(false);
    }
  }

  async function handlePurchase(pkg: TokenPackage) {
    setPurchasing(true);
    try {
      const res = await api.post<any>('/tokens/purchase', { packageId: pkg.id });
      if (res.checkoutUrl) {
        window.location.href = res.checkoutUrl;
        return;
      }
      if (balance) setBalance({ ...balance, balance: balance.balance + pkg.tokens });
    } catch {
      if (balance) setBalance({ ...balance, balance: balance.balance + pkg.tokens });
    } finally {
      setPurchasing(false);
      setPurchaseModal(null);
    }
  }

  async function handleManageSubscription() {
    try {
      const res = await api.post<{ url: string }>('/billing/portal');
      if (res.url) window.location.href = res.url;
    } catch {}
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
      </div>
    );
  }

  const daysLeft = balance && balance.dailyRate > 0
    ? Math.floor(balance.balance / balance.dailyRate)
    : 0;
  const balancePct = balance ? Math.min((balance.balance / 5000000) * 100, 100) : 0;
  const progressColor = daysLeft < 1 ? 'progress-fill-red' : daysLeft < 3 ? 'progress-fill-amber' : 'progress-fill-green';

  const txTypeLabel: Record<string, string> = {
    subscription_grant: 'Plan bonus',
    purchase: 'Top-up',
    usage: 'Usage',
    refund: 'Refund',
    adjustment: 'Adjustment',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-bold text-white tracking-tight">Tokens & Billing</h1>
          <p className="mt-1 text-[15px] text-white/50">
            Manage your token balance, usage, and billing
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-white/[0.06] pb-0">
        {([
          { id: 'overview' as TabId, label: 'Overview' },
          { id: 'usage' as TabId, label: 'Usage' },
          { id: 'billing' as TabId, label: 'Billing' },
        ]).map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-[13px] font-medium border-b-2 -mb-[1px] transition-all ${
              activeTab === tab.id
                ? 'border-white text-white'
                : 'border-transparent text-white/30 hover:text-white/50'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Warning banners */}
      {daysLeft < 1 && (
        <div className="glass p-4 border-red-500/20 bg-red-500/5 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-red-400 shrink-0" />
          <div>
            <p className="text-[14px] font-medium text-red-400">Running on empty</p>
            <p className="text-[13px] text-red-400/60">Your agent may stop working soon. Top up now.</p>
          </div>
        </div>
      )}

      {/* ── OVERVIEW TAB ── */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Balance Card */}
          <Card glow>
            <div className="flex items-start justify-between mb-6">
              <div>
                <p className="text-[14px] text-white/40 mb-2">Remaining balance</p>
                <p className="text-[42px] font-bold text-white tracking-tight leading-none">
                  {balance ? balance.balance.toLocaleString() : '—'}
                </p>
                <p className="text-[14px] text-white/40 mt-1">tokens</p>
              </div>
              <div className="rounded-2xl bg-white/[0.06] p-4">
                <Coins className="h-7 w-7 text-white/40" />
              </div>
            </div>

            <div className="space-y-3">
              <div className="progress-bar h-3">
                <div className={`h-full ${progressColor}`} style={{ width: `${balancePct}%` }} />
              </div>
              <p className="text-[14px] text-white/40">
                {balance && balance.dailyRate > 0
                  ? `At ~${formatTokens(balance.dailyRate)}/day, this lasts about ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`
                  : 'No usage data yet'}
              </p>
            </div>

            <div className="mt-5">
              <Button size="lg" onClick={() => {
                const el = document.getElementById('packages');
                el?.scrollIntoView({ behavior: 'smooth' });
              }}>
                <Coins className="h-4 w-4" />
                Buy More Tokens
              </Button>
            </div>
          </Card>

          {/* Stats Row */}
          <div className="grid grid-cols-3 gap-4">
            <Card className="!p-4">
              <p className="text-[12px] text-white/30 mb-1">Total purchased</p>
              <p className="text-[22px] font-bold text-white">{formatTokens(balance?.totalPurchased ?? 0)}</p>
            </Card>
            <Card className="!p-4">
              <p className="text-[12px] text-white/30 mb-1">Total used</p>
              <p className="text-[22px] font-bold text-white">{formatTokens(balance?.totalUsed ?? 0)}</p>
            </Card>
            <Card className="!p-4">
              <p className="text-[12px] text-white/30 mb-1">Daily rate</p>
              <p className="text-[22px] font-bold text-white">{formatTokens(balance?.dailyRate ?? 0)}/d</p>
            </Card>
          </div>

          {/* Token Packages */}
          <div id="packages">
            <h2 className="text-[18px] font-semibold text-white mb-4">Token Packages</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {packages.map((pkg) => (
                <Card
                  key={pkg.id}
                  className={`relative text-center cursor-pointer transition-all hover:scale-[1.02] ${
                    pkg.bestValue ? 'ring-1 ring-white/20' : ''
                  }`}
                  glow={pkg.bestValue}
                >
                  {pkg.bestValue && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge variant="accent" dot={false}>Best Value</Badge>
                    </div>
                  )}
                  <div className="pt-2">
                    <p className="text-[32px] font-bold text-white">${(pkg.price / 100).toFixed(0)}</p>
                    <p className="text-[14px] text-white/50 mt-1">{formatTokens(pkg.tokens)} tokens</p>
                    <p className="text-[12px] text-white/25 mt-0.5">
                      ~{Math.round(pkg.tokens / 70000)} days of usage
                    </p>
                    <Button
                      className="mt-4 w-full"
                      variant={pkg.bestValue ? 'primary' : 'glass'}
                      onClick={() => setPurchaseModal(pkg)}
                    >
                      Buy
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </div>

          {/* Auto Top-Up */}
          <Card>
            <CardTitle>Auto Top-Up</CardTitle>
            <CardDescription>Automatically buy more tokens when you&apos;re running low.</CardDescription>
            <div className="mt-4">
              <Toggle
                enabled={autoTopUp}
                onChange={async (v) => {
                  setAutoTopUp(v);
                  try { await api.put('/tokens/auto-topup', { enabled: v }); } catch {}
                }}
                label="Enable Auto Top-Up"
                description="We'll add tokens when your balance drops below 1 day of usage."
              />
            </div>
          </Card>

          {/* Recent Transactions */}
          {transactions.length > 0 && (
            <Card>
              <CardTitle>Recent Transactions</CardTitle>
              <div className="mt-4 space-y-1">
                {transactions.slice(0, 10).map(tx => (
                  <div key={tx.id} className="flex items-center justify-between py-2.5 border-b border-white/[0.04] last:border-0">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                        tx.amount > 0 ? 'bg-green-500/10' : 'bg-red-500/10'
                      }`}>
                        {tx.amount > 0
                          ? <ArrowUpRight className="h-3.5 w-3.5 text-green-400" />
                          : <TrendingDown className="h-3.5 w-3.5 text-red-400" />
                        }
                      </div>
                      <div>
                        <p className="text-[13px] text-white/70">{tx.description || txTypeLabel[tx.type] || tx.type}</p>
                        <p className="text-[11px] text-white/20">
                          {new Date(tx.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                    <span className={`text-[14px] font-medium tabular-nums ${tx.amount > 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {tx.amount > 0 ? '+' : ''}{formatTokens(tx.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ── USAGE TAB ── */}
      {activeTab === 'usage' && (
        <div className="space-y-6">
          <Card>
            <CardTitle>Daily usage</CardTitle>
            <CardDescription>How many tokens your agent used each day this week</CardDescription>
            <div className="h-64 mt-5">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyUsage} barCategoryGap="25%">
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 12 }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 12 }}
                    tickFormatter={(v) => formatTokens(v)}
                  />
                  <Tooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    formatter={(value: any) => [formatTokens(value ?? 0), 'Tokens']}
                    cursor={{ fill: 'rgba(255, 255, 255, 0.04)' }}
                  />
                  <Bar dataKey="tokens" fill="rgba(255,255,255,0.3)" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card>
            <CardTitle>Usage by model</CardTitle>
            <CardDescription>Which AI models your agent has been using</CardDescription>
            <div className="mt-5 space-y-4">
              {modelUsage.length === 0 && (
                <p className="text-[13px] text-white/30 text-center py-8">No usage data yet</p>
              )}
              {modelUsage.map((model) => (
                <div key={model.model} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[14px] text-white/70">
                      {MODEL_NAMES[model.model] || model.friendlyName || model.model}
                    </span>
                    <span className="text-[13px] text-white/40">{model.percentage}%</span>
                  </div>
                  <div className="progress-bar h-2">
                    <div
                      className="h-full progress-fill"
                      style={{ width: `${model.percentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {transactions.length > 0 && (
            <Card>
              <CardTitle>Transaction History</CardTitle>
              <div className="mt-4 space-y-1">
                {transactions.map(tx => (
                  <div key={tx.id} className="flex items-center justify-between py-2.5 border-b border-white/[0.04] last:border-0">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${
                        tx.amount > 0 ? 'bg-green-500/10' : 'bg-red-500/10'
                      }`}>
                        {tx.amount > 0
                          ? <ArrowUpRight className="h-3 w-3 text-green-400" />
                          : <TrendingDown className="h-3 w-3 text-red-400" />
                        }
                      </div>
                      <div>
                        <p className="text-[13px] text-white/70">{tx.description || txTypeLabel[tx.type] || tx.type}</p>
                        <p className="text-[11px] text-white/20">
                          {new Date(tx.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                    <span className={`text-[13px] font-medium tabular-nums ${tx.amount > 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {tx.amount > 0 ? '+' : ''}{formatTokens(tx.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ── BILLING TAB ── */}
      {activeTab === 'billing' && (
        <div className="space-y-6">
          <Card>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle>Subscription</CardTitle>
                <CardDescription>Your current plan and billing status</CardDescription>
              </div>
              <Button variant="glass" size="sm" onClick={handleManageSubscription}>
                <ExternalLink className="h-3.5 w-3.5" />
                Manage
              </Button>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-4">
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                <p className="text-[12px] text-white/30 mb-1">Plan</p>
                <p className="text-[18px] font-bold text-white capitalize">{billingInfo?.plan || 'Pro'}</p>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                <p className="text-[12px] text-white/30 mb-1">Status</p>
                <p className="text-[18px] font-bold text-white capitalize">{billingInfo?.status || 'Active'}</p>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                <p className="text-[12px] text-white/30 mb-1">Token spend (this month)</p>
                <p className="text-[18px] font-bold text-white">
                  ${((billingInfo?.tokenSpendThisMonth ?? 0) / 100).toFixed(2)}
                </p>
              </div>
            </div>
          </Card>

          {invoices.length > 0 && (
            <Card>
              <CardTitle>Invoices</CardTitle>
              <CardDescription>Your past invoices</CardDescription>
              <div className="mt-4 space-y-1">
                {invoices.map(inv => (
                  <div key={inv.id} className="flex items-center justify-between py-3 border-b border-white/[0.04] last:border-0">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5">
                        <FileText className="h-3.5 w-3.5 text-white/30" />
                      </div>
                      <div>
                        <p className="text-[13px] text-white/70">
                          ${(inv.amount_due / 100).toFixed(2)}
                        </p>
                        <p className="text-[11px] text-white/20">
                          {new Date(inv.created * 1000).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={inv.status === 'paid' ? 'green' : 'amber'}>{inv.status}</Badge>
                      {inv.hosted_invoice_url && (
                        <a href={inv.hosted_invoice_url} target="_blank" rel="noreferrer"
                          className="text-[11px] text-white/30 hover:text-white/50 transition-colors">
                          View
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {invoices.length === 0 && (
            <Card>
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Receipt className="h-10 w-10 text-white/10 mb-3" />
                <p className="text-[14px] text-white/30">No invoices yet</p>
                <p className="text-[12px] text-white/15 mt-1">Invoices will appear here after your first payment</p>
              </div>
            </Card>
          )}
        </div>
      )}

      <Modal
        open={!!purchaseModal}
        onClose={() => setPurchaseModal(null)}
        title="Confirm Purchase"
      >
        {purchaseModal && (
          <div className="space-y-5">
            <GlassPanel>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[15px] font-medium text-white">{formatTokens(purchaseModal.tokens)} tokens</p>
                  <p className="text-[13px] text-white/40">~{Math.round(purchaseModal.tokens / 70000)} days of usage</p>
                </div>
                <p className="text-[22px] font-bold text-white">${(purchaseModal.price / 100).toFixed(0)}</p>
              </div>
            </GlassPanel>
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setPurchaseModal(null)}>Cancel</Button>
              <Button onClick={() => handlePurchase(purchaseModal)} loading={purchasing}>
                <Check className="h-4 w-4" />
                Confirm
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
