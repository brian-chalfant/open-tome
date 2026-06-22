/**
 * @file components/SprintTimer.jsx
 * @description Drop-down sprint timer panel with live word-count tracking.
 *
 * Props:
 *   isOpen      - whether the panel is currently visible
 *   onClose     - called when the user clicks Hide (collapses panel, timer keeps running)
 *   onForceOpen - called when the timer completes (re-opens panel if hidden)
 */

import { useState, useEffect, useRef } from 'react';
import { useTargets } from '../hooks/useTargets.js';
import '../styles/sprintTimer.css';

const PRESETS = [5, 10, 15, 20, 25, 30]; // minutes

function fmtTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function playDone() {
  try {
    const ctx  = new AudioContext();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.0);
    osc.start();
    osc.stop(ctx.currentTime + 1.0);
  } catch { /* AudioContext blocked in some browsers — silent fallback */ }
}

export default function SprintTimer({ isOpen, onClose, onForceOpen }) {
  const { totalWords } = useTargets();

  const [stage,       setStage]       = useState('setup'); // 'setup'|'running'|'paused'|'done'
  const [duration,    setDuration]    = useState(25 * 60); // seconds
  const [remaining,   setRemaining]   = useState(25 * 60);
  const [customMin,   setCustomMin]   = useState('');
  const [wordGoalRaw, setWordGoalRaw] = useState('');      // raw input text
  const [wordGoal,    setWordGoal]    = useState(null);    // number | null

  const intervalRef    = useRef(null);
  const wordBaselineRef = useRef(null); // totalWords at sprint start

  // Derived: words written since the sprint started
  /* eslint-disable react-hooks/refs */
  const sprintWords = wordBaselineRef.current != null
    ? Math.max(0, totalWords - wordBaselineRef.current)
    : 0;
  /* eslint-enable react-hooks/refs */

  // ── Tick ──────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (stage !== 'running') return;

    intervalRef.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current);
          setStage('done');
          onForceOpen();
          playDone();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(intervalRef.current);
  }, [stage]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Helpers ───────────────────────────────────────────────────────────────────
  function selectPreset(min) {
    setDuration(min * 60);
    setRemaining(min * 60);
    setCustomMin('');
  }

  function commitCustomTime(raw) {
    const n = parseInt(raw, 10);
    if (n > 0 && n <= 999) {
      setDuration(n * 60);
      setRemaining(n * 60);
    }
  }

  function start() {
    wordBaselineRef.current = totalWords;
    setStage('running');
  }

  function pause() { setStage('paused'); }

  function resume() { setStage('running'); }

  function reset() {
    clearInterval(intervalRef.current);
    wordBaselineRef.current = null;
    setStage('setup');
    setRemaining(duration);
    setCustomMin('');
    setWordGoalRaw('');
    setWordGoal(null);
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  const selectedMin = duration / 60;

  return (
    <div className={`sprint-panel${isOpen ? ' sprint-panel--open' : ''}`} aria-hidden={!isOpen}>
      <div className="sprint-inner">

        <span className="sprint-label">&#9201; Sprint</span>

        {/* ── Setup ── */}
        {stage === 'setup' && (
          <>
            <span className="sprint-group-label" aria-hidden="true">Duration</span>
            <div className="sprint-presets">
              {PRESETS.map((min) => (
                <button
                  key={min}
                  type="button"
                  className={`sprint-preset-btn${selectedMin === min && !customMin ? ' sprint-preset-btn--active' : ''}`}
                  onClick={() => selectPreset(min)}
                  aria-pressed={selectedMin === min && !customMin ? 'true' : 'false'}
                  aria-label={`${min} minutes`}
                >
                  {min}
                </button>
              ))}
            </div>

            <div className="sprint-custom-wrap">
              <input
                type="number"
                min="1"
                max="999"
                className="sprint-custom-input"
                placeholder="—"
                value={customMin}
                onChange={(e) => {
                  setCustomMin(e.target.value);
                  commitCustomTime(e.target.value);
                }}
                aria-label="Custom duration in minutes"
              />
              <span className="sprint-custom-unit">min</span>
            </div>

            <div className="sprint-custom-wrap">
              <input
                id="sprint-word-goal"
                type="number"
                min="1"
                className="sprint-custom-input"
                placeholder="—"
                value={wordGoalRaw}
                onChange={(e) => {
                  setWordGoalRaw(e.target.value);
                  const n = parseInt(e.target.value, 10);
                  setWordGoal(n > 0 ? n : null);
                }}
                aria-label="Sprint word goal (optional)"
              />
              <label htmlFor="sprint-word-goal" className="sprint-custom-unit">word goal</label>
            </div>

            <span className="sprint-sep" />

            <button type="button" className="sprint-btn sprint-btn--primary" onClick={start}>
              Start
            </button>

            <button
              type="button"
              className="sprint-btn sprint-btn--ghost"
              onClick={onClose}
              aria-label="Close sprint timer"
            >
              ✕
            </button>
          </>
        )}

        {/* ── Running / Paused ── */}
        {(stage === 'running' || stage === 'paused') && (
          <>
            <span className="sprint-clock">{fmtTime(remaining)}</span>
            {stage === 'paused' && <span className="sprint-paused-badge">paused</span>}

            <span className="sprint-word-count">
              {wordGoal
                ? `${sprintWords.toLocaleString()} / ${wordGoal.toLocaleString()} words`
                : `${sprintWords.toLocaleString()} words`}
            </span>

            <span className="sprint-sep" />

            {stage === 'running' && (
              <button type="button" className="sprint-btn" onClick={pause}>Pause</button>
            )}
            {stage === 'paused' && (
              <button type="button" className="sprint-btn sprint-btn--primary" onClick={resume}>Resume</button>
            )}

            <button type="button" className="sprint-btn" onClick={reset}>Reset</button>

            <button type="button" className="sprint-btn sprint-btn--ghost" onClick={onClose}>
              Hide
            </button>
          </>
        )}

        {/* ── Done ── */}
        {stage === 'done' && (
          <>
            <span className="sprint-done-msg">
              {wordGoal
                ? (sprintWords >= wordGoal
                    ? `✓ ${sprintWords.toLocaleString()} words — goal reached!`
                    : `✓ ${sprintWords.toLocaleString()} / ${wordGoal.toLocaleString()} words`)
                : `✓ ${sprintWords.toLocaleString()} words written`}
            </span>

            <span className="sprint-sep" />

            <button type="button" className="sprint-btn sprint-btn--primary" onClick={reset}>
              New Sprint
            </button>

            <button
              type="button"
              className="sprint-btn sprint-btn--ghost"
              onClick={() => { reset(); onClose(); }}
            >
              Close
            </button>
          </>
        )}

      </div>
    </div>
  );
}
