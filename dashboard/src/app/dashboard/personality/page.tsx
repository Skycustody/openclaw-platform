'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardDescription, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import api from '@/lib/api';
import {
  User, Save, Loader2, CheckCircle, AlertTriangle,
  Lightbulb, Bot, Sparkles,
} from 'lucide-react';

interface Agent {
  id: string;
  name: string;
  purpose: string | null;
  instructions: string | null;
  is_primary: boolean;
}

const PERSONA_TIPS = [
  'Give your agent a clear role: "You are a research analyst specializing in..."',
  'Define tone: "Always respond professionally but with a friendly tone."',
  'Set boundaries: "Never share confidential information or make up data."',
  'Add context: "You work for a SaaS company that sells project management tools."',
  'Include preferences: "Prefer bullet points over long paragraphs when summarizing."',
];

export default function PersonalityPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [instructions, setInstructions] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAgents = useCallback(async () => {
    try {
      const data = await api.get<{ agents: Agent[] }>('/agents');
      const list = data.agents || [];
      setAgents(list);
      const primary = list.find(a => a.is_primary) || list[0];
      if (primary) {
        setSelectedAgent(primary);
        setName(primary.name || '');
        setPurpose(primary.purpose || '');
        setInstructions(primary.instructions || '');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load agents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAgents(); }, [fetchAgents]);

  const selectAgent = (agent: Agent) => {
    setSelectedAgent(agent);
    setName(agent.name || '');
    setPurpose(agent.purpose || '');
    setInstructions(agent.instructions || '');
    setSaved(false);
    setError(null);
  };

  const handleSave = async () => {
    if (!selectedAgent) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await api.put(`/agents/${selectedAgent.id}`, {
        name: name.trim() || selectedAgent.name,
        purpose: purpose.trim() || null,
        instructions: instructions.trim() || null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      const data = await api.get<{ agents: Agent[] }>('/agents');
      setAgents(data.agents || []);
    } catch (err: any) {
      setError(err.message || 'Failed to save persona');
    } finally {
      setSaving(false);
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
      <div className="animate-fade-up">
        <h1 className="text-[26px] font-bold text-white tracking-tight">Persona</h1>
        <p className="mt-1 text-[15px] text-white/40">
          Define how your agent speaks and behaves. This writes to the agent&apos;s SOUL.md file.
        </p>
      </div>

      {/* Agent selector tabs */}
      {agents.length > 1 && (
        <div className="flex gap-2 animate-fade-up">
          {agents.map(agent => (
            <button
              key={agent.id}
              onClick={() => selectAgent(agent)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all text-[13px] ${
                selectedAgent?.id === agent.id
                  ? 'border-white/20 bg-white/[0.06] text-white'
                  : 'border-white/[0.06] bg-white/[0.02] text-white/40 hover:text-white/60 hover:border-white/10'
              }`}
            >
              <Bot className="h-3.5 w-3.5" />
              {agent.name}
              {agent.is_primary && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">Primary</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 animate-fade-up">
          <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
          <p className="text-[13px] text-red-400">{error}</p>
        </div>
      )}

      {/* Success */}
      {saved && (
        <div className="flex items-center gap-2 rounded-xl border border-green-500/20 bg-green-500/5 px-4 py-3 animate-fade-up">
          <CheckCircle className="h-4 w-4 text-green-400 shrink-0" />
          <p className="text-[13px] text-green-400">
            Persona saved and deployed to your agent container
          </p>
        </div>
      )}

      {/* Editor */}
      <Card className="animate-fade-up">
        <div className="flex items-start justify-between mb-5">
          <div>
            <CardTitle>Agent Identity</CardTitle>
            <CardDescription>
              The name and core personality of {selectedAgent?.name || 'your agent'}
            </CardDescription>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.06] border border-white/[0.08]">
            <User className="h-4 w-4 text-white/50" />
          </div>
        </div>

        <div className="space-y-5">
          <div>
            <label className="text-[12px] text-white/30 block mb-1.5">Agent Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Atlas, Aria, Research Bot"
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-[14px] text-white placeholder:text-white/20 focus:border-white/25 focus:outline-none transition-colors"
            />
          </div>

          <div>
            <label className="text-[12px] text-white/30 block mb-1.5">Purpose / Role</label>
            <textarea
              value={purpose}
              onChange={e => setPurpose(e.target.value)}
              placeholder="What is this agent's primary role? e.g. You are a senior marketing strategist who helps create campaign briefs and analyze metrics..."
              rows={3}
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-[14px] text-white placeholder:text-white/20 focus:border-white/25 focus:outline-none resize-none transition-colors"
            />
          </div>

          <div>
            <label className="text-[12px] text-white/30 block mb-1.5">Instructions / Rules</label>
            <textarea
              value={instructions}
              onChange={e => setInstructions(e.target.value)}
              placeholder="Any specific rules, tone guidelines, or context. e.g. Always be concise. Prefer bullet points. Never mention competitors. Use British English..."
              rows={6}
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-[14px] text-white placeholder:text-white/20 focus:border-white/25 focus:outline-none resize-none transition-colors font-mono text-[13px]"
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <p className="text-[11px] text-white/20">
              Changes are written to SOUL.md inside the container and take effect immediately after restart
            </p>
            <Button variant="primary" size="sm" onClick={handleSave} loading={saving} disabled={saving}>
              <Save className="h-3.5 w-3.5" /> Save Persona
            </Button>
          </div>
        </div>
      </Card>

      {/* Tips */}
      <Card className="!p-5 animate-fade-up">
        <div className="flex items-center gap-2 mb-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10">
            <Lightbulb className="h-4 w-4 text-amber-400" />
          </div>
          <div>
            <p className="text-[14px] font-medium text-white">Persona Tips</p>
            <p className="text-[12px] text-white/30">Write better instructions for your agent</p>
          </div>
        </div>
        <div className="space-y-2.5">
          {PERSONA_TIPS.map((tip, i) => (
            <div key={i} className="flex items-start gap-2.5 text-[13px]">
              <Sparkles className="h-3.5 w-3.5 text-white/15 mt-0.5 shrink-0" />
              <span className="text-white/40">{tip}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
