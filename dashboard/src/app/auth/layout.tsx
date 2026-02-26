'use client';

import { useEffect } from 'react';
import Script from 'next/script';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.style.setProperty('--auth-ready', '1');
    return () => { document.documentElement.style.removeProperty('--auth-ready'); };
  }, []);

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(250,250,250,0.04),transparent_50%)]"
      />
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
      />
      {children}
    </div>
  );
}
