/**
 * @file components/ThemeToggle.jsx
 * @description Sun/moon button that switches between light and dark themes.
 *
 * Uses optimistic UI: the theme is applied and stored immediately on click,
 * then persisted to the backend. If the PATCH fails, the theme is rolled back.
 */

import { useAuthStore } from '../store/authStore.js';
import { applyTheme } from '../hooks/useAuth.js';
import api from '../api/axios.js';

/**
 * Theme toggle button (sun icon for dark mode, moon icon for light mode).
 * Reads and writes the user's theme preference via the auth store and the API.
 *
 * @returns {JSX.Element}
 */
export default function ThemeToggle() {
  /** Current user object from the auth store (contains the persisted theme value). */
  const user = useAuthStore((s) => s.user);
  /** Action to optimistically update the theme in the auth store. */
  const updateTheme = useAuthStore((s) => s.updateTheme);

  const THEMES = ['light', 'dark', 'tome'];
  const ICONS  = { light: '☾', dark: '✦', tome: '☀' };
  const LABELS = {
    light: 'Switch to dark mode',
    dark:  'Switch to Tome mode',
    tome:  'Switch to light mode',
  };

  const current = user?.theme ?? 'light';
  const next = THEMES[(THEMES.indexOf(current) + 1) % THEMES.length];

  const handleToggle = async () => {
    applyTheme(next);
    updateTheme(next);
    try {
      await api.patch('/api/auth/me/theme', { theme: next });
    } catch {
      applyTheme(current);
      updateTheme(current);
    }
  };

  return (
    <button
      type="button"
      className="app-theme-btn"
      onClick={handleToggle}
      title={LABELS[current]}
      aria-label={LABELS[current]}
    >
      <span aria-hidden="true">{ICONS[current]}</span> Tome
    </button>
  );
}
