'use client';

import { useCallback, useEffect, useState } from 'react';
import api from '@/lib/api';
import { Card, CardDescription, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatCents, formatDate } from '@/lib/utils';
import { CreditCard, ExternalLink, FileText, Loader2 } from 'lucide-react';

type BillingOverview = {
  plan: string;
  status: string;
  stripeCustomerId?: string | null;
  isInTrial?: boolean;
  trialEndsAt?: string | null;
};

type Invoice = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  date: string;
  pdf?: string | null;
};

export default function BillingPage() {
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [overview, setOverview] = useState<BillingOverview | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const o = await api.get<BillingOverview>('/billing');
      const inv = await api.get<{ invoices: Invoice[] }>('/billing/invoices');
      setOverview(o);
      setInvoices(inv.invoices || []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load billing info');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openPortal = async () => {
    setPortalLoading(true);
    setError('');
    try {
      const res = await api.post<{ url: string }>('/billing/portal');
      if (res?.url) window.location.href = res.url;
    } catch (e: any) {
      setError(e?.message || 'Unable to open billing portal');
    } finally {
      setPortalLoading(false);
    }
  };

  const cancelSubscription = async () => {
    setCancelLoading(true);
    setError('');
    setSuccessMsg('');
    try {
      const res = await api.post<{ cancelled: boolean; endsAt: string }>('/billing/cancel');
      if (res?.cancelled) {
        setSuccessMsg(`Subscription cancelled. You'll have access until ${new Date(res.endsAt).toLocaleDateString()}.`);
        setCancelConfirm(false);
        load();
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to cancel subscription');
    } finally {
      setCancelLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-white/30" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="animate-fade-up">
        <h1 className="text-[22px] font-semibold text-[#e8e8e8] tracking-tight">Billing</h1>
        <p className="mt-1 text-[14px] text-white/40">Manage your subscription and invoices</p>
      </div>

      {error && (
        <div className="rounded-lg bg-[#f87171]/[0.04] border border-[#f87171]/15 px-4 py-3 text-[13px] text-[#f87171]/80">
          {error}
        </div>
      )}

      {successMsg && (
        <div className="rounded-lg bg-[#4ade80]/[0.04] border border-[#4ade80]/15 px-4 py-3 text-[13px] text-[#4ade80]/80">
          {successMsg}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>Subscription</CardTitle>
              <CardDescription>Your current plan and status</CardDescription>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.04] border border-white/[0.06]">
              <CreditCard className="h-4 w-4 text-white/40" />
            </div>
          </div>

          <div className="mt-5 flex items-center gap-3 flex-wrap">
            {overview?.isInTrial && (
              <Badge className="bg-[#fbbf24]/[0.08] text-[#fbbf24]/80 border-[#fbbf24]/15">Free trial</Badge>
            )}
            <Badge>{overview?.plan || 'unknown'}</Badge>
            <Badge variant={overview?.status === 'active' ? 'green' : overview?.status === 'grace_period' ? 'amber' : 'red'}>
              {overview?.status || 'unknown'}
            </Badge>
          </div>

          {overview?.isInTrial && overview?.trialEndsAt && (
            <p className="mt-3 text-[13px] text-white/40">
              Trial ends {new Date(overview.trialEndsAt).toLocaleDateString()}
            </p>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            {overview?.stripeCustomerId ? (
              <Button variant="glass" onClick={openPortal} loading={portalLoading}>
                <ExternalLink className="h-4 w-4" />
                Manage in Stripe
              </Button>
            ) : (
              <Button variant="glass" onClick={() => { window.location.href = '/pricing'; }}>
                <CreditCard className="h-4 w-4" />
                Upgrade to paid plan
              </Button>
            )}
            <Button variant="glass" onClick={load}>
              Refresh
            </Button>
          </div>

          {overview?.status === 'active' && (
            <div className="mt-4 border-t border-white/[0.06] pt-4">
              {!cancelConfirm ? (
                <button
                  onClick={() => setCancelConfirm(true)}
                  className="text-[13px] text-white/20 hover:text-[#f87171]/70 transition-colors"
                >
                  Cancel subscription
                </button>
              ) : (
                <div className="rounded-lg border border-[#f87171]/15 bg-[#f87171]/[0.04] p-4">
                  <p className="text-[13px] text-white/50">
                    Are you sure? Your agent will stay active until the end of your billing period, then be deactivated.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Button
                      variant="glass"
                      onClick={cancelSubscription}
                      loading={cancelLoading}
                      className="!border-[#f87171]/20 !text-[#f87171]/70 hover:!bg-[#f87171]/[0.06]"
                    >
                      Yes, cancel
                    </Button>
                    <Button variant="glass" onClick={() => setCancelConfirm(false)}>
                      Keep subscription
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>

        <Card>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>Invoices</CardTitle>
              <CardDescription>Download recent invoices</CardDescription>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.04] border border-white/[0.06]">
              <FileText className="h-4 w-4 text-white/40" />
            </div>
          </div>

          <div className="mt-5 space-y-2">
            {invoices.length === 0 ? (
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-4 text-[13px] text-white/30">
                No invoices yet.
              </div>
            ) : (
              invoices.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-[13px] text-white/60 truncate">{inv.id}</p>
                    <p className="text-[12px] text-white/25 mt-0.5">
                      {formatDate(inv.date)} · {inv.status}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] text-white/50 tabular-nums">
                      {formatCents(inv.amount)}
                    </span>
                    {inv.pdf && (
                      <a
                        href={inv.pdf}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-[12px] text-white/40 hover:bg-white/[0.04] hover:text-white/60 transition-all"
                      >
                        PDF
                      </a>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
