'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardTitle, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import api from '@/lib/api';
import {
  Coins,
  Loader2,
  ExternalLink,
  FileText,
  CreditCard,
  Zap,
  Receipt,
  Plus,
  CheckCircle2,
} from 'lucide-react';

interface NexosUsage {
  usedUsd: number;
  remainingUsd: number;
  limitUsd: number;
  displayAmountBought?: number;
  lastUpdated: string;
}

interface BillingInfo {
  plan: string;
  status: string;
}

interface Invoice {
  id: string;
  amount_due: number;
  status: string;
  created: number;
  hosted_invoice_url?: string;
}

type TabId = 'overview' | 'billing';

const TOPUP_PACKS = [
  { id: '500k',  price: '€5',  displayAmount: 5,  desc: 'Adds $5 balance' },
  { id: '1200k', price: '€10', displayAmount: 10, desc: 'Adds $10 balance' },
  { id: '3500k', price: '€25', displayAmount: 25, desc: 'Adds $25 balance' },
  { id: '8m',    price: '€50', displayAmount: 50, desc: 'Adds $50 balance' },
];

export default function TokensPage() {
  const searchParams = useSearchParams();
  const [nexosUsage, setNexosUsage] = useState<NexosUsage | null>(null);
  const [billingInfo, setBillingInfo] = useState<BillingInfo | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [buyingPack, setBuyingPack] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
    if (searchParams.get('credits') === 'success') {
      setSuccessMsg('Top-up successful! Your AI balance has been increased.');
      setTimeout(() => setSuccessMsg(null), 6000);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchData() {
    try {
      const [usageRes, billRes, invRes] = await Promise.allSettled([
        api.get<any>('/settings/nexos-usage'),
        api.get<any>('/billing'),
        api.get<any>('/billing/invoices'),
      ]);

      if (usageRes.status === 'fulfilled' && usageRes.value.usage) {
        setNexosUsage(usageRes.value.usage);
      }
      if (billRes.status === 'fulfilled') setBillingInfo(billRes.value);
      if (invRes.status === 'fulfilled') setInvoices(invRes.value.invoices || []);
    } catch {
      // Graceful fallback
    } finally {
      setLoading(false);
    }
  }

  async function handleManageSubscription() {
    try {
      const res = await api.post<{ url: string }>('/billing/portal');
      if (res.url) window.location.href = res.url;
    } catch {}
  }

  async function handleBuyCredits(pack: string) {
    setBuyingPack(pack);
    try {
      const res = await api.post<{ checkoutUrl: string }>('/billing/buy-credits', { pack });
      if (res.checkoutUrl) window.location.href = res.checkoutUrl;
    } catch {
      setBuyingPack(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-bold text-white tracking-tight">AI Balance & Billing</h1>
          <p className="mt-1 text-[15px] text-white/50">
            Your AI usage is powered by multi-model smart routing
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-white/[0.06] pb-0">
        {([
          { id: 'overview' as TabId, label: 'Overview' },
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

      {/* Success banner */}
      {successMsg && (
        <div className="flex items-center gap-3 rounded-xl border border-green-500/20 bg-green-500/5 px-4 py-3 animate-fade-up">
          <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
          <p className="text-[13px] text-green-400">{successMsg}</p>
        </div>
      )}

      {/* OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Balance Card */}
          <Card glow>
            <div className="flex items-start justify-between mb-6">
              <div>
                <p className="text-[14px] text-white/40 mb-2">AI Balance</p>
                <p className="text-[42px] font-bold text-white tracking-tight leading-none">
                  {nexosUsage ? `$${nexosUsage.remainingUsd.toFixed(2)}` : 'Unlimited*'}
                </p>
                <p className="text-[14px] text-white/40 mt-1">remaining this month</p>
              </div>
              <div className="rounded-2xl bg-white/[0.06] p-4">
                <Zap className="h-7 w-7 text-white/40" />
              </div>
            </div>

            {nexosUsage && (
              <p className="text-[14px] text-white/40">
                ${nexosUsage.usedUsd.toFixed(2)} used of ${nexosUsage.limitUsd.toFixed(2)} bought — consumption reduces proportionally
              </p>
            )}

            <div className="mt-5">
              <p className="text-[12px] text-white/20">Your plan includes a monthly AI budget. Purchased top-ups never expire.</p>
            </div>
          </Card>

          {/* Top Up */}
          <Card>
            <div className="flex items-center gap-2 mb-1">
              <Plus className="h-4 w-4 text-white/40" />
              <CardTitle>Need more balance?</CardTitle>
            </div>
            <CardDescription className="mb-5">
              Your subscription includes a monthly AI budget. Top up to increase your balance for the current billing period.
            </CardDescription>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {TOPUP_PACKS.map(pack => (
                <button
                  key={pack.id}
                  onClick={() => handleBuyCredits(pack.id)}
                  disabled={buyingPack !== null}
                  className="flex flex-col items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.02] p-5 hover:border-indigo-500/30 hover:bg-indigo-500/[0.04] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span className="text-[24px] font-bold text-white">{pack.price}</span>
                  <span className="text-[13px] text-white/50">{pack.desc}</span>
                  {buyingPack === pack.id ? (
                    <Loader2 className="h-4 w-4 animate-spin text-indigo-400 mt-1" />
                  ) : (
                    <span className="text-[11px] font-medium text-indigo-400 mt-1">Buy now</span>
                  )}
                </button>
              ))}
            </div>
            <p className="mt-4 text-[11px] text-white/20">
              One-time purchase. Credits never expire and carry over every month. Smart routing stretches your credits further.
            </p>
          </Card>

          {/* How it works */}
          <Card>
            <CardTitle>How AI billing works</CardTitle>
            <CardDescription>
              Your agent uses intelligent multi-model routing to optimise cost and performance
            </CardDescription>
            <div className="mt-5 space-y-4">
              <div className="flex items-start gap-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.06]">
                  <Zap className="h-4 w-4 text-white/40" />
                </div>
                <div>
                  <p className="text-[14px] font-medium text-white/80">Smart model routing</p>
                  <p className="text-[13px] text-white/40">Simple tasks automatically use cheaper models (Gemini Flash, GPT-4o Mini). Complex tasks route to powerful models (Claude Sonnet). This cuts costs without sacrificing quality.</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.06]">
                  <Coins className="h-4 w-4 text-white/40" />
                </div>
                <div>
                  <p className="text-[14px] font-medium text-white/80">Pay-per-use pricing</p>
                  <p className="text-[13px] text-white/40">Different models cost different amounts. Your plan includes a monthly AI budget in dollars. Lighter models stretch your balance further.</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.06]">
                  <CreditCard className="h-4 w-4 text-white/40" />
                </div>
                <div>
                  <p className="text-[14px] font-medium text-white/80">Multi-model access included</p>
                  <p className="text-[13px] text-white/40">Access Claude, GPT-4, Gemini, and more. Switch models anytime from the agent UI or let smart routing choose for you.</p>
                </div>
              </div>
            </div>
          </Card>

          {/* Model pricing reference */}
          <Card>
            <CardTitle>Model costs</CardTitle>
            <CardDescription>Cost per 1M tokens (approximate, in USD)</CardDescription>
            <div className="mt-4 space-y-1">
              {[
                { model: 'Gemini 2.0 Flash', input: '$0.10',  output: '$0.40',  tag: 'Cheapest' },
                { model: 'GPT-4o Mini',      input: '$0.15',  output: '$0.60',  tag: 'Budget' },
                { model: 'Claude 3.5 Haiku', input: '$0.80',  output: '$4.00',  tag: '' },
                { model: 'GPT-4o',           input: '$2.50',  output: '$10.00', tag: '' },
                { model: 'GPT-4.1',          input: '$2.00',  output: '$8.00',  tag: '' },
                { model: 'Claude Sonnet 4',  input: '$3.00',  output: '$15.00', tag: 'Default (Pro)' },
                { model: 'O3 Mini',          input: '$1.10',  output: '$4.40',  tag: 'Reasoning' },
              ].map(m => (
                <div key={m.model} className="flex items-center justify-between py-2.5 border-b border-white/[0.04] last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] text-white/70">{m.model}</span>
                    {m.tag && <Badge variant="amber" className="text-[10px]">{m.tag}</Badge>}
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-[12px] text-white/30">{m.input} in</span>
                    <span className="text-[12px] text-white/30">{m.output} out</span>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-white/20">Cost per 1M tokens in USD. Smart routing typically uses cheaper models, keeping average spend low.</p>
          </Card>
        </div>
      )}

      {/* BILLING TAB */}
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
            <div className="mt-5 grid grid-cols-2 gap-4">
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                <p className="text-[12px] text-white/30 mb-1">Plan</p>
                <p className="text-[18px] font-bold text-white capitalize">{billingInfo?.plan || 'Pro'}</p>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                <p className="text-[12px] text-white/30 mb-1">Status</p>
                <p className="text-[18px] font-bold text-white capitalize">{billingInfo?.status || 'Active'}</p>
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
    </div>
  );
}
