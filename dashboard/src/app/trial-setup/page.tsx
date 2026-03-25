'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Zap, Key, ArrowRight, Loader2, Check, ChevronDown, ChevronUp, ExternalLink, User } from 'lucide-react';

type Provider = 'openrouter' | 'openai' | 'anthropic' | 'gemini';

const PROVIDERS: Array<{
  id: Provider;
  name: string;
  description: string;
  placeholder: string;
  prefix?: string;
  helpUrl: string;
}> = [
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Access 200+ models (GPT-4o, Claude, Gemini, etc.) with one key',
    placeholder: 'sk-or-v1-...',
    helpUrl: 'https://openrouter.ai/keys',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT-4o, GPT-4.1, o3-mini, and more',
    placeholder: 'sk-...',
    prefix: 'sk-',
    helpUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Claude Sonnet 4, Claude Opus 4, Claude Haiku',
    placeholder: 'sk-ant-...',
    prefix: 'sk-ant-',
    helpUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    description: 'Gemini 2.5 Pro, Gemini 2.5 Flash',
    placeholder: 'AIza...',
    helpUrl: 'https://aistudio.google.com/apikey',
  },
];

type SubAuthStatus = Record<string, { connected: boolean; email?: string }>;

export default function TrialSetupPage() {
  const [keys, setKeys] = useState<Record<Provider, string>>({
    openrouter: '',
    openai: '',
    anthropic: '',
    gemini: '',
  });
  const [saved, setSaved] = useState<Record<Provider, boolean>>({
    openrouter: false,
    openai: false,
    anthropic: false,
    gemini: false,
  });
  const [saving, setSaving] = useState<Provider | null>(null);
  const [error, setError] = useState('');
  const [showMore, setShowMore] = useState(false);
  const [showSubAuth, setShowSubAuth] = useState(false);
  const [continuing, setContinuing] = useState(false);

  const [subAuthStatus, setSubAuthStatus] = useState<SubAuthStatus>({});
  const [subAuthLoading, setSubAuthLoading] = useState<string | null>(null);
  const [anthropicToken, setAnthropicToken] = useState('');
  const [openaiOAuthUrl, setOpenaiOAuthUrl] = useState<string | null>(null);
  const [openaiRedirectUrl, setOpenaiRedirectUrl] = useState('');

  useEffect(() => {
    if (!api.getToken()) {
      window.location.href = '/auth/signup';
      return;
    }
    (async () => {
      try {
        const billing = await api.get<{ stripeCustomerId?: string }>('/billing');
        if (billing.stripeCustomerId) {
          window.location.href = '/dashboard';
        }
      } catch { /* proceed */ }
      try {
        const data = await api.get<{ providers: SubAuthStatus }>('/settings/provider-auth/status');
        setSubAuthStatus(data.providers || {});
      } catch { /* agent may not be provisioned yet */ }
    })();
  }, []);

  const saveKey = async (provider: Provider) => {
    const key = keys[provider].trim();
    if (!key) return;
    setSaving(provider);
    setError('');
    try {
      const endpoint = provider === 'openrouter'
        ? '/settings/own-openrouter-key'
        : `/settings/own-${provider}-key`;
      await api.put(endpoint, { key });
      setSaved((prev) => ({ ...prev, [provider]: true }));
    } catch (err: any) {
      setError(err.message || 'Failed to save key');
    } finally {
      setSaving(null);
    }
  };

  const startOpenAIOAuth = async () => {
    setSubAuthLoading('openai-start');
    setError('');
    try {
      const data = await api.post<{ url: string }>('/settings/provider-auth/openai/start', {});
      setOpenaiOAuthUrl(data.url);
      window.open(data.url, '_blank', 'noopener');
    } catch (err: any) {
      setError(err.message || 'Failed to start OpenAI login. Make sure your agent is running, then try again.');
    } finally {
      setSubAuthLoading(null);
    }
  };

  const completeOpenAIOAuth = async () => {
    if (!openaiRedirectUrl.trim()) return;
    setSubAuthLoading('openai-complete');
    setError('');
    try {
      await api.post('/settings/provider-auth/openai/complete', { redirectUrl: openaiRedirectUrl.trim() });
      setSubAuthStatus((prev) => ({ ...prev, 'openai-codex': { connected: true } }));
      setOpenaiOAuthUrl(null);
      setOpenaiRedirectUrl('');
    } catch (err: any) {
      setError(err.message || 'Failed to complete OpenAI login. Try using an API key instead.');
    } finally {
      setSubAuthLoading(null);
    }
  };

  const saveAnthropicToken = async () => {
    if (!anthropicToken.trim()) return;
    setSubAuthLoading('anthropic');
    setError('');
    try {
      await api.post('/settings/provider-auth/anthropic/setup-token', { token: anthropicToken.trim() });
      setSubAuthStatus((prev) => ({ ...prev, anthropic: { connected: true } }));
      setAnthropicToken('');
    } catch (err: any) {
      setError(err.message || 'Failed to save Claude token. Make sure your agent is running.');
    } finally {
      setSubAuthLoading(null);
    }
  };

  const hasAnySaved = Object.values(saved).some(Boolean);
  const hasSubAuth = Object.values(subAuthStatus).some((v) => v.connected);
  const hasAnyConnected = hasAnySaved || hasSubAuth;

  const handleContinue = () => {
    setContinuing(true);
    // Trial users go through onboarding before dashboard
    window.location.href = '/welcome';
  };

  const primaryProvider = PROVIDERS[0];
  const otherProviders = PROVIDERS.slice(1);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5 rounded-md p-1">
            <Zap className="h-4 w-4" />
            <span className="text-sm font-semibold tracking-tight">Valnaa</span>
          </Link>
          <Link
            href="/pricing"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            View plans
          </Link>
        </div>
      </nav>

      <section className="mx-auto max-w-xl px-6 py-16">
        <div className="text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            <Key className="size-3" />
            Free trial setup
          </div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Connect your AI account
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Use your existing ChatGPT Plus, Claude Pro subscription, or API key.
            <br />
            You only pay the AI provider directly — Valnaa is free.
          </p>
        </div>

        {error && (
          <div className="mt-6 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-[13px] text-red-400">
            {error}
          </div>
        )}

        {/* ── Subscription auth (ChatGPT / Claude accounts) ── */}
        <div className="mt-10 space-y-4">
          <h2 className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <User className="h-3.5 w-3.5" />
            Connect your subscription
          </h2>
          <p className="text-xs text-muted-foreground -mt-2">
            Already pay for ChatGPT Plus or Claude Pro? Use those credits here — no API key needed.
          </p>

          {/* OpenAI (ChatGPT) subscription */}
          <div className="rounded-xl border border-border bg-card/50 p-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold">ChatGPT Plus / Team</h3>
                  {subAuthStatus['openai-codex']?.connected && (
                    <span className="flex items-center gap-1 text-[11px] text-green-400">
                      <Check className="h-3 w-3" /> Connected
                      {subAuthStatus['openai-codex']?.email && (
                        <span className="text-muted-foreground ml-1">({subAuthStatus['openai-codex'].email})</span>
                      )}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Use your ChatGPT subscription credits for GPT-4o, o3, and more
                </p>
              </div>
            </div>

            {subAuthStatus['openai-codex']?.connected ? (
              <p className="mt-3 text-xs text-green-400/80">OpenAI account connected. Your subscription credits are active.</p>
            ) : !openaiOAuthUrl ? (
              <div className="mt-3">
                <Button
                  onClick={startOpenAIOAuth}
                  disabled={subAuthLoading === 'openai-start'}
                  variant="outline"
                  size="default"
                >
                  {subAuthLoading === 'openai-start' ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Connecting...</>
                  ) : (
                    <>Sign in with OpenAI <ExternalLink className="ml-2 h-3.5 w-3.5" /></>
                  )}
                </Button>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Opens OpenAI login in a new tab. Requires your agent to be running.
                </p>
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                <div className="rounded-lg bg-foreground/5 p-3 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground/80">Complete the sign-in:</p>
                  <ol className="mt-1.5 list-inside list-decimal space-y-1">
                    <li>Sign in to OpenAI in the tab that opened</li>
                    <li>After sign-in, the page will try to load <code className="text-[10px] bg-foreground/10 px-1 py-0.5 rounded">localhost:1455/...</code> and fail — that&apos;s OK</li>
                    <li>Copy the <strong>full URL</strong> from your browser&apos;s address bar</li>
                    <li>Paste it below</li>
                  </ol>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={openaiRedirectUrl}
                    onChange={(e) => setOpenaiRedirectUrl(e.target.value)}
                    placeholder="http://localhost:1455/auth/callback?code=..."
                    className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 transition-colors focus:border-foreground/30 focus:outline-none"
                  />
                  <Button
                    onClick={completeOpenAIOAuth}
                    disabled={!openaiRedirectUrl.trim() || subAuthLoading === 'openai-complete'}
                    size="default"
                  >
                    {subAuthLoading === 'openai-complete' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : 'Connect'}
                  </Button>
                </div>
                <button
                  onClick={() => { setOpenaiOAuthUrl(null); setOpenaiRedirectUrl(''); }}
                  className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          {/* Anthropic (Claude) subscription */}
          <div className="rounded-xl border border-border bg-card/50 p-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold">Claude Pro / Team</h3>
                  {subAuthStatus.anthropic?.connected && (
                    <span className="flex items-center gap-1 text-[11px] text-green-400">
                      <Check className="h-3 w-3" /> Connected
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Use your Claude subscription credits for Sonnet 4, Opus 4, and Haiku
                </p>
              </div>
            </div>

            {subAuthStatus.anthropic?.connected ? (
              <p className="mt-3 text-xs text-green-400/80">Claude account connected. Your subscription credits are active.</p>
            ) : (
              <div className="mt-3 space-y-3">
                <div className="rounded-lg bg-foreground/5 p-3 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground/80">How to get your token:</p>
                  <ol className="mt-1.5 list-inside list-decimal space-y-1">
                    <li>Install Claude Code: <code className="text-[10px] bg-foreground/10 px-1 py-0.5 rounded">npm install -g @anthropic-ai/claude-code</code></li>
                    <li>Run: <code className="text-[10px] bg-foreground/10 px-1 py-0.5 rounded">claude setup-token</code></li>
                    <li>Copy the token it gives you</li>
                    <li>Paste it below</li>
                  </ol>
                </div>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={anthropicToken}
                    onChange={(e) => setAnthropicToken(e.target.value)}
                    placeholder="Paste your Claude setup token..."
                    className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 transition-colors focus:border-foreground/30 focus:outline-none"
                  />
                  <Button
                    onClick={saveAnthropicToken}
                    disabled={!anthropicToken.trim() || subAuthLoading === 'anthropic'}
                    size="default"
                  >
                    {subAuthLoading === 'anthropic' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : 'Connect'}
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Requires your agent to be running. Anthropic may restrict subscription use outside Claude Code for some users.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── API Keys ── */}
        <div className="mt-10 space-y-4">
          <h2 className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <Key className="h-3.5 w-3.5" />
            Or use an API key
          </h2>

          <ProviderCard
            provider={primaryProvider}
            value={keys[primaryProvider.id]}
            onChange={(v) => setKeys((prev) => ({ ...prev, [primaryProvider.id]: v }))}
            onSave={() => saveKey(primaryProvider.id)}
            isSaved={saved[primaryProvider.id]}
            isSaving={saving === primaryProvider.id}
            recommended
          />

          <button
            onClick={() => setShowMore(!showMore)}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card/30 px-4 py-3 text-sm text-muted-foreground transition-colors hover:bg-card/60 hover:text-foreground"
          >
            {showMore ? 'Hide' : 'Or use'} OpenAI, Anthropic, or Gemini directly
            {showMore ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {showMore && otherProviders.map((p) => (
            <ProviderCard
              key={p.id}
              provider={p}
              value={keys[p.id]}
              onChange={(v) => setKeys((prev) => ({ ...prev, [p.id]: v }))}
              onSave={() => saveKey(p.id)}
              isSaved={saved[p.id]}
              isSaving={saving === p.id}
            />
          ))}
        </div>

        <div className="mt-8 flex flex-col gap-3">
          <Button
            onClick={handleContinue}
            disabled={continuing}
            size="lg"
            className="w-full"
          >
            {continuing ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading dashboard...</>
            ) : hasAnyConnected ? (
              <>Go to dashboard <ArrowRight className="ml-2 h-4 w-4" /></>
            ) : (
              <>Skip for now — set up later <ArrowRight className="ml-2 h-4 w-4" /></>
            )}
          </Button>

          {!hasAnyConnected && (
            <p className="text-center text-xs text-muted-foreground">
              You can connect accounts or add API keys anytime from Dashboard &gt; Settings
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function ProviderCard({
  provider,
  value,
  onChange,
  onSave,
  isSaved,
  isSaving,
  recommended,
}: {
  provider: (typeof PROVIDERS)[number];
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  isSaved: boolean;
  isSaving: boolean;
  recommended?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card/50 p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">{provider.name}</h3>
            {recommended && (
              <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] font-medium text-foreground/70">
                Recommended
              </span>
            )}
            {isSaved && (
              <span className="flex items-center gap-1 text-[11px] text-green-400">
                <Check className="h-3 w-3" /> Saved
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{provider.description}</p>
        </div>
        <a
          href={provider.helpUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          Get key
        </a>
      </div>

      <div className="mt-3 flex gap-2">
        <input
          type="password"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={provider.placeholder}
          className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 transition-colors focus:border-foreground/30 focus:outline-none"
          disabled={isSaved}
        />
        <Button
          onClick={onSave}
          disabled={!value.trim() || isSaved || isSaving}
          variant={isSaved ? 'outline' : 'default'}
          size="default"
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : isSaved ? 'Saved' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
