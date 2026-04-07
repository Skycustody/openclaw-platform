'use client';

import { useEffect, useState } from 'react';
import { Card, CardTitle, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Toggle } from '@/components/ui/Toggle';
import { Slider } from '@/components/ui/Slider';
import api from '@/lib/api';
import {
  Shield,
  Moon,
  RefreshCw,
  Save,
  Loader2,
  Check,
} from 'lucide-react';

interface ProtectionSettings {
  quietHours: { enabled: boolean; start: string; end: string };
  loopProtection: { enabled: boolean; maxMinutes: number };
  maxTaskDuration: number;
}

export default function ProtectionPage() {
  const [settings, setSettings] = useState<ProtectionSettings>({
    quietHours: { enabled: false, start: '22:00', end: '07:00' },
    loopProtection: { enabled: true, maxMinutes: 5 },
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

  return (
    <div className="space-y-8">
      <div className="animate-fade-up">
        <div className="flex items-center gap-3 mb-2">
          <div className="rounded-2xl bg-white/[0.06] p-3">
            <Shield className="h-6 w-6 text-white/40" />
          </div>
          <h1 className="text-[28px] font-bold text-white tracking-tight">Safety Settings</h1>
        </div>
        <p className="text-[15px] text-white/50 sm:ml-[52px]">
          Control when and how your agent operates.
        </p>
      </div>

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
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4 sm:ml-14">
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

      <div className="flex justify-end pb-8 animate-fade-up">
        <Button onClick={handleSave} loading={saving} size="lg">
          {saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {saved ? 'Saved!' : 'Save Protection Settings'}
        </Button>
      </div>
    </div>
  );
}
