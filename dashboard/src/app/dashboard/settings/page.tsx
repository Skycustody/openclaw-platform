'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardTitle, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import api from '@/lib/api';
import {
  Settings, Key, Bot, Cpu, Save, Loader2,
  CheckCircle, AlertTriangle,
} from 'lucide-react';

interface Agent {
  id: string;
  name: string;
  purpose: string | null;
  instructions: string | null;
  is_primary: boolean;
}

interface UserSettings {
  brain_mode: 'auto' | 'manual';
  manual_model: string | null;
  has_own_openrouter_key: boolean;
  agent_name: string;
  openrouter_key?: string;
}

const MODEL_OPTIONS = [
  { value: 'auto', label: 'Auto (recommended)' },
  { value: 'anthropic/claude-sonnet-4', label: 'Claude Sonnet 4' },
  { value: 'anthropic/claude-opus-4', label: 'Claude Opus 4' },
  { value: 'openai/gpt-4o', label: 'GPT-4o' },
  { value: 'openai/o3', label: 'OpenAI o3' },
  { value: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  { value: 'deepseek/deepseek-r1', label: 'DeepSeek R1' },
];

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);

  // Persona fields
  const [agentName, setAgentName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [instructions, setInstructions] = useState('');

  // Model
  const [brainMode, setBrainMode] = useState<'auto' | 'manual'>('auto');
  const [manualModel, setManualModel] = useState('');

  // API key
  const [openrouterKey, setOpenrouterKey] = useState('');

  // Save states
  const [savingPersona, setSavingPersona] = useState(false);
  const [savedPersona, setSavedPersona] = useState(false);
  const [savingModel, setSavingModel] = useState(false);
  const [savedModel, setSavedModel] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [savedKey, setSavedKey] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [settingsRes, agentsRes] = await Promise.allSettled([
        api.get<{ settings: UserSettings }>('/settings'),
        api.get<{ agents: Agent[] }>('/agents'),
      ]);

      if (settingsRes.status === 'fulfilled') {
        const s = settingsRes.value.settings;
        setSettings(s);
        setBrainMode(s.brain_mode || 'auto');
        setManualModel(s.manual_model || '');
      }

      if (agentsRes.status === 'fulfilled') {
        const list = agentsRes.value.agents || [];
        setAgents(list);
        const primary = list.find(a => a.is_primary) || list[0];
        if (primary) {
          setSelectedAgent(primary);
          setAgentName(primary.name || '');
          setPurpose(primary.purpose || '');
          setInstructions(primary.instructions || '');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const selectAgent = (agent: Agent) => {
    setSelectedAgent(agent);
    setAgentName(agent.name || '');
    setPurpose(agent.purpose || '');
    setInstructions(agent.instructions || '');
    setSavedPersona(false);
    setError(null);
  };

  const handleSavePersona = async () => {
    if (!selectedAgent) return;
    setSavingPersona(true);
    setError(null);
    setSavedPersona(false);
    try {
      await api.put(`/agents/${selectedAgent.id}`, {
        name: agentName.trim() || selectedAgent.name,
        purpose: purpose.trim() || null,
        instructions: instructions.trim() || null,
      });
      setSavedPersona(true);
      setTimeout(() => setSavedPersona(false), 3000);
      const data = await api.get<{ agents: Agent[] }>('/agents');
      setAgents(data.agents || []);
    } catch (err: any) {
      setError(err.message || 'Failed to save persona');
    } finally {
      setSavingPersona(false);
    }
  };

  const handleSaveModel = async () => {
    setSavingModel(true);
    setSavedModel(false);
    try {
      await api.put('/settings', {
        brain_mode: brainMode,
        manual_model: brainMode === 'manual' ? manualModel : null,
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
          <Settings className="h-6 w-6 text-white/40" />
          <h1 className="text-[26px] font-bold text-white tracking-tight">Settings</h1>
        </div>
        <p className="text-[15px] text-white/40">
          Configure your agent, model, and API keys in one place.
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 animate-fade-up">
          <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
          <p className="text-[13px] text-red-400">{error}</p>
        </div>
      )}

      {/* Agent Persona */}
      <Card className="animate-fade-up">
        <div className="flex items-start justify-between mb-5">
          <div>
            <CardTitle>Agent Persona</CardTitle>
            <CardDescription>
              Name, role, and personality of your agent. Writes to the agent&apos;s SOUL.md.
            </CardDescription>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.06] border border-white/[0.08]">
            <Bot className="h-4 w-4 text-white/50" />
          </div>
        </div>

        {/* Agent selector tabs */}
        {agents.length > 1 && (
          <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
            {agents.map(agent => (
              <button
                key={agent.id}
                onClick={() => selectAgent(agent)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all text-[13px] shrink-0 ${
                  selectedAgent?.id === agent.id
                    ? 'border-white/20 bg-white/[0.06] text-white'
                    : 'border-white/[0.06] bg-white/[0.02] text-white/40 hover:text-white/60 hover:border-white/10'
                }`}
              >
                <Bot className="h-3.5 w-3.5" />
                {agent.name}
              </button>
            ))}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="text-[12px] text-white/30 block mb-1.5">Agent Name</label>
            <input
              type="text"
              value={agentName}
              onChange={e => setAgentName(e.target.value)}
              placeholder="e.g. Atlas, Aria, Research Bot"
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-[14px] text-white placeholder:text-white/20 focus:border-white/25 focus:outline-none transition-colors"
            />
          </div>

          <div>
            <label className="text-[12px] text-white/30 block mb-1.5">Purpose / Role</label>
            <textarea
              value={purpose}
              onChange={e => setPurpose(e.target.value)}
              placeholder="What is this agent's primary role?"
              rows={2}
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-[14px] text-white placeholder:text-white/20 focus:border-white/25 focus:outline-none resize-none transition-colors"
            />
          </div>

          <div>
            <label className="text-[12px] text-white/30 block mb-1.5">Instructions / Rules</label>
            <textarea
              value={instructions}
              onChange={e => setInstructions(e.target.value)}
              placeholder="Tone, rules, context. e.g. Always be concise. Prefer bullet points..."
              rows={4}
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-[14px] text-white placeholder:text-white/20 focus:border-white/25 focus:outline-none resize-none transition-colors font-mono text-[13px]"
            />
          </div>

          <div className="flex items-center justify-end pt-1">
            <Button variant="primary" size="sm" onClick={handleSavePersona} loading={savingPersona} disabled={savingPersona}>
              {savedPersona ? <CheckCircle className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
              {savedPersona ? 'Saved' : 'Save Persona'}
            </Button>
          </div>
        </div>
      </Card>

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
            <Cpu className="h-4 w-4 text-white/50" />
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setBrainMode('auto')}
              className={`px-4 py-2.5 rounded-xl border text-[13px] font-medium transition-all ${
                brainMode === 'auto'
                  ? 'border-white/20 bg-white/[0.08] text-white'
                  : 'border-white/[0.06] bg-white/[0.02] text-white/40 hover:text-white/60 hover:border-white/10'
              }`}
            >
              Auto (recommended)
            </button>
            <button
              onClick={() => setBrainMode('manual')}
              className={`px-4 py-2.5 rounded-xl border text-[13px] font-medium transition-all ${
                brainMode === 'manual'
                  ? 'border-white/20 bg-white/[0.08] text-white'
                  : 'border-white/[0.06] bg-white/[0.02] text-white/40 hover:text-white/60 hover:border-white/10'
              }`}
            >
              Manual
            </button>
          </div>

          {brainMode === 'manual' && (
            <div>
              <label className="text-[12px] text-white/30 block mb-1.5">Select Model</label>
              <select
                value={manualModel}
                onChange={e => setManualModel(e.target.value)}
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-[14px] text-white focus:border-white/25 focus:outline-none transition-colors appearance-none"
              >
                <option value="" className="bg-black">Choose a model...</option>
                {MODEL_OPTIONS.filter(m => m.value !== 'auto').map(m => (
                  <option key={m.value} value={m.value} className="bg-black">{m.label}</option>
                ))}
              </select>
            </div>
          )}

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
                : 'Optionally bring your own OpenRouter API key for model access.'}
            </CardDescription>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.06] border border-white/[0.08]">
            <Key className="h-4 w-4 text-white/50" />
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
    </div>
  );
}
