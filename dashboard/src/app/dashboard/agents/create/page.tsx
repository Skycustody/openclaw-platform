'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import api from '@/lib/api';
import { useStore } from '@/lib/store';
import {
  Bot, ArrowLeft, ArrowRight, Check, ChevronRight,
  Loader2, Sparkles, Send, Search, Code, Palette,
  Brain, Mail, Globe, Wrench,
  MessageSquare, FileCode,
  Zap, X, RotateCcw, Layers,
} from 'lucide-react';
import { useRouter } from 'next/navigation';

// ─── Types ───

interface Template {
  id: string;
  name: string;
  category: string;
  icon: string;
  role: string;
  description: string;
  skills: string[];
  cron: string[];
}

interface AgentConfig {
  name: string;
  purpose: string;
  instructions: string;
  model: string;
  skills: string[];
  channels: string[];
  cron: string[];
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
}

// ─── Skills Catalog ───

interface SkillDef {
  id: string;
  name: string;
  description: string;
  category: string;
}

const SKILL_CATEGORIES = [
  { id: 'web', label: 'Browser & Web', icon: Globe },
  { id: 'comms', label: 'Communication', icon: Mail },
  { id: 'dev', label: 'Development', icon: Code },
  { id: 'creative', label: 'Creative & Media', icon: Palette },
  { id: 'productivity', label: 'Productivity', icon: Brain },
  { id: 'data', label: 'Data & Research', icon: Layers },
  { id: 'social', label: 'Social Media', icon: MessageSquare },
];

const SKILLS_CATALOG: SkillDef[] = [
  { id: 'web-search', name: 'Web Search', description: 'Search the web for current information', category: 'web' },
  { id: 'web-reader', name: 'Web Reader', description: 'Read and extract content from web pages', category: 'web' },
  { id: 'agent-browser', name: 'Browser Control', description: 'Full browser automation — click, type, navigate', category: 'web' },
  { id: 'himalaya', name: 'Email (IMAP)', description: 'Read and send email via IMAP/SMTP', category: 'comms' },
  { id: 'clawflow', name: 'ClawFlow', description: 'Workflow automation engine', category: 'comms' },
  { id: 'clawflow-inbox-triage', name: 'Inbox Triage', description: 'Smart email categorization and routing', category: 'comms' },
  { id: 'coding-agent', name: 'Coding Agent', description: 'Write, review, debug, and test code', category: 'dev' },
  { id: 'github', name: 'GitHub', description: 'Clone, commit, push to GitHub repos', category: 'dev' },
  { id: 'gh-issues', name: 'GitHub Issues', description: 'Manage issues, PRs, and code reviews', category: 'dev' },
  { id: 'skill-creator', name: 'Skill Creator', description: 'Create new custom skills dynamically', category: 'dev' },
  { id: 'image-tools', name: 'Image Tools', description: 'Generate and edit images', category: 'creative' },
  { id: 'svg-tools', name: 'SVG Tools', description: 'Create and manipulate SVG graphics', category: 'creative' },
  { id: 'video-frames', name: 'Video Processing', description: 'Video editing, frame extraction, ffmpeg', category: 'creative' },
  { id: 'tasks', name: 'Tasks', description: 'Task management and tracking', category: 'productivity' },
  { id: 'notes', name: 'Notes', description: 'Note-taking and organization', category: 'productivity' },
  { id: 'apple-notes', name: 'Apple Notes', description: 'Sync with Apple Notes', category: 'productivity' },
  { id: 'weather', name: 'Weather', description: 'Weather forecasts and conditions', category: 'productivity' },
  { id: 'healthcheck', name: 'Health Check', description: 'Monitor uptime and service health', category: 'productivity' },
  { id: 'pdf-tools', name: 'PDF Tools', description: 'Read and process PDF documents', category: 'data' },
  { id: 'json-tools', name: 'JSON Tools', description: 'Parse, transform, and validate JSON', category: 'data' },
  { id: 'deep-research', name: 'Deep Research', description: 'Multi-source research with citations', category: 'data' },
  { id: 'twitter-tools', name: 'Twitter/X', description: 'Post, monitor, and engage on Twitter', category: 'social' },
  { id: 'reddit-tools', name: 'Reddit', description: 'Browse, post, and monitor Reddit', category: 'social' },
  { id: 'linkedin-tools', name: 'LinkedIn', description: 'LinkedIn profile and post automation', category: 'social' },
];

// ─── Channel Definitions ───

const CHANNELS = [
  { id: 'telegram', name: 'Telegram', emoji: '\u2708\uFE0F', description: 'Connect a Telegram bot', color: 'blue' },
  { id: 'discord', name: 'Discord', emoji: '\uD83C\uDFAE', description: 'Add to a Discord server', color: 'indigo' },
  { id: 'slack', name: 'Slack', emoji: '\u26A1', description: 'Connect to a Slack workspace', color: 'purple' },
  { id: 'whatsapp', name: 'WhatsApp', emoji: '\uD83D\uDCAC', description: 'Pair via QR code', color: 'green' },
];

// ─── Models ───

const MODELS = [
  { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', tier: 'Recommended' },
  { id: 'openai/gpt-4.1', name: 'GPT-4.1', tier: 'Recommended' },
  { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro', tier: 'Recommended' },
  { id: 'anthropic/claude-opus-4', name: 'Claude Opus 4', tier: 'Premium' },
  { id: 'openai/gpt-4o', name: 'GPT-4o', tier: 'Standard' },
  { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash', tier: 'Fast' },
  { id: 'openai/gpt-4.1-mini', name: 'GPT-4.1 Mini', tier: 'Fast' },
  { id: 'anthropic/claude-3.5-haiku', name: 'Claude 3.5 Haiku', tier: 'Fast' },
  { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1', tier: 'Reasoning' },
];

// ─── Template Categories ───

const CATEGORY_META: Record<string, { label: string; color: string }> = {
  creative: { label: 'Creative', color: 'text-pink-400 border-pink-500/20 bg-pink-500/5' },
  marketing: { label: 'Marketing', color: 'text-orange-400 border-orange-500/20 bg-orange-500/5' },
  business: { label: 'Business', color: 'text-blue-400 border-blue-500/20 bg-blue-500/5' },
  development: { label: 'Development', color: 'text-green-400 border-green-500/20 bg-green-500/5' },
  productivity: { label: 'Productivity', color: 'text-purple-400 border-purple-500/20 bg-purple-500/5' },
};

// ─── Config YAML formatter ───

function configToYaml(config: AgentConfig): string {
  const lines: string[] = [];
  lines.push(`name: ${config.name || '(unnamed)'}`);
  if (config.purpose) {
    lines.push(`purpose: |`);
    config.purpose.split('\n').forEach(l => lines.push(`  ${l}`));
  }
  if (config.instructions) {
    lines.push(`instructions: |`);
    config.instructions.split('\n').forEach(l => lines.push(`  ${l}`));
  }
  lines.push(`model: ${config.model}`);
  if (config.skills.length > 0) {
    lines.push(`skills:`);
    config.skills.forEach(s => lines.push(`  - ${s}`));
  } else {
    lines.push(`skills: []`);
  }
  if (config.channels.length > 0) {
    lines.push(`channels:`);
    config.channels.forEach(c => lines.push(`  - ${c}`));
  } else {
    lines.push(`channels: []`);
  }
  if (config.cron.length > 0) {
    lines.push(`cron:`);
    config.cron.forEach(c => lines.push(`  - ${c}`));
  } else {
    lines.push(`cron: []`);
  }
  return lines.join('\n');
}

function configToJson(config: AgentConfig): string {
  return JSON.stringify(config, null, 2);
}

// ─── Parse YAML from LLM response ───

function extractYamlConfig(text: string): Partial<AgentConfig> | null {
  const yamlMatch = text.match(/```yaml\n([\s\S]*?)```/);
  if (!yamlMatch) return null;

  const yaml = yamlMatch[1];
  const result: Partial<AgentConfig> = {};

  const nameMatch = yaml.match(/^name:\s*(.+)$/m);
  if (nameMatch) result.name = nameMatch[1].trim();

  const purposeMatch = yaml.match(/^purpose:\s*\|?\s*\n((?:\s{2}.+\n?)*)/m);
  if (purposeMatch) result.purpose = purposeMatch[1].replace(/^ {2}/gm, '').trim();
  else {
    const purposeSingle = yaml.match(/^purpose:\s*(.+)$/m);
    if (purposeSingle) result.purpose = purposeSingle[1].trim();
  }

  const instrMatch = yaml.match(/^instructions:\s*\|?\s*\n((?:\s{2}.+\n?)*)/m);
  if (instrMatch) result.instructions = instrMatch[1].replace(/^ {2}/gm, '').trim();
  else {
    const instrSingle = yaml.match(/^instructions:\s*(.+)$/m);
    if (instrSingle) result.instructions = instrSingle[1].trim();
  }

  const modelMatch = yaml.match(/^model:\s*(.+)$/m);
  if (modelMatch) result.model = modelMatch[1].trim();

  const skillsMatch = yaml.match(/^skills:\s*\n((?:\s+-\s+.+\n?)*)/m);
  if (skillsMatch) {
    result.skills = skillsMatch[1].match(/-\s+(.+)/g)?.map(s => s.replace(/^-\s+/, '').trim()) || [];
  }

  const channelsMatch = yaml.match(/^channels:\s*\n((?:\s+-\s+.+\n?)*)/m);
  if (channelsMatch) {
    result.channels = channelsMatch[1].match(/-\s+(.+)/g)?.map(s => s.replace(/^-\s+/, '').trim()) || [];
  }

  return result;
}

// ─── Main Component ───

const STEPS = ['Templates', 'Configure', 'Skills & Channels', 'Review & Create'];

const DEFAULT_CONFIG: AgentConfig = {
  name: '',
  purpose: '',
  instructions: '',
  model: 'anthropic/claude-sonnet-4',
  skills: [],
  channels: [],
  cron: [],
};

export default function AgentCreatorPage() {
  const [step, setStep] = useState(0);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [templateSearch, setTemplateSearch] = useState('');

  const [config, setConfig] = useState<AgentConfig>({ ...DEFAULT_CONFIG });
  const [configView, setConfigView] = useState<'yaml' | 'json'>('yaml');

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [chatStarted, setChatStarted] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const streamFlushRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamContentRef = useRef<string>('');

  const [skillFilter, setSkillFilter] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState(false);

  const { user } = useStore();
  const router = useRouter();

  // ─── Fetch templates ───

  useEffect(() => {
    api.get<{ agents: Template[] }>('/agents/marketplace')
      .then(res => setTemplates(res.agents || []))
      .catch(() => {})
      .finally(() => setLoadingTemplates(false));
  }, []);

  // ─── Auto-scroll chat ───

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // ─── Select template → prefill config ───

  const selectTemplate = useCallback((tpl: Template) => {
    setSelectedTemplate(tpl);
    setConfig(prev => ({
      ...prev,
      name: tpl.name,
      purpose: tpl.role,
      skills: [...tpl.skills],
    }));
    setStep(1);
    setChatStarted(false);
    setChatMessages([]);
  }, []);

  // ─── Start from scratch ───

  const startFromScratch = useCallback(() => {
    setSelectedTemplate(null);
    setConfig({ ...DEFAULT_CONFIG });
    setStep(1);
    setChatStarted(false);
    setChatMessages([]);
  }, []);

  // ─── Send chat message to builder AI ───

  const sendMessage = useCallback(async (text?: string) => {
    const msg = text || chatInput.trim();
    if (!msg || isStreaming) return;

    setChatInput('');
    setChatStarted(true);

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: msg,
    };
    const assistantMsg: ChatMessage = {
      id: `a-${Date.now()}`,
      role: 'assistant',
      content: '',
      streaming: true,
    };

    setChatMessages(prev => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const allMessages = [...chatMessages, userMsg].map(m => ({
        role: m.role,
        content: m.content,
      }));

      const res = await api.stream('/agents/builder-chat', {
        messages: allMessages,
        config,
        templateId: selectedTemplate?.id,
      }, abort.signal);

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No reader');

      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';
      streamContentRef.current = '';

      const flushToState = () => {
        const content = streamContentRef.current;
        setChatMessages(prev => {
          const msgs = [...prev];
          const last = msgs[msgs.length - 1];
          if (last?.streaming) {
            msgs[msgs.length - 1] = { ...last, content };
          }
          return msgs;
        });
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              fullContent += delta;
              streamContentRef.current = fullContent;
              if (!streamFlushRef.current) {
                streamFlushRef.current = setTimeout(() => {
                  streamFlushRef.current = null;
                  flushToState();
                }, 50);
              }
            }
          } catch {}
        }
      }

      // Final flush
      if (streamFlushRef.current) {
        clearTimeout(streamFlushRef.current);
        streamFlushRef.current = null;
      }
      setChatMessages(prev => {
        const msgs = [...prev];
        const last = msgs[msgs.length - 1];
        if (last?.streaming) {
          msgs[msgs.length - 1] = { ...last, streaming: false, content: fullContent };
        }
        return msgs;
      });

      // Extract config from response
      const extracted = extractYamlConfig(fullContent);
      if (extracted) {
        setConfig(prev => ({
          ...prev,
          ...Object.fromEntries(
            Object.entries(extracted).filter(([, v]) => v !== undefined && v !== '')
          ),
        }));
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setChatMessages(prev => {
        const msgs = [...prev];
        const last = msgs[msgs.length - 1];
        if (last?.streaming) {
          msgs[msgs.length - 1] = { ...last, streaming: false, content: last.content || 'Failed to get response. Try again.' };
        }
        return msgs;
      });
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [chatInput, isStreaming, chatMessages, config, selectedTemplate]);

  // ─── Stop streaming ───

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
  }, []);

  // ─── Toggle skill ───

  const toggleSkill = useCallback((skillId: string) => {
    setConfig(prev => ({
      ...prev,
      skills: prev.skills.includes(skillId)
        ? prev.skills.filter(s => s !== skillId)
        : [...prev.skills, skillId],
    }));
  }, []);

  // ─── Toggle channel ───

  const toggleChannel = useCallback((channelId: string) => {
    setConfig(prev => ({
      ...prev,
      channels: prev.channels.includes(channelId)
        ? prev.channels.filter(c => c !== channelId)
        : [...prev.channels, channelId],
    }));
  }, []);

  // ─── Create agent ───

  const handleCreate = useCallback(async () => {
    if (!config.name.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      await api.post('/agents', {
        name: config.name.trim(),
        purpose: config.purpose.trim(),
        instructions: config.instructions.trim(),
      });
      setCreateSuccess(true);
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create agent');
    } finally {
      setCreating(false);
    }
  }, [config]);

  // ─── Reset ───

  const resetCreator = useCallback(() => {
    setStep(0);
    setSelectedTemplate(null);
    setConfig({ ...DEFAULT_CONFIG });
    setChatMessages([]);
    setChatStarted(false);
    setChatInput('');
    setCreateSuccess(false);
    setCreateError(null);
  }, []);

  // ─── Keyboard handlers ───

  const handleChatKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }, [sendMessage]);

  // ─── Filtered templates ───

  const filteredTemplates = templates.filter(t =>
    !templateSearch ||
    t.name.toLowerCase().includes(templateSearch.toLowerCase()) ||
    t.role.toLowerCase().includes(templateSearch.toLowerCase()) ||
    t.category.toLowerCase().includes(templateSearch.toLowerCase())
  );

  // ─── Filtered skills ───

  const filteredSkills = SKILLS_CATALOG.filter(s =>
    !skillFilter || s.category === skillFilter
  );

  // ─── Render ───

  return (
    <div className="min-h-screen">
      {/* Top Bar */}
      <div className="sticky top-0 z-30 bg-[#1a1a18]/90 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => router.push('/dashboard/agents')}
              className="p-2 -ml-2 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.04] transition-colors">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <h1 className="text-[16px] font-semibold text-white">Create Agent</h1>
              <p className="text-[12px] text-white/30">{STEPS[step]}</p>
            </div>
          </div>

          {/* Step Indicators */}
          <div className="hidden sm:flex items-center gap-0">
            {STEPS.map((label, i) => (
              <div key={label} className="flex items-center">
                {i > 0 && (
                  <div className={`w-8 h-px mx-1 ${i <= step ? 'bg-white/20' : 'bg-white/[0.06]'}`} />
                )}
                <button
                  onClick={() => i < step && setStep(i)}
                  disabled={i > step}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[12px] font-medium transition-all ${
                    i === step
                      ? 'bg-white/[0.08] text-white border border-white/[0.12]'
                      : i < step
                        ? 'text-white/50 hover:text-white/70 cursor-pointer'
                        : 'text-white/20 cursor-default'
                  }`}
                >
                  {i < step ? (
                    <Check className="h-3 w-3 text-green-400" />
                  ) : (
                    <span className={`h-4 w-4 rounded-full flex items-center justify-center text-[10px] ${
                      i === step ? 'bg-white/20 text-white' : 'bg-white/[0.06] text-white/30'
                    }`}>{i + 1}</span>
                  )}
                  <span className="hidden md:inline">{label}</span>
                </button>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {step > 0 && (
              <Button variant="ghost" size="sm" onClick={resetCreator}>
                <RotateCcw className="h-3.5 w-3.5" /> Start Over
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ═══════════════════════ STEP 0: Templates ═══════════════════════ */}
      {step === 0 && (
        <div className="max-w-5xl mx-auto px-6 py-8 space-y-8 animate-fade-up">
          {/* Hero */}
          <div className="text-center space-y-3">
            <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-white/[0.04] border border-white/[0.08] mx-auto">
              <Sparkles className="h-8 w-8 text-white/40" />
            </div>
            <h2 className="text-[28px] font-bold text-white tracking-tight">Build Your Agent</h2>
            <p className="text-[15px] text-white/40 max-w-lg mx-auto">
              Start from a template or describe what you need. The AI builder will help you configure everything.
            </p>
          </div>

          {/* Describe Your Agent */}
          <Card className="!p-0 overflow-hidden">
            <div className="p-5 border-b border-white/[0.06]">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-white/[0.04] flex items-center justify-center">
                  <MessageSquare className="h-5 w-5 text-white/30" />
                </div>
                <div>
                  <h3 className="text-[15px] font-semibold text-white">Describe your agent</h3>
                  <p className="text-[12px] text-white/30">Tell the AI what you need and it will build the config for you</p>
                </div>
              </div>
            </div>
            <div className="p-5">
              <div className="flex gap-3">
                <textarea
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (chatInput.trim()) {
                        startFromScratch();
                        setTimeout(() => sendMessage(chatInput.trim()), 100);
                      }
                    }
                  }}
                  placeholder="e.g. I need an agent that monitors my competitors' social media and sends me a weekly report..."
                  rows={2}
                  className="flex-1 bg-white/[0.02] border border-white/[0.06] rounded-xl px-4 py-3 text-[14px] text-[#e8e8e8] placeholder:text-white/20 resize-none focus:border-white/[0.15] focus:outline-none transition-colors"
                />
                <Button variant="primary" size="lg"
                  onClick={() => {
                    if (chatInput.trim()) {
                      const msg = chatInput.trim();
                      startFromScratch();
                      setTimeout(() => sendMessage(msg), 100);
                    }
                  }}
                  disabled={!chatInput.trim()}
                  className="self-end">
                  <Sparkles className="h-4 w-4" /> Build
                </Button>
              </div>
            </div>
          </Card>

          {/* Or Start from Scratch */}
          <div className="flex items-center gap-4">
            <div className="flex-1 h-px bg-white/[0.06]" />
            <button onClick={startFromScratch}
              className="text-[13px] text-white/30 hover:text-white/50 transition-colors flex items-center gap-2">
              <Wrench className="h-3.5 w-3.5" /> Start from scratch
            </button>
            <div className="flex-1 h-px bg-white/[0.06]" />
          </div>

          {/* Template Search */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20" />
            <input
              type="text"
              value={templateSearch}
              onChange={e => setTemplateSearch(e.target.value)}
              placeholder="Search templates..."
              className="w-full bg-white/[0.02] border border-white/[0.06] rounded-xl pl-11 pr-4 py-3 text-[14px] text-[#e8e8e8] placeholder:text-white/20 focus:border-white/[0.15] focus:outline-none transition-colors"
            />
          </div>

          {/* Template Grid */}
          {loadingTemplates ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-white/20" />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredTemplates.map(tpl => {
                const cat = CATEGORY_META[tpl.category] || { label: tpl.category, color: 'text-white/40 border-white/10 bg-white/[0.02]' };
                return (
                  <Card key={tpl.id} className="!p-0 overflow-hidden group hover:border-white/[0.15] transition-all cursor-pointer"
                    onClick={() => selectTemplate(tpl)}>
                    <div className="p-5 space-y-3">
                      <div className="flex items-start justify-between">
                        <span className="text-2xl">{tpl.icon}</span>
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${cat.color}`}>
                          {cat.label}
                        </span>
                      </div>
                      <div>
                        <h3 className="text-[15px] font-semibold text-white group-hover:text-white/90">{tpl.name}</h3>
                        <p className="text-[13px] text-white/40 mt-1 line-clamp-2">{tpl.role}</p>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {tpl.skills.slice(0, 4).map(s => (
                          <span key={s} className="text-[10px] text-white/25 bg-white/[0.04] px-1.5 py-0.5 rounded">
                            {s}
                          </span>
                        ))}
                        {tpl.skills.length > 4 && (
                          <span className="text-[10px] text-white/20">+{tpl.skills.length - 4}</span>
                        )}
                      </div>
                    </div>
                    <div className="border-t border-white/[0.04] px-5 py-2.5 flex items-center justify-between bg-white/[0.01]">
                      <span className="text-[11px] text-white/20">Use as starting point</span>
                      <ArrowRight className="h-3.5 w-3.5 text-white/15 group-hover:text-white/40 transition-colors" />
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════ STEP 1: Configure (Split Screen) ═══════════════════════ */}
      {step === 1 && (
        <div className="h-[calc(100vh-57px)] flex">
          {/* Left: Chat */}
          <div className="flex-1 flex flex-col border-r border-white/[0.06] min-w-0">
            {/* Chat Header */}
            <div className="shrink-0 border-b border-white/[0.06] px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-white/30" />
                <span className="text-[13px] font-medium text-white/60">Agent Builder AI</span>
              </div>
              {selectedTemplate && (
                <Badge variant="default" className="!text-[10px]">
                  Template: {selectedTemplate.name}
                </Badge>
              )}
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {!chatStarted && (
                <div className="flex flex-col items-center justify-center h-full text-center space-y-4 py-8">
                  <div className="h-14 w-14 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center">
                    <Sparkles className="h-7 w-7 text-white/20" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-[15px] font-medium text-white/60">
                      {selectedTemplate ? `Customize your ${selectedTemplate.name}` : 'Describe your agent'}
                    </p>
                    <p className="text-[12px] text-white/25 max-w-sm">
                      {selectedTemplate
                        ? "The template is loaded. Tell me what you'd like to change or just continue to the next step."
                        : 'Tell me what you need your agent to do and I\'ll help configure it.'}
                    </p>
                  </div>
                  {/* Quick prompts */}
                  <div className="flex flex-wrap gap-2 justify-center max-w-md">
                    {selectedTemplate ? (
                      <>
                        <QuickPrompt text="What can I customize?" onClick={sendMessage} />
                        <QuickPrompt text="Change the tone to be more casual" onClick={sendMessage} />
                        <QuickPrompt text="Add email integration" onClick={sendMessage} />
                      </>
                    ) : (
                      <>
                        <QuickPrompt text="I need an agent for customer support" onClick={sendMessage} />
                        <QuickPrompt text="Build me a research assistant" onClick={sendMessage} />
                        <QuickPrompt text="I want an agent that manages my social media" onClick={sendMessage} />
                      </>
                    )}
                  </div>
                </div>
              )}

              {chatMessages.map(msg => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                    msg.role === 'user'
                      ? 'bg-white/[0.08] text-white/90'
                      : 'bg-white/[0.03] border border-white/[0.06] text-white/70'
                  }`}>
                    <div className="text-[13px] leading-relaxed whitespace-pre-wrap">
                      {formatChatContent(msg.content)}
                    </div>
                    {msg.streaming && (
                      <span className="inline-block w-1.5 h-4 bg-white/40 animate-pulse ml-0.5" />
                    )}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            {/* Chat Input */}
            <div className="shrink-0 border-t border-white/[0.06] p-4">
              <div className="flex gap-3">
                <textarea
                  ref={inputRef}
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={handleChatKeyDown}
                  placeholder="Describe what your agent should do..."
                  rows={1}
                  className="flex-1 bg-white/[0.02] border border-white/[0.06] rounded-xl px-4 py-3 text-[14px] text-[#e8e8e8] placeholder:text-white/20 resize-none focus:border-white/[0.15] focus:outline-none transition-colors"
                  style={{ minHeight: '44px', maxHeight: '120px' }}
                />
                {isStreaming ? (
                  <button onClick={stopStreaming}
                    className="self-end p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors">
                    <X className="h-4 w-4" />
                  </button>
                ) : (
                  <button onClick={() => sendMessage()}
                    disabled={!chatInput.trim()}
                    className="self-end p-3 rounded-xl bg-white/[0.06] border border-white/[0.08] text-white/50 hover:bg-white/[0.1] hover:text-white/80 disabled:opacity-30 transition-colors">
                    <Send className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="flex items-center justify-between mt-2">
                <p className="text-[11px] text-white/15">Press Enter to send, Shift+Enter for new line</p>
                <Button variant="primary" size="sm" onClick={() => setStep(2)}>
                  Next: Skills & Channels <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>

          {/* Right: Config Preview */}
          <div className="w-[400px] lg:w-[480px] flex flex-col bg-[#1e1e1c] shrink-0 hidden md:flex">
            {/* Config Header */}
            <div className="shrink-0 border-b border-white/[0.06] px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCode className="h-4 w-4 text-white/30" />
                <span className="text-[13px] font-medium text-white/60">Agent Config</span>
              </div>
              <div className="flex bg-white/[0.04] rounded-lg p-0.5">
                <button
                  onClick={() => setConfigView('yaml')}
                  className={`px-3 py-1 rounded-md text-[11px] font-medium transition-colors ${
                    configView === 'yaml' ? 'bg-white/[0.08] text-white/80' : 'text-white/30 hover:text-white/50'
                  }`}
                >YAML</button>
                <button
                  onClick={() => setConfigView('json')}
                  className={`px-3 py-1 rounded-md text-[11px] font-medium transition-colors ${
                    configView === 'json' ? 'bg-white/[0.08] text-white/80' : 'text-white/30 hover:text-white/50'
                  }`}
                >JSON</button>
              </div>
            </div>

            {/* Config Content */}
            <div className="flex-1 overflow-y-auto p-5">
              <pre className="text-[12px] text-white/50 font-mono leading-relaxed whitespace-pre-wrap">
                {configView === 'yaml' ? configToYaml(config) : configToJson(config)}
              </pre>
            </div>

            {/* Inline Edit Fields */}
            <div className="shrink-0 border-t border-white/[0.06] p-4 space-y-3">
              <div>
                <label className="text-[11px] text-white/25 block mb-1">Name</label>
                <input type="text" value={config.name}
                  onChange={e => setConfig(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Agent name"
                  className="w-full bg-white/[0.02] border border-white/[0.06] rounded-lg px-3 py-2 text-[13px] text-[#e8e8e8] placeholder:text-white/15 focus:border-white/[0.15] focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] text-white/25 block mb-1">Purpose</label>
                <textarea value={config.purpose}
                  onChange={e => setConfig(prev => ({ ...prev, purpose: e.target.value }))}
                  placeholder="What does this agent do?"
                  rows={2}
                  className="w-full bg-white/[0.02] border border-white/[0.06] rounded-lg px-3 py-2 text-[13px] text-[#e8e8e8] placeholder:text-white/15 resize-none focus:border-white/[0.15] focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] text-white/25 block mb-1">Model</label>
                <select value={config.model}
                  onChange={e => setConfig(prev => ({ ...prev, model: e.target.value }))}
                  className="w-full bg-white/[0.02] border border-white/[0.06] rounded-lg px-3 py-2 text-[13px] text-[#e8e8e8] focus:border-white/[0.15] focus:outline-none appearance-none cursor-pointer">
                  {MODELS.map(m => (
                    <option key={m.id} value={m.id} className="bg-[#2a2a28] text-white">
                      {m.name} ({m.tier})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════ STEP 2: Skills & Channels ═══════════════════════ */}
      {step === 2 && (
        <div className="max-w-5xl mx-auto px-6 py-8 space-y-8 animate-fade-up">
          {/* Skills Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-[20px] font-bold text-white">Skills & Tools</h2>
                <p className="text-[13px] text-white/30 mt-0.5">
                  Choose what your agent can do. {config.skills.length > 0 && (
                    <span className="text-white/50">{config.skills.length} selected</span>
                  )}
                </p>
              </div>
            </div>

            {/* Category Filter */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSkillFilter(null)}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
                  !skillFilter ? 'bg-white/[0.08] text-white/80 border border-white/[0.12]' : 'text-white/30 hover:text-white/50 border border-transparent'
                }`}
              >All</button>
              {SKILL_CATEGORIES.map(cat => {
                const Icon = cat.icon;
                const count = SKILLS_CATALOG.filter(s => s.category === cat.id && config.skills.includes(s.id)).length;
                return (
                  <button key={cat.id}
                    onClick={() => setSkillFilter(skillFilter === cat.id ? null : cat.id)}
                    className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors flex items-center gap-1.5 ${
                      skillFilter === cat.id ? 'bg-white/[0.08] text-white/80 border border-white/[0.12]' : 'text-white/30 hover:text-white/50 border border-transparent'
                    }`}>
                    <Icon className="h-3 w-3" />
                    {cat.label}
                    {count > 0 && <span className="text-[10px] text-green-400 ml-0.5">{count}</span>}
                  </button>
                );
              })}
            </div>

            {/* Skills Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {filteredSkills.map(skill => {
                const active = config.skills.includes(skill.id);
                return (
                  <button key={skill.id}
                    onClick={() => toggleSkill(skill.id)}
                    className={`text-left p-4 rounded-xl border transition-all ${
                      active
                        ? 'bg-white/[0.06] border-white/[0.15]'
                        : 'bg-white/[0.02] border-white/[0.06] hover:border-white/[0.1] hover:bg-white/[0.04]'
                    }`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className={`text-[13px] font-medium ${active ? 'text-white' : 'text-white/60'}`}>
                          {skill.name}
                        </p>
                        <p className="text-[11px] text-white/30 mt-0.5 line-clamp-1">{skill.description}</p>
                      </div>
                      <div className={`shrink-0 h-5 w-5 rounded-md flex items-center justify-center border transition-colors ${
                        active
                          ? 'bg-white/20 border-white/30'
                          : 'border-white/10 bg-transparent'
                      }`}>
                        {active && <Check className="h-3 w-3 text-white" />}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Divider */}
          <div className="h-px bg-white/[0.06]" />

          {/* Channels Section */}
          <div className="space-y-4">
            <div>
              <h2 className="text-[20px] font-bold text-white">Channels</h2>
              <p className="text-[13px] text-white/30 mt-0.5">
                Where should this agent be reachable? You can configure tokens after creation.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {CHANNELS.map(ch => {
                const active = config.channels.includes(ch.id);
                return (
                  <button key={ch.id}
                    onClick={() => toggleChannel(ch.id)}
                    className={`text-left p-5 rounded-xl border transition-all ${
                      active
                        ? 'bg-white/[0.06] border-white/[0.15]'
                        : 'bg-white/[0.02] border-white/[0.06] hover:border-white/[0.1] hover:bg-white/[0.04]'
                    }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{ch.emoji}</span>
                        <div>
                          <p className={`text-[14px] font-medium ${active ? 'text-white' : 'text-white/60'}`}>
                            {ch.name}
                          </p>
                          <p className="text-[12px] text-white/25">{ch.description}</p>
                        </div>
                      </div>
                      <div className={`h-5 w-5 rounded-md flex items-center justify-center border transition-colors ${
                        active
                          ? 'bg-white/20 border-white/30'
                          : 'border-white/10 bg-transparent'
                      }`}>
                        {active && <Check className="h-3 w-3 text-white" />}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <p className="text-[11px] text-white/15 flex items-center gap-1.5">
              <Zap className="h-3 w-3" />
              Channel tokens are configured after the agent is created, on the agent detail page.
            </p>
          </div>

          {/* Divider */}
          <div className="h-px bg-white/[0.06]" />

          {/* Model Selection */}
          <div className="space-y-4">
            <div>
              <h2 className="text-[20px] font-bold text-white">Model</h2>
              <p className="text-[13px] text-white/30 mt-0.5">Which AI model powers this agent?</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {MODELS.map(m => {
                const active = config.model === m.id;
                return (
                  <button key={m.id}
                    onClick={() => setConfig(prev => ({ ...prev, model: m.id }))}
                    className={`text-left p-4 rounded-xl border transition-all ${
                      active
                        ? 'bg-white/[0.06] border-white/[0.15]'
                        : 'bg-white/[0.02] border-white/[0.06] hover:border-white/[0.1]'
                    }`}>
                    <p className={`text-[13px] font-medium ${active ? 'text-white' : 'text-white/50'}`}>{m.name}</p>
                    <p className="text-[11px] text-white/20 mt-0.5">{m.tier}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between pt-4 border-t border-white/[0.06]">
            <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
              <ArrowLeft className="h-3.5 w-3.5" /> Back to Configure
            </Button>
            <Button variant="primary" size="sm" onClick={() => setStep(3)}
              disabled={!config.name.trim()}>
              Review & Create <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* ═══════════════════════ STEP 3: Review & Create ═══════════════════════ */}
      {step === 3 && !createSuccess && (
        <div className="max-w-3xl mx-auto px-6 py-8 space-y-6 animate-fade-up">
          <div className="text-center space-y-2">
            <h2 className="text-[24px] font-bold text-white">Review Your Agent</h2>
            <p className="text-[14px] text-white/30">Everything looks good? Hit create to deploy.</p>
          </div>

          {/* Summary Card */}
          <Card className="!p-0 overflow-hidden">
            {/* Identity */}
            <div className="p-6 border-b border-white/[0.06]">
              <div className="flex items-start gap-4">
                <div className="h-14 w-14 rounded-2xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center">
                  {selectedTemplate
                    ? <span className="text-2xl">{selectedTemplate.icon}</span>
                    : <Bot className="h-7 w-7 text-white/30" />}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-[20px] font-bold text-white">{config.name || 'Unnamed Agent'}</h3>
                  <p className="text-[14px] text-white/40 mt-1">{config.purpose || 'No purpose defined'}</p>
                </div>
              </div>
            </div>

            {/* Details Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-white/[0.06]">
              {/* Model */}
              <div className="p-5">
                <p className="text-[11px] text-white/25 uppercase tracking-wider font-medium mb-2">Model</p>
                <p className="text-[14px] text-white/70">
                  {MODELS.find(m => m.id === config.model)?.name || config.model}
                </p>
              </div>

              {/* Channels */}
              <div className="p-5">
                <p className="text-[11px] text-white/25 uppercase tracking-wider font-medium mb-2">Channels</p>
                {config.channels.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {config.channels.map(ch => {
                      const c = CHANNELS.find(x => x.id === ch);
                      return (
                        <span key={ch} className="text-[12px] text-white/50 bg-white/[0.04] border border-white/[0.06] px-2 py-0.5 rounded-full">
                          {c?.emoji} {c?.name || ch}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[13px] text-white/25">None selected</p>
                )}
              </div>
            </div>

            {/* Skills */}
            <div className="border-t border-white/[0.06] p-5">
              <p className="text-[11px] text-white/25 uppercase tracking-wider font-medium mb-3">
                Skills ({config.skills.length})
              </p>
              {config.skills.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {config.skills.map(s => {
                    const skill = SKILLS_CATALOG.find(x => x.id === s);
                    return (
                      <span key={s} className="text-[12px] text-white/50 bg-white/[0.04] border border-white/[0.06] px-2.5 py-1 rounded-lg">
                        {skill?.name || s}
                      </span>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[13px] text-white/25">No skills selected — agent will have default capabilities</p>
              )}
            </div>

            {/* Instructions */}
            {config.instructions && (
              <div className="border-t border-white/[0.06] p-5">
                <p className="text-[11px] text-white/25 uppercase tracking-wider font-medium mb-2">Instructions</p>
                <p className="text-[13px] text-white/40 leading-relaxed whitespace-pre-wrap">{config.instructions}</p>
              </div>
            )}

            {/* Config Preview */}
            <div className="border-t border-white/[0.06] p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[11px] text-white/25 uppercase tracking-wider font-medium">Config Preview</p>
                <div className="flex bg-white/[0.04] rounded-md p-0.5">
                  <button onClick={() => setConfigView('yaml')}
                    className={`px-2 py-0.5 rounded text-[10px] font-medium ${configView === 'yaml' ? 'bg-white/[0.08] text-white/60' : 'text-white/20'}`}>
                    YAML
                  </button>
                  <button onClick={() => setConfigView('json')}
                    className={`px-2 py-0.5 rounded text-[10px] font-medium ${configView === 'json' ? 'bg-white/[0.08] text-white/60' : 'text-white/20'}`}>
                    JSON
                  </button>
                </div>
              </div>
              <pre className="text-[11px] text-white/30 font-mono bg-white/[0.02] border border-white/[0.04] rounded-lg p-4 overflow-x-auto leading-relaxed">
                {configView === 'yaml' ? configToYaml(config) : configToJson(config)}
              </pre>
            </div>
          </Card>

          {/* Error */}
          {createError && (
            <div className="border border-red-500/20 bg-red-500/5 rounded-xl px-4 py-3 flex items-center gap-3">
              <X className="h-4 w-4 text-red-400 shrink-0" />
              <p className="text-[13px] text-red-400 flex-1">{createError}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => setStep(2)}>
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </Button>
            <div className="flex items-center gap-3">
              <Button variant="glass" size="sm" onClick={() => setStep(1)}>
                <MessageSquare className="h-3.5 w-3.5" /> Edit with AI
              </Button>
              <Button variant="primary" size="lg" onClick={handleCreate}
                loading={creating} disabled={!config.name.trim() || creating}>
                <Sparkles className="h-4 w-4" /> Create Agent
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════ Success Screen ═══════════════════════ */}
      {createSuccess && (
        <div className="max-w-lg mx-auto px-6 py-16 text-center space-y-6 animate-fade-up">
          <div className="inline-flex items-center justify-center h-20 w-20 rounded-3xl bg-green-500/10 border border-green-500/20 mx-auto">
            <Check className="h-10 w-10 text-green-400" />
          </div>
          <div className="space-y-2">
            <h2 className="text-[24px] font-bold text-white">Agent Created</h2>
            <p className="text-[14px] text-white/40">
              <strong className="text-white/70">{config.name}</strong> has been deployed to your OpenClaw container.
              {config.channels.length > 0 && ' Head to the agent settings to configure channel tokens.'}
            </p>
          </div>
          <div className="flex items-center justify-center gap-3">
            <Button variant="glass" size="sm" onClick={resetCreator}>
              <Sparkles className="h-3.5 w-3.5" /> Create Another
            </Button>
            <Button variant="primary" size="sm" onClick={() => router.push('/dashboard/agents')}>
              View All Agents <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Subcomponents ───

function QuickPrompt({ text, onClick }: { text: string; onClick: (text: string) => void }) {
  return (
    <button
      onClick={() => onClick(text)}
      className="text-[12px] text-white/30 border border-white/[0.08] rounded-full px-3 py-1.5 hover:bg-white/[0.04] hover:text-white/50 hover:border-white/[0.12] transition-all"
    >
      {text}
    </button>
  );
}

/** Strip YAML blocks from displayed chat content, show conversational text only */
function formatChatContent(content: string): string {
  return content.replace(/```yaml[\s\S]*?```/g, '').replace(/<!-- FINAL -->/g, '').trim();
}
