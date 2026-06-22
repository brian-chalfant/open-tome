import { useState, useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore.js';
import { applyTheme } from '../hooks/useAuth.js';
import api from '../api/axios.js';
import '../styles/login.css';

export default function LoginPage() {
  const { user, isLoading, setUser } = useAuthStore();
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [error, setError]           = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const prev = document.documentElement.getAttribute('data-theme');
    document.documentElement.setAttribute('data-theme', 'tome');
    return () => {
      if (prev) document.documentElement.setAttribute('data-theme', prev);
      else document.documentElement.removeAttribute('data-theme');
    };
  }, []);

  if (isLoading) return null;
  if (user) return <Navigate to="/app" replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await api.post('/api/auth/login', { email, password });
      setUser(res.data);
      applyTheme(res.data.theme ?? 'light');
      window.location.href = '/app';
    } catch (err) {
      setError(err.response?.data?.error ?? 'Login failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <title>Sign In — Open Tome</title>
      <meta name="robots" content="noindex, nofollow" />
      <main className="login-page">
        <div className="login-card">

          <div className="login-ornament" aria-hidden="true">◆</div>

          <h1 className="login-logo">
            Open <span className="login-logo-accent">Tome</span>
          </h1>
          <p className="login-tagline">The Tome is open. It has been waiting for you.</p>

          <div className="login-ornament" aria-hidden="true">◆</div>

          <form className="login-form" onSubmit={handleSubmit} noValidate>
            <div className="login-field">
              <label className="login-label" htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                className="login-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="login-field">
              <label className="login-label" htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                className="login-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            {error && <p className="login-error" role="alert">{error}</p>}
            <button type="submit" className="login-submit" disabled={submitting}>
              {submitting ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          <p className="login-switch-link">
            No account? <Link to="/signup">Create one</Link>
          </p>

        </div>
      </main>
    </>
  );
}
