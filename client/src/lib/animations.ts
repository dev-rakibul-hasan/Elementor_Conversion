'use client';

import type { Variants, Transition } from 'framer-motion';

/**
 * Shared easing curve — smooth, iOS-like deceleration.
 */
export const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];

/**
 * Shared spring for interactive elements (buttons, cards).
 */
export const SPRING_SOFT: Transition = {
  type: 'spring',
  stiffness: 300,
  damping: 24,
  mass: 0.6,
};

export const SPRING_BOUNCY: Transition = {
  type: 'spring',
  stiffness: 400,
  damping: 18,
  mass: 0.8,
};

/**
 * Page-level entrance: fade + slide up.
 */
export const pageVariants: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: (delay: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: EASE_OUT_EXPO, delay },
  }),
  exit: { opacity: 0, y: -12, transition: { duration: 0.25, ease: 'easeIn' } },
};

/**
 * Stagger container for lists/grids.
 */
export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.07, delayChildren: 0.1 },
  },
};

/**
 * Individual item inside a stagger container.
 */
export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.5, ease: EASE_OUT_EXPO },
  },
};

/**
 * Card hover: lift + subtle tilt.
 */
export const cardHoverVariants: Variants = {
  rest: { y: 0, scale: 1, transition: { duration: 0.35, ease: EASE_OUT_EXPO } },
  hover: {
    y: -6,
    scale: 1.02,
    transition: { duration: 0.35, ease: EASE_OUT_EXPO },
  },
};

/**
 * Button press feedback.
 */
export const buttonTap = { scale: 0.96 };

/**
 * Modal/backdrop variants.
 */
export const backdropVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.25 } },
  exit: { opacity: 0, transition: { duration: 0.2, delay: 0.05 } },
};

export const modalVariants: Variants = {
  hidden: { opacity: 0, y: 24, scale: 0.96 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.35, ease: EASE_OUT_EXPO },
  },
  exit: {
    opacity: 0,
    y: 12,
    scale: 0.97,
    transition: { duration: 0.2, ease: 'easeIn' },
  },
};

/**
 * Header mobile menu drop-down.
 */
export const menuVariants: Variants = {
  hidden: { opacity: 0, height: 0 },
  visible: {
    opacity: 1,
    height: 'auto',
    transition: { duration: 0.3, ease: EASE_OUT_EXPO },
  },
  exit: { opacity: 0, height: 0, transition: { duration: 0.2, ease: 'easeIn' } },
};

/**
 * Fade-in helper for small badges/pills.
 */
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.4 } },
};
