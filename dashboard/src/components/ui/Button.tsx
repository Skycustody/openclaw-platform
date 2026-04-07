'use client';
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-lg text-[13px] font-medium transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/20 disabled:pointer-events-none disabled:opacity-40',
  {
    variants: {
      variant: {
        default: 'bg-white/[0.06] border border-white/[0.12] text-[#e0e0e0] hover:bg-white/[0.1] hover:border-white/[0.18]',
        primary: 'bg-white/[0.06] border border-white/[0.12] text-[#e0e0e0] hover:bg-white/[0.1] hover:border-white/[0.18]',
        secondary: 'bg-white/[0.04] border border-white/[0.08] text-white/60 hover:bg-white/[0.06] hover:text-white/80',
        glass: 'bg-transparent border border-white/[0.08] text-white/50 hover:bg-white/[0.04] hover:text-white/70 hover:border-white/[0.12]',
        ghost: 'text-white/40 hover:text-white/60 hover:bg-white/[0.04]',
        link: 'text-white/50 underline-offset-4 hover:underline hover:text-white/70',
        destructive: 'bg-transparent border border-[#f87171]/20 text-[#f87171]/70 hover:bg-[#f87171]/[0.06] hover:border-[#f87171]/30',
        outline: 'border border-white/[0.08] bg-transparent text-white/50 hover:bg-white/[0.04] hover:text-white/70',
        danger: 'bg-transparent border border-[#f87171]/20 text-[#f87171]/70 hover:bg-[#f87171]/[0.06] hover:border-[#f87171]/30',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 px-3',
        lg: 'h-10 px-6',
        icon: 'h-9 w-9',
        md: 'h-9 px-4 py-2',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      loading,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : 'button';

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        <span className="inline-flex items-center gap-2">
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {children}
        </span>
      </Comp>
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
