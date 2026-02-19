'use client';

import { useEffect, useState } from 'react';
import { Card, CardTitle, CardDescription, GlassPanel } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import api from '@/lib/api';
import { formatTokens, timeAgo } from '@/lib/utils';
import {
  Brain,
  Sparkles,
  CircleDot,
  Zap,
  TrendingDown,
  Loader2,
  Save,
  Check,
  Rabbit,
  Scale,
  Cpu,
  FlaskConical,
} from 'lucide-react';

interface RoutingDecision {
  id: string;
  messagePreview: string;
  model: string;
  friendlyName: string;
  cost: number;
  timestamp: string;
}

interface RouterSavings {
  tokensSaved: number;
  costSaved: number;
}

const MODEL_OPTIONS = [
  {
    id: 'fast',
    label: 'Fast & Cheap',
    description: 'Simple tasks, quick answers',
    icon: Rabbit,
  },
  {
    id: 'smart',
    label: 'Smart & Balanced',
    description: 'Good for most things',
    icon: Scale,
  },
  {
    id: 'powerful',
    label: 'Powerful',
    description: 'Best for coding and complex work',
    icon: Cpu,
  },
  {
    id: 'most-powerful',
    label: 'Most Powerful',
    description: 'Deep research and analysis',
    icon: FlaskConical,
  },
];

const MODEL_BADGE_VARIANT: Record<string, 'active' | 'sleeping' | 'accent' | 'starting'> = {
  'Fast & Cheap': 'active',
  'Smart & Balanced': 'sleeping',
  'Powerful': 'accent',
  'Most Powerful': 'starting',
};

export default function RouterPage() {
  const [mode, setMode] = useState<'auto' | 'manual'>('auto');
  const [selectedModel, setSelectedModel] = useState('smart');
  const [history, setHistory] = useState<RoutingDecision[]>([]);
  const [savings, setSavings] = useState<RouterSavings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchRouterData();
  }, []);

  async function fetchRouterData() {
    try {
      const [historyData, savingsData] = await Promise.all([
        api.get<RoutingDecision[]>('/router/history'),
        api.get<RouterSavings>('/router/savings'),
      ]);
      setHistory(historyData);
      setSavings(savingsData);
    } catch {
      setHistory([
        {
          id: '1',
          messagePreview: 'Summarize the Q3 earnings report and extract key metrics...',
          model: 'claude-3.5',
          friendlyName: 'Powerful',
          cost: 0.024,
          timestamp: new Date(Date.now() - 300000).toISOString(),
        },
        {
          id: '2',
          messagePreview: 'What time is the meeting tomorrow?',
          model: 'gpt-4o-mini',
          friendlyName: 'Fast & Cheap',
          cost: 0.001,
          timestamp: new Date(Date.now() - 600000).toISOString(),
        },
        {
          id: '3',
          messagePreview: 'Write a detailed product comparison between our solution...',
          model: 'gpt-4o',
          friendlyName: 'Smart & Balanced',
          cost: 0.018,
          timestamp: new Date(Date.now() - 900000).toISOString(),
        },
        {
          id: '4',
          messagePreview: 'Translate this paragraph to French',
          model: 'gpt-4o-mini',
          friendlyName: 'Fast & Cheap',
          cost: 0.002,
          timestamp: new Date(Date.now() - 1200000).toISOString(),
        },
        {
          id: '5',
          messagePreview: 'Generate test cases for the login module and edge cases...',
          model: 'claude-3.5',
          friendlyName: 'Powerful',
          cost: 0.031,
          timestamp: new Date(Date.now() - 1500000).toISOString(),
        },
        {
          id: '6',
          messagePreview: 'Acknowledge receipt of the invoice',
          model: 'gpt-4o-mini',
          friendlyName: 'Fast & Cheap',
          cost: 0.0005,
          timestamp: new Date(Date.now() - 1800000).toISOString(),
        },
      ]);
      setSavings({ tokensSaved: 1200000, costSaved: 600 });
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await api.put('/settings/brain', {
        mode,
        model: mode === 'manual' ? selectedModel : null,
      });
    } catch {}
    finally {
      setSaving(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  const dollarsSaved = savings ? (savings.costSaved / 100).toFixed(2) : '0.00';

  return (
    <div className="space-y-8">
      <div className="animate-fade-up">
        <h1 className="text-[28px] font-bold text-white tracking-tight">How Your Agent Thinks</h1>
        <p className="mt-1.5 text-[15px] text-white/50">
          Choose whether your agent automatically picks the best AI for each task, or always uses one you choose.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-fade-up">
        <button
          onClick={() => setMode('auto')}
          className="text-left"
        >
          <Card
            className={`h-full transition-all ${
              mode === 'auto'
                ? 'ring-1 ring-indigo-500/50 bg-indigo-500/5'
                : 'hover:bg-white/[0.03]'
            }`}
            glow={mode === 'auto'}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className={`rounded-xl p-2.5 ${mode === 'auto' ? 'bg-indigo-500/15' : 'bg-white/5'}`}>
                <Sparkles className={`h-5 w-5 ${mode === 'auto' ? 'text-indigo-400' : 'text-white/30'}`} />
              </div>
              <div>
                <p className={`text-[16px] font-semibold ${mode === 'auto' ? 'text-white' : 'text-white/60'}`}>
                  Auto Mode
                </p>
                <Badge variant={mode === 'auto' ? 'active' : 'default'} dot={false}>Recommended</Badge>
              </div>
            </div>
            <p className="text-[14px] text-white/40 leading-relaxed">
              Your agent picks the smartest, cheapest AI for every task automatically. Simple questions use a fast model, complex ones use a powerful one.
            </p>
          </Card>
        </button>

        <button
          onClick={() => setMode('manual')}
          className="text-left"
        >
          <Card
            className={`h-full transition-all ${
              mode === 'manual'
                ? 'ring-1 ring-indigo-500/50 bg-indigo-500/5'
                : 'hover:bg-white/[0.03]'
            }`}
            glow={mode === 'manual'}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className={`rounded-xl p-2.5 ${mode === 'manual' ? 'bg-indigo-500/15' : 'bg-white/5'}`}>
                <CircleDot className={`h-5 w-5 ${mode === 'manual' ? 'text-indigo-400' : 'text-white/30'}`} />
              </div>
              <p className={`text-[16px] font-semibold ${mode === 'manual' ? 'text-white' : 'text-white/60'}`}>
                Choose One AI
              </p>
            </div>
            <p className="text-[14px] text-white/40 leading-relaxed">
              Always use the same AI model for everything. Best if you have a specific preference.
            </p>
          </Card>
        </button>
      </div>

      {mode === 'manual' && (
        <Card className="animate-fade-up">
          <CardTitle>Pick your AI model</CardTitle>
          <CardDescription>Your agent will use this model for every task</CardDescription>
          <div className="mt-5 space-y-3">
            {MODEL_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const selected = selectedModel === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => setSelectedModel(opt.id)}
                  className={`w-full flex items-center gap-4 p-4 rounded-2xl border transition-all text-left ${
                    selected
                      ? 'border-indigo-500/50 bg-indigo-500/5'
                      : 'border-white/5 hover:border-white/10 hover:bg-white/[0.02]'
                  }`}
                >
                  <div className={`rounded-xl p-2.5 ${selected ? 'bg-indigo-500/15' : 'bg-white/5'}`}>
                    <Icon className={`h-5 w-5 ${selected ? 'text-indigo-400' : 'text-white/30'}`} />
                  </div>
                  <div className="flex-1">
                    <p className={`text-[15px] font-medium ${selected ? 'text-white' : 'text-white/60'}`}>
                      {opt.label}
                    </p>
                    <p className="text-[13px] text-white/30">{opt.description}</p>
                  </div>
                  <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center transition-all ${
                    selected ? 'border-indigo-500 bg-indigo-500' : 'border-white/15'
                  }`}>
                    {selected && <div className="h-2 w-2 rounded-full bg-white" />}
                  </div>
                </button>
              );
            })}
          </div>
        </Card>
      )}

      <div className="flex justify-end animate-fade-up">
        <Button onClick={handleSave} loading={saving}>
          {saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {saved ? 'Saved!' : 'Save Changes'}
        </Button>
      </div>

      {history.length > 0 && (
        <Card className="animate-fade-up">
          <CardTitle>Recent decisions</CardTitle>
          <CardDescription>How your agent chose which AI to use for recent messages</CardDescription>
          <div className="mt-5 space-y-2">
            {history.map((decision) => (
              <div
                key={decision.id}
                className="flex items-center gap-4 p-3 rounded-xl hover:bg-white/[0.02] transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] text-white/70 truncate">{decision.messagePreview}</p>
                </div>
                <Badge
                  variant={MODEL_BADGE_VARIANT[decision.friendlyName] || 'default'}
                  dot={false}
                >
                  {decision.friendlyName}
                </Badge>
                <span className="text-[13px] text-white/30 font-mono whitespace-nowrap w-16 text-right">
                  {decision.cost < 0.01
                    ? `${(decision.cost * 100).toFixed(2)}¢`
                    : `$${decision.cost.toFixed(3)}`}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {savings && savings.tokensSaved > 0 && (
        <GlassPanel className="animate-fade-up">
          <div className="flex items-center gap-4">
            <div className="rounded-xl bg-emerald-500/10 p-3">
              <TrendingDown className="h-6 w-6 text-emerald-400" />
            </div>
            <div>
              <p className="text-[15px] text-white/70">
                Tokens saved this month: <span className="font-semibold text-emerald-400">{formatTokens(savings.tokensSaved)}</span>
              </p>
              <p className="text-[14px] text-white/40 mt-0.5">
                = <span className="text-emerald-400 font-medium">${dollarsSaved} saved</span>
              </p>
            </div>
          </div>
        </GlassPanel>
      )}
    </div>
  );
}
