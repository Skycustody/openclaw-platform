'use client';

import { Card, CardDescription, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { MessageSquare } from 'lucide-react';

export default function ConversationsPage() {
  return (
    <div className="space-y-6">
      <div className="animate-fade-up">
        <h1 className="text-[26px] font-bold text-white tracking-tight">History</h1>
        <p className="mt-1 text-[15px] text-white/40">Review previous conversations</p>
      </div>

      <Card>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle>Coming soon</CardTitle>
            <CardDescription>
              Conversation history UI is being refined. Your agent still logs activity in the Activity feed.
            </CardDescription>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.06] border border-white/[0.08]">
            <MessageSquare className="h-4 w-4 text-white/50" />
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <Button variant="glass" onClick={() => window.location.href = '/dashboard/activity'}>
            Open Activity
          </Button>
        </div>
      </Card>
    </div>
  );
}
