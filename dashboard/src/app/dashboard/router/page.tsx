'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardTitle, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import api from '@/lib/api';
import {
  Brain, Loader2,
  Key, Eye, EyeOff, Trash2, Lock, Sparkles, Info, X, ExternalLink,
  Zap, TrendingDown, Settings2, RotateCcw, Check, Code, Globe, Calculator,
  Search, Pen, ImageIcon, FileText, Terminal, MessageSquare, Cpu, Layers,
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

interface TaskCategory {
  key: string;
  label: string;
  description: string;
  defaultModel: string;
  ruleNumber: number;
}

interface CategoryModel {
  id: string;
  displayName: string;
  costPer1MTokens: number;
  retailPrice: number;
}

interface Settings {
  brain_mode: 'auto' | 'manual';
  manual_model: string | null;
  has_own_openrouter_key: boolean;
  own_openrouter_key_masked: string | null;
  routing_preferences: Record<string, string>;
}

interface RoutingEntry {
  id: string;
  message_preview: string;
  model_selected: string;
  reason: string;
  tokens_saved: number;
  classification: string;
  created_at: string;
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  greeting:      <MessageSquare className="h-4 w-4" />,
  browser:       <Globe className="h-4 w-4" />,
  coding:        <Code className="h-4 w-4" />,
  math:          <Calculator className="h-4 w-4" />,
  research:      <Search className="h-4 w-4" />,
  creative:      <Pen className="h-4 w-4" />,
  vision:        <ImageIcon className="h-4 w-4" />,
  large_context: <FileText className="h-4 w-4" />,
  general:       <Layers className="h-4 w-4" />,
  shell:         <Terminal className="h-4 w-4" />,
  messaging:     <MessageSquare className="h-4 w-4" />,
  complex:       <Cpu className="h-4 w-4" />,
};

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export default function RouterPage() {
  const [models, setModels] = useState<Model[]>([]);
  const [categories, setCategories] = useState<TaskCategory[]>([]);
  const [categoryModels, setCategoryModels] = useState<CategoryModel[]>([]);
  const [settings, setSettings] = useState<Settings>({
    brain_mode: 'auto', manual_model: null,
    has_own_openrouter_key: false, own_openrouter_key_masked: null,
    routing_preferences: {},
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [showKeyInput, setShowKeyInput] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [keySaving, setKeySaving] = useState(false);
  const [routingHistory, setRoutingHistory] = useState<RoutingEntry[]>([]);
  const [tokensSaved, setTokensSaved] = useState(0);

  const [prefsDraft, setPrefsDraft] = useState<Record<string, string>>({});
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [prefsSaved, setPrefsSaved] = useState(false);
  const [showPrefs, setShowPrefs] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [modelsRes, settingsRes, historyRes, savingsRes, catRes] = await Promise.all([
        api.get<{ models: Model[] }>('/router/models'),
        api.get<{ settings: any }>('/settings'),
        api.get<{ history: RoutingEntry[] }>('/router/history?limit=10').catch(() => ({ history: [] })),
        api.get<{ tokensSavedThisMonth: number }>('/router/savings').catch(() => ({ tokensSavedThisMonth: 0 })),
        api.get<{ categories: TaskCategory[]; models: CategoryModel[] }>('/router/categories').catch(() => ({ categories: [], models: [] })),
      ]);
      setModels(modelsRes.models || []);
      setCategories(catRes.categories || []);
      setCategoryModels(catRes.models || []);
      setRoutingHistory(historyRes.history || []);
      setTokensSaved(savingsRes.tokensSavedThisMonth || 0);
      if (settingsRes.settings) {
        const s = settingsRes.settings;
        const prefs = s.routing_preferences || {};
        setSettings({
          brain_mode: s.brain_mode || 'auto',
          manual_model: s.manual_model || null,
          has_own_openrouter_key: !!s.has_own_openrouter_key,
          own_openrouter_key_masked: s.own_openrouter_key_masked || null,
          routing_preferences: prefs,
        });
        setPrefsDraft(prefs);
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

  const saveOwnKey = async () => {
    if (!keyInput.trim()) return;
    setKeySaving(true);
    try {
      await api.put('/settings/own-openrouter-key', { key: keyInput });
      setKeyInput('');
      setShowKeyInput(false);
      fetchData();
    } catch (err: any) {
      alert(err.message || 'Failed to save key');
    }
    setKeySaving(false);
  };

  const deleteOwnKey = async () => {
    if (!confirm('Remove your OpenRouter key? Your agent will switch back to using the included AI budget.')) return;
    try {
      await api.delete('/settings/own-openrouter-key');
      fetchData();
    } catch {}
  };

  const savePrefs = async () => {
    setPrefsSaving(true);
    try {
      await api.put('/settings/routing-preferences', { preferences: prefsDraft });
      setSettings(prev => ({ ...prev, routing_preferences: { ...prefsDraft } }));
      setPrefsSaved(true);
      setTimeout(() => setPrefsSaved(false), 2000);
    } catch (err: any) {
      alert(err.message || 'Failed to save preferences');
    }
    setPrefsSaving(false);
  };

  const resetAllPrefs = () => {
    setPrefsDraft({});
  };

  const prefsChanged = JSON.stringify(prefsDraft) !== JSON.stringify(settings.routing_preferences);

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
                  An AI reads each message and picks the best model. Simple chats use cheap models, complex tasks use powerful ones.
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

      {/* Smart Routing Activity */}
      {settings.brain_mode === 'auto' && (
        <div className="space-y-4">
          {tokensSaved > 0 && (
            <Card className="!border-green-500/20 !bg-green-500/[0.03]">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-500/20">
                  <TrendingDown className="h-5 w-5 text-green-400" />
                </div>
                <div>
                  <p className="text-[15px] font-semibold text-green-400">
                    {(tokensSaved / 1000).toFixed(0)}K tokens saved this month
                  </p>
                  <p className="text-[12px] text-white/40">
                    Smart routing picks the cheapest capable model for each task
                  </p>
                </div>
              </div>
            </Card>
          )}

          {routingHistory.length > 0 && (
            <Card>
              <div className="flex items-center gap-2 mb-3">
                <Zap className="h-4 w-4 text-amber-400" />
                <CardTitle>Recent Routing Decisions</CardTitle>
              </div>
              <div className="space-y-1.5">
                {routingHistory.map((entry) => {
                  const modelShort = entry.model_selected.split('/').pop() || entry.model_selected;
                  const timeAgo = formatTimeAgo(entry.created_at);
                  let routerLabel = '';
                  try {
                    const cls = JSON.parse(entry.classification || '{}');
                    if (cls.routerUsed === 'google/gemini-2.5-flash' || cls.routerUsed === 'google/gemini-2.0-flash-001') routerLabel = 'Gemini Router';
                    else if (cls.routerUsed === 'openai/gpt-4o-mini') routerLabel = 'GPT-4o-mini Router';
                    else if (cls.routerUsed === 'fallback') routerLabel = 'Safe Fallback';
                    else if (cls.method === 'ai') routerLabel = 'AI Router';
                    else if (cls.method === 'manual') routerLabel = 'Manual';
                  } catch {}
                  const modelBadgeVariant = modelShort.includes('flash') || modelShort.includes('mini') || modelShort.includes('nano')
                    ? 'green' as const
                    : modelShort.includes('sonnet') || modelShort.includes('opus') || modelShort.includes('o3')
                    ? 'amber' as const
                    : 'default' as const;
                  return (
                    <div key={entry.id} className="rounded-lg border border-white/[0.04] bg-white/[0.01] px-3 py-2.5">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] text-white/60 truncate">{entry.message_preview || '...'}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant={modelBadgeVariant}>
                            {modelShort}
                          </Badge>
                          <span className="text-[10px] text-white/25 w-12 text-right">{timeAgo}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-1.5">
                        {routerLabel && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.04] text-white/30 border border-white/[0.06]">
                            {routerLabel}
                          </span>
                        )}
                        <span className="text-[10px] text-white/20 truncate">{entry.reason}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Per-Task Routing Preferences */}
      {settings.brain_mode === 'auto' && categories.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-indigo-400" />
              <CardTitle>Customize Auto Routing</CardTitle>
            </div>
            <Button
              variant="glass"
              size="sm"
              onClick={() => setShowPrefs(!showPrefs)}
            >
              {showPrefs ? 'Hide' : 'Customize'}
            </Button>
          </div>

          {!showPrefs && (
            <CardDescription>
              Override which model the AI router picks for specific task types. For example, use Codex for coding or DeepSeek for research.
              {Object.keys(settings.routing_preferences).length > 0 && (
                <span className="ml-1 text-indigo-400">
                  ({Object.keys(settings.routing_preferences).length} custom {Object.keys(settings.routing_preferences).length === 1 ? 'override' : 'overrides'} active)
                </span>
              )}
            </CardDescription>
          )}

          {showPrefs && (
            <div className="space-y-2">
              <p className="text-[12px] text-white/30 mb-3">
                Set &quot;Default&quot; to let the AI router decide, or pick a specific model for each task type.
              </p>
              {categories.map((cat) => {
                const override = prefsDraft[cat.key];
                const defaultModelName = categoryModels.find(m => m.id === cat.defaultModel)?.displayName || cat.defaultModel.split('/').pop();
                const isOverridden = !!override;

                return (
                  <div
                    key={cat.key}
                    className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                      isOverridden
                        ? 'border-indigo-500/20 bg-indigo-500/[0.03]'
                        : 'border-white/[0.04] bg-white/[0.01]'
                    }`}
                  >
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg shrink-0 ${
                      isOverridden ? 'bg-indigo-500/15 text-indigo-400' : 'bg-white/[0.04] text-white/30'
                    }`}>
                      {CATEGORY_ICONS[cat.key] || <Layers className="h-4 w-4" />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-white/80">{cat.label}</p>
                      <p className="text-[11px] text-white/30 truncate">{cat.description}</p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {!isOverridden && (
                        <Badge variant="default">{defaultModelName}</Badge>
                      )}
                      <select
                        value={override || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setPrefsDraft(prev => {
                            const next = { ...prev };
                            if (val) {
                              next[cat.key] = val;
                            } else {
                              delete next[cat.key];
                            }
                            return next;
                          });
                        }}
                        className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1.5 text-[12px] text-white/70 focus:border-indigo-500/40 focus:outline-none appearance-none cursor-pointer min-w-[160px]"
                      >
                        <option value="" className="bg-[#1a1a2e] text-white/70">
                          Default ({defaultModelName})
                        </option>
                        {categoryModels.map((m) => (
                          <option
                            key={m.id}
                            value={m.id}
                            className="bg-[#1a1a2e] text-white/70"
                          >
                            {m.displayName} — ${m.retailPrice}/1M
                          </option>
                        ))}
                      </select>

                      {isOverridden && (
                        <button
                          onClick={() => setPrefsDraft(prev => {
                            const next = { ...prev };
                            delete next[cat.key];
                            return next;
                          })}
                          className="p-1 rounded text-white/20 hover:text-white/50 transition-colors"
                          title="Reset to default"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={resetAllPrefs}
                  className="text-[12px] text-white/30 hover:text-white/50 transition-colors"
                  disabled={Object.keys(prefsDraft).length === 0}
                >
                  Reset all to defaults
                </button>
                <div className="flex items-center gap-2">
                  {prefsSaved && (
                    <span className="flex items-center gap-1 text-[12px] text-green-400">
                      <Check className="h-3 w-3" /> Saved
                    </span>
                  )}
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={savePrefs}
                    loading={prefsSaving}
                    disabled={!prefsChanged}
                  >
                    Save Preferences
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Own OpenRouter Key (BYOK) */}
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <Key className="h-4 w-4 text-white/40" />
          <CardTitle>Your Own OpenRouter Key</CardTitle>
          <Badge variant="default">Optional</Badge>
        </div>
        <CardDescription className="mb-4">
          Bring your own OpenRouter key for unlimited AI usage. You pay OpenRouter directly — no platform budget limits apply.
          {' '}
          <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 transition-colors">
            Get a key <ExternalLink className="h-3 w-3" />
          </a>
        </CardDescription>

        {settings.has_own_openrouter_key && (
          <div className="mb-4 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
            <p className="text-[12px] text-amber-400/90 font-medium mb-1">Direct OpenRouter Mode</p>
            <p className="text-[11px] text-amber-400/60">
              Your agent connects directly to OpenRouter with your key. Smart routing, cost optimization, and token compression are disabled.
              You choose the model, you pay OpenRouter directly. Remove your key to re-enable the platform&apos;s cost-saving features.
            </p>
          </div>
        )}

        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 border border-indigo-500/20">
                <Key className="h-3.5 w-3.5 text-indigo-400" />
              </div>
              <div>
                <p className="text-[13px] font-medium text-white/70">OpenRouter</p>
                {settings.has_own_openrouter_key ? (
                  <p className="text-[11px] text-indigo-400 font-mono">{settings.own_openrouter_key_masked}</p>
                ) : (
                  <p className="text-[11px] text-white/30">No key set — using included AI budget</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {settings.has_own_openrouter_key && (
                <button onClick={deleteOwnKey} className="p-1.5 rounded-md text-white/20 hover:text-red-400 hover:bg-red-400/10 transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
              <Button variant="glass" size="sm" onClick={() => { setShowKeyInput(!showKeyInput); setKeyInput(''); setShowKey(false); }}>
                {settings.has_own_openrouter_key ? 'Change' : 'Add Key'}
              </Button>
            </div>
          </div>

          {showKeyInput && (
            <div className="flex gap-2 pl-11">
              <div className="relative flex-1">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder="sk-or-..."
                  className="w-full rounded-lg border border-white/[0.08] bg-transparent px-3 py-2 pr-8 text-[13px] text-white font-mono placeholder:text-white/20 focus:border-white/25 focus:outline-none"
                />
                <button onClick={() => setShowKey(!showKey)} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/50">
                  {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
              <Button variant="primary" size="sm" onClick={saveOwnKey} loading={keySaving} disabled={keyInput.length < 10}>Save</Button>
              <Button variant="glass" size="sm" onClick={() => { setShowKeyInput(false); setKeyInput(''); }}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>

        <div className="mt-3 flex items-start gap-2 rounded-lg bg-white/[0.02] p-2.5">
          <Lock className="h-3.5 w-3.5 text-white/20 shrink-0 mt-0.5" />
          <p className="text-[11px] text-white/30">
            Your key is stored securely and never displayed in full. With your own key: unlimited usage, direct OpenRouter billing, but no smart routing or cost optimization. Without your key: platform budget applies, but the AI router picks the best model per task and compresses tokens to save you money.
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
            <p className="text-[13px] text-white/50 font-medium">How AI routing works</p>
            <p className="text-[12px] text-white/30 mt-1 leading-relaxed">
              In Auto mode, a cheap AI (Gemini Flash, costs ~$0.00002 per decision) reads your message and picks the best model from 21 options.
              &quot;Hello&quot; → Gemini Flash ($0.10/1M). &quot;Apply to jobs on LinkedIn&quot; → Claude Sonnet ($3.00/1M).
              If the router AI is down, a backup router (GPT-4o-mini) takes over. If both fail, Claude Sonnet handles it as a safe default.
              This saves 60-80% vs always using one expensive model. In Fixed mode, all messages use your selected model.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
