'use client';
import { cn } from '@/lib/utils';

const variants = {
  online: 'badge-green',
  active: 'badge-green',
  sleeping: 'badge-blue',
  starting: 'badge-amber',
  updating: 'badge-amber',
  paused: 'badge-red',
  offline: 'badge-red',
  cancelled: 'bg-white/5 text-white/40',
  provisioning: 'badge-blue',
  default: 'bg-white/5 text-white/50',
  accent: 'badge-accent',
};

export function Badge({
  children,
  variant = 'default',
  dot,
  className,
}: {
  children: React.ReactNode;
  variant?: keyof typeof variants;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium',
        variants[variant] || variants.default,
        className
      )}
    >
      {dot !== false && variant !== 'default' && (
        <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
      )}
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    active: 'Online',
    sleeping: 'Sleeping',
    paused: 'Paused',
    provisioning: 'Starting',
    cancelled: 'Offline',
    grace_period: 'Needs Attention',
    offline: 'Offline',
  };

  return (
    <Badge variant={(status as any) || 'default'}>
      {labels[status] || status}
    </Badge>
  );
}
