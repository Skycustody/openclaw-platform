'use client';
import { cn } from '@/lib/utils';
import { ReactNode } from 'react';
import { GlowingEffect } from '@/components/ui/glowing-effect';

export function Card({ children, className, glow = true }: { children: ReactNode; className?: string; glow?: boolean }) {
  return (
    <div className="relative rounded-[1.25rem] border-[0.75px] border-white/[0.08] p-2 animate-fade-up">
      {glow && (
        <GlowingEffect
          spread={40}
          glow={true}
          disabled={false}
          proximity={64}
          inactiveZone={0.01}
          borderWidth={3}
        />
      )}
      <div className={cn(
        'relative bg-white/[0.03] border-[0.75px] border-white/[0.08] rounded-xl p-6',
        className
      )}>
        {children}
      </div>
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
