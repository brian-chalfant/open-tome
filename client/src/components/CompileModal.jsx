/**
 * @file components/CompileModal.jsx
 * @description Modal dialog for compiling and exporting the project to PDF, DOCX, or ePub.
 *
 * Displays two panels:
 *  - Left: The full document tree with checkboxes (scene nodes only are selectable).
 *  - Right: The ordered export list where the user can reorder via drag-and-drop
 *    and remove individual items.
 *
 * On export, POSTs to /api/projects/:projectId/compile and triggers a browser
 * file download using the server-provided Content-Disposition filename.
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useBinderStore } from '../store/binderStore.js';
import api from '../api/axios.js';
import '../styles/compile.css';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Flatten the full document tree in binder order, annotating each node with depth. */
function flattenAll(docs, parentId = null, depth = 0) {
  return docs
    .filter((d) => d.parent_id === parentId)
    .sort((a, b) => a.sort_order - b.sort_order)
    .flatMap((d) => [{ ...d, depth }, ...flattenAll(docs, d.id, depth + 1)]);
}

const EXT_MAP  = { pdf: 'pdf', docx: 'docx', epub: 'epub', markdown: 'md', manuscript: 'docx' };

// ── Group checkbox (handles indeterminate state, which requires a DOM ref) ────

function GroupCheckbox({ checked, indeterminate, onChange, disabled }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = indeterminate; }, [indeterminate]);
  return (
    <input ref={ref} type="checkbox" checked={checked} onChange={onChange}
           disabled={disabled} className="compile-checkbox" />
  );
}

// ── Sortable export-order item ────────────────────────────────────────────────

function SortableExportItem({ id, title, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  const style = {
    transform:  CSS.Transform.toString(transform),
    transition,
    opacity:    isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="compile-export-item">
      <span className="compile-drag-handle" {...attributes} {...listeners} aria-label="Drag to reorder">
        ⠿
      </span>
      <span className="compile-export-title">{title}</span>
      <button
        className="compile-remove-btn"
        onClick={() => onRemove(id)}
        aria-label={`Remove ${title} from export`}
        title="Remove from export"
      >
        ×
      </button>
    </div>
  );
}

// ── CompileModal ──────────────────────────────────────────────────────────────

export default function CompileModal({ projectId, onClose }) {
  const docs = useBinderStore((s) => s.documents);

  // Flat ordered list with depth info
  const flatDocs = useMemo(() => flattenAll(docs), [docs]);

  // Export order: scene-doc IDs, initially in binder order (folders excluded)
  const [exportOrder, setExportOrder] = useState(() =>
    flatDocs.filter((d) => d.type === 'scene').map((d) => d.id),
  );

  const [format,  setFormat]  = useState('pdf');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  // Map id → doc for quick lookup
  const docById = useMemo(
    () => Object.fromEntries(docs.map((d) => [d.id, d])),
    [docs],
  );

  // Toggle a scene in/out of the export order (preserves drag-reorder position)
  const toggleDoc = useCallback((id) => {
    setExportOrder((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      return [...prev, id];
    });
  }, []);

  const removeFromExport = useCallback((id) => {
    setExportOrder((prev) => prev.filter((x) => x !== id));
  }, []);

  // Toggle all direct scene children of a folder/chapter node in/out of export order.
  // Preserves existing drag-reorder positions; new scenes are appended in binder order.
  const toggleGroup = useCallback((sceneIds, allChecked) => {
    setExportOrder((prev) => {
      if (allChecked) return prev.filter(id => !sceneIds.includes(id));
      const toAdd = sceneIds.filter(id => !prev.includes(id));
      return [...prev, ...toAdd];
    });
  }, []);

  // dnd-kit sensors for the export-order list
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback(({ active, over }) => {
    if (!over || active.id === over.id) return;
    setExportOrder((prev) => {
      const oldIdx = prev.indexOf(active.id);
      const newIdx = prev.indexOf(over.id);
      return arrayMove(prev, oldIdx, newIdx);
    });
  }, []);

  // Export
  const handleExport = async () => {
    if (exportOrder.length === 0) {
      setError('Select at least one document to export.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await api.post(
        `/api/projects/${projectId}/compile`,
        { documentIds: exportOrder, format },
        { responseType: 'blob' },
      );

      // Extract filename from Content-Disposition header (set server-side)
      const cd = response.headers['content-disposition'] ?? '';
      const match = cd.match(/filename="?([^";]+)"?/);
      const filename = match ? match[1] : `export.${EXT_MAP[format]}`;

      const url = URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      onClose();
    } catch {
      setError('Export failed. Please check server logs and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="compile-overlay" role="dialog" aria-modal="true" aria-label="Compile project">
      <div className="compile-modal">

        {/* Header */}
        <div className="compile-header">
          <h2 className="compile-title">Compile &amp; Export</h2>
          <button className="compile-close-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="compile-body">
          {/* Left panel: document tree with checkboxes */}
          <div className="compile-panel">
            <h3 className="compile-panel-heading">Include documents</h3>
            <div className="compile-doc-list">
              {flatDocs.map((doc) => {
                const isScene   = doc.type === 'scene';
                const isChecked = exportOrder.includes(doc.id);
                return (
                  <div
                    key={doc.id}
                    className={`compile-doc-row${!isScene ? ' compile-doc-row--folder' : ''}`}
                    style={{ paddingLeft: 8 + doc.depth * 16 }}
                  >
                    {isScene ? (
                      <label className="compile-doc-label">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleDoc(doc.id)}
                          className="compile-checkbox"
                        />
                        <span className="compile-doc-name">{doc.title}</span>
                      </label>
                    ) : (() => {
                      const directSceneIds = flatDocs
                        .filter(d => d.parent_id === doc.id && d.type === 'scene')
                        .map(d => d.id);
                      const allChecked  = directSceneIds.length > 0 && directSceneIds.every(id => exportOrder.includes(id));
                      const someChecked = directSceneIds.some(id => exportOrder.includes(id));
                      return (
                        <label className="compile-doc-label">
                          <GroupCheckbox
                            checked={allChecked}
                            indeterminate={someChecked && !allChecked}
                            onChange={() => toggleGroup(directSceneIds, allChecked)}
                            disabled={directSceneIds.length === 0}
                          />
                          <span className="compile-folder-name">{doc.title}</span>
                        </label>
                      );
                    })()}
                  </div>
                );
              })}
              {flatDocs.length === 0 && (
                <p className="compile-empty">No documents in this project.</p>
              )}
            </div>
          </div>

          {/* Right panel: sortable export order */}
          <div className="compile-panel">
            <h3 className="compile-panel-heading">Export order</h3>
            <p className="compile-panel-hint">Drag to reorder</p>
            <div className="compile-export-list">
              {exportOrder.length === 0 ? (
                <p className="compile-empty">No documents selected.</p>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={exportOrder}
                    strategy={verticalListSortingStrategy}
                  >
                    {exportOrder.map((id) => (
                      <SortableExportItem
                        key={id}
                        id={id}
                        title={docById[id]?.title ?? `#${id}`}
                        onRemove={removeFromExport}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              )}
            </div>
          </div>
        </div>

        {/* Footer: format + export button */}
        <div className="compile-footer">
          <fieldset className="compile-format-group">
            <legend className="compile-format-legend">Format</legend>
            {['pdf', 'docx', 'epub', 'markdown', 'manuscript'].map((f) => (
              <label key={f} className="compile-format-label">
                <input
                  type="radio"
                  name="format"
                  value={f}
                  checked={format === f}
                  onChange={() => setFormat(f)}
                />
                {f === 'markdown' ? 'Markdown' : f === 'manuscript' ? 'Manuscript' : f.toUpperCase()}
              </label>
            ))}
            {format === 'manuscript' && (
              <p className="compile-format-hint">
                Author info is taken from your <a href="/profile">Profile</a> (Manuscript Info section).
              </p>
            )}
          </fieldset>

          {error && <p className="compile-error" role="alert">{error}</p>}

          <button
            className="compile-export-btn"
            onClick={handleExport}
            disabled={loading || exportOrder.length === 0}
          >
            {loading ? 'Exporting…' : `Export ${format === 'markdown' ? 'Markdown' : format === 'manuscript' ? 'Manuscript' : format.toUpperCase()}`}
          </button>
        </div>

      </div>
    </div>
  );
}
