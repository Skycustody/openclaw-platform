'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import api from '@/lib/api';
import {
  Globe, Code, FileText, Brain, Search, Wrench,
  Loader2, Power, PowerOff, AlertTriangle, RefreshCw,
  Terminal, Image, Users, Clock, Key, ChevronDown, ChevronUp,
  MessageSquare, Music, Home, Shield, Zap, Camera, Mail,
  Download, Package, Check,
} from 'lucide-react';

/* ── Tool metadata (built-in OpenClaw tools) ── */
const TOOL_META: Record<string, { label: string; desc: string; icon: typeof Globe; cat: string }> = {
  web_search:     { label: 'Web Search',        desc: 'AI-powered web search via Perplexity Sonar through OpenRouter.',              icon: Search,   cat: 'Research' },
  web_fetch:      { label: 'Web Fetch',          desc: 'Fetch any URL and extract readable content (HTML to markdown).',              icon: Globe,    cat: 'Research' },
  browser:        { label: 'Web Browser',        desc: 'Full browser automation — navigate, click, type, screenshot.',                icon: Globe,    cat: 'Research' },
  exec:           { label: 'Shell / Terminal',    desc: 'Run shell commands in a sandboxed container.',                                icon: Terminal,  cat: 'Development' },
  read:           { label: 'File Read',           desc: 'Read file contents from the agent workspace.',                                icon: FileText, cat: 'Files' },
  write:          { label: 'File Write',          desc: 'Create and write files in the agent workspace.',                              icon: FileText, cat: 'Files' },
  edit:           { label: 'File Edit',           desc: 'Edit existing files with precise replacements.',                              icon: FileText, cat: 'Files' },
  memory_search:  { label: 'Memory Search',       desc: 'Search stored memories across conversations.',                                icon: Brain,    cat: 'Intelligence' },
  memory_get:     { label: 'Memory Recall',        desc: 'Retrieve a specific memory entry by ID.',                                    icon: Brain,    cat: 'Intelligence' },
  image:          { label: 'Image Analysis',       desc: 'Analyze images using vision models.',                                        icon: Image,    cat: 'Intelligence' },
  sessions_spawn: { label: 'Sub-Agents',           desc: 'Spawn sub-agent sessions for parallel tasks.',                               icon: Users,    cat: 'Multi-Agent' },
  sessions_list:  { label: 'Session List',         desc: 'List all active agent sessions.',                                            icon: Users,    cat: 'Multi-Agent' },
  sessions_send:  { label: 'Session Messaging',    desc: 'Send messages between agent sessions.',                                     icon: Users,    cat: 'Multi-Agent' },
  session_status: { label: 'Session Status',       desc: 'Check or update session status and model.',                                  icon: Users,    cat: 'Multi-Agent' },
  cron:           { label: 'Cron / Scheduler',     desc: 'Create scheduled tasks and automations.',                                    icon: Clock,    cat: 'Automation' },
};

/* ── Bundled skill metadata (all OpenClaw bundled skills) ── */
interface SkillMeta {
  label: string;
  emoji: string;
  desc: string;
  cat: string;
  icon: typeof Globe;
  envKey?: string;
  envLabel?: string;
  requiresBin?: string[];
  requiresOs?: string;
  canUseOpenRouter?: boolean;
}

const BUNDLED_SKILLS: Record<string, SkillMeta> = {
  'weather':            { label: 'Weather',            emoji: '🌤️', desc: 'Get current weather and forecasts via wttr.in or Open-Meteo.',                          cat: 'Productivity',  icon: Globe,    },
  'healthcheck':        { label: 'Security Hardening',  emoji: '🛡️', desc: 'Host security audits, firewall/SSH/update checks for deployments.',                    cat: 'DevOps',        icon: Shield,   },
  'skill-creator':      { label: 'Skill Creator',       emoji: '🧩', desc: 'Create or update AgentSkills. Design and package skills with scripts.',                cat: 'Development',   icon: Wrench,   },
  'coding-agent':       { label: 'Coding Agent',        emoji: '🧩', desc: 'Delegate coding tasks to sub-agents. Build features, fix bugs, refactor code.',       cat: 'Development',   icon: Code,     },
  'github':             { label: 'GitHub',               emoji: '🐙', desc: 'GitHub operations via gh CLI: issues, PRs, CI runs, code review.',                   cat: 'Development',   icon: Code,     requiresBin: ['gh'] },
  'gh-issues':          { label: 'GitHub Issues',        emoji: '📋', desc: 'Fetch issues, spawn sub-agents for fixes, open PRs, address review comments.',       cat: 'Development',   icon: Code,     requiresBin: ['gh'] },
  'clawhub':            { label: 'ClawHub',              emoji: '📦', desc: 'Search, install, update, and publish agent skills from clawhub.com.',                 cat: 'Development',   icon: Wrench,   requiresBin: ['clawhub'] },
  'tmux':               { label: 'Tmux',                 emoji: '🧵', desc: 'Remote-control tmux sessions for interactive CLIs.',                                  cat: 'Development',   icon: Terminal,  requiresBin: ['tmux'] },
  'session-logs':       { label: 'Session Logs',         emoji: '📜', desc: 'Search and analyze your own session logs using jq.',                                  cat: 'Development',   icon: FileText, requiresBin: ['jq', 'rg'] },
  'summarize':          { label: 'Summarize',            emoji: '🧾', desc: 'Summarize or extract text/transcripts from URLs, podcasts, and local files.',         cat: 'Research',      icon: FileText, requiresBin: ['summarize'] },
  'video-frames':       { label: 'Video Frames',         emoji: '🎞️', desc: 'Extract frames or short clips from videos using ffmpeg.',                            cat: 'Media',         icon: Camera,   requiresBin: ['ffmpeg'] },
  'notion':             { label: 'Notion',                emoji: '📝', desc: 'Notion API for creating and managing pages, databases, and blocks.',                 cat: 'Productivity',  icon: FileText, envKey: 'NOTION_API_KEY', envLabel: 'Notion API Key' },
  'trello':             { label: 'Trello',                emoji: '📋', desc: 'Manage Trello boards, lists, and cards via the Trello REST API.',                    cat: 'Productivity',  icon: FileText, envKey: 'TRELLO_API_KEY', envLabel: 'Trello API Key' },
  'nano-banana-pro':    { label: 'Image Generation',     emoji: '🍌', desc: 'Generate or edit images via Gemini 3 Pro Image.',                                     cat: 'AI / Creative', icon: Image,    requiresBin: ['uv'], canUseOpenRouter: true },
  'openai-image-gen':   { label: 'OpenAI Images',        emoji: '🖼️', desc: 'Batch-generate images via OpenAI Images API with gallery.',                          cat: 'AI / Creative', icon: Image,    canUseOpenRouter: true },
  'openai-whisper-api': { label: 'Speech to Text (API)', emoji: '☁️', desc: 'Transcribe audio via OpenAI Whisper API.',                                            cat: 'AI / Creative', icon: Music,    canUseOpenRouter: true },
  'openai-whisper':     { label: 'Speech to Text (Local)',emoji: '🎙️', desc: 'Local speech-to-text with the Whisper CLI (no API key).',                           cat: 'AI / Creative', icon: Music,    requiresBin: ['whisper'] },
  'gemini':             { label: 'Gemini CLI',            emoji: '♊', desc: 'Gemini CLI for one-shot Q&A, summaries, and generation.',                              cat: 'AI / Creative', icon: Brain,    requiresBin: ['gemini'] },
  'oracle':             { label: 'Oracle CLI',            emoji: '🧿', desc: 'Prompt + file bundling, engines, sessions, and file attachment patterns.',            cat: 'AI / Creative', icon: Brain,    requiresBin: ['oracle'] },
  'himalaya':           { label: 'Email (Himalaya)',      emoji: '📧', desc: 'Manage emails via IMAP/SMTP: list, read, write, reply, forward, search.',            cat: 'Communication', icon: Mail,     requiresBin: ['himalaya'] },
  'gog':                { label: 'Google Workspace',      emoji: '🎮', desc: 'Gmail, Calendar, Drive, Contacts, Sheets, and Docs via gog CLI.',                   cat: 'Productivity',  icon: Globe,    requiresBin: ['gog'] },
  'goplaces':           { label: 'Google Places',         emoji: '📍', desc: 'Query Google Places API for text search, details, and reviews.',                     cat: 'Research',      icon: Search,   envKey: 'GOOGLE_PLACES_API_KEY', envLabel: 'Google Places Key', requiresBin: ['goplaces'] },
  'discord':            { label: 'Discord',               emoji: '🎮', desc: 'Discord ops via the message tool.',                                                  cat: 'Communication', icon: MessageSquare },
  'slack':              { label: 'Slack',                  emoji: '💬', desc: 'Slack operations via the message tool.',                                             cat: 'Communication', icon: MessageSquare },
  'wacli':              { label: 'WhatsApp CLI',           emoji: '📱', desc: 'Send WhatsApp messages or search/sync history.',                                    cat: 'Communication', icon: MessageSquare, requiresBin: ['wacli'] },
  'xurl':               { label: 'X / Twitter',           emoji: '𝕏',  desc: 'Post tweets, reply, quote, search, read timelines via X API.',                      cat: 'Communication', icon: MessageSquare, requiresBin: ['xurl'] },
  'voice-call':         { label: 'Voice Call',             emoji: '📞', desc: 'Start voice calls via the OpenClaw voice-call plugin.',                             cat: 'Communication', icon: MessageSquare },
  'sag':                { label: 'Text-to-Speech (Cloud)', emoji: '🗣️', desc: 'ElevenLabs text-to-speech.',                                                       cat: 'Media',         icon: Music,    envKey: 'ELEVENLABS_API_KEY', envLabel: 'ElevenLabs Key', requiresBin: ['sag'] },
  'sherpa-onnx-tts':    { label: 'Text-to-Speech (Local)', emoji: '🗣️', desc: 'Local TTS via sherpa-onnx (offline, no cloud).',                                   cat: 'Media',         icon: Music   },
  'songsee':            { label: 'Audio Visualizer',       emoji: '🌊', desc: 'Generate spectrograms from audio with songsee CLI.',                                cat: 'Media',         icon: Music,    requiresBin: ['songsee'] },
  'gifgrep':            { label: 'GIF Search',             emoji: '🧲', desc: 'Search GIF providers, download results, extract stills.',                           cat: 'Media',         icon: Search,   requiresBin: ['gifgrep'] },
  'spotify-player':     { label: 'Spotify',                emoji: '🎵', desc: 'Terminal Spotify playback and search.',                                              cat: 'Media',         icon: Music   },
  'openhue':            { label: 'Philips Hue',            emoji: '💡', desc: 'Control Philips Hue lights and scenes.',                                             cat: 'Smart Home',    icon: Home,     requiresBin: ['openhue'] },
  'sonoscli':           { label: 'Sonos',                  emoji: '🔊', desc: 'Control Sonos speakers: discover, play, volume, group.',                             cat: 'Smart Home',    icon: Home,     requiresBin: ['sonos'] },
  'blucli':             { label: 'BluOS',                  emoji: '🫐', desc: 'BluOS CLI for discovery, playback, grouping, and volume.',                           cat: 'Smart Home',    icon: Home,     requiresBin: ['blu'] },
  'eightctl':           { label: 'Eight Sleep',            emoji: '🎛️', desc: 'Control Eight Sleep pods: status, temperature, alarms.',                            cat: 'Smart Home',    icon: Home,     requiresBin: ['eightctl'] },
  'camsnap':            { label: 'Camera Capture',         emoji: '📸', desc: 'Capture frames or clips from RTSP/ONVIF cameras.',                                  cat: 'Smart Home',    icon: Camera,   requiresBin: ['camsnap'] },
  '1password':          { label: '1Password',              emoji: '🔐', desc: 'Use 1Password CLI (op) for secrets and credential management.',                     cat: 'Security',      icon: Key,      requiresBin: ['op'] },
  'blogwatcher':        { label: 'Blog Watcher',           emoji: '📰', desc: 'Monitor blogs and RSS/Atom feeds for updates.',                                     cat: 'Research',      icon: Globe,    requiresBin: ['blogwatcher'] },
  'mcporter':           { label: 'MCP Tools',              emoji: '📦', desc: 'List, configure, auth, and call MCP servers/tools directly.',                       cat: 'Development',   icon: Wrench,   requiresBin: ['mcporter'] },
  'nano-pdf':           { label: 'PDF Editor',             emoji: '📄', desc: 'Edit PDFs with natural-language instructions.',                                      cat: 'Productivity',  icon: FileText, requiresBin: ['nano-pdf'] },
  'obsidian':           { label: 'Obsidian',               emoji: '💎', desc: 'Work with Obsidian vaults (plain Markdown notes).',                                  cat: 'Productivity',  icon: FileText, requiresBin: ['obsidian-cli'] },
  'ordercli':           { label: 'Food Delivery',          emoji: '🛵', desc: 'Check past orders and active order status on Foodora.',                              cat: 'Productivity',  icon: Wrench,   requiresBin: ['ordercli'] },
  'apple-notes':        { label: 'Apple Notes',            emoji: '📝', desc: 'Manage Apple Notes via memo CLI (macOS only).',                                     cat: 'Productivity',  icon: FileText, requiresOs: 'darwin' },
  'apple-reminders':    { label: 'Apple Reminders',        emoji: '⏰', desc: 'Manage Apple Reminders via remindctl CLI (macOS only).',                             cat: 'Productivity',  icon: Clock,    requiresOs: 'darwin' },
  'bear-notes':         { label: 'Bear Notes',             emoji: '🐻', desc: 'Create, search, and manage Bear notes (macOS only).',                                cat: 'Productivity',  icon: FileText, requiresOs: 'darwin' },
  'things-mac':         { label: 'Things 3',               emoji: '✅', desc: 'Manage Things 3 via the things CLI (macOS only).',                                   cat: 'Productivity',  icon: FileText, requiresOs: 'darwin' },
  'peekaboo':           { label: 'Peekaboo',               emoji: '👀', desc: 'Capture and automate macOS UI (macOS only).',                                        cat: 'Productivity',  icon: Camera,   requiresOs: 'darwin' },
  'imsg':               { label: 'iMessage',               emoji: '📨', desc: 'iMessage/SMS CLI for listing chats and sending messages (macOS only).',              cat: 'Communication', icon: MessageSquare, requiresOs: 'darwin' },
  'bluebubbles':        { label: 'BlueBubbles',            emoji: '🫧', desc: 'Send/manage iMessages via BlueBubbles.',                                              cat: 'Communication', icon: MessageSquare },
};

const CATEGORY_ORDER = [
  'Research', 'Development', 'Files', 'Intelligence', 'Multi-Agent', 'Automation',
  'Productivity', 'AI / Creative', 'Communication', 'Media', 'Smart Home', 'DevOps', 'Security',
];

interface SkillsData {
  enabled: string[];
  disabled: string[];
  available: string[];
  config: Record<string, any>;
  skills: any[];
  skillsConfig: Record<string, any>;
  notProvisioned?: boolean;
}

interface PlatformSkill {
  id: string;
  label: string;
  description: string;
  category: string;
  repoPath: string;
  emoji?: string;
}

export default function SkillsPage() {
  const [data, setData] = useState<SkillsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set(CATEGORY_ORDER.slice(0, 6)));
  const [apiKeyInputs, setApiKeyInputs] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<'tools' | 'skills' | 'marketplace'>('tools');
  const [marketplaceSkills, setMarketplaceSkills] = useState<PlatformSkill[]>([]);
  const [installingSkill, setInstallingSkill] = useState<string | null>(null);

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

  const fetchMarketplace = useCallback(async () => {
    try {
      const res = await api.get<{ skills: PlatformSkill[] }>('/skills/marketplace');
      setMarketplaceSkills(res.skills || []);
    } catch {
      setMarketplaceSkills([]);
    }
  }, []);

  useEffect(() => { fetchMarketplace(); }, [fetchMarketplace]);

  const installSkill = async (skillId: string) => {
    setInstallingSkill(skillId);
    try {
      await api.post('/skills/install', { skillId });
      await fetchSkills();
    } catch (err: any) {
      setError(err.message || 'Failed to install skill');
    } finally {
      setInstallingSkill(null);
    }
  };

  const toggleTool = async (name: string, enable: boolean) => {
    setToggling(prev => new Set(prev).add(name));
    setData(prev => {
      if (!prev) return prev;
      const enabled = enable
        ? [...prev.enabled.filter(t => t !== name), name]
        : prev.enabled.filter(t => t !== name);
      const disabled = enable
        ? prev.disabled.filter(t => t !== name)
        : [...prev.disabled.filter(t => t !== name), name];
      return { ...prev, enabled, disabled };
    });
    try {
      await api.put(`/skills/tool/${name}`, { enabled: enable });
      fetchSkills();
    } catch (err: any) {
      setError(err.message || 'Failed to update');
      fetchSkills();
    } finally {
      setToggling(prev => { const next = new Set(prev); next.delete(name); return next; });
    }
  };

  const toggleSkill = async (name: string, enable: boolean, envKey?: string) => {
    setToggling(prev => new Set(prev).add(name));
    setData(prev => {
      if (!prev) return prev;
      const skillsConfig = { ...prev.skillsConfig };
      skillsConfig[name] = { ...skillsConfig[name], enabled: enable };
      return { ...prev, skillsConfig };
    });
    try {
      const body: any = { enabled: enable };
      const keyVal = apiKeyInputs[name];
      if (envKey && keyVal) {
        body.apiKey = keyVal;
        body.envKey = envKey;
      }
      await api.put(`/skills/bundled/${name}`, body);
      fetchSkills();
      if (keyVal) setApiKeyInputs(prev => ({ ...prev, [name]: '' }));
    } catch (err: any) {
      setError(err.message || 'Failed to update skill');
      fetchSkills();
    } finally {
      setToggling(prev => { const next = new Set(prev); next.delete(name); return next; });
    }
  };

  const toggleCat = (cat: string) => {
    setExpandedCats(prev => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  };

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

  const enabledSet = new Set(data?.enabled || []);
  const skillsConfig = data?.skillsConfig || {};

  const apiTools = [...new Set([...(data?.enabled || []), ...(data?.disabled || [])])];
  const allTools = [...new Set([...Object.keys(TOOL_META), ...apiTools])];

  const toolsByCat: Record<string, string[]> = {};
  for (const name of allTools) {
    const meta = TOOL_META[name];
    const cat = meta?.cat || 'Other';
    if (!toolsByCat[cat]) toolsByCat[cat] = [];
    toolsByCat[cat].push(name);
  }

  const skillsByCat: Record<string, string[]> = {};
  for (const [name, meta] of Object.entries(BUNDLED_SKILLS)) {
    if (!skillsByCat[meta.cat]) skillsByCat[meta.cat] = [];
    skillsByCat[meta.cat].push(name);
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-3">
            <h1 className="text-[26px] font-bold text-white tracking-tight">Skills & Tools</h1>
            {loading ? (
              <Badge variant="default"><Loader2 className="h-3 w-3 animate-spin" /></Badge>
            ) : (
              <Badge variant="accent">{data?.enabled?.length || 0} tools active</Badge>
            )}
          </div>
          <Button variant="glass" size="sm" onClick={fetchSkills} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
        <p className="text-[15px] text-white/40">
          Manage your agent&apos;s capabilities — built-in tools and OpenClaw bundled skills
        </p>
      </div>

      {error && (
        <div className="border border-red-500/20 bg-red-500/5 rounded-xl px-4 py-3 text-[13px] text-red-400">
          {error}
        </div>
      )}

      {/* Tab switcher */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab('tools')}
          className={`px-4 py-2 rounded-lg text-[14px] font-medium transition-all ${
            tab === 'tools' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/60'
          }`}
        >
          Built-in Tools ({allTools.length})
        </button>
        <button
          onClick={() => setTab('skills')}
          className={`px-4 py-2 rounded-lg text-[14px] font-medium transition-all ${
            tab === 'skills' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/60'
          }`}
        >
          Bundled Skills ({Object.keys(BUNDLED_SKILLS).length})
        </button>
            <button
          onClick={() => setTab('marketplace')}
          className={`px-4 py-2 rounded-lg text-[14px] font-medium transition-all ${
            tab === 'marketplace' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/60'
          }`}
        >
          <Package className="h-3.5 w-3.5 inline mr-1" />
          Skill Marketplace ({marketplaceSkills.length || '…'})
            </button>
      </div>

      {/* Built-in tools tab */}
      {tab === 'tools' && (
        <div className="space-y-4">
          {CATEGORY_ORDER.filter(c => toolsByCat[c]).map(cat => (
            <div key={cat}>
              <button
                onClick={() => toggleCat(cat)}
                className="flex items-center gap-2 mb-3 text-[14px] font-semibold text-white/60 hover:text-white/80 transition-colors"
              >
                {expandedCats.has(cat) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                {cat}
                <span className="text-white/25">({toolsByCat[cat].length})</span>
              </button>
              {expandedCats.has(cat) && (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mb-4">
                  {toolsByCat[cat].map(name => {
                    const meta = TOOL_META[name] || { label: name, desc: `OpenClaw tool: ${name}`, icon: Wrench, cat: 'Other' };
                    const Icon = meta.icon;
                    const isEnabled = enabledSet.has(name);
                  return (
                      <Card key={name} className={`transition-all ${loading ? 'animate-pulse' : ''} ${isEnabled ? 'ring-1 ring-emerald-500/10' : ''}`}>
                        <div className="flex items-start gap-3 mb-2">
                          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${loading ? 'bg-white/5' : isEnabled ? 'bg-emerald-500/10' : 'bg-white/5'}`}>
                            <Icon className={`h-4.5 w-4.5 ${loading ? 'text-white/20' : isEnabled ? 'text-emerald-400' : 'text-white/40'}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                              <h3 className={`text-[14px] font-semibold ${loading ? 'text-white/40' : isEnabled ? 'text-white' : 'text-white/70'}`}>{meta.label}</h3>
                              {loading ? (
                                <div className="h-5 w-12 rounded-full bg-white/5" />
                              ) : isEnabled ? <Badge variant="green" dot>Active</Badge> : <Badge variant="default">Off</Badge>}
                            </div>
                          </div>
                        </div>
                        <p className="text-[12px] text-white/40 leading-relaxed mb-3">{meta.desc}</p>
                        {loading ? (
                          <div className="h-8 w-20 rounded-lg bg-white/5" />
                        ) : (
                          <Button
                            variant={isEnabled ? 'glass' : 'primary'} size="sm"
                            loading={toggling.has(name)}
                            onClick={() => toggleTool(name, !isEnabled)}
                          >
                            {isEnabled ? <><PowerOff className="h-3.5 w-3.5" /> Disable</> : <><Power className="h-3.5 w-3.5" /> Enable</>}
                        </Button>
                        )}
                    </Card>
                  );
                })}
              </div>
              )}
            </div>
          ))}
            </div>
          )}

      {/* Bundled skills tab */}
      {tab === 'skills' && (
        <div className="space-y-4">
          {CATEGORY_ORDER.filter(c => skillsByCat[c]).map(cat => (
            <div key={cat}>
              <button
                onClick={() => toggleCat(cat)}
                className="flex items-center gap-2 mb-3 text-[14px] font-semibold text-white/60 hover:text-white/80 transition-colors"
              >
                {expandedCats.has(cat) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                {cat}
                <span className="text-white/25">({skillsByCat[cat].length})</span>
              </button>
              {expandedCats.has(cat) && (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mb-4">
                  {skillsByCat[cat].map(name => {
                    const meta = BUNDLED_SKILLS[name];
                    const Icon = meta.icon;
                    const isEnabled = skillsConfig[name]?.enabled === true || enabledSet.has(name);
                    const isMacOnly = meta.requiresOs === 'darwin';
                    const needsBin = meta.requiresBin && meta.requiresBin.length > 0;
                    const needsKey = !!meta.envKey && !meta.canUseOpenRouter;
                    const hasKey = meta.canUseOpenRouter || !!(skillsConfig[name]?.env?.[meta.envKey || '']);

                    let statusLabel = 'Available';
                    let statusVariant: 'green' | 'default' | 'accent' = 'default';
                    if (isEnabled) { statusLabel = 'Active'; statusVariant = 'green'; }
                    else if (isMacOnly) { statusLabel = 'macOS only'; }
                    else if (needsBin) { statusLabel = 'Needs CLI'; }
                    else if (meta.canUseOpenRouter) { statusLabel = 'Auto-key'; statusVariant = 'green'; }
                    else if (needsKey && !hasKey) { statusLabel = 'Needs Key'; statusVariant = 'accent'; }

                  return (
                      <Card key={name} className={`transition-all ${isEnabled ? 'ring-1 ring-emerald-500/10' : ''}`}>
                        <div className="flex items-start gap-3 mb-2">
                          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg ${isEnabled ? 'bg-emerald-500/10' : 'bg-white/5'}`}>
                            {meta.emoji}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className={`text-[14px] font-semibold ${isEnabled ? 'text-white' : 'text-white/70'}`}>{meta.label}</h3>
                              {isEnabled ? (
                                <Badge variant="green" dot>Active</Badge>
                              ) : (
                                <Badge variant={statusVariant}>{statusLabel}</Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        <p className="text-[12px] text-white/40 leading-relaxed mb-3">{meta.desc}</p>

                        {meta.canUseOpenRouter && !isEnabled && (
                          <div className="mb-3 px-2.5 py-1.5 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
                            <span className="text-[11px] text-emerald-400/70">Uses your included OpenRouter key — no extra setup</span>
                          </div>
                        )}

                        {needsKey && !hasKey && !isMacOnly && !meta.canUseOpenRouter && (
                          <div className="mb-3">
                            <input
                              type="password"
                              placeholder={meta.envLabel || 'API Key'}
                              value={apiKeyInputs[name] || ''}
                              onChange={e => setApiKeyInputs(prev => ({ ...prev, [name]: e.target.value }))}
                              className="w-full px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[12px] text-white placeholder-white/25 focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
                            />
                      </div>
                        )}

                        {loading ? (
                          <div className="h-8 w-20 rounded-lg bg-white/5" />
                        ) : isMacOnly ? (
                          <div className="text-[11px] text-white/25">Not available in cloud containers</div>
                        ) : (
                          <Button
                            variant={isEnabled ? 'glass' : 'primary'} size="sm"
                            loading={toggling.has(name)}
                            onClick={() => toggleSkill(name, !isEnabled, meta.envKey)}
                            disabled={needsKey && !hasKey && !isEnabled && !apiKeyInputs[name]}
                          >
                            {isEnabled ? (
                              <><PowerOff className="h-3.5 w-3.5" /> Disable</>
                            ) : needsKey && !hasKey ? (
                              <><Key className="h-3.5 w-3.5" /> Save Key & Enable</>
                            ) : (
                              <><Power className="h-3.5 w-3.5" /> Enable</>
                            )}
                        </Button>
                      )}
                    </Card>
                  );
                })}
              </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Skill Marketplace tab */}
      {tab === 'marketplace' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
            <p className="text-[13px] text-white/50">
              Install community skills from the OpenClaw registry. Each skill is fetched from GitHub and added to your agent.
            </p>
            <div className="flex gap-2 items-start rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
              <Shield className="h-4 w-4 shrink-0 text-amber-400/80 mt-0.5" />
              <div className="text-[12px] text-amber-200/80">
                <strong>Safety notice:</strong> Community skills are not audited by us. Some may use external APIs, access credentials, or run code. Review skills on{' '}
                <a href="https://clawhub.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-amber-100">ClawHub</a> for VirusTotal reports before installing.
              </div>
            </div>
          </div>
          {data?.notProvisioned ? (
            <div className="text-center py-8 text-white/40 text-[14px]">
              Open your agent first to install skills.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {marketplaceSkills.map(skill => {
                const isInstalled = skillsConfig[skill.id]?.enabled === true || enabledSet.has(skill.id);
                const isInstalling = installingSkill === skill.id;
                return (
                  <Card key={skill.id} className={isInstalled ? 'ring-1 ring-emerald-500/10' : ''}>
                    <div className="flex items-start gap-3 mb-2">
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg ${isInstalled ? 'bg-emerald-500/10' : 'bg-white/5'}`}>
                        {skill.emoji || '📦'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-[14px] font-semibold text-white">{skill.label}</h3>
                          {isInstalled ? (
                            <Badge variant="green"><Check className="h-3 w-3" /> Installed</Badge>
                          ) : (
                            <Badge variant="default">{skill.category}</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <p className="text-[12px] text-white/40 leading-relaxed mb-3">{skill.description}</p>
                    <Button
                      variant={isInstalled ? 'glass' : 'primary'}
                      size="sm"
                      loading={isInstalling}
                      onClick={() => !isInstalled && installSkill(skill.id)}
                      disabled={isInstalled}
                    >
                      {isInstalled ? (
                        <><Check className="h-3.5 w-3.5" /> Installed</>
                      ) : (
                        <><Download className="h-3.5 w-3.5" /> Install</>
                      )}
                    </Button>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
