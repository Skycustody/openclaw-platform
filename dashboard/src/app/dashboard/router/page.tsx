'use client';

import { Card, CardDescription, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Cpu } from 'lucide-react';

export default function RouterPage() {
  return (
    <div className="space-y-6">
      <div className="animate-fade-up">
        <h1 className="text-[26px] font-bold text-white tracking-tight">Brain Router</h1>
        <p className="mt-1 text-[15px] text-white/40">Control how your agent chooses models and tools</p>
      </div>

      <Card>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle>Coming soon</CardTitle>
            <CardDescription>
              Router configuration is being finalized. For now, your agent uses smart defaults.
            </CardDescription>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.06] border border-white/[0.08]">
            <Cpu className="h-4 w-4 text-white/50" />
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <Button variant="glass" onClick={() => window.location.href = '/dashboard'}>
            Back to Dashboard
          </Button>
        </div>
      </Card>
    </div>
  );
}
