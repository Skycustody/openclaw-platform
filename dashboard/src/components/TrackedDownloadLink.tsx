'use client';

import type { ReactNode } from 'react';

type Props = {
  href: string;
  trackEvent: string;
  className?: string;
  children: ReactNode;
};

/** Wraps a download anchor and fires vTrack(trackEvent) before navigation. */
export function TrackedDownloadLink({ href, trackEvent, className, children }: Props) {
  return (
    <a
      href={href}
      className={className}
      onClick={() => {
        if (typeof window !== 'undefined' && window.vTrack) {
          window.vTrack(trackEvent);
        }
      }}
    >
      {children}
    </a>
  );
}
