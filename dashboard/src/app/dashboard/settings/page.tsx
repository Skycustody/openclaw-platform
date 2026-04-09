'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardTitle, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import api from '@/lib/api';
import Link from 'next/link';
import {
  Settings, Key, Cpu, Save, Loader2,
  CheckCircle, AlertTriangle, Terminal, Globe, Store, ArrowRight,
} from 'lucide-react';

interface UserSettings {
  brain_mode: 'auto' | 'manual';
  manual_model: string | null;
  has_own_openrouter_key: boolean;
  agent_name: string;
  openrouter_key?: string;
  claude_code_enabled?: boolean;
  claude_code_path?: string;
  browser_relay_enabled?: boolean;
}

const MODEL_OPTIONS = [
  { value: 'anthropic/claude-sonnet-4', label: 'Claude Sonnet 4' },
  { value: 'anthropic/claude-opus-4', label: 'Claude Opus 4' },
  { value: 'openai/gpt-4o', label: 'GPT-4o' },
  { value: 'openai/o3', label: 'OpenAI o3' },
  { value: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  { value: 'deepseek/deepseek-r1', label: 'DeepSeek R1' },
];

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`
        relative inline-flex h-[22px] w-[40px] shrink-0 cursor-pointer items-center rounded-full border border-white/[0.08] transition-colors
        ${checked ? 'bg-white/20' : 'bg-white/[0.06]'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
    >
      <span
        className={`
          pointer-events-none inline-block h-[16px] w-[16px] rounded-full bg-white/80 shadow transition-transform
          ${checked ? 'translate-x-[20px]' : 'translate-x-[2px]'}
        `}
      />
    </button>
  );
}

function StatusDot({ active, label }: { active: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px]">
      <span className={`inline-block h-2 w-2 rounded-full ${active ? 'bg-emerald-400' : 'bg-white/20'}`} />
      <span className={active ? 'text-emerald-400/80' : 'text-white/50'}>{label}</span>
    </span>
  );
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<UserSettings | null>(null);

  // Model
  const [manualModel, setManualModel] = useState('');

  // API key
  const [openrouterKey, setOpenrouterKey] = useState('');

  // Claude Code
  const [claudeEnabled, setClaudeEnabled] = useState(false);
  const [claudePath, setClaudePath] = useState('');

  // Browser Relay
  const [browserRelayEnabled, setBrowserRelayEnabled] = useState(false);

  // Save states
  const [savingModel, setSavingModel] = useState(false);
  const [savedModel, setSavedModel] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [savedKey, setSavedKey] = useState(false);
  const [savingClaude, setSavingClaude] = useState(false);
  const [savedClaude, setSavedClaude] = useState(false);
  const [savingRelay, setSavingRelay] = useState(false);
  const [savedRelay, setSavedRelay] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const settingsRes = await api.get<{ settings: UserSettings }>('/settings');
      const s = settingsRes.settings;
      setSettings(s);
      setManualModel(s.manual_model || '');
      setClaudeEnabled(s.claude_code_enabled || false);
      setClaudePath(s.claude_code_path || '');
      setBrowserRelayEnabled(s.browser_relay_enabled || false);
    } catch (err: any) {
      setError(err.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSaveModel = async () => {
    setSavingModel(true);
    setSavedModel(false);
    try {
      await api.put('/settings', {
        brain_mode: 'manual',
        manual_model: manualModel || null,
      });
      setSavedModel(true);
      setTimeout(() => setSavedModel(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save model settings');
    } finally {
      setSavingModel(false);
    }
  };

  const handleSaveKey = async () => {
    setSavingKey(true);
    setSavedKey(false);
    try {
      await api.put('/settings', {
        openrouter_key: openrouterKey.trim(),
      });
      setSavedKey(true);
      setOpenrouterKey('');
      setTimeout(() => setSavedKey(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save API key');
    } finally {
      setSavingKey(false);
    }
  };

  const handleSaveClaude = async () => {
    setSavingClaude(true);
    setSavedClaude(false);
    try {
      await api.put('/settings', {
        claude_code_enabled: claudeEnabled,
        claude_code_path: claudePath.trim() || null,
      });
      setSavedClaude(true);
      setTimeout(() => setSavedClaude(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save Claude Code settings');
    } finally {
      setSavingClaude(false);
    }
  };

  const handleSaveRelay = async () => {
    setSavingRelay(true);
    setSavedRelay(false);
    try {
      await api.put('/settings', {
        browser_relay_enabled: browserRelayEnabled,
      });
      setSavedRelay(true);
      setTimeout(() => setSavedRelay(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save browser relay settings');
    } finally {
      setSavingRelay(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="animate-fade-up">
        <div className="flex items-center gap-3 mb-1">
          <Settings className="h-6 w-6 text-white/60" />
          <h1 className="text-[26px] font-bold text-white tracking-tight">Settings</h1>
        </div>
        <p className="text-[15px] text-white/60">
          Configure your model, API keys, and integrations.
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 animate-fade-up">
          <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
          <p className="text-[13px] text-red-400">{error}</p>
        </div>
      )}

      {/* Model Selection */}
      <Card className="animate-fade-up">
        <div className="flex items-start justify-between mb-5">
          <div>
            <CardTitle>Model</CardTitle>
            <CardDescription>
              Choose which AI model powers your agent.
            </CardDescription>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.06] border border-white/[0.08]">
            <Cpu className="h-4 w-4 text-white/60" />
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-[12px] text-white/50 block mb-1.5">Default Model</label>
            <select
              value={manualModel}
              onChange={e => setManualModel(e.target.value)}
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-[14px] text-white focus:border-white/25 focus:outline-none transition-colors appearance-none"
            >
              <option value="" className="bg-[#2a2a28]">Choose a model...</option>
              {MODEL_OPTIONS.map(m => (
                <option key={m.value} value={m.value} className="bg-[#2a2a28]">{m.label}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-end pt-1">
            <Button variant="primary" size="sm" onClick={handleSaveModel} loading={savingModel} disabled={savingModel}>
              {savedModel ? <CheckCircle className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
              {savedModel ? 'Saved' : 'Save Model'}
            </Button>
          </div>
        </div>
      </Card>

      {/* API Keys */}
      <Card className="animate-fade-up">
        <div className="flex items-start justify-between mb-5">
          <div>
            <CardTitle>API Key</CardTitle>
            <CardDescription>
              {settings?.has_own_openrouter_key
                ? 'You have a custom API key configured. Enter a new one to replace it.'
                : 'Bring your own OpenRouter API key for model access.'}
            </CardDescription>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.06] border border-white/[0.08]">
            <Key className="h-4 w-4 text-white/60" />
          </div>
        </div>

        <div className="space-y-4">
          <Input
            label="OpenRouter API Key"
            type="password"
            placeholder={settings?.has_own_openrouter_key ? 'sk-or-...  (key configured)' : 'sk-or-...'}
            value={openrouterKey}
            onChange={e => setOpenrouterKey(e.target.value)}
            hint="Your key is encrypted at rest. Leave blank to keep the existing key."
          />

          <div className="flex items-center justify-end pt-1">
            <Button
              variant="primary"
              size="sm"
              onClick={handleSaveKey}
              loading={savingKey}
              disabled={savingKey || !openrouterKey.trim()}
            >
              {savedKey ? <CheckCircle className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
              {savedKey ? 'Saved' : 'Save Key'}
            </Button>
          </div>
        </div>
      </Card>

      {/* Claude Code Connection */}
      <Card className="animate-fade-up">
        <div className="flex items-start justify-between mb-5">
          <div>
            <CardTitle>Claude Code Connection</CardTitle>
            <CardDescription>
              Connect Claude Code to use your Claude subscription through the agent.
            </CardDescription>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.06] border border-white/[0.08]">
            <Terminal className="h-4 w-4 text-white/60" />
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Toggle checked={claudeEnabled} onChange={setClaudeEnabled} />
              <span className="text-[13px] text-white/80">Enable Claude Code proxy</span>
            </div>
            <StatusDot active={claudeEnabled} label={claudeEnabled ? 'Connected' : 'Not connected'} />
          </div>

          {claudeEnabled && (
            <div>
              <label className="text-[12px] text-white/50 block mb-1.5">Claude Code Path</label>
              <input
                type="text"
                value={claudePath}
                onChange={e => setClaudePath(e.target.value)}
                placeholder="auto-detect"
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-[14px] text-white placeholder:text-white/20 focus:border-white/25 focus:outline-none transition-colors font-mono text-[13px]"
              />
              <p className="mt-1.5 text-[12px] text-white/40">Leave blank to auto-detect the Claude Code binary.</p>
            </div>
          )}

          <div className="flex items-center justify-end pt-1">
            <Button variant="primary" size="sm" onClick={handleSaveClaude} loading={savingClaude} disabled={savingClaude}>
              {savedClaude ? <CheckCircle className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
              {savedClaude ? 'Saved' : 'Save'}
            </Button>
          </div>
        </div>
      </Card>

      {/* Browser Relay */}
      <Card className="animate-fade-up">
        <div className="flex items-start justify-between mb-5">
          <div>
            <CardTitle>Browser Relay</CardTitle>
            <CardDescription>
              Allow agents to control a browser for web tasks.
            </CardDescription>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.06] border border-white/[0.08]">
            <Globe className="h-4 w-4 text-white/60" />
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Toggle checked={browserRelayEnabled} onChange={setBrowserRelayEnabled} />
              <span className="text-[13px] text-white/80">Enable browser automation</span>
            </div>
            <StatusDot active={browserRelayEnabled} label={browserRelayEnabled ? 'Running' : 'Stopped'} />
          </div>

          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3">
            <p className="text-[12px] text-white/40">
              Requires the Chrome extension. Allows your agent to navigate pages, fill forms, and extract data from websites.
            </p>
          </div>

          <div className="flex items-center justify-end pt-1">
            <Button variant="primary" size="sm" onClick={handleSaveRelay} loading={savingRelay} disabled={savingRelay}>
              {savedRelay ? <CheckCircle className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
              {savedRelay ? 'Saved' : 'Save'}
            </Button>
          </div>
        </div>
      </Card>

      {/* Agent Store */}
      <Card className="animate-fade-up">
        <div className="flex items-start justify-between mb-5">
          <div>
            <CardTitle>Agent Store</CardTitle>
            <CardDescription>
              Install pre-built agents for marketing, sales, development, and more.
            </CardDescription>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.06] border border-white/[0.08]">
            <Store className="h-4 w-4 text-white/60" />
          </div>
        </div>

        <Link
          href="/dashboard/agents"
          className="inline-flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-5 py-3 text-[13px] font-medium text-white/70 hover:text-white hover:bg-white/[0.06] hover:border-white/[0.12] transition-all"
        >
          Browse Agent Store
          <ArrowRight className="h-4 w-4" />
        </Link>
      </Card>
    </div>
  );
}
