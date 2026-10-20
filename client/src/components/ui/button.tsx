'use client';

import React, { forwardRef, ButtonHTMLAttributes } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SPRING_SOFT, buttonTap } from '@/lib/animations';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'destructive';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      isLoading = false,
      disabled,
      children,
      leftIcon,
      rightIcon,
      type = 'button',
      ...props
    },
    ref
  ) => {
    const baseStyles =
      'inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 select-none rounded-lg';

    const variants = {
      primary:
        'bg-gradient-to-br from-primary to-[#8b5cf6] text-primary-foreground hover:from-primary-hover hover:to-[#a78bfa] shadow-md shadow-primary/25 hover:shadow-lg hover:shadow-primary/35 active:scale-[0.98]',
      secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary-hover active:scale-[0.98]',
      outline:
        'border border-border bg-transparent hover:bg-secondary text-foreground active:scale-[0.98]',
      ghost: 'bg-transparent hover:bg-secondary text-foreground',
      danger:
        'bg-destructive text-destructive-foreground hover:bg-destructive/90 active:scale-[0.98]',
      destructive:
        'bg-destructive text-destructive-foreground hover:bg-destructive/90 active:scale-[0.98]',
    };

    const sizes = {
      sm: 'h-8 px-3 text-xs gap-1.5',
      md: 'h-10 px-4 text-sm gap-2',
      lg: 'h-12 px-6 text-base gap-2.5',
      icon: 'h-10 w-10 p-0',
    };

    return (
      <motion.button
        ref={ref}
        type={type}
        disabled={disabled || isLoading}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        whileHover={disabled || isLoading ? undefined : { scale: 1.02 }}
        whileTap={disabled || isLoading ? undefined : buttonTap}
        transition={SPRING_SOFT}
        {...(props as HTMLMotionProps<'button'>)}
      >
        {isLoading && <Loader2 className="h-4 w-4 animate-spin shrink-0" />}
        {!isLoading && leftIcon && <span className="shrink-0">{leftIcon}</span>}
        {children}
        {!isLoading && rightIcon && <span className="shrink-0">{rightIcon}</span>}
      </motion.button>
    );
  }
);

Button.displayName = 'Button';
