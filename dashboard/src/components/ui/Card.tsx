'use client';
import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

export function Card({ children, className }: { children: ReactNode; className?: string; glow?: boolean }) {
  return (
    <div className={cn(
      'bg-white/[0.03] border border-white/[0.08] rounded-xl p-6 animate-fade-up',
      className
    )}>
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mb-5', className)}>{children}</div>;
}

export function CardTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h3 className={cn('text-[17px] font-semibold text-white tracking-tight', className)}>{children}</h3>;
}

export function CardDescription({ children }: { children: ReactNode }) {
  return <p className="mt-1.5 text-[14px] leading-relaxed text-white/50">{children}</p>;
}

export function GlassPanel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('bg-white/[0.02] border border-white/[0.05] rounded-lg p-5', className)}>
      {children}
    </div>
  );
}
