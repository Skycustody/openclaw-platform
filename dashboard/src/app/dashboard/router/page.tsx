'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Card, CardTitle, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import api from '@/lib/api';
import {
  Cpu, Zap, Brain, Send, Loader2, CheckCircle, AlertCircle,
  ChevronDown, Coins, ArrowRight,
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

interface BrainSettings {
  brain_mode: 'auto' | 'manual';
  manual_model: string | null;
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

export default function RouterPage() {
  const [models, setModels] = useState<Model[]>([]);
  const [settings, setSettings] = useState<BrainSettings>({ brain_mode: 'auto', manual_model: null });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [balance, setBalance] = useState(0);

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
        api.get<{ settings: BrainSettings }>('/settings'),
        api.get<{ balance: number }>('/tokens/balance'),
      ]);
      setModels(modelsRes.models || []);
      if (settingsRes.settings) {
        setSettings({
          brain_mode: (settingsRes.settings as any).brain_mode || 'auto',
          manual_model: (settingsRes.settings as any).manual_model || null,
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
      setSettings({ brain_mode: mode, manual_model: model || null });
    } catch {}
    setSaving(false);
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
          taskId: '',
          status: 'error',
          steps: [],
          totalTokens: 0,
          finalAnswer: '',
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

      // Process remaining buffer
      if (buffer.trim()) {
        try {
          const event = JSON.parse(buffer);
          if (event.type === 'result') setFinalResult(event);
        } catch {}
      }
    } catch (err: any) {
      setFinalResult({
        taskId: '',
        status: 'error',
        steps: [],
        totalTokens: 0,
        finalAnswer: '',
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
          Control how your agent picks AI models and run tasks directly
        </p>
      </div>

      {/* Mode Toggle */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card
          className={`cursor-pointer transition-all ${settings.brain_mode === 'auto' ? '!border-white/30 !bg-white/[0.06]' : 'hover:!border-white/15'}`}
          onClick={() => updateBrain('auto')}
        >
          <div className="flex items-start gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${settings.brain_mode === 'auto' ? 'bg-green-500/20' : 'bg-white/[0.06]'}`}>
              <Zap className={`h-5 w-5 ${settings.brain_mode === 'auto' ? 'text-green-400' : 'text-white/40'}`} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <CardTitle>Auto Mode</CardTitle>
                {settings.brain_mode === 'auto' && <Badge variant="green">Active</Badge>}
              </div>
              <CardDescription className="mt-1">
                Smart router picks the best model for each task. Cheap models for simple tasks, powerful models for complex ones. Saves 80-95% on token costs.
              </CardDescription>
            </div>
          </div>
        </Card>

        <Card
          className={`cursor-pointer transition-all ${settings.brain_mode === 'manual' ? '!border-white/30 !bg-white/[0.06]' : 'hover:!border-white/15'}`}
          onClick={() => updateBrain('manual', settings.manual_model || models[0]?.name)}
        >
          <div className="flex items-start gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${settings.brain_mode === 'manual' ? 'bg-blue-500/20' : 'bg-white/[0.06]'}`}>
              <Brain className={`h-5 w-5 ${settings.brain_mode === 'manual' ? 'text-blue-400' : 'text-white/40'}`} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <CardTitle>Manual Mode</CardTitle>
                {settings.brain_mode === 'manual' && <Badge variant="green">Active</Badge>}
              </div>
              <CardDescription className="mt-1">
                Always use one specific model for every task. Full control, but may cost more for simple tasks.
              </CardDescription>
            </div>
          </div>
        </Card>
      </div>

      {/* Manual Model Selector */}
      {settings.brain_mode === 'manual' && (
        <Card>
          <CardTitle className="mb-3">Select Model</CardTitle>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {models.map((m) => (
              <button
                key={m.name}
                onClick={() => updateBrain('manual', m.name)}
                className={`flex flex-col gap-1 rounded-lg border p-3 text-left transition-all ${
                  settings.manual_model === m.name
                    ? 'border-white/30 bg-white/[0.06]'
                    : 'border-white/[0.06] bg-white/[0.02] hover:border-white/15'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-medium text-white/80">{m.displayName}</span>
                  <Badge>{m.speed === 'very_fast' ? 'Fast' : m.speed === 'fast' ? 'Med' : 'Slow'}</Badge>
                </div>
                <span className="text-[11px] text-white/30">{m.name}</span>
                <div className="flex items-center gap-2 mt-1 text-[11px] text-white/40">
                  <span>${m.retailPrice}/1M tokens</span>
                  {m.internet && <span className="text-blue-400">Web</span>}
                  {m.vision && <span className="text-purple-400">Vision</span>}
                  {m.deepAnalysis && <span className="text-amber-400">Deep</span>}
                </div>
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* Auto Run — Chat-like interface */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-white/40" />
            <CardTitle>Run a Task</CardTitle>
          </div>
          <div className="flex items-center gap-2 text-[12px] text-white/40">
            <Coins className="h-3.5 w-3.5" />
            {balance.toLocaleString()} tokens
          </div>
        </div>

        {/* Steps output */}
        {steps.length > 0 && (
          <div className="mb-4 space-y-3 max-h-[500px] overflow-y-auto custom-scrollbar pr-1">
            {steps.map((s, i) => (
              <div key={i} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/[0.08] text-[10px] font-bold text-white/60">{s.step}</span>
                    <span className="text-[12px] font-medium text-white/70">{s.action.slice(0, 80)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge>{s.model}</Badge>
                    <span className="text-[10px] text-white/30">{s.tokensUsed.toLocaleString()} tok</span>
                  </div>
                </div>
                <p className="text-[11px] text-white/30 mb-2">{s.reasoning}</p>
                <div className="text-[13px] text-white/60 whitespace-pre-wrap leading-relaxed max-h-[200px] overflow-y-auto custom-scrollbar">
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
              ? 'border-green-500/20 bg-green-500/5'
              : finalResult.status === 'stopped'
              ? 'border-amber-500/20 bg-amber-500/5'
              : 'border-red-500/20 bg-red-500/5'
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
                {finalResult.status === 'completed' ? 'Task Complete' : finalResult.status === 'stopped' ? 'Task Stopped' : 'Error'}
              </span>
              <span className="text-[11px] text-white/30 ml-auto">
                {finalResult.totalTokens.toLocaleString()} tokens used
              </span>
            </div>
            {finalResult.error && (
              <p className="text-[13px] text-red-400 mb-2">{finalResult.error}</p>
            )}
            {finalResult.finalAnswer && (
              <div className="text-[13px] text-white/70 whitespace-pre-wrap leading-relaxed max-h-[300px] overflow-y-auto custom-scrollbar">
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
            placeholder="Describe a task... e.g. &quot;Research the top 5 AI startups in 2026&quot;"
            disabled={running}
            className="flex-1 rounded-lg border border-white/[0.08] bg-transparent px-4 py-2.5 text-[14px] text-white placeholder:text-white/25 focus:border-white/25 focus:outline-none disabled:opacity-50 transition-colors"
          />
          <Button
            variant="primary"
            size="md"
            onClick={runTask}
            loading={running}
            disabled={!task.trim() || running}
          >
            {running ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Running...
              </>
            ) : (
              <>
                <Send className="h-3.5 w-3.5" />
                Run
              </>
            )}
          </Button>
        </div>

        {running && currentTokens > 0 && (
          <div className="mt-2 flex items-center gap-2 text-[11px] text-white/30">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>{currentTokens.toLocaleString()} tokens used so far</span>
            <span className="text-white/15">|</span>
            <span>{balance.toLocaleString()} remaining</span>
          </div>
        )}
      </Card>

      {/* How it works */}
      <Card>
        <CardTitle className="mb-3">How Auto Mode Works</CardTitle>
        <div className="space-y-2">
          {[
            ['1', 'You describe a task in plain language.', 'text-blue-400', 'bg-blue-500/20'],
            ['2', 'A small, cheap AI (gpt-4o-mini) analyzes the task complexity and creates a plan.', 'text-purple-400', 'bg-purple-500/20'],
            ['3', 'For each step, the smart router picks the best model — cheap for simple work, powerful for complex.', 'text-green-400', 'bg-green-500/20'],
            ['4', 'Each step checks your token balance first. If you run low, it stops and tells you.', 'text-amber-400', 'bg-amber-500/20'],
            ['5', 'Results from each step feed into the next, building up context like a real assistant.', 'text-cyan-400', 'bg-cyan-500/20'],
          ].map(([num, text, textColor, bgColor]) => (
            <div key={num} className="flex items-start gap-3 p-2.5 rounded-lg bg-white/[0.02]">
              <span className={`flex h-6 w-6 items-center justify-center rounded-full ${bgColor} ${textColor} text-[11px] font-bold shrink-0`}>{num}</span>
              <p className="text-[12px] text-white/50">{text}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
