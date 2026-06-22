import { useEffect } from 'react';
import { useAuthStore } from '../store/authStore.js';
import api from '../api/axios.js';
import { applyTheme } from '../hooks/useAuth.js';

// Guards against StrictMode double-invocation firing two concurrent fetches.
let fetchInitiated = false;

/**
 * Top-level provider that performs the initial session check on mount.
 * Sets the Zustand auth store based on the /api/auth/me response.
 */
export function AuthProvider({ children }) {
  const { setUser, clearUser } = useAuthStore();

  useEffect(() => {
    if (fetchInitiated) return;
    fetchInitiated = true;

    api.get('/api/auth/me')
      .then((res) => {
        setUser(res.data);
        applyTheme(res.data.theme ?? 'light');
      })
      .catch(() => clearUser());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return children;
}
