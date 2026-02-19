'use client';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Zap, Check, Loader2, Sparkles } from 'lucide-react';

const steps = [
  { label: 'Securing your payment...', icon: '💳' },
  { label: 'Creating your AI agent...', icon: '🤖' },
  { label: 'Setting up your dashboard...', icon: '✨' },
  { label: 'Connecting everything...', icon: '🔗' },
  { label: 'Almost ready...', icon: '🚀' },
];

export default function WelcomePage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-mesh">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
      </div>
    }>
      <WelcomeContent />
    </Suspense>
  );
}

function WelcomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currentStep, setCurrentStep] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev >= steps.length - 1) {
          clearInterval(interval);
          setTimeout(() => setDone(true), 800);
          return prev;
        }
        return prev + 1;
      });
    }, 1800);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-mesh px-4">
      <div className="fixed top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] rounded-full bg-indigo-500/8 blur-[120px] pointer-events-none" />

      <div className="relative w-full max-w-[440px] text-center animate-fade-up">
        <div className={`mx-auto mb-8 flex h-16 w-16 items-center justify-center rounded-[20px] bg-gradient-to-br from-indigo-500 to-purple-500 shadow-xl shadow-indigo-500/25 ${done ? 'animate-pulse-glow' : ''}`}>
          {done ? <Sparkles className="h-8 w-8 text-white" /> : <Zap className="h-8 w-8 text-white" />}
        </div>

        <h1 className="text-[26px] font-bold text-white tracking-tight">
          {done ? 'Your agent is ready!' : 'Setting up your agent...'}
        </h1>
        <p className="mt-3 text-[15px] text-white/40">
          {done
            ? 'Your personal AI agent is live and waiting for you.'
            : 'This takes about 60 seconds. Almost there.'}
        </p>

        <div className="mt-10 space-y-3 text-left">
          {steps.map((step, i) => (
            <div
              key={step.label}
              className={`flex items-center gap-4 rounded-[16px] px-5 py-3.5 transition-all duration-500 ${
                i < currentStep
                  ? 'glass border-emerald-500/20'
                  : i === currentStep
                  ? 'glass-strong border-indigo-500/20'
                  : 'opacity-30'
              }`}
            >
              {i < currentStep ? (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/20">
                  <Check className="h-4 w-4 text-emerald-400" />
                </div>
              ) : i === currentStep ? (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-500/20">
                  <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
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

        {done && (
          <button
            onClick={() => router.push('/dashboard')}
            className="btn-primary mt-8 w-full py-4 text-[16px] font-semibold flex items-center justify-center gap-2"
          >
            Open Your Dashboard <Sparkles className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>
  );
}
