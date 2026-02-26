'use client';
import React from 'react';
import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { MenuToggleIcon } from '@/components/ui/menu-toggle-icon';
import { useScroll } from '@/components/ui/use-scroll';
import { createPortal } from 'react-dom';
import Image from 'next/image';

export function Header() {
  const [open, setOpen] = React.useState(false);
  const scrolled = useScroll(10);

  const links = [
    { label: 'Features', href: '#features' },
    { label: 'Pricing', href: '#pricing' },
    { label: 'About', href: '#about' },
  ];

  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <header
      className={cn(
        'sticky top-0 z-50 w-full border-b border-transparent transition-all duration-300',
        {
          'border-border bg-background/80 backdrop-blur-lg supports-[backdrop-filter]:bg-background/50':
            scrolled,
        }
      )}
    >
      <nav className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-md p-2 hover:bg-accent"
        >
          <Image src="/favicon.png" alt="Valnaa" width={20} height={20} className="rounded-sm" />
          <span className="text-sm font-semibold tracking-tight">Valnaa</span>
        </Link>
        <div className="hidden items-center gap-2 md:flex">
          {links.map((link) => (
            <a
              key={link.label}
              className={buttonVariants({ variant: 'ghost' })}
              href={link.href}
            >
              {link.label}
            </a>
          ))}
          <Link href="/auth/login">
            <Button variant="outline">Sign In</Button>
          </Link>
          <Link href="/auth/signup">
            <Button>Get Started</Button>
          </Link>
        </div>
        <Button
          size="icon"
          variant="outline"
          onClick={() => setOpen(!open)}
          className="md:hidden"
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label="Toggle menu"
        >
          <MenuToggleIcon open={open} className="size-5" duration={300} />
        </Button>
      </nav>
      <MobileMenu open={open}>
        <div className="grid gap-y-2">
          {links.map((link) => (
            <a
              key={link.label}
              className={buttonVariants({
                variant: 'ghost',
                className: 'justify-start',
              })}
              href={link.href}
              onClick={() => setOpen(false)}
            >
              {link.label}
            </a>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <Link href="/auth/login">
            <Button variant="outline" className="w-full bg-transparent">
              Sign In
            </Button>
          </Link>
          <Link href="/auth/signup">
            <Button className="w-full">Get Started</Button>
          </Link>
        </div>
      </MobileMenu>
    </header>
  );
}

type MobileMenuProps = React.ComponentProps<'div'> & {
  open: boolean;
};

function MobileMenu({
  open,
  children,
  className,
  ...props
}: MobileMenuProps) {
  if (!open || typeof window === 'undefined') return null;

  return createPortal(
    <div
      id="mobile-menu"
      className={cn(
        'bg-background/95 supports-[backdrop-filter]:bg-background/50 backdrop-blur-lg',
        'fixed top-14 right-0 bottom-0 left-0 z-40 flex flex-col overflow-hidden border-y md:hidden'
      )}
    >
      <div
        data-slot={open ? 'open' : 'closed'}
        className={cn(
          'data-[slot=open]:animate-in data-[slot=open]:zoom-in-97 ease-out',
          'flex size-full flex-col justify-between gap-2 p-4',
          className
        )}
        {...props}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
