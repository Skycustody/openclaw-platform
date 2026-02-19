'use client';

import { useEffect, useState } from 'react';
import { Card, CardTitle, CardDescription, GlassPanel } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input, Textarea } from '@/components/ui/Input';
import api from '@/lib/api';
import { formatCents, formatDate } from '@/lib/utils';
import {
  CreditCard,
  FileText,
  Download,
  Loader2,
  Sparkles,
  Receipt,
  Calendar,
  Check,
  X,
  Crown,
  Zap,
  ArrowRight,
  Heart,
  AlertCircle,
  ChevronRight,
  Star,
} from 'lucide-react';

interface BillingData {
  plan: {
    name: string;
    price: number;
    interval: string;
    nextPayment: string;
  };
  summary: {
    subscription: number;
    tokenPurchases: number;
    total: number;
  };
  paymentMethod: {
    brand: string;
    last4: string;
    expiry: string;
  };
}

interface Invoice {
  id: string;
  date: string;
  amount: number;
  status: string;
  pdfUrl: string;
}

const plans = [
  {
    name: 'Starter',
    price: 1000,
    features: [
      '1 AI agent',
      'Basic personality',
      '100K tokens per month',
      'Email support',
      'Standard speed',
    ],
  },
  {
    name: 'Pro',
    price: 2000,
    popular: true,
    features: [
      '3 AI agents',
      'Full personality customization',
      '500K tokens per month',
      'Priority support',
      'Faster responses',
      'All messaging apps',
    ],
  },
  {
    name: 'Business',
    price: 5000,
    features: [
      'Unlimited agents',
      'Advanced personality & memory',
      '2M tokens per month',
      'Dedicated support',
      'Maximum agent power',
      'All messaging apps',
      'Custom skills & templates',
      'Team collaboration',
    ],
  },
];

const cancelReasons = [
  'Too expensive for what I need',
  'I don\'t use it enough',
  'Missing features I need',
  'Found a better alternative',
  'Just taking a break',
  'Other',
];

export default function BillingPage() {
  const [billing, setBilling] = useState<BillingData | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [upgradeModal, setUpgradeModal] = useState(false);
  const [cancelModal, setCancelModal] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get<BillingData>('/billing'),
      api.get<{ invoices: Invoice[] }>('/billing/invoices'),
    ])
      .then(([billingRes, invoicesRes]) => {
        setBilling(billingRes);
        setInvoices(invoicesRes.invoices || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function openPortal() {
    setPortalLoading(true);
    try {
      const res = await api.post<{ url: string }>('/billing/portal');
      window.open(res.url, '_blank');
    } catch {}
    setPortalLoading(false);
  }

  async function handleCancel() {
    setCancelling(true);
    try {
      await api.post('/billing/cancel', { reason: cancelReason });
      setBilling((b) => b ? { ...b, plan: { ...b.plan, name: 'Cancelled' } } : b);
      setCancelModal(false);
    } catch {}
    setCancelling(false);
  }

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-3xl">
      {/* Header */}
      <div className="animate-fade-up">
        <h1 className="text-[28px] font-bold text-white tracking-tight">Billing</h1>
        <p className="mt-2 text-[15px] text-white/50 leading-relaxed">
          Manage your plan, view your spending, and download invoices.
        </p>
      </div>

      {/* Current Plan */}
      <Card glow className="relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-500" />
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20">
              <Crown className="h-6 w-6 text-indigo-400" />
            </div>
            <div>
              <p className="text-[13px] text-white/40">Current plan</p>
              <p className="text-[22px] font-bold text-white">{billing?.plan.name}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[15px] font-semibold text-indigo-400">
                  {formatCents(billing?.plan.price || 0)}
                </span>
                <span className="text-[13px] text-white/30">/ {billing?.plan.interval || 'month'}</span>
                {billing?.plan.nextPayment && (
                  <>
                    <span className="text-white/10">•</span>
                    <span className="text-[13px] text-white/40">
                      Next payment {formatDate(billing.plan.nextPayment)}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="primary" onClick={() => setUpgradeModal(true)}>
              <Sparkles className="h-4 w-4" />
              Upgrade to Business
            </Button>
            <Button variant="glass" onClick={openPortal} loading={portalLoading}>
              Manage Billing
            </Button>
          </div>
        </div>
      </Card>

      {/* This Month Summary */}
      <div>
        <h2 className="text-[15px] font-semibold text-white/60 mb-3">This Month</h2>
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <p className="text-[13px] text-white/40">Subscription</p>
            <p className="mt-1.5 text-[24px] font-bold text-white tracking-tight">
              {formatCents(billing?.summary.subscription || 0)}
            </p>
            <p className="mt-1 text-[12px] text-white/30">Monthly plan fee</p>
          </Card>
          <Card>
            <p className="text-[13px] text-white/40">Token top-ups</p>
            <p className="mt-1.5 text-[24px] font-bold text-white tracking-tight">
              {formatCents(billing?.summary.tokenPurchases || 0)}
            </p>
            <p className="mt-1 text-[12px] text-white/30">Extra tokens purchased</p>
          </Card>
          <Card glow>
            <p className="text-[13px] text-white/40">Total</p>
            <p className="mt-1.5 text-[24px] font-bold text-indigo-400 tracking-tight">
              {formatCents(billing?.summary.total || 0)}
            </p>
            <p className="mt-1 text-[12px] text-white/30">Everything this month</p>
          </Card>
        </div>
      </div>

      {/* Invoice History */}
      <Card className="!p-0 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <div className="flex items-center gap-3">
            <Receipt className="h-5 w-5 text-white/40" />
            <span className="text-[15px] font-semibold text-white">Invoice History</span>
          </div>
        </div>
        {invoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-center">
            <FileText className="h-8 w-8 text-white/20 mb-3" />
            <p className="text-[14px] text-white/40">No invoices yet</p>
            <p className="text-[13px] text-white/25 mt-1">Your invoices will appear here after your first payment.</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {invoices.map((invoice) => (
              <div key={invoice.id} className="flex items-center justify-between px-6 py-4 hover:bg-white/[0.02] transition-colors">
                <div className="flex items-center gap-4">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/5">
                    <FileText className="h-4 w-4 text-white/40" />
                  </div>
                  <div>
                    <p className="text-[14px] font-medium text-white">{formatCents(invoice.amount)}</p>
                    <p className="text-[12px] text-white/40">{formatDate(invoice.date)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={invoice.status === 'paid' ? 'active' : invoice.status === 'pending' ? 'starting' : 'default'}>
                    {invoice.status === 'paid' ? 'Paid' : invoice.status === 'pending' ? 'Pending' : invoice.status}
                  </Badge>
                  <Button variant="ghost" size="sm" onClick={() => window.open(invoice.pdfUrl, '_blank')}>
                    <Download className="h-4 w-4" />
                    PDF
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Payment Method */}
      <Card>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-400/10">
              <CreditCard className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <CardTitle>Payment Method</CardTitle>
              <CardDescription>
                {billing?.paymentMethod
                  ? `${billing.paymentMethod.brand} ending in ${billing.paymentMethod.last4} · expires ${billing.paymentMethod.expiry}`
                  : 'No payment method on file'}
              </CardDescription>
            </div>
          </div>
          <Button variant="glass" size="sm" onClick={openPortal}>
            Update
          </Button>
        </div>
      </Card>

      {/* Cancel */}
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => setCancelModal(true)}>
          <span className="text-white/30 hover:text-red-400 transition-colors">Cancel subscription</span>
        </Button>
      </div>

      {/* Upgrade Modal */}
      <Modal
        open={upgradeModal}
        onClose={() => setUpgradeModal(false)}
        title="Choose Your Plan"
        description="Pick the plan that works best for you. You can change anytime."
        size="lg"
      >
        <div className="grid grid-cols-3 gap-4 mt-2">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative rounded-2xl border p-5 transition-all ${
                plan.popular
                  ? 'border-indigo-500/40 bg-indigo-500/5 ring-1 ring-indigo-500/20'
                  : 'border-white/8 bg-white/[0.02] hover:border-white/15'
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                  <Badge variant="accent">Most Popular</Badge>
                </div>
              )}
              <div className="text-center mb-4 pt-1">
                <h3 className="text-[16px] font-semibold text-white">{plan.name}</h3>
                <div className="mt-2">
                  <span className="text-[28px] font-bold text-white">{formatCents(plan.price)}</span>
                  <span className="text-[13px] text-white/40">/month</span>
                </div>
              </div>
              <hr className="glass-divider mb-4" />
              <ul className="space-y-2.5 mb-5">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span className="text-[13px] text-white/60 leading-snug">{feature}</span>
                  </li>
                ))}
              </ul>
              <Button
                variant={plan.popular ? 'primary' : 'glass'}
                size="sm"
                className="w-full"
                onClick={openPortal}
              >
                {billing?.plan.name === plan.name ? 'Current Plan' : `Choose ${plan.name}`}
              </Button>
            </div>
          ))}
        </div>
      </Modal>

      {/* Cancel Modal */}
      <Modal
        open={cancelModal}
        onClose={() => setCancelModal(false)}
        title="We're sorry to see you go"
        description="Your plan will stay active until the end of your current billing period. You won't be charged again."
        size="sm"
      >
        <div className="space-y-5">
          <div>
            <label className="block text-[13px] font-medium text-white/60 mb-2">
              Would you mind telling us why?
            </label>
            <div className="space-y-2">
              {cancelReasons.map((reason) => (
                <label
                  key={reason}
                  className={`flex items-center gap-3 rounded-xl px-4 py-3 cursor-pointer transition-all ${
                    cancelReason === reason
                      ? 'bg-white/[0.06] border border-white/10'
                      : 'hover:bg-white/[0.03] border border-transparent'
                  }`}
                >
                  <input
                    type="radio"
                    name="cancelReason"
                    value={reason}
                    checked={cancelReason === reason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    className="h-4 w-4 accent-indigo-500"
                  />
                  <span className="text-[14px] text-white/70">{reason}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="primary" className="flex-1" onClick={() => setCancelModal(false)}>
              <Heart className="h-4 w-4" />
              Keep My Plan
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              onClick={handleCancel}
              loading={cancelling}
              disabled={!cancelReason}
            >
              Cancel at Period End
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
