import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(0)}K`;
  return tokens.toLocaleString();
}

export function formatTokensWithDays(tokens: number, dailyRate?: number): string {
  const base = formatTokens(tokens);
  if (dailyRate && dailyRate > 0) {
    const days = Math.floor(tokens / dailyRate);
    return `${base} (~${days} days left)`;
  }
  return base;
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function formatDollars(cents: number): string {
  const val = cents / 100;
  if (val >= 1) return `$${val.toFixed(2)}`;
  return `${(val * 100).toFixed(2)}¢`;
}

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatDateTime(date: string | Date): string {
  return new Date(date).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatTime(date: string | Date): string {
  return new Date(date).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function timeAgo(date: string | Date): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return formatDate(date);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(1)} GB`;
}

// User-friendly status messages (no technical jargon)
export function getStatusMessage(status: string): { label: string; message: string; color: string } {
  switch (status) {
    case 'active':
      return { label: 'Online', message: 'Your agent is active and ready', color: 'green' };
    case 'sleeping':
      return { label: 'Sleeping', message: 'Resting — wakes instantly when you message', color: 'blue' };
    case 'provisioning':
      return { label: 'Starting', message: 'Your agent is starting up — ready in ~10 seconds', color: 'amber' };
    case 'paused':
      return { label: 'Paused', message: 'Out of tokens — top up to resume', color: 'red' };
    case 'grace_period':
      return { label: 'Needs Attention', message: 'Payment issue — please update your card', color: 'red' };
    case 'cancelled':
      return { label: 'Offline', message: 'Subscription ended', color: 'red' };
    default:
      return { label: 'Unknown', message: 'Something went wrong — contact support', color: 'red' };
  }
}
