'use client';

import React, { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from '../store/auth';
import { MagicCursor } from './ui/magic-cursor';
import { ThemeProvider } from './theme-provider';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    useAuthStore.getState().initialize();
  }, []);

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <MagicCursor />
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 3500,
            className: 'text-sm font-medium border border-border shadow-lg',
            style: {
              background: 'var(--card)',
              color: 'var(--card-foreground)',
              borderColor: 'var(--border)',
            },
          }}
        />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
