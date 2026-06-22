/**
 * @file components/TargetsWidget.jsx
 * @description Slim progress bar shown below the topbar.
 *
 * Displays:
 *  - Project total words vs target (with red→green progress bar)
 *  - Session words vs session goal (editable inline)
 *  - Daily pace needed to hit the deadline
 */

import { useState } from 'react';
import { useTargets } from '../hooks/useTargets.js';
import { useBinderStore } from '../store/binderStore.js';
import { prefs } from '../utils/storage.js';
import '../styles/targets.css';

function fmt(n) {
  return n.toLocaleString();
}

function barColor(pct) {
  // 0% → red (hue 0), 100% → green (hue 120)
  const hue = Math.min(120, pct * 1.2);
  return `hsl(${hue}, 70%, 42%)`;
}

export default function TargetsWidget() {
  const { totalWords, targetWords, deadline, sessionWords, wordsPerDay } = useTargets();
  const setRequestGoalsOpen = useBinderStore((s) => s.setRequestGoalsOpen);
  const [sessionGoal, setSessionGoal]     = useState(prefs.sessionGoal.get);
  const [editingGoal, setEditingGoal]     = useState(false);
  const [goalDraft,   setGoalDraft]       = useState('');

  const projectPct = targetWords ? Math.min(100, (totalWords / targetWords) * 100) : 0;
  const sessionPct = sessionGoal ? Math.min(100, (sessionWords / sessionGoal) * 100) : 0;

  const daysLeft = (() => {
    if (!deadline) return null;
    const dl  = new Date(deadline + 'T00:00:00');
    const now = new Date(); now.setHours(0, 0, 0, 0);
    return Math.ceil((dl - now) / 86_400_000);
  })();

  const commitGoal = () => {
    const n = parseInt(goalDraft, 10);
    if (n > 0) { setSessionGoal(n); prefs.sessionGoal.set(n); }
    setEditingGoal(false);
  };

  return (
    <div className="targets-widget" role="status" aria-label="Writing targets">

      {/* ── Project total ── */}
      <div className="targets-section">
        <span className="targets-label targets-label--dim">Draft</span>
        <div
          className={`targets-bar-track${targetWords ? '' : ' targets-bar-track--no-goal'}`}
          aria-hidden="true"
        >
          {targetWords && (
            <div
              className="targets-bar-fill"
              style={{ width: `${projectPct}%`, background: barColor(projectPct) }}
            />
          )}
        </div>
        <span className="targets-label">
          {fmt(totalWords)}
          {targetWords ? (
            <> / {fmt(targetWords)} words<span className="targets-pct"> {Math.round(projectPct)}%</span></>
          ) : (
            <> words &nbsp;<button
              className="targets-set-goal-btn"
              onClick={() => setRequestGoalsOpen(true)}
              title="Set a word count target"
            >Set goal →</button></>
          )}
        </span>
      </div>

      {/* ── Session ── */}
      <div className="targets-section">
        <span className="targets-label targets-label--dim">Session</span>
        <div className="targets-bar-track" aria-hidden="true">
          <div
            className="targets-bar-fill"
            style={{ width: `${sessionPct}%`, background: barColor(sessionPct) }}
          />
        </div>
        <span className="targets-label">
          {fmt(sessionWords)} /&nbsp;
          {editingGoal ? (
            <input
              className="targets-goal-input"
              autoFocus
              type="number"
              min="1"
              value={goalDraft}
              onChange={(e) => setGoalDraft(e.target.value)}
              onBlur={commitGoal}
              onKeyDown={(e) => { if (e.key === 'Enter') commitGoal(); if (e.key === 'Escape') setEditingGoal(false); }}
              aria-label="Session goal"
            />
          ) : (
            <button
              className="targets-goal-btn"
              onClick={() => { setGoalDraft(String(sessionGoal)); setEditingGoal(true); }}
              title="Click to change session goal"
              aria-label={`Session goal: ${fmt(sessionGoal)} words. Click to edit.`}
            >
              {fmt(sessionGoal)}
            </button>
          )}
          &nbsp;words
          {!editingGoal && <span className="targets-pct"> {Math.round(sessionPct)}%</span>}
        </span>
      </div>

      {/* ── Pace ── */}
      {(wordsPerDay != null || daysLeft != null) && (
        <div className="targets-section targets-pace">
          {wordsPerDay != null && <span>{fmt(wordsPerDay)} words/day needed</span>}
          {wordsPerDay != null && daysLeft != null && <span className="targets-sep">·</span>}
          {daysLeft != null && (
            <span>
              {daysLeft > 0 ? `${daysLeft} day${daysLeft === 1 ? '' : 's'} left` : 'Deadline passed'}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
