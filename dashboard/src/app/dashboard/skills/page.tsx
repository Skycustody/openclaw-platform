'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import api from '@/lib/api';
import {
  Globe, Code, FileText, Brain, Search, Wrench,
  Loader2, Power, PowerOff, AlertTriangle, RefreshCw,
} from 'lucide-react';

const TOOL_META: Record<string, { label: string; description: string; icon: typeof Globe; category: string }> = {
  web_search:   { label: 'Web Search',      description: 'Search the web for real-time information, news, and answers.',             icon: Search,   category: 'Research' },
  browser:      { label: 'Web Browser',      description: 'Navigate websites, read pages, fill forms, and extract data.',             icon: Globe,    category: 'Research' },
  code:         { label: 'Code Execution',   description: 'Write and execute code in a sandboxed environment.',                       icon: Code,     category: 'Development' },
  code_exec:    { label: 'Code Execution',   description: 'Write and execute code in a sandboxed environment.',                       icon: Code,     category: 'Development' },
  file:         { label: 'File Access',       description: 'Read, write, and manage files in the agent workspace.',                    icon: FileText, category: 'Productivity' },
  files:        { label: 'File Access',       description: 'Read, write, and manage files in the agent workspace.',                    icon: FileText, category: 'Productivity' },
  memory:       { label: 'Memory',            description: 'Store and recall information across conversations.',                       icon: Brain,    category: 'Intelligence' },
  rag:          { label: 'Knowledge Base',    description: 'Search and retrieve from uploaded documents and knowledge.',               icon: Brain,    category: 'Intelligence' },
};

function getToolMeta(name: string) {
  return TOOL_META[name] || {
    label: name.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    description: `OpenClaw tool: ${name}`,
    icon: Wrench,
    category: 'Other',
  };
}

interface SkillsData {
  enabled: string[];
  disabled: string[];
  available: string[];
  config: Record<string, any>;
  notProvisioned?: boolean;
}

export default function SkillsPage() {
  const [data, setData] = useState<SkillsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchSkills = useCallback(async () => {
    try {
      setError(null);
      const res = await api.get<SkillsData>('/skills');
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to load skills');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSkills(); }, [fetchSkills]);

  const toggleTool = async (name: string, enable: boolean) => {
    setToggling(name);
    try {
      await api.put(`/skills/${name}`, { enabled: enable });
      await fetchSkills();
    } catch (err: any) {
      setError(err.message || 'Failed to update skill');
    } finally {
      setToggling(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
      </div>
    );
  }

  if (data?.notProvisioned) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 mb-4">
          <AlertTriangle className="h-8 w-8 text-amber-400/60" />
        </div>
        <p className="text-[17px] font-medium text-white/50">Agent not provisioned yet</p>
        <p className="text-[13px] text-white/30 mt-2">Open your agent first, then come back to manage skills.</p>
        <Button variant="primary" size="sm" className="mt-4" onClick={() => window.location.href = '/dashboard'}>
          Go to Chat
        </Button>
      </div>
    );
  }

  const allTools = [...new Set([...(data?.enabled || []), ...(data?.disabled || [])])];
  const enabledSet = new Set(data?.enabled || []);

  return (
    <div className="space-y-6">
      <div className="animate-fade-up">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-3">
            <h1 className="text-[26px] font-bold text-white tracking-tight">Skills</h1>
            <Badge variant="accent">{data?.enabled?.length || 0} active</Badge>
          </div>
          <Button variant="glass" size="sm" onClick={fetchSkills}>
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
        <p className="text-[15px] text-white/40">
          Tools your OpenClaw agent can use — these are read from your container config
        </p>
      </div>

      {error && (
        <div className="border border-red-500/20 bg-red-500/5 rounded-xl px-4 py-3 text-[13px] text-red-400">
          {error}
        </div>
      )}

      {allTools.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 mb-4">
            <Wrench className="h-7 w-7 text-white/20" />
          </div>
          <p className="text-[17px] font-medium text-white/60">No tools configured</p>
          <p className="text-[14px] text-white/30 mt-2 max-w-md">
            Your OpenClaw container doesn&apos;t have any tools configured yet.
            Tools are automatically available when your agent starts.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {allTools.map(name => {
            const meta = getToolMeta(name);
            const Icon = meta.icon;
            const isEnabled = enabledSet.has(name);
            const isToggling = toggling === name;

            return (
              <Card
                key={name}
                className={`transition-all ${isEnabled ? 'ring-1 ring-emerald-500/10' : ''}`}
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                    isEnabled ? 'bg-emerald-500/10' : 'bg-white/5'
                  }`}>
                    <Icon className={`h-5 w-5 ${isEnabled ? 'text-emerald-400' : 'text-white/40'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className={`text-[15px] font-semibold ${isEnabled ? 'text-white' : 'text-white/70'}`}>
                        {meta.label}
                      </h3>
                      {isEnabled ? (
                        <Badge variant="green" dot>Active</Badge>
                      ) : (
                        <Badge variant="default">Disabled</Badge>
                      )}
                    </div>
                    <span className="text-[12px] text-white/25">{meta.category}</span>
                  </div>
                </div>
                <p className="text-[13px] text-white/40 leading-relaxed mb-4">
                  {meta.description}
                </p>
                <Button
                  variant={isEnabled ? 'glass' : 'primary'}
                  size="sm"
                  loading={isToggling}
                  onClick={() => toggleTool(name, !isEnabled)}
                >
                  {isEnabled ? (
                    <><PowerOff className="h-3.5 w-3.5" /> Disable</>
                  ) : (
                    <><Power className="h-3.5 w-3.5" /> Enable</>
                  )}
                </Button>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
