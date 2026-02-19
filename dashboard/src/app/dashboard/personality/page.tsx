'use client';

import { useEffect, useState } from 'react';
import { Card, CardTitle, CardDescription, GlassPanel } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import api from '@/lib/api';
import {
  User,
  Briefcase,
  Heart,
  Coffee,
  Pencil,
  AlignLeft,
  AlignCenter,
  AlignJustify,
  Globe2,
  Save,
  Loader2,
  Check,
  MessageSquare,
  Send,
  Sparkles,
} from 'lucide-react';

interface PersonalitySettings {
  agentName: string;
  tone: string;
  responseLength: string;
  language: string;
  systemInstructions: string;
}

const STYLE_OPTIONS = [
  {
    id: 'professional',
    label: 'Professional',
    icon: Briefcase,
    description: 'Formal and business-like. Great for work tasks.',
  },
  {
    id: 'friendly',
    label: 'Friendly',
    icon: Heart,
    description: 'Warm and personable. Feels like talking to a helpful friend.',
  },
  {
    id: 'casual',
    label: 'Casual',
    icon: Coffee,
    description: 'Relaxed and conversational. Keeps things chill.',
  },
  {
    id: 'custom',
    label: 'Custom',
    icon: Pencil,
    description: 'Write your own style in the instructions below.',
  },
];

const LENGTH_OPTIONS = [
  {
    id: 'short',
    label: 'Short',
    icon: AlignLeft,
    description: 'Quick and to the point — just the essentials',
  },
  {
    id: 'medium',
    label: 'Medium',
    icon: AlignCenter,
    description: 'A good balance of detail and brevity',
  },
  {
    id: 'detailed',
    label: 'Detailed',
    icon: AlignJustify,
    description: 'Thorough explanations with full context',
  },
];

const LANGUAGES = [
  'English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese',
  'Dutch', 'Russian', 'Chinese (Simplified)', 'Chinese (Traditional)',
  'Japanese', 'Korean', 'Arabic', 'Hindi', 'Turkish', 'Polish',
  'Swedish', 'Norwegian', 'Danish', 'Finnish', 'Thai', 'Vietnamese',
  'Indonesian', 'Czech', 'Greek', 'Hebrew', 'Romanian', 'Ukrainian',
];

export default function PersonalityPage() {
  const [settings, setSettings] = useState<PersonalitySettings>({
    agentName: '',
    tone: 'friendly',
    responseLength: 'medium',
    language: 'English',
    systemInstructions: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewMessage, setPreviewMessage] = useState('');
  const [previewResponse, setPreviewResponse] = useState('');
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    try {
      const data = await api.get<{ personality: PersonalitySettings }>('/settings');
      if (data.personality) setSettings(data.personality);
    } catch {
      setSettings({
        agentName: 'Atlas',
        tone: 'friendly',
        responseLength: 'medium',
        language: 'English',
        systemInstructions: '',
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await api.put('/settings/personality', settings);
    } catch {}
    finally {
      setSaving(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
  }

  function handlePreview() {
    if (!previewMessage.trim()) return;
    setPreviewing(true);
    const toneText = STYLE_OPTIONS.find(s => s.id === settings.tone)?.label || 'Friendly';
    const lengthText = settings.responseLength === 'short' ? 'briefly' : settings.responseLength === 'detailed' ? 'in detail' : '';

    setTimeout(() => {
      const responses: Record<string, string> = {
        professional: `Thank you for your message. I've reviewed your request and prepared the following response${lengthText ? ` ${lengthText}` : ''}. Please let me know if you need any further assistance or clarification.`,
        friendly: `Hey there! Great question 😊 I looked into this for you and here's what I found${lengthText ? ` (keeping it ${settings.responseLength})` : ''}. Let me know if you'd like me to dig deeper!`,
        casual: `Sure thing! Here's the deal${lengthText ? ` — keeping it ${settings.responseLength}` : ''}. Hit me up if you want more info.`,
        custom: `[Response using your custom style instructions${lengthText ? `, ${settings.responseLength} length` : ''}]`,
      };
      setPreviewResponse(responses[settings.tone] || responses.friendly);
      setPreviewing(false);
    }, 1200);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between animate-fade-up">
        <div>
          <h1 className="text-[28px] font-bold text-white tracking-tight">Your Agent&apos;s Personality</h1>
          <p className="mt-1.5 text-[15px] text-white/50">
            Customize how your agent talks, responds, and presents itself.
          </p>
        </div>
        <Button onClick={handleSave} loading={saving}>
          {saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {saved ? 'Saved!' : 'Save'}
        </Button>
      </div>

      <Card className="animate-fade-up">
        <CardTitle>Agent name</CardTitle>
        <CardDescription>Give your agent a name — this is how it introduces itself</CardDescription>
        <div className="mt-4 flex items-center gap-4">
          <div className="rounded-2xl bg-indigo-500/10 p-4 shrink-0">
            <User className="h-7 w-7 text-indigo-400" />
          </div>
          <div className="flex-1">
            <Input
              placeholder="e.g. Atlas, Aria, Max..."
              value={settings.agentName}
              onChange={(e) => setSettings((p) => ({ ...p, agentName: e.target.value }))}
            />
          </div>
        </div>
      </Card>

      <Card className="animate-fade-up">
        <CardTitle>Communication style</CardTitle>
        <CardDescription>How should your agent sound when it replies?</CardDescription>
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {STYLE_OPTIONS.map((style) => {
            const Icon = style.icon;
            const selected = settings.tone === style.id;
            return (
              <button
                key={style.id}
                onClick={() => setSettings((p) => ({ ...p, tone: style.id }))}
                className={`p-4 rounded-2xl border text-left transition-all ${
                  selected
                    ? 'border-indigo-500/50 bg-indigo-500/5'
                    : 'border-white/5 hover:border-white/10 hover:bg-white/[0.02]'
                }`}
              >
                <Icon
                  className={`h-6 w-6 mb-3 ${selected ? 'text-indigo-400' : 'text-white/25'}`}
                />
                <p className={`text-[14px] font-semibold mb-1 ${selected ? 'text-white' : 'text-white/60'}`}>
                  {style.label}
                </p>
                <p className="text-[12px] text-white/30 leading-relaxed">{style.description}</p>
              </button>
            );
          })}
        </div>
      </Card>

      <Card className="animate-fade-up">
        <CardTitle>Reply length</CardTitle>
        <CardDescription>How much detail should your agent include?</CardDescription>
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {LENGTH_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const selected = settings.responseLength === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => setSettings((p) => ({ ...p, responseLength: opt.id }))}
                className={`p-4 rounded-2xl border text-left transition-all ${
                  selected
                    ? 'border-indigo-500/50 bg-indigo-500/5'
                    : 'border-white/5 hover:border-white/10 hover:bg-white/[0.02]'
                }`}
              >
                <Icon
                  className={`h-6 w-6 mb-3 ${selected ? 'text-indigo-400' : 'text-white/25'}`}
                />
                <p className={`text-[14px] font-semibold mb-1 ${selected ? 'text-white' : 'text-white/60'}`}>
                  {opt.label}
                </p>
                <p className="text-[12px] text-white/30 leading-relaxed">{opt.description}</p>
              </button>
            );
          })}
        </div>
      </Card>

      <Card className="animate-fade-up">
        <CardTitle>Language</CardTitle>
        <CardDescription>What language should your agent reply in?</CardDescription>
        <div className="mt-4 flex items-center gap-3">
          <Globe2 className="h-5 w-5 text-white/30 shrink-0" />
          <select
            className="glass-input px-4 py-3 text-[14px] w-full max-w-sm"
            value={settings.language}
            onChange={(e) => setSettings((p) => ({ ...p, language: e.target.value }))}
          >
            {LANGUAGES.map((lang) => (
              <option key={lang} value={lang} className="bg-[#0a0a0f]">
                {lang}
              </option>
            ))}
          </select>
        </div>
      </Card>

      <Card className="animate-fade-up">
        <CardTitle>Extra instructions</CardTitle>
        <CardDescription>
          Tell your agent anything special — rules, tone details, or things to remember
        </CardDescription>
        <div className="mt-4">
          <Textarea
            placeholder={`Examples:\n• Always greet customers by first name\n• Never recommend competitor products\n• Keep responses under 3 paragraphs\n• Use British English spelling`}
            value={settings.systemInstructions}
            onChange={(val) => setSettings((p) => ({ ...p, systemInstructions: val }))}
            rows={6}
          />
          <p className="mt-2 text-[12px] text-white/20">
            {settings.systemInstructions.length} characters
          </p>
        </div>
      </Card>

      <div className="flex items-center justify-between animate-fade-up">
        <Button
          variant="glass"
          onClick={() => { setPreviewOpen(true); setPreviewResponse(''); setPreviewMessage(''); }}
        >
          <MessageSquare className="h-4 w-4" />
          Preview — Test Your Agent
        </Button>
        <Button onClick={handleSave} loading={saving} size="lg">
          {saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {saved ? 'Saved!' : 'Save All Changes'}
        </Button>
      </div>

      <Modal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title="Test Your Agent"
        description="Send a test message to see how your agent would respond with current settings."
        size="lg"
      >
        <div className="space-y-4">
          <div className="flex gap-3">
            <Input
              placeholder="Type a test message..."
              value={previewMessage}
              onChange={(e) => setPreviewMessage(e.target.value)}
              className="flex-1"
              onKeyDown={(e) => { if (e.key === 'Enter') handlePreview(); }}
            />
            <Button onClick={handlePreview} loading={previewing} size="md">
              <Send className="h-4 w-4" />
            </Button>
          </div>

          {previewResponse && (
            <GlassPanel className="animate-fade-up">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-indigo-500/10 p-2 shrink-0">
                  <Sparkles className="h-4 w-4 text-indigo-400" />
                </div>
                <div>
                  <p className="text-[13px] text-indigo-400 font-medium mb-1">{settings.agentName || 'Your Agent'}</p>
                  <p className="text-[14px] text-white/70 leading-relaxed">{previewResponse}</p>
                </div>
              </div>
            </GlassPanel>
          )}

          {!previewResponse && !previewing && (
            <div className="text-center py-8">
              <MessageSquare className="h-10 w-10 text-white/10 mx-auto mb-3" />
              <p className="text-[14px] text-white/30">Type a message above to see a preview</p>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
