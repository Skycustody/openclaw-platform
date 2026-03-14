'use client';

import { useState } from 'react';
import { Zap, Star, Send, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const USEFUL_OPTIONS = [
  'Chat / AI Assistant',
  'Browser Automation',
  'Scheduled Tasks',
  'Telegram / Discord Bot',
  'File & Code Access',
  'Memory & Context',
];

export default function FeedbackPage() {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [email, setEmail] = useState('');
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [easeOfSetup, setEaseOfSetup] = useState('');
  const [mostUseful, setMostUseful] = useState('');
  const [biggestPain, setBiggestPain] = useState('');
  const [recommend, setRecommend] = useState('');
  const [improvements, setImprovements] = useState('');
  const [comments, setComments] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email || !email.includes('@')) {
      setError('Please enter your email');
      return;
    }
    if (!rating) {
      setError('Please give us a rating');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/feedback/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, rating, easeOfSetup, mostUseful, biggestPain, recommend, improvements, comments }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to submit');
      }
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <CheckCircle2 className="h-16 w-16 text-emerald-400 mx-auto mb-6" />
          <h1 className="text-2xl font-bold mb-3">Thank you!</h1>
          <p className="text-white/60 mb-8">
            Your feedback means a lot to us. We&apos;ll use it to make Valnaa better for you.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/10 hover:bg-white/15 rounded-lg transition"
          >
            <Zap className="h-4 w-4" />
            Back to Valnaa
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-xl px-6 py-12">
        <Link href="/" className="inline-flex items-center gap-2 text-white/50 hover:text-white/80 mb-10">
          <Zap className="h-5 w-5" />
          <span>Valnaa</span>
        </Link>

        <h1 className="text-2xl font-bold mb-2">How&apos;s your experience?</h1>
        <p className="text-white/50 text-sm mb-8">
          We&apos;d love to hear what you think. Takes about 2 minutes.
        </p>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">Your email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 transition"
            />
          </div>

          {/* Star Rating */}
          <div>
            <label className="block text-sm font-medium text-white/70 mb-3">Overall, how would you rate Valnaa?</label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  onMouseEnter={() => setHoverRating(n)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="p-1 transition"
                >
                  <Star
                    className={`h-8 w-8 transition ${
                      n <= (hoverRating || rating)
                        ? 'fill-amber-400 text-amber-400'
                        : 'text-white/20'
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Ease of Setup */}
          <div>
            <label className="block text-sm font-medium text-white/70 mb-3">How easy was it to get started?</label>
            <div className="flex gap-2 flex-wrap">
              {['Very easy', 'Fairly easy', 'Neutral', 'A bit confusing', 'Very difficult'].map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setEaseOfSetup(opt)}
                  className={`px-4 py-2 rounded-lg text-sm transition border ${
                    easeOfSetup === opt
                      ? 'bg-white/15 border-white/30 text-white'
                      : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          {/* Most Useful Feature */}
          <div>
            <label className="block text-sm font-medium text-white/70 mb-3">What feature do you find most useful?</label>
            <div className="flex gap-2 flex-wrap">
              {USEFUL_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setMostUseful(opt)}
                  className={`px-4 py-2 rounded-lg text-sm transition border ${
                    mostUseful === opt
                      ? 'bg-white/15 border-white/30 text-white'
                      : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          {/* Biggest Pain */}
          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">What&apos;s been the most frustrating part?</label>
            <textarea
              value={biggestPain}
              onChange={(e) => setBiggestPain(e.target.value)}
              placeholder="Anything that didn't work well or was confusing..."
              rows={3}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 transition resize-none"
            />
          </div>

          {/* Recommend */}
          <div>
            <label className="block text-sm font-medium text-white/70 mb-3">Would you recommend Valnaa to a friend?</label>
            <div className="flex gap-2 flex-wrap">
              {['Definitely', 'Probably', 'Not sure', 'Probably not', 'No'].map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setRecommend(opt)}
                  className={`px-4 py-2 rounded-lg text-sm transition border ${
                    recommend === opt
                      ? 'bg-white/15 border-white/30 text-white'
                      : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          {/* Improvements */}
          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">What would make Valnaa better for you?</label>
            <textarea
              value={improvements}
              onChange={(e) => setImprovements(e.target.value)}
              placeholder="Features you'd love to see, things we should change..."
              rows={3}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 transition resize-none"
            />
          </div>

          {/* Anything Else */}
          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">Anything else you&apos;d like to tell us?</label>
            <textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="Optional — any thoughts, suggestions, or kind words :)"
              rows={3}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 transition resize-none"
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 py-3 bg-white text-black font-semibold rounded-lg hover:bg-white/90 disabled:opacity-50 transition"
          >
            {submitting ? (
              'Submitting...'
            ) : (
              <>
                <Send className="h-4 w-4" />
                Send Feedback
              </>
            )}
          </button>
        </form>

        <p className="text-white/30 text-xs text-center mt-6">
          Your feedback is private and only visible to the Valnaa team.
        </p>
      </div>
    </div>
  );
}
