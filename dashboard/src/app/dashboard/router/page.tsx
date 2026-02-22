'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardTitle, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import api from '@/lib/api';
import {
  Cpu, Brain, Loader2,
  Key, Eye, EyeOff, Trash2, Lock, Sparkles, Info, X,
} from 'lucide-react';

interface Model {
  name: string;
  displayName: string;
  internet: boolean;
  vision: boolean;
  deepAnalysis: boolean;
  costPer1MTokens: number;
  speed: string;
  retailPrice: number;
}

interface Settings {
  brain_mode: 'auto' | 'manual';
  manual_model: string | null;
  has_own_openai_key: boolean;
  own_openai_key_masked: string | null;
  has_own_anthropic_key: boolean;
  own_anthropic_key_masked: string | null;
}

export default function RouterPage() {
  const [models, setModels] = useState<Model[]>([]);
  const [settings, setSettings] = useState<Settings>({
    brain_mode: 'auto', manual_model: null,
    has_own_openai_key: false, own_openai_key_masked: null,
    has_own_anthropic_key: false, own_anthropic_key_masked: null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [showKeyInput, setShowKeyInput] = useState<'openai' | 'anthropic' | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [keySaving, setKeySaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [modelsRes, settingsRes] = await Promise.all([
        api.get<{ models: Model[] }>('/router/models'),
        api.get<{ settings: any }>('/settings'),
      ]);
      setModels(modelsRes.models || []);
      if (settingsRes.settings) {
        const s = settingsRes.settings;
        setSettings({
          brain_mode: s.brain_mode || 'auto',
          manual_model: s.manual_model || null,
          has_own_openai_key: !!s.has_own_openai_key,
          own_openai_key_masked: s.own_openai_key_masked || null,
          has_own_anthropic_key: !!s.has_own_anthropic_key,
          own_anthropic_key_masked: s.own_anthropic_key_masked || null,
        });
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const updateBrain = async (mode: 'auto' | 'manual', model?: string) => {
    setSaving(true);
    try {
      await api.put('/settings/brain', { brainMode: mode, manualModel: model || null });
      setSettings(prev => ({ ...prev, brain_mode: mode, manual_model: model || null }));
    } catch {}
    setSaving(false);
  };

  const saveOwnKey = async (provider: 'openai' | 'anthropic') => {
    if (!keyInput.trim()) return;
    setKeySaving(true);
    try {
      const body = provider === 'openai' ? { openaiKey: keyInput } : { anthropicKey: keyInput };
      await api.put('/settings/own-keys', body);
      setKeyInput('');
      setShowKeyInput(null);
      fetchData();
    } catch (err: any) {
      alert(err.message || 'Failed to save key');
    }
    setKeySaving(false);
  };

  const deleteOwnKey = async (provider: 'openai' | 'anthropic') => {
    if (!confirm(`Remove your ${provider === 'openai' ? 'OpenAI' : 'Anthropic'} key? Your agent will use platform tokens instead.`)) return;
    try {
      await api.delete(`/settings/own-keys/${provider}`);
      fetchData();
    } catch {}
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="animate-fade-up">
        <h1 className="text-[26px] font-bold text-white tracking-tight">Model Settings</h1>
        <p className="mt-1 text-[15px] text-white/40">
          Configure which AI model your OpenClaw agent uses — changes sync to your container
        </p>
      </div>

      {/* Mode Toggle */}
      <div className="grid gap-4 sm:grid-cols-2">
        <button className="text-left w-full" onClick={() => updateBrain('auto')}>
          <Card
            className={`cursor-pointer transition-all ${settings.brain_mode === 'auto' ? '!border-green-500/30 !bg-green-500/[0.04]' : 'hover:!border-white/15'}`}
          >
            <div className="flex items-start gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${settings.brain_mode === 'auto' ? 'bg-green-500/20' : 'bg-white/[0.06]'}`}>
                <Sparkles className={`h-5 w-5 ${settings.brain_mode === 'auto' ? 'text-green-400' : 'text-white/40'}`} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <CardTitle>Auto</CardTitle>
                  {settings.brain_mode === 'auto' && <Badge variant="green">Active</Badge>}
                </div>
                <CardDescription className="mt-1">
                  Let OpenClaw pick the best model for each task. Balances speed, quality, and cost automatically.
                </CardDescription>
              </div>
            </div>
          </Card>
        </button>

        <button className="text-left w-full" onClick={() => updateBrain('manual', settings.manual_model || models[0]?.name)}>
          <Card
            className={`cursor-pointer transition-all ${settings.brain_mode === 'manual' ? '!border-blue-500/30 !bg-blue-500/[0.04]' : 'hover:!border-white/15'}`}
          >
            <div className="flex items-start gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${settings.brain_mode === 'manual' ? 'bg-blue-500/20' : 'bg-white/[0.06]'}`}>
                <Brain className={`h-5 w-5 ${settings.brain_mode === 'manual' ? 'text-blue-400' : 'text-white/40'}`} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <CardTitle>Fixed Model</CardTitle>
                  {settings.brain_mode === 'manual' && <Badge variant="blue">Active</Badge>}
                </div>
                <CardDescription className="mt-1">
                  Always use one specific model. Full control over which AI handles your tasks.
                </CardDescription>
              </div>
            </div>
          </Card>
        </button>
      </div>

      {saving && (
        <div className="flex items-center gap-2 text-[12px] text-white/40">
          <Loader2 className="h-3 w-3 animate-spin" />
          Syncing to your OpenClaw container...
        </div>
      )}

      {/* Model Selector */}
      {settings.brain_mode === 'manual' && (
        <Card>
          <CardTitle className="mb-3">Choose Your Model</CardTitle>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {models.map((m) => (
              <button
                key={m.name}
                onClick={() => updateBrain('manual', m.name)}
                className={`flex flex-col gap-1.5 rounded-lg border p-3 text-left transition-all ${
                  settings.manual_model === m.name
                    ? 'border-blue-500/30 bg-blue-500/[0.06]'
                    : 'border-white/[0.06] bg-white/[0.02] hover:border-white/15'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-medium text-white/80">{m.displayName}</span>
                  <Badge variant={m.speed === 'very_fast' ? 'green' : m.speed === 'fast' ? 'default' : 'amber'}>
                    {m.speed === 'very_fast' ? 'Fast' : m.speed === 'fast' ? 'Med' : 'Slow'}
                  </Badge>
                </div>
                <span className="text-[11px] text-white/30 font-mono">{m.name}</span>
                <div className="flex flex-wrap items-center gap-1.5 mt-0.5 text-[10px]">
                  <span className="text-white/40">${m.retailPrice}/1M</span>
                  {m.internet && <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">Web</span>}
                  {m.vision && <span className="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">Vision</span>}
                  {m.deepAnalysis && <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">Deep</span>}
                </div>
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* Own API Keys */}
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <Key className="h-4 w-4 text-white/40" />
          <CardTitle>Your Own API Keys</CardTitle>
          <Badge variant="default">Optional</Badge>
        </div>
        <CardDescription className="mb-4">
          Bring your own OpenAI or Anthropic key. Your OpenClaw agent will use your key directly — no platform tokens deducted.
        </CardDescription>

        <div className="space-y-3">
          {/* OpenAI key */}
          <div className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-500/10 border border-green-500/20">
                <span className="text-[11px] font-bold text-green-400">OAI</span>
              </div>
              <div>
                <p className="text-[13px] font-medium text-white/70">OpenAI</p>
                {settings.has_own_openai_key ? (
                  <p className="text-[11px] text-green-400 font-mono">{settings.own_openai_key_masked}</p>
                ) : (
                  <p className="text-[11px] text-white/30">No key set — uses platform tokens</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {settings.has_own_openai_key && (
                <button onClick={() => deleteOwnKey('openai')} className="p-1.5 rounded-md text-white/20 hover:text-red-400 hover:bg-red-400/10 transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
              <Button variant="glass" size="sm" onClick={() => { setShowKeyInput(showKeyInput === 'openai' ? null : 'openai'); setKeyInput(''); setShowKey(false); }}>
                {settings.has_own_openai_key ? 'Change' : 'Add Key'}
              </Button>
            </div>
          </div>

          {showKeyInput === 'openai' && (
            <div className="flex gap-2 pl-11">
              <div className="relative flex-1">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder="sk-..."
                  className="w-full rounded-lg border border-white/[0.08] bg-transparent px-3 py-2 pr-8 text-[13px] text-white font-mono placeholder:text-white/20 focus:border-white/25 focus:outline-none"
                />
                <button onClick={() => setShowKey(!showKey)} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/50">
                  {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
              <Button variant="primary" size="sm" onClick={() => saveOwnKey('openai')} loading={keySaving} disabled={!keyInput.startsWith('sk-')}>Save</Button>
              <Button variant="glass" size="sm" onClick={() => { setShowKeyInput(null); setKeyInput(''); }}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}

          {/* Anthropic key */}
          <div className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/10 border border-orange-500/20">
                <span className="text-[11px] font-bold text-orange-400">ANT</span>
              </div>
              <div>
                <p className="text-[13px] font-medium text-white/70">Anthropic</p>
                {settings.has_own_anthropic_key ? (
                  <p className="text-[11px] text-orange-400 font-mono">{settings.own_anthropic_key_masked}</p>
                ) : (
                  <p className="text-[11px] text-white/30">No key set — uses platform tokens</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {settings.has_own_anthropic_key && (
                <button onClick={() => deleteOwnKey('anthropic')} className="p-1.5 rounded-md text-white/20 hover:text-red-400 hover:bg-red-400/10 transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
              <Button variant="glass" size="sm" onClick={() => { setShowKeyInput(showKeyInput === 'anthropic' ? null : 'anthropic'); setKeyInput(''); setShowKey(false); }}>
                {settings.has_own_anthropic_key ? 'Change' : 'Add Key'}
              </Button>
            </div>
          </div>

          {showKeyInput === 'anthropic' && (
            <div className="flex gap-2 pl-11">
              <div className="relative flex-1">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder="sk-ant-..."
                  className="w-full rounded-lg border border-white/[0.08] bg-transparent px-3 py-2 pr-8 text-[13px] text-white font-mono placeholder:text-white/20 focus:border-white/25 focus:outline-none"
                />
                <button onClick={() => setShowKey(!showKey)} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/50">
                  {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
              <Button variant="primary" size="sm" onClick={() => saveOwnKey('anthropic')} loading={keySaving} disabled={!keyInput.startsWith('sk-ant-')}>Save</Button>
              <Button variant="glass" size="sm" onClick={() => { setShowKeyInput(null); setKeyInput(''); }}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>

        <div className="mt-3 flex items-start gap-2 rounded-lg bg-white/[0.02] p-2.5">
          <Lock className="h-3.5 w-3.5 text-white/20 shrink-0 mt-0.5" />
          <p className="text-[11px] text-white/30">
            Keys are encrypted with AES-256 and never displayed in full. When you use your own key, no platform tokens are deducted.
          </p>
        </div>
      </Card>

      {/* Info card */}
      <Card className="!bg-white/[0.015]">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 shrink-0">
            <Info className="h-4.5 w-4.5 text-blue-400/60" />
          </div>
          <div>
            <p className="text-[13px] text-white/50 font-medium">How it works</p>
            <p className="text-[12px] text-white/30 mt-1 leading-relaxed">
              These settings are synced to your OpenClaw container. When you chat, your agent
              uses the configured model to process messages. All AI calls go through the platform
              proxy which tracks token usage. To test your settings, go to the home page and chat with your agent.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
