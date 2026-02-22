import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCredits(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

/** @deprecated Use formatCredits */
export const formatTokens = formatCredits;

export function formatCreditsWithDays(balance: number, dailyRate: number): string {
  const formatted = formatCredits(balance);
  if (dailyRate <= 0) return formatted;
  const days = Math.floor(balance / dailyRate);
  return `${formatted} (~${days} days)`;
}

/** @deprecated Use formatCreditsWithDays */
export const formatTokensWithDays = formatCreditsWithDays;

export function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function timeAgo(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  if (diff < 604800_000) return `${Math.floor(diff / 86400_000)}d ago`;
  return d.toLocaleDateString();
}

export function getStatusMessage(status: string): { message: string } {
  const map: Record<string, string> = {
    active: 'Your agent is running and ready',
    sleeping: 'Your agent is sleeping and will wake on message',
    paused: 'Your agent is paused',
    provisioning: 'Your agent is being set up',
    cancelled: 'Your subscription was cancelled',
    offline: 'Your agent is offline',
    grace_period: 'Your subscription is in grace period',
  };
  return { message: map[status] ?? status };
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatCents(cents: number): string {
  return formatDollars(cents);
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}
