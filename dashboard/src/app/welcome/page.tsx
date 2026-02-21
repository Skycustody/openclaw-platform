'use client';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Zap, Check, Loader2, Sparkles, ArrowRight, ChevronRight, SkipForward } from 'lucide-react';
import api from '@/lib/api';

const provisionSteps = [
  { label: 'Securing your payment...', icon: '💳' },
  { label: 'Creating your AI agent...', icon: '🤖' },
  { label: 'Setting up your dashboard...', icon: '✨' },
  { label: 'Connecting everything...', icon: '🔗' },
  { label: 'Almost ready...', icon: '🚀' },
];

interface OnboardingAnswers {
  name: string;
  primaryUse: string;
  industry: string;
  communicationStyle: string;
  topTasks: string[];
  additionalContext: string;
}

const PRIMARY_USES = [
  { id: 'personal', label: 'Personal Assistant', desc: 'Emails, scheduling, reminders, browsing' },
  { id: 'business', label: 'Business & Work', desc: 'Research, reports, data analysis, workflows' },
  { id: 'customer', label: 'Customer Support', desc: 'Reply to messages, handle inquiries' },
  { id: 'content', label: 'Content & Social', desc: 'Write posts, manage accounts, create content' },
  { id: 'dev', label: 'Development & Tech', desc: 'Code help, monitoring, automation' },
  { id: 'ecommerce', label: 'E-commerce', desc: 'Price tracking, orders, inventory' },
];

const INDUSTRIES = [
  'Tech / SaaS', 'E-commerce / Retail', 'Finance / Crypto',
  'Marketing / Agency', 'Healthcare', 'Education',
  'Real Estate', 'Legal', 'Freelance / Creator', 'Other',
];

const COMM_STYLES = [
  { id: 'professional', label: 'Professional', desc: 'Formal and precise' },
  { id: 'casual', label: 'Casual', desc: 'Friendly and relaxed' },
  { id: 'concise', label: 'Concise', desc: 'Short and to the point' },
  { id: 'detailed', label: 'Detailed', desc: 'Thorough explanations' },
];

const TOP_TASKS = [
  'Reply to messages on my behalf',
  'Research topics and summarize',
  'Monitor websites for changes',
  'Schedule and manage appointments',
  'Write emails and drafts',
  'Track prices and deals',
  'Generate reports',
  'Manage social media',
  'Organize files and notes',
  'Automate repetitive workflows',
];

export default function WelcomePage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-black">
        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
      </div>
    }>
      <WelcomeContent />
    </Suspense>
  );
}

function WelcomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [phase, setPhase] = useState<'provisioning' | 'onboarding' | 'done'>('provisioning');
  const [currentStep, setCurrentStep] = useState(0);
  const [provisionDone, setProvisionDone] = useState(false);

  // Onboarding state
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [answers, setAnswers] = useState<OnboardingAnswers>({
    name: '',
    primaryUse: '',
    industry: '',
    communicationStyle: '',
    topTasks: [],
    additionalContext: '',
  });
  const [saving, setSaving] = useState(false);

  // Provisioning animation
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev >= provisionSteps.length - 1) {
          clearInterval(interval);
          setTimeout(() => {
            setProvisionDone(true);
            setTimeout(() => setPhase('onboarding'), 600);
          }, 800);
          return prev;
        }
        return prev + 1;
      });
    }, 1800);
    return () => clearInterval(interval);
  }, []);

  const toggleTask = (task: string) => {
    setAnswers(prev => ({
      ...prev,
      topTasks: prev.topTasks.includes(task)
        ? prev.topTasks.filter(t => t !== task)
        : prev.topTasks.length < 5 ? [...prev.topTasks, task] : prev.topTasks,
    }));
  };

  const handleSkip = () => {
    router.push('/dashboard');
  };

  const handleFinish = async () => {
    setSaving(true);
    try {
      await api.post('/settings/onboarding', { answers });
    } catch {}
    setSaving(false);
    setPhase('done');
    setTimeout(() => router.push('/dashboard'), 1500);
  };

  const canProceed = () => {
    switch (onboardingStep) {
      case 0: return answers.name.trim().length > 0;
      case 1: return answers.primaryUse !== '';
      case 2: return answers.industry !== '';
      case 3: return answers.communicationStyle !== '';
      case 4: return answers.topTasks.length > 0;
      case 5: return true;
      default: return false;
    }
  };

  const totalOnboardingSteps = 6;

  // ── Provisioning Phase ──
  if (phase === 'provisioning') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-4">
        <div className="relative w-full max-w-[440px] text-center animate-fade-up">
          <div className="mx-auto mb-8 flex h-16 w-16 items-center justify-center rounded-[20px] bg-white/[0.06] border border-white/[0.08]">
            {provisionDone ? <Sparkles className="h-8 w-8 text-white" /> : <Zap className="h-8 w-8 text-white" />}
          </div>

          <h1 className="text-[26px] font-bold text-white tracking-tight">
            {provisionDone ? 'Your agent is ready!' : 'Setting up your agent...'}
          </h1>
          <p className="mt-3 text-[15px] text-white/40">
            {provisionDone
              ? 'Let\'s personalize it for you.'
              : 'This takes about 60 seconds. Almost there.'}
          </p>

          <div className="mt-10 space-y-3 text-left">
            {provisionSteps.map((step, i) => (
              <div
                key={step.label}
                className={`flex items-center gap-4 rounded-[16px] px-5 py-3.5 transition-all duration-500 ${
                  i < currentStep
                    ? 'glass border-green-500/20'
                    : i === currentStep
                    ? 'glass-strong border-white/[0.08]'
                    : 'opacity-30'
                }`}
              >
                {i < currentStep ? (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/20">
                    <Check className="h-4 w-4 text-emerald-400" />
                  </div>
                ) : i === currentStep ? (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.06]">
                    <Loader2 className="h-4 w-4 animate-spin text-white/40" />
                  </div>
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-[14px]">
                    {step.icon}
                  </div>
                )}
                <span className={`text-[14px] ${i <= currentStep ? 'text-white' : 'text-white/30'}`}>
                  {step.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Done Phase ──
  if (phase === 'done') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-4">
        <div className="w-full max-w-[440px] text-center animate-fade-up">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-[20px] bg-emerald-500/10 border border-emerald-500/20">
            <Check className="h-8 w-8 text-emerald-400" />
          </div>
          <h1 className="text-[26px] font-bold text-white tracking-tight">All set!</h1>
          <p className="mt-3 text-[15px] text-white/40">Your agent is personalized and ready to go.</p>
        </div>
      </div>
    );
  }

  // ── Onboarding Phase ──
  return (
    <div className="flex min-h-screen items-center justify-center bg-black px-4">
      <div className="relative w-full max-w-[520px] animate-fade-up">
        {/* Progress bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[12px] text-white/30">Step {onboardingStep + 1} of {totalOnboardingSteps}</span>
            <button onClick={handleSkip}
              className="flex items-center gap-1 text-[12px] text-white/25 hover:text-white/50 transition-colors">
              <SkipForward className="h-3 w-3" /> Skip setup
            </button>
          </div>
          <div className="h-1 bg-white/5 rounded-full overflow-hidden">
            <div className="h-full bg-white/30 rounded-full transition-all duration-500"
              style={{ width: `${((onboardingStep + 1) / totalOnboardingSteps) * 100}%` }} />
          </div>
        </div>

        {/* Step 0: Your name */}
        {onboardingStep === 0 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-[22px] font-bold text-white">What should your agent call you?</h2>
              <p className="text-[14px] text-white/40 mt-2">Your agent will use this name when talking to you.</p>
            </div>
            <input
              type="text"
              value={answers.name}
              onChange={e => setAnswers(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Your name or nickname"
              autoFocus
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3.5 text-[15px] text-white placeholder:text-white/20 focus:border-white/25 focus:outline-none"
            />
          </div>
        )}

        {/* Step 1: Primary use */}
        {onboardingStep === 1 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-[22px] font-bold text-white">What will you mainly use your agent for?</h2>
              <p className="text-[14px] text-white/40 mt-2">Pick the one that fits best. You can change this later.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {PRIMARY_USES.map(use => (
                <button key={use.id} onClick={() => setAnswers(prev => ({ ...prev, primaryUse: use.id }))}
                  className={`flex flex-col gap-1 rounded-xl border p-4 text-left transition-all ${
                    answers.primaryUse === use.id
                      ? 'border-white/25 bg-white/[0.06]'
                      : 'border-white/[0.06] bg-white/[0.02] hover:border-white/15'
                  }`}>
                  <span className="text-[14px] font-medium text-white/80">{use.label}</span>
                  <span className="text-[12px] text-white/30">{use.desc}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Industry */}
        {onboardingStep === 2 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-[22px] font-bold text-white">What industry are you in?</h2>
              <p className="text-[14px] text-white/40 mt-2">Helps your agent understand context better.</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {INDUSTRIES.map(ind => (
                <button key={ind} onClick={() => setAnswers(prev => ({ ...prev, industry: ind }))}
                  className={`rounded-xl border px-4 py-3 text-left text-[14px] transition-all ${
                    answers.industry === ind
                      ? 'border-white/25 bg-white/[0.06] text-white'
                      : 'border-white/[0.06] bg-white/[0.02] text-white/50 hover:border-white/15'
                  }`}>
                  {ind}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Communication style */}
        {onboardingStep === 3 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-[22px] font-bold text-white">How should your agent communicate?</h2>
              <p className="text-[14px] text-white/40 mt-2">Sets the default tone for all replies.</p>
            </div>
            <div className="space-y-3">
              {COMM_STYLES.map(style => (
                <button key={style.id} onClick={() => setAnswers(prev => ({ ...prev, communicationStyle: style.id }))}
                  className={`w-full flex items-center gap-4 rounded-xl border px-5 py-4 text-left transition-all ${
                    answers.communicationStyle === style.id
                      ? 'border-white/25 bg-white/[0.06]'
                      : 'border-white/[0.06] bg-white/[0.02] hover:border-white/15'
                  }`}>
                  <div className="flex-1">
                    <span className="text-[14px] font-medium text-white/80">{style.label}</span>
                    <span className="text-[12px] text-white/30 ml-2">{style.desc}</span>
                  </div>
                  {answers.communicationStyle === style.id && (
                    <Check className="h-4 w-4 text-white/50" />
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 4: Top tasks */}
        {onboardingStep === 4 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-[22px] font-bold text-white">What tasks matter most to you?</h2>
              <p className="text-[14px] text-white/40 mt-2">Pick up to 5. Your agent will prioritize these.</p>
            </div>
            <div className="space-y-2">
              {TOP_TASKS.map(task => (
                <button key={task} onClick={() => toggleTask(task)}
                  className={`w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-[13px] transition-all ${
                    answers.topTasks.includes(task)
                      ? 'border-white/25 bg-white/[0.06] text-white'
                      : 'border-white/[0.06] bg-white/[0.02] text-white/50 hover:border-white/15'
                  }`}>
                  <div className={`flex h-5 w-5 items-center justify-center rounded border shrink-0 ${
                    answers.topTasks.includes(task)
                      ? 'border-white/40 bg-white/10'
                      : 'border-white/10'
                  }`}>
                    {answers.topTasks.includes(task) && <Check className="h-3 w-3 text-white" />}
                  </div>
                  {task}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 5: Anything else */}
        {onboardingStep === 5 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-[22px] font-bold text-white">Anything else your agent should know?</h2>
              <p className="text-[14px] text-white/40 mt-2">
                Optional — add any context like your timezone, preferred language, specific instructions, or things to avoid.
              </p>
            </div>
            <textarea
              value={answers.additionalContext}
              onChange={e => setAnswers(prev => ({ ...prev, additionalContext: e.target.value }))}
              placeholder="e.g. I'm based in London (GMT), prefer metric units, always reply in English..."
              rows={5}
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3.5 text-[14px] text-white placeholder:text-white/20 focus:border-white/25 focus:outline-none resize-none"
            />
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8">
          <button
            onClick={() => setOnboardingStep(Math.max(0, onboardingStep - 1))}
            className={`text-[13px] text-white/30 hover:text-white/50 transition-colors ${onboardingStep === 0 ? 'invisible' : ''}`}>
            Back
          </button>

          {onboardingStep < totalOnboardingSteps - 1 ? (
            <button
              onClick={() => canProceed() && setOnboardingStep(onboardingStep + 1)}
              disabled={!canProceed()}
              className="flex items-center gap-2 rounded-xl bg-white/10 border border-white/20 px-6 py-3 text-[14px] font-medium text-white hover:bg-white/15 transition-all disabled:opacity-30 disabled:cursor-not-allowed">
              Continue <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={handleFinish}
              disabled={saving}
              className="flex items-center gap-2 rounded-xl bg-white/10 border border-white/20 px-6 py-3 text-[14px] font-medium text-white hover:bg-white/15 transition-all disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {saving ? 'Saving...' : 'Finish Setup'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
