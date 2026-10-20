'use client';

import { useEffect, useState } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';

/**
 * MagicCursor
 * A beautiful custom cursor with:
 * - Soft radial glow trail (spring-smoothed)
 * - Spinning orbital rings around a glowing dot
 * - Enlarges + highlights when hovering interactive elements
 * - Hides itself over text inputs/areas (native caret is better there)
 * - Disabled entirely on touch/coarse-pointer devices
 */
export function MagicCursor() {
  const mouseX = useMotionValue(-100);
  const mouseY = useMotionValue(-100);

  // Smooth springs for trailing layers
  const glowX = useSpring(mouseX, { stiffness: 120, damping: 20, mass: 0.6 });
  const glowY = useSpring(mouseY, { stiffness: 120, damping: 20, mass: 0.6 });
  const ringX = useSpring(mouseX, { stiffness: 350, damping: 28, mass: 0.5 });
  const ringY = useSpring(mouseY, { stiffness: 350, damping: 28, mass: 0.5 });

  const [enabled, setEnabled] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [pressing, setPressing] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Only enable on fine pointers (mice) — skip touch devices
    const finePointer = window.matchMedia('(pointer: fine)').matches;
    const noReducedMotion = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!finePointer || !noReducedMotion) return;
    setEnabled(true);
    // Hide the native cursor across the app
    document.documentElement.classList.add('magic-cursor-active');
    return () => {
      document.documentElement.classList.remove('magic-cursor-active');
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const onMove = (e: MouseEvent) => {
      mouseX.set(e.clientX);
      mouseY.set(e.clientY);
      setVisible(true);

      // Detect interactive hover targets via event delegation
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const interactive = target.closest(
        'a, button, [role="button"], [role="tab"], input, textarea, select, label, summary, [data-cursor="pointer"]'
      );
      const textArea = target.closest('input, textarea, select, [contenteditable="true"]');
      setHovering(Boolean(interactive) && !textArea);
    };

    const onLeave = () => setVisible(false);
    const onEnter = () => setVisible(true);
    const onDown = () => setPressing(true);
    const onUp = () => setPressing(false);

    window.addEventListener('mousemove', onMove, { passive: true });
    document.addEventListener('mouseleave', onLeave);
    document.addEventListener('mouseenter', onEnter);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);

    return () => {
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', onLeave);
      document.removeEventListener('mouseenter', onEnter);
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('mouseup', onUp);
    };
  }, [enabled, mouseX, mouseY]);

  if (!enabled) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] pointer-events-none"
      aria-hidden="true"
      style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.25s ease' }}
    >
      {/* Soft glow trail — slowest spring */}
      <motion.div
        className="absolute rounded-full"
        style={{
          x: glowX,
          y: glowY,
          width: 420,
          height: 420,
          marginLeft: -210,
          marginTop: -210,
          background:
            'radial-gradient(circle, rgba(99,102,241,0.16) 0%, rgba(139,92,246,0.06) 45%, transparent 70%)',
          mixBlendMode: 'screen',
        }}
        animate={{ opacity: hovering ? 0.9 : 0.45, scale: hovering ? 1.25 : 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      />

      {/* Spinning orbit rings + dot — fast spring, tracks tightly */}
      <motion.div
        className="absolute"
        style={{ x: ringX, y: ringY, width: 0, height: 0 }}
        animate={{ scale: pressing ? 0.8 : hovering ? 1.6 : 1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 22 }}
      >
        {/* Outer ring (spins clockwise) */}
        <div
          className="absolute rounded-full"
          style={{
            inset: -22,
            border: '1.5px solid rgba(99,102,241,0.45)',
            borderTopColor: 'transparent',
            animation: 'cursor-spin 6s linear infinite',
          }}
        />
        {/* Middle ring (spins counter-clockwise) */}
        <div
          className="absolute rounded-full"
          style={{
            inset: -13,
            border: '1px solid rgba(167,139,250,0.35)',
            borderBottomColor: 'transparent',
            animation: 'cursor-spin 4s linear infinite reverse',
          }}
        />
        {/* Glow ring on hover */}
        <div
          className="absolute rounded-full transition-all duration-300"
          style={{
            inset: -26,
            border: hovering ? '1px solid rgba(99,102,241,0.5)' : '1px solid transparent',
            boxShadow: hovering ? '0 0 18px rgba(99,102,241,0.35)' : 'none',
          }}
        />
        {/* Center dot */}
        <div
          className="absolute rounded-full transition-all duration-200"
          style={{
            width: hovering ? 10 : 7,
            height: hovering ? 10 : 7,
            left: hovering ? -5 : -3.5,
            top: hovering ? -5 : -3.5,
            background: 'radial-gradient(circle at 30% 30%, #a5b4fc, #4f46e5)',
            boxShadow:
              '0 0 8px rgba(99,102,241,0.9), 0 0 22px rgba(99,102,241,0.45), 0 0 44px rgba(99,102,241,0.2)',
          }}
        />
      </motion.div>
    </div>
  );
}

