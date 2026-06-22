// ============================================================
// storage.js
// ============================================================
// Purpose:   Centralised localStorage accessors for user preferences.
//            Replaces a dozen ad-hoc try/localStorage.getItem/catch blocks
//            scattered across components. Every accessor is { get, set } and
//            silently degrades to defaults when localStorage is unavailable
//            (private mode, quota exceeded, SSR).
// Used by:   pages/AppPage.jsx, components/Editor.jsx,
//            components/TargetsWidget.jsx, hooks/useTargets.js,
//            store/binderStore.js
// Exports:   prefs — a single object whose keys are preference names
// Notes:     Per-project preferences (sessionBaseline, binderExpanded) are
//            FACTORY entries — call them with a projectId to get the
//            { get, set } pair for that project's namespaced key.
// ============================================================

// --- READ / WRITE PRIMITIVES --------------------------------
// Each typed primitive wraps the bare localStorage calls so a single try/catch
// surrounds every access — quota or permission errors never bubble to the UI.

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch { return fallback; }
}
function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* unavailable */ }
}
function readString(key, fallback) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function writeString(key, value) {
  try { localStorage.setItem(key, String(value)); } catch { /* unavailable */ }
}
function readBool(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    if (v == null) return fallback;
    // Strict equality on 'true' — we only ever write the literal strings
    // 'true' or 'false', so anything else is treated as a corrupted entry
    // and falls back to false.
    return v === 'true';
  } catch { return fallback; }
}
function readInt(key, fallback) {
  try {
    const n = parseInt(localStorage.getItem(key), 10);
    // Number.isFinite (not Number.isInteger) lets a stored 0 survive while
    // rejecting NaN from a missing or corrupted value.
    return Number.isFinite(n) ? n : fallback;
  } catch { return fallback; }
}

// --- ACCESSOR FACTORIES --------------------------------------
// Tiny factory helpers keep every preference key on the same read/write path,
// so call sites only care about the value shape and not localStorage plumbing.

const bool = (key, fallback) => ({
  get: () => readBool(key, fallback),
  set: (v) => writeString(key, v ? 'true' : 'false'),
});
const intPref = (key, fallback) => ({
  get: () => readInt(key, fallback),
  set: (v) => writeString(key, v),
});
const strPref = (key, fallback) => ({
  get: () => readString(key, fallback),
  set: (v) => writeString(key, v),
});
const jsonPref = (key, fallback) => ({
  get: () => readJson(key, fallback),
  set: (v) => writeJson(key, v),
});

// --- EXPORTED PREFERENCES ------------------------------------
// Static entries are { get, set } pairs ready to use.
// Per-project entries are factories: call with a projectId to namespace the
// localStorage key so two projects can keep separate state.

export const prefs = {
  // Global UI toggles (boolean)
  binderCollapsed:    bool('binder-collapsed', false),
  editorSplit:        bool('editor-split', false),
  targetsOpen:        bool('targets-open', false),
  corkboardActive:    bool('corkboard-active', false),
  editorSynopsisOpen: bool('editor-synopsis-open', true),

  // Editor / writing targets (numeric / string)
  sessionGoal:        intPref('session-goal', 500),
  editorZoom:         intPref('editor-zoom', 100),
  editorFont:         strPref('editor-font', 'sans'),
  editorFontSize:     intPref('editor-font-size', 16),
  editorLineSpacing:  strPref('editor-line-spacing', '1.5'),

  // Per-project entries — call with the projectId to get { get, set }.
  /** Stored shape: { date: 'YYYY-MM-DD', baseline: number } */
  sessionBaseline:    (projectId) => jsonPref(`session-${projectId}`, null),
  /** Stored shape: number[] of expanded folder ids */
  binderExpanded:     (projectId) => jsonPref(`binder-expanded-${projectId}`, []),
};
