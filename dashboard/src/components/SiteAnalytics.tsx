'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useCallback } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function getVisitorId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    let id = localStorage.getItem('valnaa_vid');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('valnaa_vid', id);
    }
    return id;
  } catch {
    return null;
  }
}

declare global {
  interface Window {
    vTrack?: (event: string, meta?: Record<string, unknown>) => void;
  }
}

export function SiteAnalytics() {
  const pathname = usePathname() || '/';
  const searchParams = useSearchParams();

  const sendPageview = useCallback(() => {
    const vid = getVisitorId();
    if (!vid) return;
    const utm_source = searchParams?.get('utm_source') || '';
    const utm_medium = searchParams?.get('utm_medium') || '';
    const utm_campaign = searchParams?.get('utm_campaign') || '';
    fetch(`${API_BASE}/track/pageview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        visitorId: vid,
        path: pathname,
        referrer: typeof document !== 'undefined' ? document.referrer || '' : '',
        utm_source,
        utm_medium,
        utm_campaign,
      }),
      keepalive: true,
    }).catch(() => {});
  }, [pathname, searchParams]);

  useEffect(() => {
    sendPageview();
  }, [sendPageview]);

  useEffect(() => {
    window.vTrack = (event: string, meta?: Record<string, unknown>) => {
      const vid = getVisitorId();
      if (!vid) return;
      fetch(`${API_BASE}/track/event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visitorId: vid,
          event,
          path: typeof window !== 'undefined' ? window.location.pathname : '/',
          meta: meta || {},
        }),
        keepalive: true,
      }).catch(() => {});
    };
    return () => {
      delete window.vTrack;
    };
  }, []);

  return null;
}
