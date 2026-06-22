/**
 * @file components/CorkboardView.jsx
 * @description Visual index-card canvas for the selected folder.
 *
 * Renders the direct children of the currently selected folder node as draggable
 * index cards. Driven entirely by the binder store — no independent state.
 *
 * Features:
 *  - Breadcrumb path trail with click-to-navigate
 *  - Drag-and-drop reorder (dnd-kit rectSortingStrategy for wrapping grid)
 *  - "+ Add Card" toolbar button (creates a new scene in the current folder)
 *  - Drill-down: double-clicking a folder card descends into it (updates binder)
 */

import { useMemo, useCallback } from 'react';
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
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  arrayMove,
} from '@dnd-kit/sortable';
import { useBinderStore } from '../store/binderStore.js';
import { useBinder } from '../hooks/useBinder.js';
import IndexCard from './IndexCard.jsx';
import '../styles/corkboard.css';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Walk parent_id chain from folderId up to the root, returning the path
 * as an array ordered from root → current folder.
 */
function buildPath(docs, folderId) {
  const path = [];
  let cur = docs.find((d) => d.id === folderId);
  while (cur) {
    path.unshift(cur);
    cur = cur.parent_id ? docs.find((d) => d.id === cur.parent_id) : null;
  }
  return path;
}

// ── Add-card context ──────────────────────────────────────────────────────────

/**
 * Determine what add-button variant to show based on the active folder:
 *   'root'       → top-level; add a chapter
 *   'chapter'    → inside a chapter; show 4-quadrant picker
 *   'characters' → Characters folder; add a character
 *   'research'   → Research folder; add a research note
 *   'folder'     → any other folder; show 4-quadrant picker
 */
function getAddContext(activeDocId, activeNode) {
  if (!activeDocId) return 'root';
  if (activeNode?.type === 'chapter') return 'chapter';
  if (activeNode?.type === 'folder') {
    const t = (activeNode.title ?? '').toLowerCase();
    if (t.includes('character')) return 'characters';
    if (t.includes('research'))  return 'research';
    if (activeNode.parent_id === null) return 'root'; // top-level folder = chapter container
    return 'folder';
  }
  return 'folder';
}

// ── CorkboardView ─────────────────────────────────────────────────────────────

export default function CorkboardView() {
  const docs        = useBinderStore((s) => s.documents);
  const activeDocId = useBinderStore((s) => s.activeDocId);
  const setActiveDoc = useBinderStore((s) => s.setActiveDoc);
  const binder      = useBinder();

  const activeNode = docs.find((d) => d.id === activeDocId) ?? null;
  const addContext = getAddContext(activeDocId, activeNode);

  // Direct children of the active folder, sorted by sort_order
  const cards = useMemo(
    () =>
      docs
        .filter((d) => d.parent_id === activeDocId)
        .sort((a, b) => a.sort_order - b.sort_order),
    [docs, activeDocId],
  );

  const path = useMemo(() => buildPath(docs, activeDocId), [docs, activeDocId]);

  // ── Drag-and-drop ────────────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback(
    ({ active, over }) => {
      if (!over || active.id === over.id) return;
      const oldIdx = cards.findIndex((c) => c.id === active.id);
      const newIdx = cards.findIndex((c) => c.id === over.id);
      const reordered = arrayMove(cards, oldIdx, newIdx);
      binder.bulkReorder(reordered.map((c, i) => ({ id: c.id, sort_order: i })));
    },
    [cards, binder],
  );

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="corkboard">

      {/* ── Breadcrumb ─────────────────────────────────────────────────────── */}
      <nav className="corkboard-breadcrumb" aria-label="Folder path">
        {path.map((node, i) => (
          <span key={node.id} className="cb-crumb-wrap">
            <button
              className={`cb-crumb${i === path.length - 1 ? ' cb-crumb--current' : ''}`}
              onClick={() => setActiveDoc(node.id)}
              disabled={i === path.length - 1}
            >
              {node.title}
            </button>
            {i < path.length - 1 && (
              <span className="cb-sep" aria-hidden="true"> › </span>
            )}
          </span>
        ))}
      </nav>

      {/* ── Card canvas ────────────────────────────────────────────────────── */}
      <div className="corkboard-canvas">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={cards.map((c) => c.id)} strategy={rectSortingStrategy}>
            <div className="corkboard-grid">
              {cards.map((card) => (
                <IndexCard key={card.id} doc={card} />
              ))}
              {(addContext === 'chapter' || addContext === 'folder') ? (
                <div className="cb-add-ghost cb-add-ghost--quad" role="group" aria-label="Add item">
                  <button className="cb-quad-btn" onClick={() => binder.newDocument('scene',     activeDocId)}>+ Scene</button>
                  <button className="cb-quad-btn" onClick={() => binder.newDocument('folder',    activeDocId)}>+ Folder</button>
                  <button className="cb-quad-btn" onClick={() => binder.newDocument('character', activeDocId)}>+ Character</button>
                  <button className="cb-quad-btn" onClick={() => binder.newDocument('research',  activeDocId)}>+ Research</button>
                </div>
              ) : (
                <button
                  className="cb-add-ghost"
                  onClick={() => binder.newDocument(
                    addContext === 'characters' ? 'character'
                    : addContext === 'research' ? 'research'
                    : 'chapter',
                    activeDocId,
                  )}
                  aria-label={
                    addContext === 'characters' ? 'Add character'
                    : addContext === 'research' ? 'Add research'
                    : 'Add chapter'
                  }
                >
                  <span className="cb-add-ghost-icon">+</span>
                  <span className="cb-add-ghost-label">
                    {addContext === 'characters' ? 'Add Character'
                    : addContext === 'research'  ? 'Add Research'
                    : 'Add Chapter'}
                  </span>
                </button>
              )}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      {/* ── Toolbar ────────────────────────────────────────────────────────── */}
      <div className="corkboard-toolbar">
        <button
          className="cb-add-btn"
          onClick={() => binder.newDocument(
            addContext === 'root'       ? 'chapter'
            : addContext === 'characters' ? 'character'
            : addContext === 'research'   ? 'research'
            : 'scene',
            activeDocId,
          )}
        >
          {addContext === 'root'         ? '+ Add Chapter'
          : addContext === 'characters'  ? '+ Add Character'
          : addContext === 'research'    ? '+ Add Research'
          : '+ Add Scene'}
        </button>
      </div>

    </div>
  );
}
