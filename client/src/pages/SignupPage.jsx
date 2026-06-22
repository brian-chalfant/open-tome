import { useState, useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore.js';
import { applyTheme } from '../hooks/useAuth.js';
import api from '../api/axios.js';
import '../styles/login.css';

export default function SignupPage() {
  const { user, isLoading, setUser } = useAuthStore();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [confirm, setConfirm]         = useState('');
  const [inviteToken, setInviteToken] = useState('');
  const [error, setError]             = useState('');
  const [submitting, setSubmitting]   = useState(false);

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
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setSubmitting(true);
    try {
      const body = { email, display_name: displayName, password };
      if (inviteToken.trim()) body.invite_token = inviteToken.trim();
      const res = await api.post('/api/auth/signup', body);
      setUser(res.data);
      applyTheme(res.data.theme ?? 'light');
      window.location.href = '/app';
    } catch (err) {
      setError(err.response?.data?.error ?? 'Registration failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <title>Create Account — Tome</title>
      <meta name="robots" content="noindex, nofollow" />
      <main className="login-page">
        <div className="login-card">
          <div className="login-ornament" aria-hidden="true">✦</div>

          <h1 className="login-logo">
            Open <span className="login-logo-accent">Tome</span>
          </h1>
          <p className="login-tagline">The Tome is open. It has been waiting for you.</p>

          <div className="login-ornament" aria-hidden="true">✦</div>

          <form className="login-form" onSubmit={handleSubmit} noValidate>
            <div className="login-field">
              <label className="login-label" htmlFor="display-name">Display Name</label>
              <input
                id="display-name"
                type="text"
                className="login-input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                autoComplete="name"
              />
            </div>
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
                autoComplete="new-password"
                minLength={8}
              />
            </div>
            <div className="login-field">
              <label className="login-label" htmlFor="confirm">Confirm Password</label>
              <input
                id="confirm"
                type="password"
                className="login-input"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>
            <div className="login-field">
              <label className="login-label" htmlFor="invite-token">
                Invite Token <span style={{ fontStyle: 'italic', opacity: 0.6 }}>(optional for first user)</span>
              </label>
              <input
                id="invite-token"
                type="text"
                className="login-input"
                value={inviteToken}
                onChange={(e) => setInviteToken(e.target.value)}
                autoComplete="off"
                placeholder="Paste your invite token"
              />
            </div>
            {error && <p className="login-error" role="alert">{error}</p>}
            <button type="submit" className="login-submit" disabled={submitting}>
              {submitting ? 'Creating account…' : 'Create Account'}
            </button>
          </form>

          <p className="login-switch-link">
            Already have an account? <Link to="/login">Sign in</Link>
          </p>

          <div className="login-ornament" aria-hidden="true">✦</div>
        </div>
      </main>
    </>
  );
}
