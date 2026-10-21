'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Header } from '../../../components/layout/header';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { Button } from '../../../components/ui/button';
import { api } from '../../../lib/api';
import { useAuthStore } from '../../../store/auth';
import toast from 'react-hot-toast';
import { LogIn, Zap, Mail, Lock } from 'lucide-react';
import { staggerContainer, staggerItem } from '../../../lib/animations';

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((state) => state.setAuth);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isQuickLoading, setIsQuickLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Please enter both email and password');
      return;
    }

    setIsLoading(true);
    try {
      const res = await api.auth.login({ email, password });
      setAuth(res.user, res.token);
      toast.success('Signed in successfully!');
      router.push('/');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickDevLogin = async () => {
    setIsQuickLoading(true);
    try {
      const res = await api.auth.quickLogin();
      setAuth(res.user, res.token);
      toast.success('Logged in as Dev User!');
      router.push('/');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Quick login failed');
    } finally {
      setIsQuickLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 md:p-8 relative overflow-hidden">
        {/* Ambient background glow */}
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full opacity-20 blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.4) 0%, transparent 70%)' }}
          animate={{ scale: [1, 1.08, 1], opacity: [0.15, 0.25, 0.15] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="w-full max-w-md space-y-6 relative z-10"
        >
          <motion.div variants={staggerItem} className="text-center space-y-1.5">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">Welcome Back</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Sign in to manage and convert your designs to Elementor templates
            </p>
          </motion.div>

          <motion.div variants={staggerItem}>
            <Card className="bg-card border-border shadow-xl">
              <CardHeader>
                <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                  <LogIn className="w-5 h-5 text-primary" />
                  Sign In
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <form onSubmit={handleLogin} className="space-y-4">
                  <Input
                    label="Email Address"
                    type="email"
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    leftIcon={<Mail className="w-4 h-4" />}
                    required
                  />
                  <Input
                    label="Password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    leftIcon={<Lock className="w-4 h-4" />}
                    required
                  />
                  <Button type="submit" className="w-full mt-2" isLoading={isLoading}>
                    Sign In
                  </Button>
                </form>

                {process.env.NODE_ENV !== 'production' && (<>
                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground font-semibold">
                      Developer Fast-Track
                    </span>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-primary/30 text-primary hover:bg-primary/10"
                  onClick={handleQuickDevLogin}
                  isLoading={isQuickLoading}
                  leftIcon={<Zap className="w-4 h-4" />}
                >
                  1-Click Quick Dev Login
                </Button>

                </>)}

                <div className="text-center text-xs text-muted-foreground pt-2">
                  Don&apos;t have an account?{' '}
                  <Link href="/auth/register" className="text-primary hover:underline font-semibold">
                    Create Account
                  </Link>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>
      </main>
    </div>
  );
}
