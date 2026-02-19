'use client';
import { cn } from '@/lib/utils';
import { ButtonHTMLAttributes, forwardRef } from 'react';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'glass' | 'danger' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          'inline-flex items-center justify-center gap-2 font-medium transition-all duration-200 focus:outline-none disabled:opacity-40 disabled:pointer-events-none',
          {
            'btn-primary': variant === 'primary',
            'btn-glass': variant === 'glass',
            'btn-danger': variant === 'danger',
            'text-white/50 hover:text-white hover:bg-white/5 rounded-xl': variant === 'ghost',
            'border border-white/10 text-white/70 hover:bg-white/5 hover:border-white/15 rounded-xl': variant === 'outline',
          },
          {
            'px-3.5 py-2 text-[13px] rounded-[10px]': size === 'sm',
            'px-5 py-2.5 text-[14px]': size === 'md',
            'px-7 py-3.5 text-[15px]': size === 'lg',
          },
          className
        )}
        {...props}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
