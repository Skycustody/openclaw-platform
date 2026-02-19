import Link from 'next/link';
import {
  Zap, MessageSquare, Globe, Shield, Clock, Coins,
  ArrowRight, Check, Star, Sparkles,
} from 'lucide-react';

const features = [
  { icon: Sparkles, title: 'Ready in 60 Seconds', desc: 'Sign up, pay, and your personal AI agent is live — no setup needed' },
  { icon: MessageSquare, title: 'All Your Apps', desc: 'Connect to Telegram, WhatsApp, Discord, Slack and more' },
  { icon: Globe, title: 'Browses the Web', desc: 'Your agent searches, researches, checks prices, and extracts data for you' },
  { icon: Shield, title: 'Token Protection', desc: 'Smart budgets prevent surprise costs. You stay in control.' },
  { icon: Clock, title: 'Works While You Sleep', desc: 'Schedule daily briefings, email summaries, price alerts — all automated' },
  { icon: Coins, title: 'Saves You Money', desc: 'Smart routing picks the cheapest AI that can do the job. Saves 50%+ on average.' },
];

const plans = [
  { name: 'Starter', price: 10, tokens: '500K', features: ['Personal AI agent', '500K tokens/month', '10 skills', 'Telegram only', 'Email support'] },
  { name: 'Pro', price: 20, popular: true, tokens: '1.5M', features: ['Everything in Starter', '1.5M tokens/month', 'All 53 skills', 'All messaging apps', 'Browser access', 'Priority support'] },
  { name: 'Business', price: 50, tokens: '5M', features: ['Everything in Pro', '5M tokens/month', 'Community templates', 'Maximum agent power', '100 scheduled tasks', 'Direct support line'] },
];

const testimonials = [
  { name: 'Sarah K.', role: 'Marketing Manager', text: 'My agent handles all my emails and gives me a daily brief. Saves me 2 hours every day.' },
  { name: 'David M.', role: 'Crypto Trader', text: 'Price alerts, portfolio summaries, news briefings — all automated. Best $20/month I spend.' },
  { name: 'Lisa R.', role: 'Freelancer', text: 'I was intimidated by AI tools. OpenClaw made it so simple. Connected to WhatsApp in 2 minutes.' },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-mesh text-white overflow-hidden">
      {/* Nav */}
      <nav className="relative z-10">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-gradient-to-br from-indigo-500 to-purple-500 shadow-lg shadow-indigo-500/25">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <span className="text-[18px] font-bold tracking-tight">OpenClaw</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/auth/login" className="text-[14px] text-white/50 hover:text-white transition-colors">
              Sign In
            </Link>
            <Link href="/auth/signup" className="btn-primary px-5 py-2.5 text-[14px] inline-flex items-center">
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative mx-auto max-w-4xl px-6 pt-20 pb-24 text-center">
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full bg-indigo-500/10 blur-[120px]" />
        </div>
        <div className="mb-6 inline-flex items-center gap-2 rounded-full glass px-4 py-2 text-[13px] text-white/60">
          <Star className="h-3.5 w-3.5 text-amber-400" />
          145,000+ GitHub stars — Trusted by thousands
        </div>
        <h1 className="text-[52px] sm:text-[64px] font-bold leading-[1.05] tracking-tight">
          Your Personal AI
          <br />
          <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            Ready in 60 Seconds
          </span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-[18px] leading-relaxed text-white/50">
          OpenClaw is the most powerful open-source AI agent. We host it for you — 
          zero setup, zero technical knowledge. Connect to WhatsApp, browse the web,
          manage your emails, automate your life.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/auth/signup"
            className="btn-primary inline-flex items-center gap-2 px-8 py-4 text-[16px] font-semibold"
          >
            Get Your AI Agent <ArrowRight className="h-5 w-5" />
          </Link>
          <Link
            href="#pricing"
            className="btn-glass inline-flex items-center gap-2 px-8 py-4 text-[16px]"
          >
            View Pricing
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="mb-4 text-center text-[32px] font-bold tracking-tight">Everything your agent can do</h2>
        <p className="mb-14 text-center text-[16px] text-white/40">No coding required. No technical knowledge needed.</p>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="glass p-6 glass-hover transition-all duration-300 cursor-default">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-[14px] bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/20">
                <f.icon className="h-5 w-5 text-indigo-400" />
              </div>
              <h3 className="mb-2 text-[16px] font-semibold">{f.title}</h3>
              <p className="text-[14px] leading-relaxed text-white/40">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Testimonials */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {testimonials.map((t) => (
            <div key={t.name} className="glass p-6">
              <div className="flex gap-1 mb-4">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
                ))}
              </div>
              <p className="text-[14px] leading-relaxed text-white/60 mb-4">&ldquo;{t.text}&rdquo;</p>
              <div>
                <p className="text-[14px] font-medium text-white">{t.name}</p>
                <p className="text-[12px] text-white/30">{t.role}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-5xl px-6 py-20">
        <h2 className="mb-4 text-center text-[32px] font-bold tracking-tight">Simple, transparent pricing</h2>
        <p className="mb-14 text-center text-[16px] text-white/40">Start with what you need. Upgrade anytime. Cancel anytime.</p>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative glass p-7 transition-all duration-300 ${
                plan.popular ? 'glow-accent ring-1 ring-indigo-500/30' : ''
              }`}
            >
              {plan.popular && (
                <span className="absolute -top-3 left-6 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 px-3.5 py-1 text-[11px] font-semibold">
                  Most Popular
                </span>
              )}
              <h3 className="text-[18px] font-semibold">{plan.name}</h3>
              <p className="mt-3">
                <span className="text-[40px] font-bold tracking-tight">${plan.price}</span>
                <span className="text-[14px] text-white/40">/month</span>
              </p>
              <p className="mt-1 text-[13px] text-white/40">{plan.tokens} tokens included</p>
              <ul className="mt-6 space-y-3">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-[14px] text-white/60">
                    <Check className="h-4 w-4 text-indigo-400 shrink-0 mt-0.5" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                href={`/auth/signup?plan=${plan.name.toLowerCase()}`}
                className={`mt-8 block w-full py-3 text-center text-[14px] font-medium rounded-xl transition-all ${
                  plan.popular
                    ? 'btn-primary'
                    : 'btn-glass'
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
        <div className="glass-strong p-12 glow-accent">
          <h2 className="text-[28px] font-bold tracking-tight">Ready to meet your AI agent?</h2>
          <p className="mt-3 text-[16px] text-white/50">From payment to working agent in under 60 seconds.</p>
          <Link
            href="/auth/signup"
            className="btn-primary inline-flex items-center gap-2 mt-8 px-8 py-4 text-[16px] font-semibold"
          >
            Get Started Now <ArrowRight className="h-5 w-5" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-10">
        <div className="mx-auto max-w-6xl px-6 text-center text-[13px] text-white/25">
          <p>OpenClaw Hosting Platform — Powered by open-source AI</p>
        </div>
      </footer>
    </div>
  );
}
