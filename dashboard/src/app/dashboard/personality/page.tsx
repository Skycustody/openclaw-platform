'use client';

import { Card, CardDescription, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { User } from 'lucide-react';

export default function PersonalityPage() {
  return (
    <div className="space-y-6">
      <div className="animate-fade-up">
        <h1 className="text-[26px] font-bold text-white tracking-tight">Persona</h1>
        <p className="mt-1 text-[15px] text-white/40">Define how your agent speaks and behaves</p>
      </div>

      <Card>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle>Coming soon</CardTitle>
            <CardDescription>
              Persona editing is on the roadmap. You can still set core instructions from Settings.
            </CardDescription>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.06] border border-white/[0.08]">
            <User className="h-4 w-4 text-white/50" />
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <Button variant="glass" onClick={() => window.location.href = '/dashboard/settings'}>
            Open Settings
          </Button>
        </div>
      </Card>
    </div>
  );
}
