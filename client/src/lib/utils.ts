import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge multiple class names together with Tailwind conflict resolution
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Format bytes to human readable format (KB, MB, GB)
 */
export function formatBytes(bytes: number | bigint | string, decimals = 2): string {
  const numericBytes = typeof bytes === 'bigint' ? Number(bytes) : typeof bytes === 'string' ? Number(bytes) : bytes;
  if (!numericBytes || isNaN(numericBytes) || numericBytes <= 0) return '0 B';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(numericBytes) / Math.log(k));
  const index = Math.min(i, sizes.length - 1);

  return `${parseFloat((numericBytes / Math.pow(k, index)).toFixed(dm))} ${sizes[index]}`;
}

/**
 * Format timestamp or ISO date string into readable format
 */
export function formatDate(date: string | Date | number | null | undefined): string {
  if (!date) return 'N/A';
  const d = new Date(date);
  if (isNaN(d.getTime())) return 'Invalid date';

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

/**
 * Format relative time (e.g., '2 hours ago', 'just now')
 */
export function formatRelativeTime(date: string | Date | number | null | undefined): string {
  if (!date) return 'N/A';
  const d = new Date(date);
  if (isNaN(d.getTime())) return 'Invalid date';

  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 30) return 'just now';
  if (diffSecs < 60) return `${diffSecs}s ago`;
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return formatDate(date);
}

/**
 * Truncate long strings with ellipsis
 */
export function truncate(str: string | null | undefined, length: number): string {
  if (!str) return '';
  if (str.length <= length) return str;
  return `${str.slice(0, length)}...`;
}

/**
 * Sleep helper
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
