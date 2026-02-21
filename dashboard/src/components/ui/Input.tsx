'use client';
import { cn } from '@/lib/utils';
import { InputHTMLAttributes, forwardRef } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, hint, error, id, ...props }, ref) => {
    return (
      <div className="space-y-2">
        {label && (
          <label htmlFor={id} className="block text-[13px] font-medium text-white/60">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          className={cn(
            'w-full bg-transparent border border-white/10 rounded-lg px-4 py-3 text-[14px] text-white placeholder:text-white/25 focus:border-white/30 focus:outline-none transition-colors',
            error && 'border-red-400/50 focus:border-red-400',
            className
          )}
          {...props}
        />
        {hint && <p className="text-[12px] text-white/30">{hint}</p>}
        {error && <p className="text-[12px] text-red-400">{error}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';

export function Textarea({
  label,
  hint,
  value,
  onChange,
  placeholder,
  rows = 4,
  className,
}: {
  label?: string;
  hint?: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
}) {
  return (
    <div className="space-y-2">
      {label && <label className="block text-[13px] font-medium text-white/60">{label}</label>}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className={cn(
          'w-full bg-transparent border border-white/10 rounded-lg px-4 py-3 text-[14px] text-white placeholder:text-white/25 resize-none leading-relaxed focus:border-white/30 focus:outline-none transition-colors',
          className
        )}
      />
      {hint && <p className="text-[12px] text-white/30">{hint}</p>}
    </div>
  );
}
