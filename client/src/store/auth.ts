import { create } from 'zustand';
import { readStorage, writeStorage } from '../lib/browser-storage';

export interface User {
  id: string;
  email: string;
  role?: 'USER' | 'ADMIN';
  storageQuota?: string | number;
  usedStorage?: string | number;
  createdAt?: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setAuth: (user: User, token: string) => void;
  setUser: (user: User) => void;
  logout: () => void;
  initialize: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true,

  setAuth: (user, token) => {
    if (typeof window !== 'undefined') {
      writeStorage('dte_token', token);
      writeStorage('dte_user', JSON.stringify(user));
    }
    set({ user, token, isAuthenticated: true, isLoading: false });
  },

  setUser: (user) => {
    if (typeof window !== 'undefined') {
      writeStorage('dte_user', JSON.stringify(user));
    }
    set({ user });
  },

  logout: () => {
    if (typeof window !== 'undefined') {
      writeStorage('dte_token', null);
      writeStorage('dte_user', null);
    }
    set({ user: null, token: null, isAuthenticated: false, isLoading: false });
  },

  initialize: () => {
    if (typeof window === 'undefined') {
      set({ isLoading: false });
      return;
    }

    try {
      const token = readStorage('dte_token');
      const userStr = readStorage('dte_user');
      const user = userStr ? JSON.parse(userStr) : null;

      if (token && typeof user?.id === 'string' && typeof user?.email === 'string') {
        set({ user, token, isAuthenticated: true, isLoading: false });
      } else {
        set({ user: null, token: null, isAuthenticated: false, isLoading: false });
      }
    } catch {
      set({ user: null, token: null, isAuthenticated: false, isLoading: false });
    }
  },
}));
