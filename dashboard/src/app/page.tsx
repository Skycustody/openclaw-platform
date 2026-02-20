import Link from 'next/link';
import {
  Zap, MessageSquare, Globe, Shield, Clock, Coins,
  ArrowRight, Check,
} from 'lucide-react';

const features = [
  { icon: Zap, title: 'Ready in 60 Seconds', desc: 'Sign up, pay, and your personal AI agent is live — no setup needed.' },
  { icon: MessageSquare, title: 'All Your Apps', desc: 'Connect to Telegram, WhatsApp, Discord, Slack and more.' },
  { icon: Globe, title: 'Browses the Web', desc: 'Your agent searches, researches, checks prices, and extracts data.' },
  { icon: Shield, title: 'Token Protection', desc: 'Smart budgets prevent surprise costs. You stay in control.' },
  { icon: Clock, title: 'Works While You Sleep', desc: 'Schedule daily briefings, email summaries, price alerts — automated.' },
  { icon: Coins, title: 'Saves You Money', desc: 'Smart routing picks the cheapest AI that can do the job.' },
];

const plans = [
  { name: 'Starter', price: 10, tokens: '500K', features: ['Personal AI agent', '500K tokens/month', '10 skills', 'Telegram only', 'Email support'] },
  { name: 'Pro', price: 20, popular: true, tokens: '1.5M', features: ['Everything in Starter', '1.5M tokens/month', 'All 53 skills', 'All messaging apps', 'Browser access', 'Priority support'] },
  { name: 'Business', price: 50, tokens: '5M', features: ['Everything in Pro', '5M tokens/month', 'Community templates', 'Maximum agent power', '100 scheduled tasks', 'Direct support line'] },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      {/* Nav */}
      <nav className="border-b border-white/[0.06]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg">
              <Zap className="h-4 w-4 text-white" />
            </div>
            <span className="text-[16px] font-semibold tracking-tight">OpenClaw</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/auth/login" className="text-[14px] text-white/50 hover:text-white transition-colors">
              Sign In
            </Link>
            <Link href="/auth/signup" className="btn-primary px-5 py-2 text-[14px] inline-flex items-center rounded-lg">
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="mx-auto max-w-3xl px-6 pt-24 pb-28 text-center">
        <h1 className="text-[48px] sm:text-[60px] font-bold leading-[1.05] tracking-tight">
          Your Personal AI
          <br />
          <span className="text-white/50">Ready in 60 Seconds</span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-[17px] leading-relaxed text-white/40">
          The most powerful open-source AI agent, hosted for you. Zero setup.
          Connect to WhatsApp, browse the web, automate your life.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/auth/signup"
            className="btn-primary inline-flex items-center gap-2 px-7 py-3.5 text-[15px] font-semibold rounded-lg"
          >
            Get Your AI Agent <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="#pricing"
            className="btn-glass inline-flex items-center gap-2 px-7 py-3.5 text-[15px] rounded-lg"
          >
            View Pricing
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-5xl px-6 py-20 border-t border-white/[0.06]">
        <h2 className="mb-3 text-center text-[28px] font-bold tracking-tight">Everything your agent can do</h2>
        <p className="mb-14 text-center text-[15px] text-white/40">No coding. No technical knowledge needed.</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="border border-white/[0.06] rounded-xl p-6 hover:border-white/[0.12] transition-colors">
              <f.icon className="h-5 w-5 text-white/50 mb-4" />
              <h3 className="mb-2 text-[15px] font-semibold">{f.title}</h3>
              <p className="text-[14px] leading-relaxed text-white/40">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-5xl px-6 py-20 border-t border-white/[0.06]">
        <h2 className="mb-3 text-center text-[28px] font-bold tracking-tight">Simple, transparent pricing</h2>
        <p className="mb-14 text-center text-[15px] text-white/40">Start with what you need. Upgrade anytime. Cancel anytime.</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative border rounded-xl p-7 transition-colors ${
                plan.popular
                  ? 'border-white bg-white/[0.03]'
                  : 'border-white/[0.06] hover:border-white/[0.12]'
              }`}
            >
              {plan.popular && (
                <span className="absolute -top-3 left-6 rounded-full bg-white text-black px-3 py-0.5 text-[11px] font-semibold">
                  Most Popular
                </span>
              )}
              <h3 className="text-[17px] font-semibold">{plan.name}</h3>
              <p className="mt-3">
                <span className="text-[36px] font-bold tracking-tight">${plan.price}</span>
                <span className="text-[14px] text-white/40">/month</span>
              </p>
              <p className="mt-1 text-[13px] text-white/40">{plan.tokens} tokens included</p>
              <ul className="mt-6 space-y-3">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-[14px] text-white/60">
                    <Check className="h-4 w-4 text-white/40 shrink-0 mt-0.5" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/auth/signup"
                className={`mt-8 block w-full py-3 text-center text-[14px] font-medium rounded-lg transition-all ${
                  plan.popular ? 'btn-primary' : 'btn-glass'
                }`}
              >
                Get Started
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-3xl px-6 py-20 text-center">
        <div className="border border-white/[0.08] rounded-xl p-12">
          <h2 className="text-[24px] font-bold tracking-tight">Ready to meet your AI agent?</h2>
          <p className="mt-3 text-[15px] text-white/40">From payment to working agent in under 60 seconds.</p>
          <Link
            href="/auth/signup"
            className="btn-primary inline-flex items-center gap-2 mt-8 px-7 py-3.5 text-[15px] font-semibold rounded-lg"
          >
            Get Started Now <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] py-8">
        <div className="mx-auto max-w-6xl px-6 text-center text-[13px] text-white/25">
          <p>OpenClaw — Powered by open-source AI</p>
        </div>
      </footer>
    </div>
  );
}
