'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Layers, Sun, Moon, LogOut, User as UserIcon, Plus, Menu, X, Settings } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { Button } from '@/components/ui/button';
import { menuVariants, SPRING_BOUNCY, EASE_OUT_EXPO } from '@/lib/animations';
import { useTheme } from '@/components/theme-provider';

export function Header() {
  const pathname = usePathname();
  const { user, isAuthenticated, logout } = useAuthStore();
  const { resolvedTheme, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { href: '/', label: 'Projects' },
    { href: '/upload', label: 'New Conversion' },
    { href: '/settings', label: 'Settings' },
  ];

  return (
    <motion.header
      initial={{ y: -64, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: EASE_OUT_EXPO }}
      className="sticky top-0 z-40 w-full border-b border-border bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60"
    >
      <div className="flex h-16 items-center justify-between px-4 sm:px-8 max-w-7xl mx-auto">
        {/* Brand */}
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2.5 font-bold text-lg text-foreground transition-opacity hover:opacity-90">
            <motion.div
              whileHover={{ rotate: 12, scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              transition={SPRING_BOUNCY}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-primary to-accent shadow-md shadow-primary/25 text-white"
            >
              <Layers className="h-5 w-5" />
            </motion.div>
            <span className="tracking-tight">
              Design<span className="text-primary font-black">2</span>Elementor
            </span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => {
              const isActive = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href));
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`relative px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                    isActive
                      ? 'text-foreground font-semibold'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                  }`}
                >
                  {isActive && (
                    <motion.span
                      layoutId="nav-active"
                      className="absolute inset-0 rounded-lg bg-secondary"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  <span className="relative z-10">{link.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Action controls */}
        <div className="flex items-center gap-3">
          <Link href="/upload" className="hidden sm:inline-flex">
            <Button size="sm" leftIcon={<Plus className="h-4 w-4" />}>
              New Conversion
            </Button>
          </Link>

          {/* Dark/Light mode toggle */}
          <motion.div whileHover={{ rotate: 20, scale: 1.1 }} whileTap={{ scale: 0.85 }} transition={SPRING_BOUNCY}>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className="rounded-lg text-muted-foreground hover:text-foreground"
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={resolvedTheme}
                  initial={{ opacity: 0, rotate: -90, scale: 0.5 }}
                  animate={{ opacity: 1, rotate: 0, scale: 1 }}
                  exit={{ opacity: 0, rotate: 90, scale: 0.5 }}
                  transition={{ duration: 0.25 }}
                  className="flex items-center justify-center"
                >
                  {resolvedTheme === 'dark' ? (
                    <Sun className="h-4 w-4 text-amber-400" />
                  ) : (
                    <Moon className="h-4 w-4 text-indigo-600" />
                  )}
                </motion.span>
              </AnimatePresence>
            </Button>
          </motion.div>

          {/* User auth state */}
          {isAuthenticated && user ? (
            <div className="flex items-center gap-3 pl-2 border-l border-border">
              <div className="hidden sm:flex flex-col text-right">
                <span className="text-xs font-semibold text-foreground truncate max-w-[140px]">
                  {user.email}
                </span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  {user.role || 'User'}
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={logout}
                aria-label="Log out"
                title="Log out"
                className="text-muted-foreground hover:text-destructive"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/auth/login">
                <Button variant="ghost" size="sm">
                  Sign In
                </Button>
              </Link>
              <Link href="/auth/register">
                <Button variant="outline" size="sm">
                  Sign Up
                </Button>
              </Link>
            </div>
          )}

          {/* Mobile hamburger */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile menu dropdown */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            variants={menuVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="md:hidden border-b border-border bg-card px-4 pt-2 pb-4 space-y-1 overflow-hidden"
          >
            {navLinks.map((link, i) => (
              <motion.div
                key={link.href}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.05 * i, duration: 0.3, ease: EASE_OUT_EXPO }}
              >
                <Link
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="block px-3 py-2 rounded-md text-base font-medium text-muted-foreground hover:text-foreground hover:bg-secondary"
                >
                  {link.label}
                </Link>
              </motion.div>
            ))}
            <div className="pt-2 border-t border-border mt-2">
              <Link
                href="/upload"
                onClick={() => setMobileMenuOpen(false)}
                className="block w-full text-center py-2 text-sm font-semibold text-primary"
              >
                + Start New Conversion
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
