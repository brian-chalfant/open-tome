import { useAuthStore } from '../store/authStore.js';
import api from '../api/axios.js';

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

/**
 * Authentication hook. Exposes the current user, loading state, and logout action.
 * The initial session check is performed by AuthProvider on app mount.
 */
export function useAuth() {
  const { user, isLoading, clearUser } = useAuthStore();

  const logout = async () => {
    await api.post('/api/auth/logout').catch(() => {});
    clearUser();
    window.location.href = '/login';
  };

  return { user, isLoading, logout };
}
