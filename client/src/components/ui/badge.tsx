'use client';

import React, { HTMLAttributes } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { SPRING_BOUNCY } from '@/lib/animations';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'success' | 'warning' | 'error' | 'info' | 'neutral';
  withDot?: boolean;
}

export function Badge({
  className,
  variant = 'neutral',
  withDot = false,
  children,
  ...props
}: BadgeProps) {
  const variants = {
    neutral: 'bg-secondary text-secondary-foreground border-border/60',
    info: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30',
    success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
    warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
    error: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30',
  };

  const dotColors = {
    neutral: 'bg-muted-foreground',
    info: 'bg-indigo-500 dark:bg-indigo-400 animate-pulse',
    success: 'bg-emerald-500 dark:bg-emerald-400',
    warning: 'bg-amber-500 dark:bg-amber-400',
    error: 'bg-rose-500 dark:bg-rose-400',
  };

  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.05 }}
      transition={SPRING_BOUNCY}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium tracking-wide transition-colors',
        variants[variant],
        className
      )}
      {...(props as React.ComponentProps<typeof motion.span>)}
    >
      {withDot && <span className={cn('h-1.5 w-1.5 rounded-full', dotColors[variant])} />}
      {children}
    </motion.span>
  );
}
