'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import api from '@/lib/api';
import { KeyRound, Plus, Trash2, Check, Loader2, ExternalLink } from 'lucide-react';

const PROVIDERS = [
  { id: 'openai', name: 'OpenAI', placeholder: 'sk-...', keyUrl: 'https://platform.openai.com/api-keys' },
  { id: 'anthropic', name: 'Anthropic', placeholder: 'sk-ant-...', keyUrl: 'https://console.anthropic.com/settings/keys' },
  { id: 'google', name: 'Google AI', placeholder: 'AIza...', keyUrl: 'https://aistudio.google.com/apikey' },
  { id: 'xai', name: 'xAI (Grok)', placeholder: 'xai-...', keyUrl: 'https://console.x.ai' },
  { id: 'mistral', name: 'Mistral', placeholder: '...', keyUrl: 'https://console.mistral.ai/api-keys' },
  { id: 'groq', name: 'Groq', placeholder: 'gsk_...', keyUrl: 'https://console.groq.com/keys' },
];

interface ConnectedProvider {
  connected: boolean;
  email?: string;
  type?: string;
}

export default function ApiKeysPage() {
  const [providers, setProviders] = useState<Record<string, ConnectedProvider>>({});
  const [loading, setLoading] = useState(true);
  const [modalProvider, setModalProvider] = useState<typeof PROVIDERS[0] | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const loadStatus = async () => {
    try {
      const res = await api.get<{ providers: Record<string, ConnectedProvider> }>('/settings/provider-auth/status');
      setProviders(res.providers || {});
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadStatus(); }, []);

  const handleSave = async () => {
    if (!modalProvider || !keyInput.trim()) return;
    setSaving(true);
    setSaveStatus(null);
    try {
      await api.post('/settings/provider-auth/save-key', { provider: modalProvider.id, key: keyInput.trim() });
      setSaveStatus({ ok: true, msg: 'Saved!' });
      setKeyInput('');
      await loadStatus();
      setTimeout(() => { setModalProvider(null); setSaveStatus(null); }, 800);
    } catch (err: any) {
      setSaveStatus({ ok: false, msg: err.message || 'Failed to save' });
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

  const connectedIds = Object.keys(providers).filter(k => providers[k]?.connected);
  const availableProviders = PROVIDERS.filter(p => !connectedIds.includes(p.id));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[20px] font-semibold text-white/90">API Keys</h1>
        <p className="text-[13px] text-white/40 mt-1">Connect AI providers to your agent. Keys are stored securely in your container.</p>
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
              const info = PROVIDERS.find(p => p.id === id);
              const prov = providers[id];
              return (
                <div key={id} className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.04]">
                      <KeyRound className="h-4 w-4 text-white/40" />
                    </div>
                    <div>
                      <p className="text-[14px] font-medium text-white/80">{info?.name || id}</p>
                      <p className="text-[12px] text-white/30">{prov.type === 'api_key' ? 'API Key' : prov.type}{prov.email ? ` \u00b7 ${prov.email}` : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="success" dot>Connected</Badge>
                    <button
                      onClick={() => handleDelete(id)}
                      disabled={deleting === id}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-white/20 hover:text-red-400/70 hover:bg-white/[0.04] transition-colors"
                      title="Remove key"
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

      {/* Add provider */}
      {availableProviders.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-[13px] font-medium text-white/50 uppercase tracking-wider">Add Provider</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {availableProviders.map(p => (
              <button
                key={p.id}
                onClick={() => { setModalProvider(p); setKeyInput(''); setSaveStatus(null); }}
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
            <p className="text-[13px] text-white/40 mt-1">Enter your API key for {modalProvider.name}</p>

            <div className="mt-5">
              <label className="text-[12px] font-medium text-white/50 mb-1.5 block">API Key</label>
              <input
                type="password"
                value={keyInput}
                onChange={e => setKeyInput(e.target.value)}
                placeholder={modalProvider.placeholder}
                autoComplete="off"
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleSave()}
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[14px] text-white/80 placeholder:text-white/20 focus:border-white/[0.15] focus:outline-none transition-colors"
              />
            </div>

            <a
              href={modalProvider.keyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[12px] text-white/30 hover:text-white/50 transition-colors mt-3"
            >
              <ExternalLink className="h-3 w-3" />
              Get your API key
            </a>

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
              <Button size="sm" onClick={handleSave} disabled={saving || !keyInput.trim()}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                Save Key
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
