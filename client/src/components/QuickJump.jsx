// ============================================================
// QuickJump.jsx
// ============================================================
// Purpose:   Floating search palette that lets the user jump to
//            any document in the binder by typing part of its title.
//            Opened with Ctrl+G from the Editor; closed with Esc or
//            by clicking the backdrop.
// Used by:   Editor.jsx — rendered when jumpOpen is true
// Exports:   QuickJump (default)
// Notes:     Only scenes, characters, and research nodes appear in
//            results. Folders and chapters are structural containers
//            and aren't useful jump targets.
// ============================================================

import { useState, useEffect, useRef } from 'react';
import { useBinderStore } from '../store/binderStore.js';
import '../styles/quick-jump.css';

// --- CONSTANTS -----------------------------------------------

// Document types the user can navigate to directly.
// Folders and chapters are excluded — they hold other docs, not content.
const JUMPABLE_TYPES = new Set(['scene', 'character', 'research']);

// --- COMPONENT -----------------------------------------------

// Floating search palette for quick binder navigation.
// Renders a text input and a live-filtered list of matching documents.
// Selecting a document switches the active doc in the binder store
// and closes the palette.
export default function QuickJump({ onClose }) {
  const documents = useBinderStore((s) => s.documents);
  const [query, setQuery]   = useState('');
  const [cursor, setCursor] = useState(0); // index of the keyboard-highlighted row
  const inputRef            = useRef(null);
  const listRef             = useRef(null);

  // --- FILTERING -----------------------------------------------

  // Filter to jumpable types, match title case-insensitively, cap at 20 results
  // so the list doesn't grow unwieldy for projects with hundreds of documents.
  const filtered = documents
    .filter((d) => JUMPABLE_TYPES.has(d.type) && d.title.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 20);

  // --- EFFECTS -------------------------------------------------

  // Focus the input the moment the palette opens so the user can type immediately.
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Escape closes the palette regardless of which element has focus.
  // The input's onKeyDown only fires when the input is active; this document-level
  // listener ensures Escape always works (e.g., in headless test environments).
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Reset the highlighted row to the top whenever the search query changes.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setCursor(0); }, [query]);

  // Keep the highlighted row scrolled into view when the user navigates with arrow keys.
  useEffect(() => {
    const el = listRef.current?.querySelector('[data-active="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  // --- HANDLERS ------------------------------------------------

  // Switch to the chosen document and close the palette.
  const select = (docId) => {
    useBinderStore.getState().setActiveDoc(docId);
    onClose();
  };

  // Arrow keys move the cursor; Enter selects the highlighted row; Esc closes.
  // The document-level listener above also handles Esc — this one is the fast
  // path when the input already has focus (avoids bubbling to document first).
  const handleKey = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === 'Enter') {
      if (filtered[cursor]) select(filtered[cursor].id);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  // --- RENDER --------------------------------------------------

  // Small visual indicator of document type shown before each title.
  const TYPE_ICON = { scene: '📄', character: '👤', research: '🔬' };

  return (
    // Clicking the backdrop (overlay) closes the palette.
    <div className="qj-overlay" onClick={onClose}>
      {/* Clicks inside the panel don't bubble up to the backdrop. */}
      <div className="qj-panel" onClick={(e) => e.stopPropagation()}>
        {/* autoFocus handles the browser-level focus on mount; the useEffect
            above is the belt-and-suspenders for environments (e.g. some mobile
            browsers) where the HTML attribute alone doesn't fire reliably. */}
        <input
          ref={inputRef}
          autoFocus
          className="qj-input"
          placeholder="Jump to document…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKey}
          aria-label="Quick document jump"
          aria-autocomplete="list"
          aria-controls="qj-list"
        />
        <ul id="qj-list" ref={listRef} className="qj-list" role="listbox">
          {filtered.length === 0 && (
            <li className="qj-empty">No documents found</li>
          )}
          {filtered.map((doc, i) => (
            <li
              key={doc.id}
              className={`qj-item${i === cursor ? ' qj-item--active' : ''}`}
              // data-active is used by the scroll-into-view effect above.
              data-active={i === cursor ? 'true' : undefined}
              role="option"
              aria-selected={i === cursor}
              // Hovering with the mouse keeps the cursor in sync with the keyboard position.
              onMouseEnter={() => setCursor(i)}
              onClick={() => select(doc.id)}
            >
              <span className="qj-icon">{TYPE_ICON[doc.type] ?? '📄'}</span>
              <span className="qj-title">{doc.title || 'Untitled'}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
