'use client';

import { useEffect, useState } from 'react';
import { Card, CardTitle, CardDescription, GlassPanel } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Toggle } from '@/components/ui/Toggle';
import { Slider } from '@/components/ui/Slider';
import api from '@/lib/api';
import {
  Shield,
  Clock,
  Moon,
  AlertTriangle,
  RefreshCw,
  Save,
  Loader2,
  Check,
  Zap,
  ArrowRight,
} from 'lucide-react';

interface ProtectionSettings {
  tokenBudgets: { simple: number; medium: number; complex: number };
  limitBehavior: 'stop' | 'continue' | 'ask';
  quietHours: { enabled: boolean; start: string; end: string };
  loopProtection: { enabled: boolean; maxMinutes: number };
  lowBalanceWarning: number;
  maxTaskDuration: number;
}

function tokensToCents(tokens: number): string {
  const cost = (tokens / 1000) * 0.002;
  if (cost < 0.01) return `about ${(cost * 100).toFixed(3)}¢`;
  if (cost < 1) return `about ${(cost * 100).toFixed(1)}¢`;
  return `about $${cost.toFixed(2)}`;
}

export default function ProtectionPage() {
  const [settings, setSettings] = useState<ProtectionSettings>({
    tokenBudgets: { simple: 500, medium: 5000, complex: 20000 },
    limitBehavior: 'stop',
    quietHours: { enabled: false, start: '22:00', end: '07:00' },
    loopProtection: { enabled: true, maxMinutes: 5 },
    lowBalanceWarning: 3,
    maxTaskDuration: 120,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get<any>('/settings')
      .then((res) => {
        const s = res.settings;
        if (s && typeof s === 'object') {
          setSettings(prev => ({
            ...prev,
            tokenBudgets: {
              simple: s.token_budget_simple ?? prev.tokenBudgets.simple,
              medium: s.token_budget_medium ?? prev.tokenBudgets.medium,
              complex: s.token_budget_complex ?? prev.tokenBudgets.complex,
            },
            quietHours: {
              enabled: s.quiet_hours_enabled ?? prev.quietHours.enabled,
              start: s.quiet_start ?? prev.quietHours.start,
              end: s.quiet_end ?? prev.quietHours.end,
            },
            loopProtection: {
              enabled: s.loop_detection ?? prev.loopProtection.enabled,
              maxMinutes: s.max_task_duration ?? prev.loopProtection.maxMinutes,
            },
          }));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await api.put('/settings/protection', {
        quietHoursEnabled: settings.quietHours.enabled,
        quietStart: settings.quietHours.start,
        quietEnd: settings.quietHours.end,
        maxTaskDuration: settings.loopProtection.maxMinutes,
        loopDetection: settings.loopProtection.enabled,
        tokenBudgetSimple: settings.tokenBudgets.simple,
        tokenBudgetMedium: settings.tokenBudgets.medium,
        tokenBudgetComplex: settings.tokenBudgets.complex,
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
        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
      </div>
    );
  }

  const LIMIT_OPTIONS = [
    { id: 'stop' as const, label: 'Stop and let me know', description: 'The safest option — your agent will pause and notify you' },
    { id: 'continue' as const, label: 'Continue anyway', description: 'Let the agent keep going even if it hits the limit' },
    { id: 'ask' as const, label: 'Ask me first', description: 'Your agent will ask for permission before continuing' },
  ];

  return (
    <div className="space-y-8">
      <div className="animate-fade-up">
        <div className="flex items-center gap-3 mb-2">
          <div className="rounded-2xl bg-white/[0.06] p-3">
            <Shield className="h-6 w-6 text-white/40" />
          </div>
          <h1 className="text-[28px] font-bold text-white tracking-tight">Protect Your Budget</h1>
        </div>
        <p className="text-[15px] text-white/50 ml-[52px]">
          Stop your agent from overspending accidentally.
        </p>
      </div>

      <Card className="animate-fade-up">
        <CardTitle>Budget limits per task type</CardTitle>
        <CardDescription>
          Set spending limits for different kinds of tasks
        </CardDescription>
        <div className="mt-6 space-y-8">
          <Slider
            label="Simple tasks (reminders, quick answers)"
            value={settings.tokenBudgets.simple}
            onChange={(v) => setSettings((s) => ({ ...s, tokenBudgets: { ...s.tokenBudgets, simple: v } }))}
            min={100}
            max={5000}
            step={100}
            valueLabel={`${settings.tokenBudgets.simple.toLocaleString()} tokens max`}
            hint={tokensToCents(settings.tokenBudgets.simple) + ' per task'}
          />
          <hr className="glass-divider" />
          <Slider
            label="Medium tasks (emails, research)"
            value={settings.tokenBudgets.medium}
            onChange={(v) => setSettings((s) => ({ ...s, tokenBudgets: { ...s.tokenBudgets, medium: v } }))}
            min={1000}
            max={30000}
            step={500}
            valueLabel={`${settings.tokenBudgets.medium.toLocaleString()} tokens max`}
            hint={tokensToCents(settings.tokenBudgets.medium) + ' per task'}
          />
          <hr className="glass-divider" />
          <Slider
            label="Complex tasks (analysis, reports)"
            value={settings.tokenBudgets.complex}
            onChange={(v) => setSettings((s) => ({ ...s, tokenBudgets: { ...s.tokenBudgets, complex: v } }))}
            min={5000}
            max={100000}
            step={1000}
            valueLabel={`${settings.tokenBudgets.complex.toLocaleString()} tokens max`}
            hint={tokensToCents(settings.tokenBudgets.complex) + ' per task'}
          />
        </div>
      </Card>

      <Card className="animate-fade-up">
        <CardTitle>If a task hits its limit</CardTitle>
        <CardDescription>What should your agent do when it reaches the budget limit?</CardDescription>
        <div className="mt-5 space-y-3">
          {LIMIT_OPTIONS.map((opt) => {
            const selected = settings.limitBehavior === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => setSettings((s) => ({ ...s, limitBehavior: opt.id }))}
                className={`w-full flex items-center gap-4 p-4 rounded-2xl border transition-all text-left ${
                  selected
                    ? 'border-white/[0.08] bg-white/[0.06]'
                    : 'border-white/5 hover:border-white/10 hover:bg-white/[0.02]'
                }`}
              >
                <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                  selected ? 'border-white bg-white' : 'border-white/15'
                }`}>
                  {selected && <div className="h-2 w-2 rounded-full bg-white" />}
                </div>
                <div>
                  <p className={`text-[14px] font-medium ${selected ? 'text-white' : 'text-white/60'}`}>
                    {opt.label}
                  </p>
                  <p className="text-[12px] text-white/30 mt-0.5">{opt.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      <Card className="animate-fade-up">
        <div className="flex items-center gap-3 mb-4">
          <Moon className="h-5 w-5 text-blue-400" />
          <div>
            <CardTitle>Quiet Hours</CardTitle>
            <CardDescription>Pause your agent during certain hours — like overnight</CardDescription>
          </div>
        </div>
        <Toggle
          enabled={settings.quietHours.enabled}
          onChange={(v) => setSettings((s) => ({ ...s, quietHours: { ...s.quietHours, enabled: v } }))}
          label="Enable quiet hours"
          description="Your agent won't start new tasks during this time"
        />
        {settings.quietHours.enabled && (
          <div className="mt-5 grid grid-cols-2 gap-4 ml-14">
            <Input
              label="From"
              type="time"
              value={settings.quietHours.start}
              onChange={(e) =>
                setSettings((s) => ({ ...s, quietHours: { ...s.quietHours, start: e.target.value } }))
              }
            />
            <Input
              label="Until"
              type="time"
              value={settings.quietHours.end}
              onChange={(e) =>
                setSettings((s) => ({ ...s, quietHours: { ...s.quietHours, end: e.target.value } }))
              }
            />
          </div>
        )}
      </Card>

      <Card className="animate-fade-up">
        <div className="flex items-center gap-3 mb-4">
          <RefreshCw className="h-5 w-5 text-amber-400" />
          <div>
            <CardTitle>Loop Protection</CardTitle>
            <CardDescription>Stop your agent if it gets stuck repeating the same thing</CardDescription>
          </div>
        </div>
        <Toggle
          enabled={settings.loopProtection.enabled}
          onChange={(v) => setSettings((s) => ({ ...s, loopProtection: { ...s.loopProtection, enabled: v } }))}
          label="Enable loop protection"
          description="Automatically stops tasks that seem stuck"
        />
        {settings.loopProtection.enabled && (
          <div className="mt-5 ml-14">
            <Slider
              label="Maximum time before stopping"
              value={settings.loopProtection.maxMinutes}
              onChange={(v) => setSettings((s) => ({ ...s, loopProtection: { ...s.loopProtection, maxMinutes: v } }))}
              min={1}
              max={30}
              step={1}
              valueLabel={`${settings.loopProtection.maxMinutes} minutes`}
            />
          </div>
        )}
      </Card>

      <Card className="animate-fade-up">
        <div className="flex items-center gap-3 mb-4">
          <AlertTriangle className="h-5 w-5 text-red-400" />
          <div>
            <CardTitle>Low Balance Warning</CardTitle>
            <CardDescription>Get notified when your balance is running low</CardDescription>
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <p className="text-[14px] text-white/50 mb-3">Warn me when I have fewer than:</p>
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 5, 7, 14].map((days) => (
                <button
                  key={days}
                  onClick={() => setSettings((s) => ({ ...s, lowBalanceWarning: days }))}
                  className={`px-4 py-2.5 rounded-xl text-[14px] font-medium transition-all ${
                    settings.lowBalanceWarning === days
                      ? 'bg-white/[0.06] text-white border border-white/[0.08]'
                      : 'bg-white/5 text-white/40 border border-white/5 hover:border-white/10'
                  }`}
                >
                  {days} day{days !== 1 ? 's' : ''} left
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <GlassPanel className="animate-fade-up">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Zap className="h-5 w-5 text-white/40" />
            <div>
              <p className="text-[14px] text-white/70">Want your balance to refill automatically?</p>
              <p className="text-[13px] text-white/40">Set up Auto Top-Up in your balance settings</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.location.href = '/dashboard/tokens'}
          >
            Go to Balance
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </GlassPanel>

      <div className="flex justify-end pb-8 animate-fade-up">
        <Button onClick={handleSave} loading={saving} size="lg">
          {saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {saved ? 'Saved!' : 'Save Protection Settings'}
        </Button>
      </div>
    </div>
  );
}
