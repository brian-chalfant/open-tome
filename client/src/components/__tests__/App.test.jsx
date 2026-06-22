import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../hooks/useAuth.js', () => ({
  useAuth: () => ({ user: null, isLoading: false, logout: vi.fn() }),
  applyTheme: vi.fn(),
}));

vi.mock('../../store/authStore.js', () => ({
  useAuthStore: () => ({ user: null, isLoading: false, setUser: vi.fn(), clearUser: vi.fn() }),
}));

import LoginPage from '../../pages/LoginPage.jsx';

describe('LoginPage', () => {
  it('renders email and password fields', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });
});
