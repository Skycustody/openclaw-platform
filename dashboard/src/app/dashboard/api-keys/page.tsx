'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import api from '@/lib/api';
import { KeyRound, Plus, Trash2, Check, Loader2, ExternalLink, LogIn, Zap, Terminal } from 'lucide-react';

interface ProviderDef {
  id: string;
  name: string;
  placeholder?: string;
  keyUrl?: string;
  mode: 'api_key' | 'setup_token' | 'oauth';
  desc?: string;
}

const PROVIDERS: ProviderDef[] = [
  // Subscription auth (free via existing subscriptions)
  { id: 'anthropic', name: 'Claude Pro / Max', mode: 'setup_token', desc: 'Use your Anthropic subscription. Run "claude setup-token" in terminal to get your token.', placeholder: 'Paste setup token...' },
  { id: 'openai-codex', name: 'ChatGPT Plus', mode: 'oauth', desc: 'Connect your ChatGPT Plus subscription via browser login.' },
  // API key providers
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

  const handleCcOAuth = async () => {
    setCcLoading(true);
    setCcError(null);
    try {
      const res = await api.get<{ authUrl: string }>('/settings/claude-code/start-oauth');
      if (res.authUrl) {
        // Open popup for Claude OAuth
        const w = 600, h = 700;
        const left = window.screenX + (window.outerWidth - w) / 2;
        const top = window.screenY + (window.outerHeight - h) / 2;
        window.open(res.authUrl, 'claude-oauth', `width=${w},height=${h},left=${left},top=${top}`);
      }
    } catch (err: any) {
      setCcError(err.message || 'Failed to start OAuth');
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

  useEffect(() => { loadStatus(); loadCcStatus(); }, []);

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

      {/* Claude Code */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.04]">
              <Terminal className="h-5 w-5 text-white/40" />
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
            ) : (
              <Button size="sm" onClick={handleCcOAuth} disabled={ccLoading}>
                {ccLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <LogIn className="h-3.5 w-3.5 mr-1.5" />}
                Connect
              </Button>
            )}
          </div>
        </div>
        {!ccStatus?.authenticated && (
          <div className="mt-3 space-y-3">
            {ccShowInput ? (
              <>
                <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-4 py-3">
                  <p className="text-[13px] text-white/60">Run this in your terminal to get a setup token:</p>
                  <code className="block mt-2 bg-white/[0.04] rounded-lg px-3 py-2 text-[13px] text-white/70 font-mono select-all">claude setup-token</code>
                  <p className="text-[11px] text-white/30 mt-2">Signs in via browser and gives you a token (sk-ant-oat01-...). Token lasts 1 year.</p>
                </div>
                <input
                  type="password"
                  value={ccToken}
                  onChange={e => setCcToken(e.target.value)}
                  placeholder="sk-ant-oat01-..."
                  autoComplete="off"
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && ccToken.trim() && handleCcConnect()}
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[14px] text-white/80 placeholder:text-white/20 focus:border-white/[0.15] focus:outline-none transition-colors font-mono"
                />
                <div className="flex justify-end">
                  <Button size="sm" onClick={handleCcConnect} disabled={ccLoading || !ccToken.trim()}>
                    {ccLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                    Save Token
                  </Button>
                </div>
              </>
            ) : (
              <button
                onClick={() => setCcShowInput(true)}
                className="text-[12px] text-white/30 hover:text-white/50 transition-colors"
              >
                Or paste a setup token manually...
              </button>
            )}
            {ccError && (
              <div className="rounded-lg bg-red-500/10 px-3 py-2 text-[13px] text-red-400/80">
                {ccError}
              </div>
            )}
          </div>
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
                      <KeyRound className="h-4 w-4 text-white/40" />
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
                  <Zap className="h-3.5 w-3.5 text-white/30 group-hover:text-white/50" />
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
                  <Plus className="h-3.5 w-3.5 text-white/30 group-hover:text-white/50" />
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
