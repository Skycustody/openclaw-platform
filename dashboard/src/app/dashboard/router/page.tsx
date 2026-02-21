'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Card, CardTitle, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import api from '@/lib/api';
import {
  Cpu, Zap, Brain, Send, Loader2, CheckCircle, AlertCircle,
  Coins, Key, Eye, EyeOff, Trash2, Lock, Sparkles, ArrowRight,
  ChevronDown, X,
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

interface AutoStep {
  step: number;
  action: string;
  model: string;
  reasoning: string;
  result: string;
  tokensUsed: number;
}

interface AutoResult {
  taskId: string;
  status: 'completed' | 'stopped' | 'error';
  steps: AutoStep[];
  totalTokens: number;
  finalAnswer: string;
  error?: string;
}

const PIPELINE_STEPS = [
  {
    num: '1',
    title: 'Classify',
    desc: 'A tiny, cheap AI (gpt-4o-mini) reads your task and figures out how complex it is — simple question, research task, deep analysis, code, etc.',
    model: 'gpt-4o-mini',
    cost: '$0.15/1M',
    color: 'text-blue-400',
    bg: 'bg-blue-500/20',
  },
  {
    num: '2',
    title: 'Draft',
    desc: 'Claude Sonnet writes a thorough first response. Sonnet is already very capable — most of the heavy lifting happens here.',
    model: 'claude-sonnet-4-6',
    cost: '$3/1M',
    color: 'text-purple-400',
    bg: 'bg-purple-500/20',
  },
  {
    num: '3',
    title: 'Critique',
    desc: 'The cheap AI reviews the draft like an editor — finding errors, gaps, weak reasoning, and missing perspectives.',
    model: 'gpt-4o-mini',
    cost: '$0.15/1M',
    color: 'text-amber-400',
    bg: 'bg-amber-500/20',
  },
  {
    num: '4',
    title: 'Refine',
    desc: 'Sonnet rewrites the response from scratch, addressing every critique. The result matches Opus quality at ~80% less cost.',
    model: 'claude-sonnet-4-6',
    cost: '$3/1M',
    color: 'text-green-400',
    bg: 'bg-green-500/20',
  },
];

export default function RouterPage() {
  const [models, setModels] = useState<Model[]>([]);
  const [settings, setSettings] = useState<Settings>({
    brain_mode: 'auto', manual_model: null,
    has_own_openai_key: false, own_openai_key_masked: null,
    has_own_anthropic_key: false, own_anthropic_key_masked: null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [balance, setBalance] = useState(0);

  // Own key inputs
  const [showKeyInput, setShowKeyInput] = useState<'openai' | 'anthropic' | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [keySaving, setKeySaving] = useState(false);

  // Auto mode chat
  const [task, setTask] = useState('');
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<AutoStep[]>([]);
  const [finalResult, setFinalResult] = useState<AutoResult | null>(null);
  const [currentTokens, setCurrentTokens] = useState(0);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(async () => {
    try {
      const [modelsRes, settingsRes, tokensRes] = await Promise.all([
        api.get<{ models: Model[] }>('/router/models'),
        api.get<{ settings: any }>('/settings'),
        api.get<{ balance: number }>('/tokens/balance'),
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
      setBalance(tokensRes.balance || 0);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [steps, finalResult]);

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

  const runTask = async () => {
    if (!task.trim() || running) return;
    setRunning(true);
    setSteps([]);
    setFinalResult(null);
    setCurrentTokens(0);

    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/auto/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ task: task.trim() }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setFinalResult({
          taskId: '', status: 'error', steps: [], totalTokens: 0, finalAnswer: '',
          error: err.error?.message || err.error || 'Request failed',
        });
        setRunning(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No reader');
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            if (event.type === 'step') {
              setSteps(prev => [...prev, event.step]);
              setCurrentTokens(event.totalTokens);
              setBalance(event.balance);
            } else if (event.type === 'result') {
              setFinalResult(event);
              setCurrentTokens(event.totalTokens);
            }
          } catch {}
        }
      }
      if (buffer.trim()) {
        try {
          const event = JSON.parse(buffer);
          if (event.type === 'result') setFinalResult(event);
        } catch {}
      }
    } catch (err: any) {
      setFinalResult({
        taskId: '', status: 'error', steps: [], totalTokens: 0, finalAnswer: '',
        error: err.message || 'Connection failed',
      });
    }
    setRunning(false);
    fetchData();
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
        <h1 className="text-[26px] font-bold text-white tracking-tight">Brain Router</h1>
        <p className="mt-1 text-[15px] text-white/40">
          Choose how your agent thinks — auto mode for smart routing, or pick a specific model
        </p>
      </div>

      {/* ── Mode Toggle ── */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card
          className={`cursor-pointer transition-all ${settings.brain_mode === 'auto' ? '!border-green-500/30 !bg-green-500/[0.04]' : 'hover:!border-white/15'}`}
          onClick={() => updateBrain('auto')}
        >
          <div className="flex items-start gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${settings.brain_mode === 'auto' ? 'bg-green-500/20' : 'bg-white/[0.06]'}`}>
              <Sparkles className={`h-5 w-5 ${settings.brain_mode === 'auto' ? 'text-green-400' : 'text-white/40'}`} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <CardTitle>Auto Mode</CardTitle>
                {settings.brain_mode === 'auto' && <Badge variant="green">Active</Badge>}
              </div>
              <CardDescription className="mt-1">
                Opus-quality responses at 80% less cost. Uses a draft-critique-refine pipeline with cheaper models to match Opus depth.
              </CardDescription>
            </div>
          </div>
        </Card>

        <Card
          className={`cursor-pointer transition-all ${settings.brain_mode === 'manual' ? '!border-blue-500/30 !bg-blue-500/[0.04]' : 'hover:!border-white/15'}`}
          onClick={() => updateBrain('manual', settings.manual_model || models[0]?.name)}
        >
          <div className="flex items-start gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${settings.brain_mode === 'manual' ? 'bg-blue-500/20' : 'bg-white/[0.06]'}`}>
              <Brain className={`h-5 w-5 ${settings.brain_mode === 'manual' ? 'text-blue-400' : 'text-white/40'}`} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <CardTitle>Manual Mode</CardTitle>
                {settings.brain_mode === 'manual' && <Badge variant="blue">Active</Badge>}
              </div>
              <CardDescription className="mt-1">
                Pick one model for everything. Full control over which AI handles your tasks.
              </CardDescription>
            </div>
          </div>
        </Card>
      </div>

      {/* ── Manual Model Selector ── */}
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

      {/* ── Own API Keys ── */}
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <Key className="h-4 w-4 text-white/40" />
          <CardTitle>Your Own API Keys</CardTitle>
          <Badge variant="default">Optional</Badge>
        </div>
        <CardDescription className="mb-4">
          Bring your own OpenAI or Anthropic key to skip platform token usage. Your keys are encrypted and never visible to anyone.
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
            Keys are encrypted with AES-256 and never displayed in full. When you use your own key, no platform tokens are deducted — you pay the provider directly. Your keys cannot be accessed by anyone, including through CLI or container environments.
          </p>
        </div>
      </Card>

      {/* ── Run a Task ── */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-white/40" />
            <CardTitle>Run a Task</CardTitle>
            {settings.brain_mode === 'auto' && <Badge variant="green">Auto Pipeline</Badge>}
            {settings.brain_mode === 'manual' && <Badge variant="blue">{settings.manual_model}</Badge>}
          </div>
          <div className="flex items-center gap-2 text-[12px] text-white/40">
            <Coins className="h-3.5 w-3.5" />
            {balance.toLocaleString()} tokens
          </div>
        </div>

        {/* Steps output */}
        {steps.length > 0 && (
          <div className="mb-4 space-y-2 max-h-[500px] overflow-y-auto custom-scrollbar pr-1">
            {steps.map((s, i) => (
              <div key={i} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/[0.08] text-[10px] font-bold text-white/60 shrink-0">{s.step}</span>
                    <span className="text-[12px] font-medium text-white/70 truncate">{s.action}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <Badge>{s.model.length > 18 ? s.model.slice(0, 15) + '...' : s.model}</Badge>
                    <span className="text-[10px] text-white/30">{s.tokensUsed.toLocaleString()}</span>
                  </div>
                </div>
                <p className="text-[11px] text-white/25 mb-1">{s.reasoning}</p>
                <div className="text-[13px] text-white/60 whitespace-pre-wrap leading-relaxed max-h-[150px] overflow-y-auto custom-scrollbar">
                  {s.result}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
        )}

        {/* Final result */}
        {finalResult && (
          <div className={`mb-4 rounded-lg border p-4 ${
            finalResult.status === 'completed'
              ? 'border-green-500/20 bg-green-500/[0.03]'
              : finalResult.status === 'stopped'
              ? 'border-amber-500/20 bg-amber-500/[0.03]'
              : 'border-red-500/20 bg-red-500/[0.03]'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              {finalResult.status === 'completed' ? (
                <CheckCircle className="h-4 w-4 text-green-400" />
              ) : (
                <AlertCircle className="h-4 w-4 text-amber-400" />
              )}
              <span className={`text-[13px] font-semibold ${
                finalResult.status === 'completed' ? 'text-green-400' : 'text-amber-400'
              }`}>
                {finalResult.status === 'completed' ? 'Complete' : finalResult.status === 'stopped' ? 'Stopped' : 'Error'}
              </span>
              <span className="text-[11px] text-white/30 ml-auto">
                {finalResult.totalTokens.toLocaleString()} tokens
              </span>
            </div>
            {finalResult.error && (
              <p className="text-[13px] text-red-400 mb-2">{finalResult.error}</p>
            )}
            {finalResult.finalAnswer && (
              <div className="text-[13px] text-white/70 whitespace-pre-wrap leading-relaxed max-h-[400px] overflow-y-auto custom-scrollbar">
                {finalResult.finalAnswer}
              </div>
            )}
          </div>
        )}

        {/* Input */}
        <div className="flex gap-2">
          <input
            type="text"
            value={task}
            onChange={(e) => setTask(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && runTask()}
            placeholder="Ask anything... the auto pipeline will handle the rest"
            disabled={running}
            className="flex-1 rounded-lg border border-white/[0.08] bg-transparent px-4 py-2.5 text-[14px] text-white placeholder:text-white/25 focus:border-white/25 focus:outline-none disabled:opacity-50 transition-colors"
          />
          <Button variant="primary" size="md" onClick={runTask} loading={running} disabled={!task.trim() || running}>
            {running ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" />Running</>
            ) : (
              <><Send className="h-3.5 w-3.5" />Run</>
            )}
          </Button>
        </div>

        {running && currentTokens > 0 && (
          <div className="mt-2 flex items-center gap-2 text-[11px] text-white/30">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>{currentTokens.toLocaleString()} tokens used</span>
            <span className="text-white/10">|</span>
            <span>{balance.toLocaleString()} remaining</span>
          </div>
        )}
      </Card>

      {/* ── How Auto Mode Works ── */}
      {settings.brain_mode === 'auto' && (
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="h-4 w-4 text-green-400" />
            <CardTitle>How Auto Mode Gets Opus Quality at 80% Less Cost</CardTitle>
          </div>
          <CardDescription className="mb-4">
            Instead of sending everything to Claude Opus ($30/1M tokens), we run a multi-model pipeline. Simple tasks go straight to the cheapest model. Complex tasks get drafted, critiqued, and refined — matching Opus depth at a fraction of the price.
          </CardDescription>

          <div className="space-y-2">
            {PIPELINE_STEPS.map((ps) => (
              <div key={ps.num} className="flex items-start gap-3 rounded-lg bg-white/[0.02] p-3">
                <span className={`flex h-7 w-7 items-center justify-center rounded-full ${ps.bg} ${ps.color} text-[12px] font-bold shrink-0`}>{ps.num}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-[13px] font-semibold ${ps.color}`}>{ps.title}</span>
                    <span className="text-[10px] text-white/20 font-mono">{ps.model}</span>
                    <span className="text-[10px] text-white/15">{ps.cost}</span>
                  </div>
                  <p className="text-[12px] text-white/40 mt-0.5">{ps.desc}</p>
                </div>
                {parseInt(ps.num) < 4 && <ArrowRight className="h-3.5 w-3.5 text-white/10 shrink-0 mt-1.5" />}
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-lg border border-green-500/10 bg-green-500/[0.03] p-3">
            <div className="flex items-center gap-2 mb-1">
              <Coins className="h-3.5 w-3.5 text-green-400" />
              <span className="text-[12px] font-semibold text-green-400">Cost comparison</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-[12px]">
              <div>
                <p className="text-white/30">Opus direct</p>
                <p className="text-white/60 font-semibold">~$30/1M tokens</p>
              </div>
              <div>
                <p className="text-white/30">Auto pipeline</p>
                <p className="text-green-400 font-semibold">~$6/1M tokens</p>
              </div>
            </div>
            <p className="text-[11px] text-white/25 mt-2">Simple tasks use only the $0.15/1M model. The full pipeline only runs for medium/complex tasks.</p>
          </div>
        </Card>
      )}
    </div>
  );
}
