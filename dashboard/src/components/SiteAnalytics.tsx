'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useCallback, useRef } from 'react';

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

function sendEvent(event: string, path: string, meta?: Record<string, unknown>) {
  const vid = getVisitorId();
  if (!vid) return;
  fetch(`${API_BASE}/track/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ visitorId: vid, event, path, meta: meta || {} }),
    keepalive: true,
  }).catch(() => {});
}

export function SiteAnalytics() {
  const pathname = usePathname() || '/';
  const searchParams = useSearchParams();
  const enterTime = useRef<number>(Date.now());

  const sendPageview = useCallback(() => {
    if (pathname.startsWith('/admin')) return;
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

  // Track time spent on each page
  useEffect(() => {
    if (pathname.startsWith('/admin')) return;
    enterTime.current = Date.now();

    const sendLeave = () => {
      const seconds = Math.round((Date.now() - enterTime.current) / 1000);
      if (seconds < 1 || seconds > 1800) return; // ignore <1s or >30min (tab left open)
      sendEvent('page_leave', pathname, { seconds });
    };

    window.addEventListener('beforeunload', sendLeave);
    return () => {
      window.removeEventListener('beforeunload', sendLeave);
      sendLeave(); // also fires on route change
    };
  }, [pathname]);

  useEffect(() => {
    window.vTrack = (event: string, meta?: Record<string, unknown>) => {
      sendEvent(event, typeof window !== 'undefined' ? window.location.pathname : '/', meta);
    };
    return () => {
      delete window.vTrack;
    };
  }, []);

  return null;
}
