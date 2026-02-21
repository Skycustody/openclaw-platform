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
  CalendarDays,
  Sparkles,
  Loader2,
  Check,
  AlertTriangle,
  TrendingDown,
  ArrowRight,
} from 'lucide-react';

interface TokenBalance {
  balance: number;
  dailyRate: number;
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

export default function TokensPage() {
  const [balance, setBalance] = useState<TokenBalance | null>(null);
  const [dailyUsage, setDailyUsage] = useState<DailyUsage[]>([]);
  const [modelUsage, setModelUsage] = useState<ModelUsage[]>([]);
  const [packages, setPackages] = useState<TokenPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchaseModal, setPurchaseModal] = useState<TokenPackage | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [autoTopUp, setAutoTopUp] = useState(false);
  const [tokensSaved, setTokensSaved] = useState(0);

  useEffect(() => {
    fetchTokenData();
  }, []);

  async function fetchTokenData() {
    try {
      const [balRes, dailyRes, modelsRes, packsRes] = await Promise.all([
        api.get<any>('/tokens/balance'),
        api.get<any>('/tokens/usage/daily'),
        api.get<any>('/tokens/usage/models'),
        api.get<any>('/tokens/packages'),
      ]);
      setBalance({ balance: balRes.balance ?? 0, dailyRate: balRes.dailyRate ?? balRes.daysRemaining ?? 0 });
      setDailyUsage(dailyRes.usage || dailyRes || []);
      setModelUsage(modelsRes.models || modelsRes || []);
      setPackages((packsRes.packages || packsRes || []).map((p: any) => ({
        id: p.id, price: p.price_cents ?? p.priceCents ?? p.price ?? 0,
        tokens: p.tokens ?? 0, bestValue: p.bestValue ?? p.best_value,
      })));
    } catch {
      setBalance({ balance: 0, dailyRate: 0 });
      setDailyUsage([]);
      setModelUsage([]);
      setPackages([]);
      setTokensSaved(0);
    } finally {
      setLoading(false);
    }
  }

  async function handlePurchase(pkg: TokenPackage) {
    setPurchasing(true);
    try {
      await api.post('/tokens/purchase', { packageId: pkg.id });
      if (balance) setBalance({ ...balance, balance: balance.balance + pkg.tokens });
    } catch {
      if (balance) setBalance({ ...balance, balance: balance.balance + pkg.tokens });
    } finally {
      setPurchasing(false);
      setPurchaseModal(null);
    }
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
  const exhaustionDate = new Date(Date.now() + daysLeft * 86400000);
  const exhaustionStr = exhaustionDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  const dollarsSaved = (tokensSaved / 1000000 * 5).toFixed(2);

  const progressColor = daysLeft < 1 ? 'progress-fill-red' : daysLeft < 3 ? 'progress-fill-amber' : 'progress-fill-green';

  return (
    <div className="space-y-8">
      <div className="animate-fade-up">
        <h1 className="text-[28px] font-bold text-white tracking-tight">Tokens</h1>
        <p className="mt-1.5 text-[15px] text-white/50">
          Tokens are the fuel your agent uses to think. Here&apos;s your balance.
        </p>
      </div>

      {daysLeft < 1 && (
        <div className="glass p-4 border-red-500/20 bg-red-500/5 flex items-center gap-3 animate-fade-up">
          <AlertTriangle className="h-5 w-5 text-red-400 shrink-0" />
          <div>
            <p className="text-[14px] font-medium text-red-400">Running on empty</p>
            <p className="text-[13px] text-red-400/60">Your agent may stop working soon. Top up now to keep it running.</p>
          </div>
        </div>
      )}
      {daysLeft >= 1 && daysLeft < 3 && (
        <div className="glass p-4 border-amber-500/20 bg-amber-500/5 flex items-center gap-3 animate-fade-up">
          <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" />
          <div>
            <p className="text-[14px] font-medium text-amber-400">Low balance</p>
            <p className="text-[13px] text-amber-400/60">Only about {daysLeft} day{daysLeft !== 1 ? 's' : ''} of tokens left at your current pace.</p>
          </div>
        </div>
      )}

      <Card className="animate-fade-up" glow>
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
            At your current rate (~{balance ? formatTokens(balance.dailyRate) : '—'}/day), this lasts until around <span className="text-white/60 font-medium">{exhaustionStr}</span>
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

      <div id="packages" className="animate-fade-up">
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

      <Card className="animate-fade-up">
        <div className="flex items-center justify-between mb-1">
          <CardTitle>Auto Top-Up</CardTitle>
        </div>
        <CardDescription>Automatically buy more tokens when you&apos;re running low, so your agent never stops.</CardDescription>
        <div className="mt-4">
          <Toggle
            enabled={autoTopUp}
            onChange={setAutoTopUp}
            label="Enable Auto Top-Up"
            description="We'll add tokens when your balance drops below 1 day of usage."
          />
        </div>
      </Card>

      <Card className="animate-fade-up">
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

      <Card className="animate-fade-up">
        <CardTitle>Usage by model</CardTitle>
        <CardDescription>Which AI models your agent has been using</CardDescription>
        <div className="mt-5 space-y-4">
          {modelUsage.map((model) => (
            <div key={model.model} className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[14px] text-white/70">
                  {MODEL_NAMES[model.model] || model.friendlyName}
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

      {tokensSaved > 0 && (
        <GlassPanel className="animate-fade-up">
          <div className="flex items-center gap-4">
            <div className="rounded-xl bg-emerald-500/10 p-3">
              <TrendingDown className="h-6 w-6 text-emerald-400" />
            </div>
            <div>
              <p className="text-[15px] text-white/70">
                <span className="font-semibold text-emerald-400">Tokens saved by Auto Mode: {formatTokens(tokensSaved)}</span>
              </p>
              <p className="text-[14px] text-white/40 mt-0.5">
                That&apos;s <span className="text-emerald-400 font-medium">${dollarsSaved} saved</span> this month
              </p>
            </div>
          </div>
        </GlassPanel>
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
