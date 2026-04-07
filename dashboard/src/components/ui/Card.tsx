'use client';
import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

export function Card({ children, className, glow = false, onClick }: { children: ReactNode; className?: string; glow?: boolean; onClick?: () => void }) {
  return (
    <div
      className={cn(
        'rounded-xl border border-white/[0.06] bg-white/[0.04] p-6 animate-fade-up',
        onClick && 'cursor-pointer hover:bg-white/[0.06] transition-colors',
        className
      )}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mb-5', className)}>{children}</div>;
}

export function CardTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h3 className={cn('text-[16px] font-semibold text-[#e8e8e8] tracking-tight', className)}>{children}</h3>;
}

export function CardDescription({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('mt-1.5 text-[13px] leading-relaxed text-white/40', className)}>{children}</p>;
}

export function GlassPanel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('bg-white/[0.02] border border-white/[0.06] rounded-lg p-5', className)}>
      {children}
    </div>
  );
}
