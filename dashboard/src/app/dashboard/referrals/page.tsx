'use client';

import { useEffect, useState } from 'react';
import { Card, CardTitle, CardDescription, GlassPanel } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import api from '@/lib/api';
import { formatCents, formatDate } from '@/lib/utils';
import {
  Users,
  Link2,
  Copy,
  Check,
  Loader2,
  DollarSign,
  TrendingUp,
  Gift,
  Share2,
  Send,
  Mail,
  UserPlus,
  ArrowRight,
  Sparkles,
  Heart,
} from 'lucide-react';

interface ReferralData {
  referralLink: string;
  stats: {
    total: number;
    active: number;
    monthlyEarnings: number;
    totalEarnings: number;
  };
  referrals: {
    id: string;
    email: string;
    status: 'pending' | 'active' | 'churned';
    joinedAt: string;
    earnings: number;
  }[];
}

const steps = [
  {
    icon: Link2,
    title: 'Share your link',
    description: 'Copy your unique link and send it to friends, family, or anyone who\'d love a personal AI assistant.',
  },
  {
    icon: UserPlus,
    title: 'They sign up',
    description: 'When someone uses your link to create an account, we\'ll connect them to you automatically.',
  },
  {
    icon: Sparkles,
    title: 'They start using it',
    description: 'Once your friend subscribes to any paid plan, your reward kicks in right away.',
  },
  {
    icon: DollarSign,
    title: 'You earn $5/month',
    description: 'For as long as they stay subscribed, you earn $5 every month. It adds up fast!',
  },
];

export default function ReferralsPage() {
  const [data, setData] = useState<ReferralData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.get<ReferralData>('/referrals')
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function copyLink() {
    if (!data) return;
    await navigator.clipboard.writeText(data.referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  function shareTwitter() {
    if (!data) return;
    const text = encodeURIComponent(
      `I've been using this amazing AI assistant that handles my tasks for me. Try it out with my link and we both benefit! ${data.referralLink}`
    );
    window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank');
  }

  function shareWhatsApp() {
    if (!data) return;
    const text = encodeURIComponent(
      `Hey! I've been using this AI assistant that's been a game-changer for me. Sign up with my link and we both get rewarded: ${data.referralLink}`
    );
    window.open(`https://wa.me/?text=${text}`, '_blank');
  }

  function shareEmail() {
    if (!data) return;
    const subject = encodeURIComponent('You should try this AI assistant');
    const body = encodeURIComponent(
      `Hi!\n\nI've been using Valnaa — it's a personal AI assistant that handles all kinds of tasks for me. I thought you'd love it too.\n\nSign up with my link and get started: ${data.referralLink}\n\nWe both benefit when you join!`
    );
    window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
  }

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
      </div>
    );
  }

  const statusMap: Record<string, 'green' | 'amber' | 'red'> = {
    active: 'green',
    pending: 'amber',
    churned: 'red',
  };

  const statusLabels: Record<string, string> = {
    active: 'Earning',
    pending: 'Signed up',
    churned: 'Inactive',
  };

  return (
    <div className="space-y-8 max-w-3xl">
      {/* Header */}
      <div className="animate-fade-up">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/[0.06] border border-white/[0.08]">
            <Gift className="h-5 w-5 text-white/50" />
          </div>
          <h1 className="text-[28px] font-bold text-white tracking-tight">Refer Friends & Earn</h1>
        </div>
        <p className="mt-2 text-[15px] text-white/50 leading-relaxed">
          Earn <span className="text-green-400 font-semibold">$5 every month</span> for each friend who signs up. 
          The more friends you invite, the more you earn — it never expires.
        </p>
      </div>

      {/* Referral Link Card */}
      <Card glow className="relative overflow-hidden">
        <div className="relative">
          <div className="mb-4">
            <CardTitle>Your Referral Link</CardTitle>
            <CardDescription>Share this link and start earning when your friends sign up.</CardDescription>
          </div>

          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 truncate rounded-2xl glass-subtle px-5 py-3.5 font-mono text-[15px] text-white/60 border border-white/[0.08]">
              {data?.referralLink || 'https://valnaa.com/ref/...'}
            </div>
            <Button variant={copied ? 'glass' : 'primary'} onClick={copyLink}>
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-emerald-400" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Copy Link
                </>
              )}
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[13px] text-white/30 mr-1">Share via:</span>
            <Button variant="glass" size="sm" onClick={shareWhatsApp}>
              <Send className="h-3.5 w-3.5" />
              WhatsApp
            </Button>
            <Button variant="glass" size="sm" onClick={shareTwitter}>
              <Share2 className="h-3.5 w-3.5" />
              Twitter
            </Button>
            <Button variant="glass" size="sm" onClick={shareEmail}>
              <Mail className="h-3.5 w-3.5" />
              Email
            </Button>
          </div>
        </div>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-400/10">
              <Users className="h-4 w-4 text-blue-400" />
            </div>
          </div>
          <p className="text-[24px] font-bold text-white tracking-tight">{data?.stats.active ?? 0}</p>
          <p className="text-[13px] text-white/40 mt-1">Active referrals</p>
          <p className="text-[12px] text-white/25 mt-0.5">{data?.stats.total ?? 0} total sign-ups</p>
        </Card>
        <Card>
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-400/10">
              <TrendingUp className="h-4 w-4 text-emerald-400" />
            </div>
          </div>
          <p className="text-[24px] font-bold text-emerald-400 tracking-tight">
            {formatCents(data?.stats.monthlyEarnings ?? 0)}
          </p>
          <p className="text-[13px] text-white/40 mt-1">Monthly earnings</p>
          <p className="text-[12px] text-white/25 mt-0.5">Recurring every month</p>
        </Card>
        <Card>
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-400/10">
              <DollarSign className="h-4 w-4 text-amber-400" />
            </div>
          </div>
          <p className="text-[24px] font-bold text-white tracking-tight">
            {formatCents(data?.stats.totalEarnings ?? 0)}
          </p>
          <p className="text-[13px] text-white/40 mt-1">Total earned</p>
          <p className="text-[12px] text-white/25 mt-0.5">Lifetime earnings</p>
        </Card>
      </div>

      {/* How It Works */}
      <div>
        <h2 className="text-[15px] font-semibold text-white/60 mb-4">How It Works</h2>
        <div className="grid grid-cols-4 gap-3">
          {steps.map((step, i) => {
            const StepIcon = step.icon;
            return (
              <GlassPanel key={i} className="text-center relative">
                  <div className="flex justify-center mb-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/[0.06]">
                    <StepIcon className="h-5 w-5 text-white/40" />
                  </div>
                </div>
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white/5 text-[12px] font-bold text-white/40 mx-auto mb-2">
                  {i + 1}
                </div>
                <h3 className="text-[13px] font-semibold text-white mb-1">{step.title}</h3>
                <p className="text-[12px] text-white/40 leading-relaxed">{step.description}</p>
                {i < steps.length - 1 && (
                  <ArrowRight className="absolute right-[-14px] top-1/2 -translate-y-1/2 h-4 w-4 text-white/10 hidden lg:block" />
                )}
              </GlassPanel>
            );
          })}
        </div>
      </div>

      {/* Referral List */}
      <Card className="!p-0 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <div className="flex items-center gap-3">
            <Heart className="h-5 w-5 text-white/40" />
            <span className="text-[15px] font-semibold text-white">Your Referrals</span>
          </div>
          {data?.referrals && data.referrals.length > 0 && (
            <span className="text-[12px] text-white/30">{data.referrals.length} people</span>
          )}
        </div>

        {(!data?.referrals || data.referrals.length === 0) ? (
          <div className="flex flex-col items-center justify-center py-14 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.06] mb-4">
              <Users className="h-6 w-6 text-white/40" />
            </div>
            <p className="text-[15px] font-medium text-white">No referrals yet</p>
            <p className="mt-2 text-[13px] text-white/40 max-w-sm">
              Share your link and earn $5/month for every friend who signs up!
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {data.referrals.map((ref) => (
              <div key={ref.id} className="flex items-center justify-between px-6 py-4 hover:bg-white/[0.02] transition-colors">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.06] text-[14px] font-semibold text-white/60">
                    {ref.email.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-[14px] font-medium text-white">{ref.email}</p>
                    <p className="text-[12px] text-white/40">Joined {formatDate(ref.joinedAt)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-[14px] font-semibold text-emerald-400">
                    {formatCents(ref.earnings)}<span className="text-[12px] text-white/30">/mo</span>
                  </span>
                  <Badge variant={statusMap[ref.status] || 'default'}>
                    {statusLabels[ref.status] || ref.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
