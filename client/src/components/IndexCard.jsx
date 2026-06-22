/**
 * @file components/IndexCard.jsx
 * @description A single draggable index card in the corkboard canvas.
 *
 * Displays and edits one document node:
 *  - Title          — inline edit on double-click; syncs to binder on blur/Enter
 *  - Synopsis       — auto-resizing textarea; blur-saves to server
 *  - Label stripe   — colored pin; click opens LabelStatusPicker
 *  - Status badge   — named badge; click opens LabelStatusPicker
 *  - Word count     — read-only
 *  - Drill-down     — double-clicking a folder card descends into it
 *
 * Uses useSortable from @dnd-kit/sortable for drag handles.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { CSS } from '@dnd-kit/utilities';
import { useSortable } from '@dnd-kit/sortable';
import { useBinderStore } from '../store/binderStore.js';
import { useBinder } from '../hooks/useBinder.js';
import LabelStatusPicker from './LabelStatusPicker.jsx';

export default function IndexCard({ doc }) {
  const setActiveDoc  = useBinderStore((s) => s.setActiveDoc);
  const binder        = useBinder();

  // Derive label and status objects from store
  const label  = binder.labels.find((l) => l.id === doc.label_id)  ?? null;
  const status = binder.statuses.find((s) => s.id === doc.status_id) ?? null;

  // ── dnd-kit sortable ─────────────────────────────────────────────────────────
  const {
    attributes, listeners, setNodeRef,
    transform, transition, isDragging,
  } = useSortable({ id: doc.id });

  const style = {
    transform:  CSS.Transform.toString(transform),
    transition,
    opacity:    isDragging ? 0.45 : 1,
    zIndex:     isDragging ? 100 : undefined,
  };

  // ── Title inline editing ─────────────────────────────────────────────────────
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft,   setTitleDraft]   = useState(doc.title);
  const titleInputRef = useRef(null);

  // Keep draft in sync when the store updates (e.g. binder rename from tree)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!editingTitle) setTitleDraft(doc.title);
  }, [doc.title, editingTitle]);

  useEffect(() => {
    if (editingTitle) titleInputRef.current?.select();
  }, [editingTitle]);

  const commitTitle = useCallback(() => {
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== doc.title) binder.renDocument(doc.id, trimmed);
    else setTitleDraft(doc.title); // Revert if empty or unchanged
    setEditingTitle(false);
  }, [titleDraft, doc.title, doc.id, binder]);

  const onTitleKeyDown = useCallback((e) => {
    if (e.key === 'Enter')  { e.preventDefault(); commitTitle(); }
    if (e.key === 'Escape') { setTitleDraft(doc.title); setEditingTitle(false); }
  }, [commitTitle, doc.title]);

  // ── Synopsis editing ─────────────────────────────────────────────────────────
  const [synopsis, setSynopsis] = useState(doc.synopsis ?? '');

  // Sync if store updates from elsewhere
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSynopsis(doc.synopsis ?? '');
  }, [doc.synopsis]);

  const commitSynopsis = useCallback(() => {
    const current = doc.synopsis ?? '';
    if (synopsis !== current) binder.patchDocument(doc.id, { synopsis });
  }, [synopsis, doc.synopsis, doc.id, binder]);

  // ── Label / Status pickers ───────────────────────────────────────────────────
  const [showLabelPicker,  setShowLabelPicker]  = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);

  const assignLabel = useCallback((_docId, labelId) => {
    binder.setDocLabel(doc.id, labelId);
  }, [doc.id, binder]);

  const assignStatus = useCallback((_docId, statusId) => {
    binder.setDocStatus(doc.id, statusId);
  }, [doc.id, binder]);

  // ── Drill-down (folder cards) ────────────────────────────────────────────────
  const handleCardDoubleClick = useCallback(() => {
    if (doc.type === 'folder' || doc.type === 'chapter') setActiveDoc(doc.id);
  }, [doc.type, doc.id, setActiveDoc]);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`index-card${(doc.type === 'folder' || doc.type === 'chapter') ? ' index-card--folder' : ''}`}
      onDoubleClick={handleCardDoubleClick}
    >
      {/* ── Drag handle + label stripe ─────────────────────────────────── */}
      <div className="card-header">
        <span
          className="card-drag-handle"
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
          title="Drag to reorder"
          // Stop double-click on handle from triggering drill-down
          onDoubleClick={(e) => e.stopPropagation()}
        >
          ⠿
        </span>

        <span
          className="card-label-stripe"
          style={{ background: label ? label.color : 'transparent' }}
          onClick={(e) => { e.stopPropagation(); setShowLabelPicker(true); }}
          title={label ? `Label: ${label.name}` : 'Set label'}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowLabelPicker(true); } }}
          aria-label={label ? `Label: ${label.name}` : 'Set label'}
        />
      </div>

      {/* ── Title ──────────────────────────────────────────────────────── */}
      <div className="card-title-row" onDoubleClick={(e) => e.stopPropagation()}>
        {editingTitle ? (
          <input
            ref={titleInputRef}
            className="card-title-input"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={onTitleKeyDown}
            maxLength={200}
            aria-label="Edit title"
          />
        ) : (
          <span
            className="card-title"
            onDoubleClick={() => setEditingTitle(true)}
            title="Double-click to edit"
          >
            {doc.type === 'folder'  && <span className="card-folder-icon" aria-hidden="true">📁 </span>}
            {doc.type === 'chapter' && <span className="card-folder-icon" aria-hidden="true">📖 </span>}
            {doc.title}
          </span>
        )}
      </div>

      {/* ── Synopsis ───────────────────────────────────────────────────── */}
      <textarea
        className="card-synopsis"
        value={synopsis}
        onChange={(e) => setSynopsis(e.target.value)}
        onBlur={commitSynopsis}
        placeholder="Synopsis…"
        rows={4}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        aria-label="Synopsis"
      />

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <div className="card-footer">
        <span className="card-word-count">
          {doc.word_count > 0 ? `${doc.word_count.toLocaleString()} words` : '—'}
        </span>

        <button
          className={`card-status-badge${status ? '' : ' card-status-badge--none'}`}
          style={status ? { background: status.color } : undefined}
          onClick={(e) => { e.stopPropagation(); setShowStatusPicker(true); }}
          title={status ? `Status: ${status.name}` : 'Set status'}
        >
          {status ? status.name : 'No status'}
        </button>
      </div>

      {/* ── Pickers ─────────────────────────────────────────────────────── */}
      {showLabelPicker && (
        <LabelStatusPicker
          type="label"
          docId={doc.id}
          doc={doc}
          items={binder.labels}
          onAssign={assignLabel}
          onNew={(name, color) => binder.newLabel(binder.activeProjectId, name, color)}
          onClose={() => setShowLabelPicker(false)}
        />
      )}
      {showStatusPicker && (
        <LabelStatusPicker
          type="status"
          docId={doc.id}
          doc={doc}
          items={binder.statuses}
          onAssign={assignStatus}
          onNew={(name, color) => binder.newStatus(binder.activeProjectId, name, color)}
          onClose={() => setShowStatusPicker(false)}
        />
      )}
    </div>
  );
}
