'use client';
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-all duration-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline:
          'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
        primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
        glass:
          'border border-input bg-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground',
        danger: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-10 w-10',
        md: 'h-10 px-4 py-2',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

const noGlassVariants = new Set(['ghost', 'link']);

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
    const showGlass = !asChild && !noGlassVariants.has(variant ?? 'default');

    return (
      <Comp
        className={cn(
          buttonVariants({ variant, size, className }),
          showGlass && 'relative overflow-hidden'
        )}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {showGlass && (
          <>
            <span
              className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-[inherit]"
              style={{
                backdropFilter: 'blur(4px)',
                filter: 'url(#glass-distortion)',
                isolation: 'isolate',
              }}
            />
            <span
              className="pointer-events-none absolute inset-0 z-[1] rounded-[inherit]"
              style={{ background: 'rgba(255, 255, 255, 0.12)' }}
            />
            <span
              className="pointer-events-none absolute inset-0 z-[2] overflow-hidden rounded-[inherit]"
              style={{
                boxShadow:
                  'inset 2px 2px 2px 0 rgba(255,255,255,0.2), inset -1px -1px 1px 0 rgba(255,255,255,0.15)',
              }}
            />
          </>
        )}
        <span className={cn('inline-flex items-center gap-2', showGlass && 'relative z-[3]')}>
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {children}
        </span>
      </Comp>
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
