/**
 * @file components/LabelStatusPicker.jsx
 * @description Floating panel for assigning a label or status to a document.
 *
 * Props:
 *   type            - 'label' | 'status'
 *   docId           - ID of the document being assigned
 *   doc             - The document object (for reading current label_id / status_id)
 *   items           - Array of label or status objects for this project
 *   onAssign(docId, id|null) - Called when user picks an item (null = clear)
 *   onNew(name, color)       - Called to create a new item; should return the created item
 *   onClose                  - Called to close the picker
 */

import { useState, useEffect, useRef } from 'react';
import '../styles/labels.css';

const PALETTE = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899',
  '#94a3b8', '#78716c', '#d97706', '#6366f1',
];

export default function LabelStatusPicker({ type, docId, doc, items, onAssign, onNew, onClose }) {
  const title = type === 'label' ? 'Set Label' : 'Set Status';
  const currentId = doc ? (type === 'label' ? doc.label_id : doc.status_id) : null;

  const [showNew,   setShowNew]   = useState(false);
  const [newName,   setNewName]   = useState('');
  const [newColor,  setNewColor]  = useState(PALETTE[0]);
  const [creating,  setCreating]  = useState(false);

  const panelRef = useRef(null);
  const nameInputRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose();
    };
    // Defer so the context-menu click that opened us doesn't immediately close us
    const tid = setTimeout(() => window.addEventListener('mousedown', handler), 0);
    return () => { clearTimeout(tid); window.removeEventListener('mousedown', handler); };
  }, [onClose]);

  // Escape closes
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Focus name input when "+ New" form opens
  useEffect(() => {
    if (showNew) nameInputRef.current?.focus();
  }, [showNew]);

  const handlePick = (id) => {
    onAssign(docId, id === currentId ? null : id); // clicking current clears it
    onClose();
  };

  const handleCreateNew = async () => {
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      await onNew(name, newColor);
      setShowNew(false);
      setNewName('');
      setNewColor(PALETTE[0]);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="lsp-overlay" aria-modal="true" role="dialog" aria-label={title}>
      <div ref={panelRef} className="lsp-panel">
        <div className="lsp-header">
          <span className="lsp-title">{title}</span>
          <button className="lsp-close-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <ul className="lsp-list" role="listbox">
          {/* None — clears assignment */}
          <li
            className={`lsp-item${!currentId ? ' lsp-item--active' : ''}`}
            role="option"
            aria-selected={!currentId}
            onClick={() => { onAssign(docId, null); onClose(); }}
          >
            <span className="lsp-dot lsp-dot--none" />
            <span className="lsp-item-name">None</span>
          </li>

          {items.map((item) => (
            <li
              key={item.id}
              className={`lsp-item${currentId === item.id ? ' lsp-item--active' : ''}`}
              role="option"
              aria-selected={currentId === item.id}
              onClick={() => handlePick(item.id)}
            >
              <span
                className={`lsp-dot${type === 'status' ? ' lsp-dot--square' : ''}`}
                style={{ background: item.color }}
              />
              <span className="lsp-item-name">{item.name}</span>
            </li>
          ))}
        </ul>

        {/* ── Inline create form ── */}
        {showNew ? (
          <div className="lsp-new-form">
            <input
              ref={nameInputRef}
              className="lsp-new-input"
              placeholder={type === 'label' ? 'Label name…' : 'Status name…'}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreateNew(); if (e.key === 'Escape') setShowNew(false); }}
              maxLength={100}
            />
            <div className="lsp-palette">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`lsp-swatch${newColor === c ? ' lsp-swatch--active' : ''}`}
                  style={{ background: c }}
                  onClick={() => setNewColor(c)}
                  aria-label={c}
                />
              ))}
            </div>
            <div className="lsp-new-actions">
              <button
                className="lsp-btn lsp-btn--primary"
                onClick={handleCreateNew}
                disabled={creating || !newName.trim()}
              >
                {creating ? '…' : 'Add'}
              </button>
              <button className="lsp-btn" onClick={() => setShowNew(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <button className="lsp-new-trigger" onClick={() => setShowNew(true)}>
            + New {type === 'label' ? 'Label' : 'Status'}
          </button>
        )}
      </div>
    </div>
  );
}
