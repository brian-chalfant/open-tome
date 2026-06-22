/**
 * @file store/authStore.js
 * @description Zustand store for authentication state.
 *
 * State shape:
 *   user       - The authenticated user object ({ id, display_name, email, avatar_url, theme })
 *                or null if not authenticated.
 *   isLoading  - True while the initial /api/auth/me request is in flight.
 *
 * Actions:
 *   setUser(user)       - Store the authenticated user and mark loading complete.
 *   clearUser()         - Clear the user (on logout or 401) and mark loading complete.
 *   updateTheme(theme)  - Optimistically update the theme on the user object.
 */

import { create } from 'zustand';

export const useAuthStore = create((set) => ({
  /** Authenticated user object, or null if not logged in. */
  user: null,
  /** True during the initial session check — prevents a premature login redirect. */
  isLoading: true,
  /** @param {Object} user - User object from /api/auth/me. */
  setUser: (user) => set({ user, isLoading: false }),
  /** Clear auth state (on logout or 401 from the session check). */
  clearUser: () => set({ user: null, isLoading: false }),
  /**
   * Update the user's theme without refetching the user profile.
   * Called optimistically by ThemeToggle before the PATCH response arrives.
   * @param {'light'|'dark'} theme
   */
  updateTheme: (theme) =>
    set((state) => ({ user: state.user ? { ...state.user, theme } : state.user })),
}));
