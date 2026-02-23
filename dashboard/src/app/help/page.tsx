'use client';

import Link from 'next/link';
import { Zap, HelpCircle, FileText, Shield, ExternalLink } from 'lucide-react';

export default function HelpPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-white/50 hover:text-white/80 mb-8">
          <Zap className="h-5 w-5" />
          <span>Valnaa</span>
        </Link>

        <div className="flex items-center gap-3 mb-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/5">
            <HelpCircle className="h-6 w-6 text-white/50" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Help</h1>
            <p className="text-white/50 text-sm">Resources and legal information</p>
          </div>
        </div>

        <div className="space-y-4">
          <Link
            href="/privacy"
            className="flex items-center gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-4 hover:border-white/20 hover:bg-white/[0.04] transition-colors"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/5">
              <Shield className="h-5 w-5 text-white/50" />
            </div>
            <div className="flex-1">
              <h2 className="font-semibold text-white">Privacy Policy</h2>
              <p className="text-[13px] text-white/50">How we collect, use, and protect your data</p>
            </div>
            <ExternalLink className="h-4 w-4 text-white/30" />
          </Link>

          <Link
            href="/terms"
            className="flex items-center gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-4 hover:border-white/20 hover:bg-white/[0.04] transition-colors"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/5">
              <FileText className="h-5 w-5 text-white/50" />
            </div>
            <div className="flex-1">
              <h2 className="font-semibold text-white">Terms of Service</h2>
              <p className="text-[13px] text-white/50">Rules of use and limitation of liability</p>
            </div>
            <ExternalLink className="h-4 w-4 text-white/30" />
          </Link>
        </div>

        <div className="mt-10 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <p className="text-[13px] text-amber-200/90">
            <strong>Use at your own risk.</strong> Valnaa and its AI agents are provided &quot;as is.&quot; We are not liable for any damages, data loss, or harm arising from your use of the platform. By using Valnaa, you accept these terms.
          </p>
        </div>

        <div className="mt-12 pt-8 border-t border-white/10 flex gap-6 text-sm">
          <Link href="/privacy" className="text-white/50 hover:text-white/80">Privacy Policy</Link>
          <Link href="/terms" className="text-white/50 hover:text-white/80">Terms of Service</Link>
          <Link href="/dashboard" className="text-white/50 hover:text-white/80">Dashboard</Link>
        </div>
      </div>
    </div>
  );
}
