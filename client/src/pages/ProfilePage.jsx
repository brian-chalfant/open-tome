import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useAuth } from '../hooks/useAuth.js';
import { useAuthStore } from '../store/authStore.js';
import { getAnalytics, getYearSummary } from '../api/analytics.js';
import api from '../api/axios.js';
import '../styles/profile.css';

const CURRENT_YEAR = new Date().getFullYear();

const EMPTY_SUMMARY = {
  total_doc_words: 0, words_this_year: 0,
  writing_days_this_year: 0, current_streak: 0, best_streak: 0,
};

const MS_EMPTY = { ms_legal_name: '', ms_pen_name: '', ms_address: '', ms_phone: '', ms_email: '' };

export default function ProfilePage() {
  const { user }              = useAuth();
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR);
  const [yearLoading, setYearLoading]   = useState(false);

  const [msFields,  setMsFields]  = useState(MS_EMPTY);
  const [msEditing, setMsEditing] = useState(false);
  const [msSaving,  setMsSaving]  = useState(false);
  const [msError,   setMsError]   = useState(null);

  // Pre-populate manuscript fields when user data arrives
  useEffect(() => {
    if (!user) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMsFields({
      ms_legal_name: user.ms_legal_name ?? '',
      ms_pen_name:   user.ms_pen_name   ?? '',
      ms_address:    user.ms_address    ?? '',
      ms_phone:      user.ms_phone      ?? '',
      ms_email:      user.ms_email      ?? '',
    });
  }, [user]);

  async function handleMsSave(e) {
    e.preventDefault();
    setMsSaving(true);
    setMsError(null);
    const saved = {
      ms_legal_name: msFields.ms_legal_name || null,
      ms_pen_name:   msFields.ms_pen_name   || null,
      ms_address:    msFields.ms_address    || null,
      ms_phone:      msFields.ms_phone      || null,
      ms_email:      msFields.ms_email      || null,
    };
    try {
      await api.patch('/api/auth/me/manuscript', saved);
      // Sync the auth store so the useEffect([user]) doesn't overwrite with stale data
      useAuthStore.getState().setUser({ ...user, ...saved });
      setMsEditing(false);
    } catch {
      setMsError('Save failed. Please try again.');
    } finally {
      setMsSaving(false);
    }
  }

  function handleMsCancel() {
    setMsFields({
      ms_legal_name: user?.ms_legal_name ?? '',
      ms_pen_name:   user?.ms_pen_name   ?? '',
      ms_address:    user?.ms_address    ?? '',
      ms_phone:      user?.ms_phone      ?? '',
      ms_email:      user?.ms_email      ?? '',
    });
    setMsError(null);
    setMsEditing(false);
  }

  useEffect(() => {
    getAnalytics()
      .then(setData)
      .catch(() => setError('Could not load analytics.'))
      .finally(() => setLoading(false));
  }, []);

  function changeYear(newYear) {
    setSelectedYear(newYear);
    setYearLoading(true);
    getYearSummary(newYear)
      .then(({ summary }) => setData((prev) => prev ? { ...prev, summary } : prev))
      .catch(()           => setData((prev) => prev ? { ...prev, summary: EMPTY_SUMMARY } : prev))
      .finally(() => setYearLoading(false));
  }

  return (
    <main className="profile-page">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="profile-header">
        <Link to="/app" className="profile-back-btn">← Back to Writing</Link>
        {user && (
          <div className="profile-identity">
            {user.avatar_url && (
              <img
                src={user.avatar_url}
                alt=""
                width={44}
                height={44}
                className="profile-avatar"
                referrerPolicy="no-referrer"
              />
            )}
            <div>
              <div className="profile-display-name">{user.display_name}</div>
              {user.email && <div className="profile-email">{user.email}</div>}
            </div>
          </div>
        )}
      </header>

      {loading && <p className="profile-status">Loading analytics…</p>}
      {error   && <p className="profile-status profile-status--error">{error}</p>}

      {data && (
        <>
          {/* ── Stat Cards ──────────────────────────────────────────────── */}
          <section className="profile-section">
            <div className="profile-year-nav">
              <button
                type="button"
                className="profile-year-btn"
                onClick={() => changeYear(selectedYear - 1)}
                aria-label="Previous year"
              >
                ‹
              </button>
              <h2 className={`profile-section-title profile-section-title--year${yearLoading ? ' profile-year-loading' : ''}`}>
                {selectedYear}
              </h2>
              {selectedYear < CURRENT_YEAR && (
                <button
                  type="button"
                  className="profile-year-btn"
                  onClick={() => changeYear(selectedYear + 1)}
                  aria-label="Next year"
                >
                  ›
                </button>
              )}
            </div>
            <div className="profile-stats-grid">
              <StatCard label="Words Written"   value={data.summary.words_this_year.toLocaleString()} />
              <StatCard label="Writing Days"    value={data.summary.writing_days_this_year} />
              <StatCard label="Current Streak"  value={`${data.summary.current_streak}d`} />
              <StatCard label="Best Streak"     value={`${data.summary.best_streak}d`} />
            </div>
          </section>

          {/* ── Heatmap ─────────────────────────────────────────────────── */}
          <section className="profile-section">
            <h2 className="profile-section-title">Writing Activity — last 12 months</h2>
            <Heatmap data={data.heatmap} />
          </section>

          {/* ── Pace Graph ──────────────────────────────────────────────── */}
          <section className="profile-section">
            <h2 className="profile-section-title">Writing Pace — last 30 days</h2>
            <div className="profile-pace-chart">
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={data.pace} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                  <XAxis
                    dataKey="stat_date"
                    tickFormatter={(d) => new Date(d + 'T00:00:00').getDate()}
                    tick={{ fontSize: 11, fill: 'var(--text-dim)' }}
                    axisLine={false}
                    tickLine={false}
                    interval={4}
                  />
                  <Tooltip
                    formatter={(v) => [`${Number(v).toLocaleString()} words`, 'Written']}
                    labelFormatter={(d) => new Date(d + 'T00:00:00').toLocaleDateString()}
                    contentStyle={{
                      background: 'var(--bg-panel)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      color: 'var(--text)',
                      fontSize: 12,
                    }}
                    cursor={{ fill: 'var(--bg-hover)' }}
                  />
                  <Bar dataKey="words_added" fill="var(--accent)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* ── All-time total ──────────────────────────────────────────── */}
          <p className="profile-total-words">
            Total words across all documents: {data.summary.total_doc_words.toLocaleString()}
          </p>
        </>
      )}

      {/* ── Manuscript Info ──────────────────────────────────────────────── */}
      {user && (
        <section className="profile-section profile-ms-section">
          <h2 className="profile-section-title">Manuscript Info</h2>
          <p className="profile-ms-desc">
            Used to populate the title page when exporting in Manuscript format.
          </p>

          {msEditing ? (
            <form className="profile-ms-form" onSubmit={handleMsSave}>
              <label className="profile-ms-label">
                Legal Name
                <input
                  type="text"
                  className="profile-ms-input"
                  value={msFields.ms_legal_name}
                  onChange={(e) => setMsFields((f) => ({ ...f, ms_legal_name: e.target.value }))}
                  maxLength={200}
                  placeholder="Your real name"
                />
              </label>
              <label className="profile-ms-label">
                Pen Name / Byline
                <span className="profile-ms-field-hint">leave blank to use legal name</span>
                <input
                  type="text"
                  className="profile-ms-input"
                  value={msFields.ms_pen_name}
                  onChange={(e) => setMsFields((f) => ({ ...f, ms_pen_name: e.target.value }))}
                  maxLength={200}
                  placeholder="Optional"
                />
              </label>
              <label className="profile-ms-label">
                Address
                <textarea
                  className="profile-ms-textarea"
                  value={msFields.ms_address}
                  onChange={(e) => setMsFields((f) => ({ ...f, ms_address: e.target.value }))}
                  maxLength={500}
                  rows={3}
                  placeholder={`123 Main St\nCity, State 00000`}
                />
              </label>
              <label className="profile-ms-label">
                Phone
                <input
                  type="tel"
                  className="profile-ms-input"
                  value={msFields.ms_phone}
                  onChange={(e) => setMsFields((f) => ({ ...f, ms_phone: e.target.value }))}
                  maxLength={50}
                  placeholder="(555) 000-0000"
                />
              </label>
              <label className="profile-ms-label">
                Email
                <input
                  type="email"
                  className="profile-ms-input"
                  value={msFields.ms_email}
                  onChange={(e) => setMsFields((f) => ({ ...f, ms_email: e.target.value }))}
                  maxLength={200}
                  placeholder={user.email ?? ''}
                />
              </label>
              <div className="profile-ms-actions">
                <button type="submit" className="profile-ms-save-btn" disabled={msSaving}>
                  {msSaving ? 'Saving…' : 'Save'}
                </button>
                <button type="button" className="profile-ms-cancel-btn" onClick={handleMsCancel} disabled={msSaving}>
                  Cancel
                </button>
                {msError && <span className="profile-ms-feedback profile-ms-feedback--err">{msError}</span>}
              </div>
            </form>
          ) : (
            <div className="profile-ms-read">
              <MsField label="Legal Name"      value={msFields.ms_legal_name} />
              <MsField label="Pen Name / Byline" value={msFields.ms_pen_name} hint="(uses legal name if blank)" />
              <MsField label="Address"         value={msFields.ms_address} pre />
              <MsField label="Phone"           value={msFields.ms_phone} />
              <MsField label="Email"           value={msFields.ms_email} />
              <button
                type="button"
                className="profile-ms-edit-btn"
                onClick={() => setMsEditing(true)}
              >
                Edit
              </button>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MsField({ label, value, hint, pre }) {
  return (
    <div className="profile-ms-field-row">
      <span className="profile-ms-field-label">{label}{hint && <span className="profile-ms-field-hint"> {hint}</span>}</span>
      {value
        ? <span className={`profile-ms-field-value${pre ? ' profile-ms-field-value--pre' : ''}`}>{value}</span>
        : <span className="profile-ms-field-empty">(not set)</span>
      }
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="profile-stat-card">
      <div className="profile-stat-value">{value}</div>
      <div className="profile-stat-label">{label}</div>
    </div>
  );
}

function Heatmap({ data }) {
  const lookup = Object.fromEntries(data.map((r) => [r.stat_date, Number(r.words_added)]));

  // Build the last 365 days in chronological order
  const today = new Date();
  const days  = [];
  for (let i = 364; i >= 0; i--) {
    const d   = new Date(today);
    d.setDate(today.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    days.push({ date: iso, words: lookup[iso] ?? 0 });
  }

  // Pad front so the first column starts on Sunday (day 0)
  const firstDow = new Date(days[0].date + 'T00:00:00').getDay();
  const padded   = [...Array(firstDow).fill(null), ...days];

  // Number of week-columns; drives the responsive grid template so the whole
  // year fits the container width instead of overflowing into a side-scroll.
  const weeks = Math.ceil(padded.length / 7);

  const level = (w) => {
    if (w <= 0)   return 0;
    if (w < 100)  return 1;
    if (w < 500)  return 2;
    if (w < 1000) return 3;
    return 4;
  };

  return (
    <div className="heatmap-wrap">
      <div className="heatmap-grid" style={{ '--weeks': weeks }}>
        {padded.map((day, i) =>
          day === null
            ? <div key={`pad-${i}`} className="heatmap-cell heatmap-cell--pad" />
            : (
              <div
                key={day.date}
                className={`heatmap-cell heatmap-cell--l${level(day.words)}`}
                title={`${day.date}: ${day.words.toLocaleString()} words`}
                aria-label={`${day.date}: ${day.words} words written`}
              />
            )
        )}
      </div>
      <div className="heatmap-legend">
        <span className="heatmap-legend-label">Less</span>
        {[0, 1, 2, 3, 4].map((l) => (
          <div key={l} className={`heatmap-cell heatmap-cell--l${l}`} />
        ))}
        <span className="heatmap-legend-label">More</span>
      </div>
    </div>
  );
}
