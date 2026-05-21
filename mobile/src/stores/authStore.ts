import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import type { MeResponse } from '@/types/api';

interface AuthState {
  session: Session | null;
  user: MeResponse | null;
  isLoading: boolean;
  setSession: (session: Session | null) => void;
  setUser: (user: MeResponse | null) => void;
  setLoading: (loading: boolean) => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  isLoading: true,

  setSession: (session) => set({ session }),
  setUser: (user) => set({ user }),
  setLoading: (isLoading) => set({ isLoading }),
  reset: () => set({ session: null, user: null, isLoading: false }),
}));
