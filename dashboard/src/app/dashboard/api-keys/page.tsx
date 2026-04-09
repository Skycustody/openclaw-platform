'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import api from '@/lib/api';
import { KeyRound, Plus, Trash2, Check, Loader2, ExternalLink, LogIn, Zap, Terminal, Cpu, Save, CheckCircle } from 'lucide-react';

// Provider brand logos with real brand colors
function OpenAILogo({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="#10A37F"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/></svg>;
}
function AnthropicLogo({ className }: { className?: string }) {
  return <img src="/claude-icon.png" alt="Claude" className={className || 'h-5 w-5'} />;
}
function GoogleLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}
function XaiLogo({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 1200 1227" fill="#FFFFFF"><path d="M714.163 519.284L1160.89 0H1055.03L667.137 450.887L357.328 0H0L468.492 681.821L0 1226.37H105.866L515.491 750.218L842.672 1226.37H1200L714.137 519.284H714.163ZM569.165 687.828L521.697 619.934L144.011 79.6944H306.615L611.412 515.685L658.88 583.579L1055.08 1150.3H892.476L569.165 687.854V687.828Z"/></svg>;
}
function MistralLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <rect fill="#F7D046" x="0" y="0" width="6" height="6"/>
      <rect fill="#F7D046" x="18" y="0" width="6" height="6"/>
      <rect fill="#F2A73B" x="0" y="9" width="6" height="6"/>
      <rect fill="#EE792F" x="9" y="9" width="6" height="6"/>
      <rect fill="#EB5829" x="18" y="9" width="6" height="6"/>
      <rect fill="#EA3326" x="0" y="18" width="6" height="6"/>
      <rect fill="#EA3326" x="18" y="18" width="6" height="6"/>
    </svg>
  );
}
function GroqLogo({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="#F55036"><path d="M12 1.5C6.21 1.5 1.5 6.21 1.5 12S6.21 22.5 12 22.5 22.5 17.79 22.5 12 17.79 1.5 12 1.5zm0 3.938a6.563 6.563 0 1 1 0 13.124 6.563 6.563 0 0 1 0-13.124zm0 2.624a3.938 3.938 0 1 0 0 7.876 3.938 3.938 0 0 0 0-7.876zm3.938 3.938h3.28v2.625a6.563 6.563 0 0 1-3.28 5.688V12z"/></svg>;
}
function ClaudeCodeLogo({ className }: { className?: string }) {
  return <img src="/claude-icon.png" alt="Claude Code" className={className || 'h-5 w-5'} />;
}

const PROVIDER_LOGOS: Record<string, (props: { className?: string }) => React.ReactElement> = {
  'openai': OpenAILogo,
  'openai-codex': OpenAILogo,
  'anthropic': AnthropicLogo,
  'anthropic-api': AnthropicLogo,
  'claude-code': ClaudeCodeLogo,
  'google': GoogleLogo,
  'xai': XaiLogo,
  'mistral': MistralLogo,
  'groq': GroqLogo,
};

function ProviderIcon({ id, className }: { id: string; className?: string }) {
  const Logo = PROVIDER_LOGOS[id];
  if (Logo) return <Logo className={className || 'h-5 w-5'} />;
  return <KeyRound className={className || 'h-5 w-5'} />;
}

interface ProviderDef {
  id: string;
  name: string;
  placeholder?: string;
  keyUrl?: string;
  mode: 'api_key' | 'setup_token' | 'oauth';
  desc?: string;
}

const MODEL_OPTIONS = [
  { value: 'anthropic/claude-sonnet-4', label: 'Claude Sonnet 4' },
  { value: 'anthropic/claude-opus-4', label: 'Claude Opus 4' },
  { value: 'openai/gpt-4o', label: 'GPT-4o' },
  { value: 'openai/o3', label: 'OpenAI o3' },
  { value: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  { value: 'deepseek/deepseek-r1', label: 'DeepSeek R1' },
];

const PROVIDERS: ProviderDef[] = [
  { id: 'anthropic', name: 'Claude Pro / Max', mode: 'setup_token', desc: 'Use your Anthropic subscription. Run "claude setup-token" in terminal to get your token.', placeholder: 'Paste setup token...' },
  { id: 'openai-codex', name: 'ChatGPT Plus', mode: 'oauth', desc: 'Connect your ChatGPT Plus subscription via browser login.' },
  { id: 'openai', name: 'OpenAI', mode: 'api_key', placeholder: 'sk-...', keyUrl: 'https://platform.openai.com/api-keys' },
  { id: 'anthropic-api', name: 'Anthropic API', mode: 'api_key', placeholder: 'sk-ant-...', keyUrl: 'https://console.anthropic.com/settings/keys' },
  { id: 'google', name: 'Google AI', mode: 'api_key', placeholder: 'AIza...', keyUrl: 'https://aistudio.google.com/apikey' },
  { id: 'xai', name: 'xAI (Grok)', mode: 'api_key', placeholder: 'xai-...', keyUrl: 'https://console.x.ai' },
  { id: 'mistral', name: 'Mistral', mode: 'api_key', placeholder: '...', keyUrl: 'https://console.mistral.ai/api-keys' },
  { id: 'groq', name: 'Groq', mode: 'api_key', placeholder: 'gsk_...', keyUrl: 'https://console.groq.com/keys' },
];

interface ConnectedProvider {
  connected: boolean;
  email?: string;
  type?: string;
}

export default function ApiKeysPage() {
  const [providers, setProviders] = useState<Record<string, ConnectedProvider>>({});
  const [loading, setLoading] = useState(true);
  const [modalProvider, setModalProvider] = useState<ProviderDef | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [oauthUrl, setOauthUrl] = useState<string | null>(null);
  const [ccStatus, setCcStatus] = useState<{ installed: boolean; authenticated: boolean; version: string | null } | null>(null);
  const [ccLoading, setCcLoading] = useState(false);
  const [ccShowInput, setCcShowInput] = useState(false);
  const [ccToken, setCcToken] = useState('');
  const [ccError, setCcError] = useState<string | null>(null);

  // Model + OpenRouter
  const [manualModel, setManualModel] = useState('');
  const [savingModel, setSavingModel] = useState(false);
  const [savedModel, setSavedModel] = useState(false);
  const [openrouterKey, setOpenrouterKey] = useState('');
  const [savingOrKey, setSavingOrKey] = useState(false);
  const [savedOrKey, setSavedOrKey] = useState(false);
  const [hasOrKey, setHasOrKey] = useState(false);

  const loadSettings = async () => {
    try {
      const res = await api.get<{ settings: { manual_model: string | null; has_own_openrouter_key: boolean } }>('/settings');
      setManualModel(res.settings.manual_model || '');
      setHasOrKey(res.settings.has_own_openrouter_key || false);
    } catch {}
  };

  const handleSaveModel = async () => {
    setSavingModel(true); setSavedModel(false);
    try {
      await api.put('/settings', { brain_mode: 'manual', manual_model: manualModel || null });
      setSavedModel(true); setTimeout(() => setSavedModel(false), 3000);
    } catch {} finally { setSavingModel(false); }
  };

  const handleSaveOrKey = async () => {
    if (!openrouterKey.trim()) return;
    setSavingOrKey(true); setSavedOrKey(false);
    try {
      await api.put('/settings', { openrouter_key: openrouterKey.trim() });
      setSavedOrKey(true); setOpenrouterKey(''); setHasOrKey(true);
      setTimeout(() => setSavedOrKey(false), 3000);
    } catch {} finally { setSavingOrKey(false); }
  };

  const loadStatus = async () => {
    try {
      const res = await api.get<{ providers: Record<string, ConnectedProvider> }>('/settings/provider-auth/status');
      setProviders(res.providers || {});
    } catch {}
    setLoading(false);
  };

  const loadCcStatus = async () => {
    try {
      const res = await api.get<{ installed: boolean; authenticated: boolean; version: string | null }>('/settings/claude-code/status');
      setCcStatus(res);
    } catch { setCcStatus({ installed: false, authenticated: false, version: null }); }
  };

  const [ccWaitingForCode, setCcWaitingForCode] = useState(false);

  const handleCcOAuth = async () => {
    setCcLoading(true);
    setCcError(null);
    try {
      const res = await api.get<{ authUrl: string }>('/settings/claude-code/start-oauth');
      if (res.authUrl) {
        const w = 600, h = 700;
        const left = window.screenX + (window.outerWidth - w) / 2;
        const top = window.screenY + (window.outerHeight - h) / 2;
        window.open(res.authUrl, 'claude-oauth', `width=${w},height=${h},left=${left},top=${top}`);
        setCcWaitingForCode(true);
      }
    } catch (err: any) {
      setCcError(err.message || 'Failed to start OAuth');
    }
    setCcLoading(false);
  };

  const handleCcPasteAndConnect = async () => {
    setCcLoading(true);
    setCcError(null);
    try {
      // Try reading from clipboard first
      let code = '';
      try { code = await navigator.clipboard.readText(); } catch {}
      if (!code) {
        // Fallback: prompt
        code = window.prompt('Paste the authentication code from Claude:') || '';
      }
      if (!code.trim()) { setCcLoading(false); return; }

      const res = await api.post<{ ok: boolean; error?: string }>('/settings/claude-code/exchange', { code: code.trim() });
      if (res.ok) {
        setCcWaitingForCode(false);
        await loadCcStatus();
        await loadStatus();
      } else {
        // Session expired — restart the flow automatically
        setCcWaitingForCode(false);
        setCcError((res.error || 'Failed') + ' — click Connect to try again.');
      }
    } catch (err: any) {
      setCcError(err.message || 'Failed');
    }
    setCcLoading(false);
  };

  const handleCcConnect = async () => {
    if (!ccToken.trim()) { setCcShowInput(true); return; }
    setCcLoading(true);
    try {
      const res = await api.post<{ ok: boolean; authenticated?: boolean; error?: string }>('/settings/claude-code/connect', { token: ccToken.trim() });
      if (res.ok) {
        setCcShowInput(false);
        setCcToken('');
        await loadCcStatus();
        await loadStatus();
      } else {
        setSaveStatus({ ok: false, msg: res.error || 'Failed to connect' });
      }
    } catch (err: any) {
      setSaveStatus({ ok: false, msg: err.message || 'Failed' });
    }
    setCcLoading(false);
  };

  // Listen for OAuth popup completion
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'claude-code-auth') {
        if (event.data.success) {
          setCcShowInput(false);
          setCcToken('');
          setCcError(null);
          loadCcStatus();
          loadStatus();
        } else {
          setCcError('OAuth connection failed. Try using a setup token instead.');
          setCcShowInput(true);
        }
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleCcDisconnect = async () => {
    setCcLoading(true);
    try {
      await api.post('/settings/claude-code/disconnect');
      await loadCcStatus();
      await loadStatus();
    } catch {}
    setCcLoading(false);
  };

  useEffect(() => { loadStatus(); loadCcStatus(); loadSettings(); }, []);

  const handleSaveKey = async () => {
    if (!modalProvider || !keyInput.trim()) return;
    setSaving(true);
    setSaveStatus(null);
    try {
      // anthropic-api saves as 'anthropic' provider in auth-profiles
      const providerId = modalProvider.id === 'anthropic-api' ? 'anthropic' : modalProvider.id;
      await api.post('/settings/provider-auth/save-key', { provider: providerId, key: keyInput.trim() });
      setSaveStatus({ ok: true, msg: 'Saved!' });
      setKeyInput('');
      await loadStatus();
      setTimeout(() => { setModalProvider(null); setSaveStatus(null); }, 800);
    } catch (err: any) {
      setSaveStatus({ ok: false, msg: err.message || 'Failed to save' });
    }
    setSaving(false);
  };

  const handleSetupToken = async () => {
    if (!keyInput.trim()) return;
    setSaving(true);
    setSaveStatus(null);
    try {
      await api.post('/settings/provider-auth/anthropic/setup-token', { token: keyInput.trim() });
      setSaveStatus({ ok: true, msg: 'Connected!' });
      setKeyInput('');
      await loadStatus();
      setTimeout(() => { setModalProvider(null); setSaveStatus(null); }, 800);
    } catch (err: any) {
      setSaveStatus({ ok: false, msg: err.message || 'Failed to connect' });
    }
    setSaving(false);
  };

  const handleOAuth = async () => {
    setSaving(true);
    setSaveStatus(null);
    try {
      const res = await api.post<{ url?: string; error?: string }>('/settings/provider-auth/openai/start');
      if (res.url) {
        setOauthUrl(res.url);
        setSaveStatus({ ok: true, msg: 'Complete sign-in in the browser window...' });
        window.open(res.url, '_blank', 'width=600,height=700');
      } else {
        setSaveStatus({ ok: false, msg: res.error || 'Could not start OAuth flow' });
      }
    } catch (err: any) {
      setSaveStatus({ ok: false, msg: err.message || 'Failed to start OAuth' });
    }
    setSaving(false);
  };

  const handleOAuthComplete = async () => {
    if (!keyInput.trim()) return;
    setSaving(true);
    setSaveStatus(null);
    try {
      const res = await api.post<{ success: boolean; error?: string }>('/settings/provider-auth/openai/complete', { redirectUrl: keyInput.trim() });
      if (res.success) {
        setSaveStatus({ ok: true, msg: 'Connected!' });
        setKeyInput('');
        setOauthUrl(null);
        await loadStatus();
        setTimeout(() => { setModalProvider(null); setSaveStatus(null); }, 800);
      } else {
        setSaveStatus({ ok: false, msg: res.error || 'OAuth failed' });
      }
    } catch (err: any) {
      setSaveStatus({ ok: false, msg: err.message || 'OAuth completion failed' });
    }
    setSaving(false);
  };

  const handleDelete = async (providerId: string) => {
    setDeleting(providerId);
    try {
      await api.delete(`/settings/provider-auth/${providerId}`);
      await loadStatus();
    } catch {}
    setDeleting(null);
  };

  const openModal = (p: ProviderDef) => {
    setModalProvider(p);
    setKeyInput('');
    setSaveStatus(null);
    setOauthUrl(null);
  };

  const connectedIds = Object.keys(providers).filter(k => providers[k]?.connected);
  const availableProviders = PROVIDERS.filter(p => {
    if (p.id === 'anthropic-api') return !connectedIds.includes('anthropic');
    return !connectedIds.includes(p.id);
  });

  const subscriptionProviders = availableProviders.filter(p => p.mode === 'setup_token' || p.mode === 'oauth');
  const apiKeyProviders = availableProviders.filter(p => p.mode === 'api_key');

  const getProviderLabel = (id: string) => {
    const def = PROVIDERS.find(p => p.id === id || (p.id === 'anthropic-api' && id === 'anthropic'));
    return def?.name || id;
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[20px] font-semibold text-white/90">API Keys</h1>
        <p className="text-[13px] text-white/40 mt-1">Connect AI providers to your agent. Keys are stored securely in your container.</p>
      </div>

      {/* Default Model */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.04]">
            <Cpu className="h-5 w-5 text-white/50" />
          </div>
          <div>
            <p className="text-[14px] font-medium text-white/90">Default Model</p>
            <p className="text-[12px] text-white/50">Choose which AI model powers your agent</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={manualModel}
            onChange={e => setManualModel(e.target.value)}
            className="flex-1 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[14px] text-white focus:border-white/[0.15] focus:outline-none transition-colors appearance-none"
          >
            <option value="" className="bg-[#2a2a28]">Choose a model...</option>
            {MODEL_OPTIONS.map(m => (
              <option key={m.value} value={m.value} className="bg-[#2a2a28]">{m.label}</option>
            ))}
          </select>
          <Button size="sm" onClick={handleSaveModel} disabled={savingModel}>
            {savingModel ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : savedModel ? <CheckCircle className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
            {savedModel ? 'Saved' : 'Save'}
          </Button>
        </div>
      </div>

      {/* OpenRouter Key */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.04]">
            <KeyRound className="h-5 w-5 text-white/50" />
          </div>
          <div>
            <p className="text-[14px] font-medium text-white/90">OpenRouter</p>
            <p className="text-[12px] text-white/50">
              {hasOrKey ? 'Custom key configured. Enter a new one to replace it.' : 'Bring your own OpenRouter API key for model routing'}
            </p>
          </div>
          {hasOrKey && <Badge variant="green" dot>Connected</Badge>}
        </div>
        <div className="flex items-center gap-3">
          <input
            type="password"
            value={openrouterKey}
            onChange={e => setOpenrouterKey(e.target.value)}
            placeholder={hasOrKey ? 'sk-or-...  (key configured)' : 'sk-or-...'}
            className="flex-1 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[14px] text-white/80 placeholder:text-white/20 focus:border-white/[0.15] focus:outline-none transition-colors"
          />
          <Button size="sm" onClick={handleSaveOrKey} disabled={savingOrKey || !openrouterKey.trim()}>
            {savingOrKey ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : savedOrKey ? <CheckCircle className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
            {savedOrKey ? 'Saved' : 'Save'}
          </Button>
        </div>
      </div>

      {/* Claude Code */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.04]">
              <AnthropicLogo className="h-5 w-5 text-white/40" />
            </div>
            <div>
              <p className="text-[14px] font-medium text-white/85">Claude Code</p>
              <p className="text-[12px] text-white/35">
                {ccStatus?.authenticated ? `Connected \u2014 ${ccStatus.version || 'Claude Code'}` :
                 'Use your Claude Pro/Max subscription as the AI model'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {ccStatus?.authenticated && <Badge variant="green" dot>Connected</Badge>}
            {ccStatus?.authenticated ? (
              <Button variant="glass" size="sm" onClick={handleCcDisconnect} disabled={ccLoading}>
                {ccLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Disconnect'}
              </Button>
            ) : ccWaitingForCode ? (
              <Button size="sm" onClick={handleCcPasteAndConnect} disabled={ccLoading}>
                {ccLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Check className="h-3.5 w-3.5 mr-1.5" />}
                Paste & Connect
              </Button>
            ) : (
              <Button size="sm" onClick={handleCcOAuth} disabled={ccLoading}>
                {ccLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <LogIn className="h-3.5 w-3.5 mr-1.5" />}
                Connect
              </Button>
            )}
          </div>
        </div>
        {ccWaitingForCode && !ccStatus?.authenticated && (
          <div className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2.5">
            <p className="text-[13px] text-amber-300/80">Sign in in the popup, click "Copy Code", then click "Paste & Connect" above.</p>
          </div>
        )}
        {ccError && (
          <div className="mt-2 rounded-lg bg-red-500/10 px-3 py-2 text-[13px] text-red-400/80">{ccError}</div>
        )}
      </div>

      {/* Connected providers */}
      <div className="space-y-3">
        <h2 className="text-[13px] font-medium text-white/50 uppercase tracking-wider">Connected</h2>
        {loading ? (
          <div className="flex items-center gap-2 py-8 justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-white/20" />
            <span className="text-[13px] text-white/30">Loading providers...</span>
          </div>
        ) : connectedIds.length === 0 ? (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-5 py-8 text-center">
            <KeyRound className="h-8 w-8 text-white/10 mx-auto mb-3" />
            <p className="text-[13px] text-white/30">No API keys configured yet</p>
            <p className="text-[12px] text-white/20 mt-1">Add a provider below to get started</p>
          </div>
        ) : (
          <div className="space-y-2">
            {connectedIds.map(id => {
              const prov = providers[id];
              return (
                <div key={id} className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.04]">
                      <ProviderIcon id={id} className="h-4 w-4 text-white/40" />
                    </div>
                    <div>
                      <p className="text-[14px] font-medium text-white/80">{getProviderLabel(id)}</p>
                      <p className="text-[12px] text-white/30">{prov.type === 'api_key' ? 'API Key' : prov.type === 'setup_token' ? 'Subscription' : prov.type}{prov.email ? ` \u00b7 ${prov.email}` : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="green" dot>Connected</Badge>
                    <button
                      onClick={() => handleDelete(id)}
                      disabled={deleting === id}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-white/20 hover:text-red-400/70 hover:bg-white/[0.04] transition-colors"
                      title="Remove"
                    >
                      {deleting === id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Subscription connect */}
      {subscriptionProviders.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-[13px] font-medium text-white/50 uppercase tracking-wider">Connect Subscription</h2>
          <p className="text-[12px] text-white/30 -mt-1">Use your existing Claude or ChatGPT subscription — no API key needed</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {subscriptionProviders.map(p => (
              <button
                key={p.id}
                onClick={() => openModal(p)}
                className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-left hover:border-white/[0.12] hover:bg-white/[0.04] transition-all group"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04] group-hover:bg-white/[0.08] transition-colors">
                  <ProviderIcon id={p.id} className="h-4 w-4 text-white/30 group-hover:text-white/50" />
                </div>
                <span className="text-[13px] font-medium text-white/60 group-hover:text-white/80">{p.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* API key providers */}
      {apiKeyProviders.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-[13px] font-medium text-white/50 uppercase tracking-wider">Add API Key</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {apiKeyProviders.map(p => (
              <button
                key={p.id}
                onClick={() => openModal(p)}
                className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-left hover:border-white/[0.12] hover:bg-white/[0.04] transition-all group"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04] group-hover:bg-white/[0.08] transition-colors">
                  <ProviderIcon id={p.id} className="h-4 w-4 text-white/30 group-hover:text-white/50" />
                </div>
                <span className="text-[13px] font-medium text-white/60 group-hover:text-white/80">{p.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Modal */}
      {modalProvider && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setModalProvider(null); setSaveStatus(null); }} />
          <div className="relative w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#2a2a28] p-6 shadow-2xl">
            <h3 className="text-[16px] font-semibold text-white/90">{modalProvider.name}</h3>
            {modalProvider.desc && (
              <p className="text-[13px] text-white/40 mt-1">{modalProvider.desc}</p>
            )}

            {/* API Key mode */}
            {modalProvider.mode === 'api_key' && (
              <>
                <div className="mt-5">
                  <label className="text-[12px] font-medium text-white/50 mb-1.5 block">API Key</label>
                  <input
                    type="password"
                    value={keyInput}
                    onChange={e => setKeyInput(e.target.value)}
                    placeholder={modalProvider.placeholder}
                    autoComplete="off"
                    autoFocus
                    onKeyDown={e => e.key === 'Enter' && handleSaveKey()}
                    className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[14px] text-white/80 placeholder:text-white/20 focus:border-white/[0.15] focus:outline-none transition-colors"
                  />
                </div>
                {modalProvider.keyUrl && (
                  <a href={modalProvider.keyUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[12px] text-white/30 hover:text-white/50 transition-colors mt-3">
                    <ExternalLink className="h-3 w-3" />Get your API key
                  </a>
                )}
              </>
            )}

            {/* Setup token mode (Claude Pro/Max) */}
            {modalProvider.mode === 'setup_token' && (
              <div className="mt-5">
                <label className="text-[12px] font-medium text-white/50 mb-1.5 block">Setup Token</label>
                <input
                  type="password"
                  value={keyInput}
                  onChange={e => setKeyInput(e.target.value)}
                  placeholder={modalProvider.placeholder}
                  autoComplete="off"
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleSetupToken()}
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[14px] text-white/80 placeholder:text-white/20 focus:border-white/[0.15] focus:outline-none transition-colors"
                />
                <p className="text-[11px] text-white/25 mt-2">
                  Open a terminal and run: <code className="bg-white/[0.06] px-1.5 py-0.5 rounded text-white/40">claude setup-token</code>
                </p>
              </div>
            )}

            {/* OAuth mode (ChatGPT Plus) */}
            {modalProvider.mode === 'oauth' && !oauthUrl && (
              <div className="mt-5">
                <p className="text-[13px] text-white/40 mb-4">Click below to sign in with your ChatGPT Plus account in a new browser window.</p>
                <Button size="sm" onClick={handleOAuth} disabled={saving} className="w-full">
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <LogIn className="h-3.5 w-3.5 mr-1.5" />}
                  Sign in with OpenAI
                </Button>
              </div>
            )}

            {/* OAuth: paste redirect URL after signing in */}
            {modalProvider.mode === 'oauth' && oauthUrl && (
              <div className="mt-5">
                <p className="text-[13px] text-white/40 mb-3">After signing in, paste the redirect URL from your browser here:</p>
                <input
                  type="text"
                  value={keyInput}
                  onChange={e => setKeyInput(e.target.value)}
                  placeholder="https://..."
                  autoComplete="off"
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleOAuthComplete()}
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[14px] text-white/80 placeholder:text-white/20 focus:border-white/[0.15] focus:outline-none transition-colors"
                />
              </div>
            )}

            {saveStatus && (
              <div className={`mt-3 rounded-lg px-3 py-2 text-[13px] ${saveStatus.ok ? 'bg-green-500/10 text-green-400/80' : 'bg-red-500/10 text-red-400/80'}`}>
                {saveStatus.ok ? <Check className="h-3.5 w-3.5 inline mr-1.5" /> : null}
                {saveStatus.msg}
              </div>
            )}

            <div className="flex justify-end gap-2 mt-5">
              <Button variant="glass" size="sm" onClick={() => { setModalProvider(null); setSaveStatus(null); }}>
                Cancel
              </Button>
              {modalProvider.mode === 'api_key' && (
                <Button size="sm" onClick={handleSaveKey} disabled={saving || !keyInput.trim()}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                  Save Key
                </Button>
              )}
              {modalProvider.mode === 'setup_token' && (
                <Button size="sm" onClick={handleSetupToken} disabled={saving || !keyInput.trim()}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                  Connect
                </Button>
              )}
              {modalProvider.mode === 'oauth' && oauthUrl && (
                <Button size="sm" onClick={handleOAuthComplete} disabled={saving || !keyInput.trim()}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                  Complete
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
