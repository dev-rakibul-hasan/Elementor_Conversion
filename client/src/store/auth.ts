import { create } from 'zustand';

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
      localStorage.setItem('dte_token', token);
      localStorage.setItem('dte_user', JSON.stringify(user));
    }
    set({ user, token, isAuthenticated: true, isLoading: false });
  },

  setUser: (user) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('dte_user', JSON.stringify(user));
    }
    set({ user });
  },

  logout: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('dte_token');
      localStorage.removeItem('dte_user');
    }
    set({ user: null, token: null, isAuthenticated: false, isLoading: false });
  },

  initialize: () => {
    if (typeof window === 'undefined') {
      set({ isLoading: false });
      return;
    }

    try {
      const token = localStorage.getItem('dte_token');
      const userStr = localStorage.getItem('dte_user');
      const user = userStr ? JSON.parse(userStr) : null;

      if (token && user) {
        set({ user, token, isAuthenticated: true, isLoading: false });
      } else {
        set({ user: null, token: null, isAuthenticated: false, isLoading: false });
      }
    } catch {
      set({ user: null, token: null, isAuthenticated: false, isLoading: false });
    }
  },
}));
