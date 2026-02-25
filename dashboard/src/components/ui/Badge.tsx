'use client';
import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

type BadgeVariant = 'default' | 'green' | 'amber' | 'red' | 'blue';

export function Badge({
  children,
  variant = 'default',
  dot,
  className,
}: {
  children: ReactNode;
  variant?: BadgeVariant | 'accent';
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-medium border',
        {
          'border-white/10 text-white/70 bg-transparent': variant === 'default',
          'border-green-500/20 text-green-400 bg-transparent': variant === 'green',
          'border-amber-500/20 text-amber-400 bg-transparent': variant === 'amber',
          'border-red-500/20 text-red-400 bg-transparent': variant === 'red',
          'border-blue-500/20 text-blue-400 bg-transparent': variant === 'blue',
          'border-white/20 text-white/80 bg-transparent': variant === 'accent',
        },
        className
      )}
    >
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" /> : null}
      {children}
    </span>
  );
}

export function StatusBadge({
  status,
  className,
}: {
  status: 'active' | 'online' | 'sleeping' | 'paused' | 'provisioning' | 'starting' | 'cancelled' | 'offline' | 'grace_period';
  className?: string;
}) {
  const config: Record<string, { label: string; variant: BadgeVariant }> = {
    active: { label: 'Active', variant: 'green' },
    online: { label: 'Online', variant: 'green' },
    sleeping: { label: 'Sleeping', variant: 'blue' },
    paused: { label: 'Paused', variant: 'red' },
    provisioning: { label: 'Setting up', variant: 'amber' },
    starting: { label: 'Starting', variant: 'amber' },
    cancelled: { label: 'Cancelled', variant: 'red' },
    offline: { label: 'Offline', variant: 'red' },
    grace_period: { label: 'Grace period', variant: 'amber' },
  };

  const c = config[status] || { label: status, variant: 'default' as BadgeVariant };
  return <Badge variant={c.variant} className={className}>{c.label}</Badge>;
}
