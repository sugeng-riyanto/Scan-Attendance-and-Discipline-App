import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface SchoolBranding {
  id: string;
  code: string;
  name: string;
  address: string | null;
  logo: string | null;
  themeColor: string | null;
}

export interface AuthUser {
  id: string;
  username: string;
  name: string;
  role: string;
  avatar?: string;
  termsAccepted?: boolean;
  termsAcceptedVersion?: number | null;
  /** Per-user provenance of that acceptance — see src/lib/terms-provenance.ts. */
  termsAcceptedAt?: string | null;
  termsAcceptedBy?: string | null;
  termsAcceptedByUserId?: string | null;
  termsAcceptedOnBehalf?: boolean;
  school?: SchoolBranding | null;
}

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (user: AuthUser) => void;
  logout: () => void;
  updateUser: (user: Partial<AuthUser>) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      login: (user: AuthUser) => set({ user, isAuthenticated: true }),
      logout: () => set({ user: null, isAuthenticated: false }),
      updateUser: (updates: Partial<AuthUser>) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...updates } : null,
        })),
    }),
    {
      name: 'school-auth-storage',
    }
  )
);
