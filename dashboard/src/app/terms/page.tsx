'use client';

import Link from 'next/link';
import { Zap } from 'lucide-react';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <Link href="/" className="inline-flex items-center gap-2 text-white/50 hover:text-white/80 mb-8">
          <Zap className="h-5 w-5" />
          <span>Valnaa</span>
        </Link>

        <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
        <p className="text-white/50 text-sm mb-10">Last updated: {new Date().toLocaleDateString('en-US')}</p>

        <div className="space-y-6 text-[15px] leading-relaxed text-white/80">
          <section>
            <h2 className="text-lg font-semibold text-white mb-2">1. Acceptance of Terms</h2>
            <p>By accessing or using Valnaa, you agree to these Terms of Service. If you do not agree, do not use the service. Use of the service constitutes acceptance of these terms.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">2. Description of Service</h2>
            <p>Valnaa provides an AI agent platform that runs autonomous agents with tools such as browser automation, file access, and third-party integrations. The service is experimental, may contain errors, and may change without notice. We do not guarantee accuracy, reliability, or fitness for any purpose.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">3. Acceptable Use</h2>
            <p>You agree not to use the service for illegal activities, harassment, fraud, or to violate any third-party rights. You are solely responsible for all actions taken by your agent, all content you input, and all outputs generated. We assume no responsibility for agent behavior or AI-generated content.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">4. No Warranty</h2>
            <p>The service is provided &quot;as is&quot; and &quot;as available&quot; without warranties of any kind, express or implied, including but not limited to warranties of merchantability, fitness for a particular purpose, or non-infringement. We do not guarantee availability, accuracy, security, or suitability for any purpose.</p>
          </section>

          <section className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
            <h2 className="text-lg font-semibold text-red-400 mb-2">5. Limitation of Liability — Use at Your Own Risk</h2>
            <p className="text-red-200/90 mb-3">
              <strong>To the maximum extent permitted by applicable law, in no event shall we be liable</strong> for any direct, indirect, incidental, special, consequential, punitive, or exemplary damages, including but not limited to: loss of profits, revenue, data, goodwill, or business; personal injury; property damage; security breaches; unauthorized access; data loss or corruption; actions or outputs of AI agents; reliance on AI-generated content; third-party conduct; service interruptions; bugs or errors; or any other harm whatsoever, whether based on warranty, contract, tort (including negligence), strict liability, or any other legal theory, even if we have been advised of the possibility of such damages.
            </p>
            <p className="text-red-200/90 mb-3">
              <strong>You use this service entirely at your own risk.</strong> You assume all risks. Our total liability, if any, shall not exceed the amount you paid us in the twelve (12) months preceding the claim. Some jurisdictions do not allow limitation of liability; in such jurisdictions, our liability is limited to the maximum extent permitted by law.
            </p>
            <p className="text-red-200/90">
              You waive any and all claims against us arising from your use of the service. You agree that the limitations in this section apply regardless of whether the remedy fails of its essential purpose.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">6. Indemnification</h2>
            <p>You agree to indemnify, defend, and hold harmless us, our affiliates, officers, directors, employees, and agents from and against any and all claims, damages, losses, liabilities, costs, and expenses (including reasonable attorneys&apos; fees) arising from or related to: (a) your use of the service; (b) your violation of these terms; (c) your violation of any third-party rights; (d) any content you submit or any actions taken by your agent; or (e) any harm caused to third parties by your use of the service.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">7. Assumption of Risk</h2>
            <p>You acknowledge that AI agents can produce inaccurate, harmful, or unexpected outputs. You assume all risks associated with using AI-generated content and agent actions. We are not responsible for any decisions you make based on agent outputs.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">8. Changes</h2>
            <p>We may modify these terms at any time. Continued use of the service after changes constitutes acceptance. It is your responsibility to review these terms periodically.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">9. Termination</h2>
            <p>We may suspend or terminate your access at any time, with or without cause or notice. You may stop using the service at any time. Upon termination, our liability remains limited as set forth in these terms.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">10. General</h2>
            <p>These terms constitute the entire agreement. If any provision is found unenforceable, the remaining provisions remain in effect. Our failure to enforce any right does not waive that right. You may not assign these terms; we may assign them at any time.</p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-white/10 flex gap-6 text-sm">
          <Link href="/privacy" className="text-white/50 hover:text-white/80">Privacy Policy</Link>
          <Link href="/help" className="text-white/50 hover:text-white/80">Help</Link>
          <Link href="/" className="text-white/50 hover:text-white/80">Home</Link>
        </div>
      </div>
    </div>
  );
}
