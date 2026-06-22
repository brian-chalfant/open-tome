// ============================================================
// LabelStatusEditor.jsx
// ============================================================
// Purpose:   Labels & Statuses editor section inside ProjectManager.
//            Fetches, displays, and mutates labels and statuses for
//            the active project. Syncs changes into binderStore so
//            the binder's colour dots stay current without a reload.
// Used by:   ProjectManager.jsx
// Exports:   default LabelStatusEditor(props)
// Notes:     PALETTE and MetadataList were extracted from
//            ProjectManager.jsx. This component is self-contained —
//            it manages its own local state and store sync.
// ============================================================

import { useState, useEffect } from 'react';
import {
  getLabels, createLabel, updateLabel, deleteLabel,
  getStatuses, createStatus, updateStatus, deleteStatus,
} from '../api/projects.js';
import { useBinderStore } from '../store/binderStore.js';

// --- CONSTANTS -----------------------------------------------

// Colour palette for label and status swatches.
const PALETTE = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899',
  '#94a3b8', '#78716c', '#d97706', '#6366f1',
];

// --- COMPONENT -----------------------------------------------

export default function LabelStatusEditor({ activeProjectId, isOpen }) {
  const [labels,   setLabels]   = useState([]);
  const [statuses, setStatuses] = useState([]);

  // Sync store labels/statuses so changes made via the binder's colour picker
  // appear here immediately without needing another fetch.
  const storeLabels   = useBinderStore((s) => s.labels);
  const storeStatuses = useBinderStore((s) => s.statuses);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setLabels(storeLabels); },   [storeLabels]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setStatuses(storeStatuses); }, [storeStatuses]);

  // Also push PM-initiated changes back into the store so binder dots update live.
  const storeSetLabels   = useBinderStore((s) => s.setLabels);
  const storeSetStatuses = useBinderStore((s) => s.setStatuses);

  // Fetch on open (when activeProjectId is set).
  useEffect(() => {
    if (isOpen && activeProjectId) {
      getLabels(activeProjectId).then(setLabels).catch(() => {});
      getStatuses(activeProjectId).then(setStatuses).catch(() => {});
    }
  }, [isOpen, activeProjectId]);

  // --- HELPERS -----------------------------------------------

  // Write to both local state and binderStore so both stay in sync.
  function syncLabels(next)   { setLabels(next);   storeSetLabels(next); }
  function syncStatuses(next) { setStatuses(next); storeSetStatuses(next); }

  // --- LABEL HANDLERS ----------------------------------------

  const handleAddLabel = async (name, color) => {
    if (!activeProjectId) return;
    const label = await createLabel(activeProjectId, { name, color });
    syncLabels([...labels, label]);
  };

  const handleUpdateLabel = async (id, name, color) => {
    const updated = await updateLabel(id, { name, color });
    syncLabels(labels.map((l) => (l.id === id ? updated : l)));
  };

  const handleDeleteLabel = async (id) => {
    await deleteLabel(id);
    syncLabels(labels.filter((l) => l.id !== id));
    // Clear label_id from documents in store so binder dots disappear immediately.
    useBinderStore.setState((s) => ({
      documents: s.documents.map((d) => d.label_id === id ? { ...d, label_id: null } : d),
    }));
  };

  // --- STATUS HANDLERS ---------------------------------------

  const handleAddStatus = async (name, color) => {
    if (!activeProjectId) return;
    const status = await createStatus(activeProjectId, { name, color });
    syncStatuses([...statuses, status]);
  };

  const handleUpdateStatus = async (id, name, color) => {
    const updated = await updateStatus(id, { name, color });
    syncStatuses(statuses.map((s) => (s.id === id ? updated : s)));
  };

  const handleDeleteStatus = async (id) => {
    await deleteStatus(id);
    syncStatuses(statuses.filter((s) => s.id !== id));
    useBinderStore.setState((s) => ({
      documents: s.documents.map((d) => d.status_id === id ? { ...d, status_id: null } : d),
    }));
  };

  // --- RENDER ------------------------------------------------

  if (!activeProjectId) return null;

  return (
    <section className="pm-section pm-ls-section">
      <div className="pm-section-header">
        <span className="pm-section-title">Labels &amp; Statuses</span>
      </div>
      <div className="pm-ls-columns">
        <MetadataList
          title="Labels"
          dotClass=""
          items={labels}
          onAdd={handleAddLabel}
          onUpdate={handleUpdateLabel}
          onDelete={handleDeleteLabel}
        />
        <MetadataList
          title="Statuses"
          dotClass="pm-ls-dot--square"
          items={statuses}
          onAdd={handleAddStatus}
          onUpdate={handleUpdateStatus}
          onDelete={handleDeleteStatus}
        />
      </div>
    </section>
  );
}

// --- SUB-COMPONENTS ------------------------------------------

// Renders a single list of labels or statuses with inline edit and add forms.
// Shared between the Labels and Statuses columns.
function MetadataList({ title, dotClass, items, onAdd, onUpdate, onDelete }) {
  const [editingId, setEditingId] = useState(null);
  const [editName,  setEditName]  = useState('');
  const [editColor, setEditColor] = useState(PALETTE[0]);
  const [showAdd,   setShowAdd]   = useState(false);
  const [addName,   setAddName]   = useState('');
  const [addColor,  setAddColor]  = useState(PALETTE[0]);
  const [saving,    setSaving]    = useState(false);

  const startEdit = (item) => {
    setEditingId(item.id);
    setEditName(item.name);
    setEditColor(item.color);
  };

  const commitEdit = async (id) => {
    const name = editName.trim();
    if (name) await onUpdate(id, name, editColor);
    setEditingId(null);
  };

  const handleAdd = async () => {
    const name = addName.trim();
    if (!name || saving) return;
    setSaving(true);
    try {
      await onAdd(name, addColor);
      setAddName('');
      setAddColor(PALETTE[0]);
      setShowAdd(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pm-ls-col">
      <div className="pm-ls-col-title">{title}</div>
      <ul className="pm-ls-list">
        {items.map((item) => (
          <li key={item.id} className="pm-ls-item">
            {editingId === item.id ? (
              <div className="pm-ls-edit-row">
                <div className="pm-ls-palette-inline">
                  {PALETTE.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`pm-ls-swatch${editColor === c ? ' pm-ls-swatch--active' : ''}`}
                      style={{ background: c }}
                      onClick={() => setEditColor(c)}
                      aria-label={c}
                    />
                  ))}
                </div>
                <input
                  autoFocus
                  className="pm-ls-name-input"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter')  commitEdit(item.id);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  onBlur={() => commitEdit(item.id)}
                  maxLength={100}
                />
              </div>
            ) : (
              <>
                <span className={`pm-ls-dot ${dotClass}`} style={{ background: item.color }} />
                <span className="pm-ls-name" onClick={() => startEdit(item)} title="Click to edit">
                  {item.name}
                </span>
                <button
                  className="pm-ls-del-btn"
                  onClick={() => onDelete(item.id)}
                  title="Delete"
                  aria-label={`Delete ${item.name}`}
                >
                  ✕
                </button>
              </>
            )}
          </li>
        ))}
      </ul>

      {showAdd ? (
        <div className="pm-ls-add-form">
          <div className="pm-ls-palette-inline">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                className={`pm-ls-swatch${addColor === c ? ' pm-ls-swatch--active' : ''}`}
                style={{ background: c }}
                onClick={() => setAddColor(c)}
                aria-label={c}
              />
            ))}
          </div>
          <input
            autoFocus
            className="pm-ls-name-input"
            placeholder="Name…"
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter')  handleAdd();
              if (e.key === 'Escape') setShowAdd(false);
            }}
            maxLength={100}
          />
          <div className="pm-ls-add-actions">
            <button
              className="pm-action-btn pm-action-btn--save"
              onClick={handleAdd}
              disabled={saving || !addName.trim()}
            >
              {saving ? '…' : 'Add'}
            </button>
            <button className="pm-action-btn" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <button className="pm-ls-add-trigger" onClick={() => setShowAdd(true)}>
          + Add {title.endsWith('es') ? title.slice(0, -2) : title.slice(0, -1)}
        </button>
      )}
    </div>
  );
}
