/**
 * @file components/Binder.jsx
 * @description Left sidebar that renders the project's document tree with drag-and-drop.
 *
 * Key responsibilities:
 *  - Renders a project switcher dropdown (when multiple projects exist).
 *  - Flattens the document tree into a visible ordered list respecting expand/collapse state.
 *  - Uses @dnd-kit for drag-and-drop reordering, including cross-folder reparenting.
 *  - Computes new (parent_id, sort_order) via `computeDrop()` on drag end and persists to server.
 *  - Manages context menu state (right-click) for create/rename/delete actions.
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  closestCenter,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useBinder } from '../hooks/useBinder.js';
import { useBinderStore } from '../store/binderStore.js';
import BinderNode from './BinderNode.jsx';
import ContextMenu from './ContextMenu.jsx';
import ProjectManager from './ProjectManager.jsx';
import LabelStatusPicker from './LabelStatusPicker.jsx';
import QuickExportModal from './QuickExportModal.jsx';
import '../styles/binder.css';
import { flattenVisible, computeDrop } from '../utils/treeHelpers.js';

// ── Binder ────────────────────────────────────────────────────────────────────

export default function Binder({ onSelect, isMobileOpen, onMobileClose }) {
  const binder = useBinder();
  const binderRef = useRef(null);
  const pickerRef = useRef(null); // project picker dropdown anchor

  // UI state
  const [contextMenu, setContextMenu]         = useState(null); // { x, y, docId }
  const [renamingId, setRenamingId]           = useState(null); // document id being renamed
  const [activeId, setActiveId]               = useState(null); // drag source id
  const [showNewProject, setShowNewProject]   = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState('');
  const [renamingProjectId, setRenamingProjectId] = useState(null);
  const [renameProjectValue, setRenameProjectValue] = useState('');
  const [pmOpen, setPmOpen]                   = useState(false);
  const [picker, setPicker]                   = useState(null); // { type: 'label'|'status', docId }
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [focusedId, setFocusedId]             = useState(null); // ARIA tree roving tabindex
  // When non-null, the QuickExportModal is open for this document.
  const [quickExport, setQuickExport]         = useState(null); // { id, title }

  // Open the ProjectManager panel when TargetsWidget requests the goals form
  const requestGoalsOpen    = useBinderStore((s) => s.requestGoalsOpen);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (requestGoalsOpen) setPmOpen(true);
  }, [requestGoalsOpen]);

  // Lookup maps for O(1) dot rendering
  const labelMap  = useMemo(() => Object.fromEntries(binder.labels.map(l => [l.id, l])),  [binder.labels]);
  const statusMap = useMemo(() => Object.fromEntries(binder.statuses.map(s => [s.id, s])), [binder.statuses]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  // Compute the flat visible list on every render
  const flatItems = flattenVisible(binder.documents, null, binder.expandedIds);

  // The item that currently "owns" tabIndex=0 in the roving tabindex pattern.
  // Falls back to the first visible item so Tab can enter the tree.
  const resolvedFocusId = focusedId ?? flatItems[0]?.id ?? null;

  // When keyboard navigation changes focusedId, imperatively move DOM focus.
  useEffect(() => {
    if (focusedId == null) return;
    const el = binderRef.current?.querySelector(`[data-nodeid="${focusedId}"]`);
    el?.focus({ preventScroll: false });
  }, [focusedId]);

  // Close project picker on outside click
  useEffect(() => {
    if (!projectPickerOpen) return;
    const close = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setProjectPickerOpen(false);
      }
    };
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [projectPickerOpen]);

  // Close context menu when the user clicks anywhere
  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  // Mobile drawer: Escape to close + focus first element on open
  useEffect(() => {
    if (!isMobileOpen) return;
    const handleKey = (e) => { if (e.key === 'Escape') onMobileClose?.(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isMobileOpen, onMobileClose]);

  useEffect(() => {
    if (!isMobileOpen) return;
    const focusable = binderRef.current?.querySelector(
      'button, [href], input, select, [tabindex]:not([tabindex="-1"])',
    );
    focusable?.focus();
  }, [isMobileOpen]);

  // ── ARIA tree keyboard navigation (arrow keys, Home, End) ────────────────

  const handleTreeKeyDown = useCallback((e) => {
    const navKeys = ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (!navKeys.includes(e.key) || !flatItems.length) return;

    const currentId  = resolvedFocusId;
    const currentIdx = flatItems.findIndex((d) => d.id === currentId);

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        const next = Math.min(currentIdx + 1, flatItems.length - 1);
        setFocusedId(flatItems[next].id);
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        const prev = Math.max(currentIdx - 1, 0);
        setFocusedId(flatItems[prev].id);
        break;
      }
      case 'ArrowRight': {
        if (currentIdx < 0) break;
        const doc = flatItems[currentIdx];
        const isFolder = doc.type === 'folder' || doc.type === 'chapter';
        if (isFolder && !binder.expandedIds.has(doc.id)) {
          e.preventDefault();
          binder.toggleExpanded(doc.id);
        } else if (isFolder && binder.expandedIds.has(doc.id)) {
          // Move focus into first visible child
          const childIdx = currentIdx + 1;
          if (childIdx < flatItems.length && flatItems[childIdx].depth > doc.depth) {
            e.preventDefault();
            setFocusedId(flatItems[childIdx].id);
          }
        }
        break;
      }
      case 'ArrowLeft': {
        if (currentIdx < 0) break;
        const doc = flatItems[currentIdx];
        const isFolder = doc.type === 'folder' || doc.type === 'chapter';
        if (isFolder && binder.expandedIds.has(doc.id)) {
          e.preventDefault();
          binder.toggleExpanded(doc.id);
        } else if (doc.depth > 0) {
          // Move focus to the nearest ancestor
          const parent = flatItems.slice(0, currentIdx).reverse().find((d) => d.depth < doc.depth);
          if (parent) { e.preventDefault(); setFocusedId(parent.id); }
        }
        break;
      }
      case 'Home':
        e.preventDefault();
        setFocusedId(flatItems[0].id);
        break;
      case 'End':
        e.preventDefault();
        setFocusedId(flatItems[flatItems.length - 1].id);
        break;
      default:
        break;
    }
  }, [flatItems, resolvedFocusId, binder]);

  // ── Context menu ────────────────────────────────────────────────────────────

  const handleNodeContextMenu = useCallback((e, docId) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, docId });
  }, []);

  // Right-click on blank tree area
  const handleTreeContextMenu = useCallback((e) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, docId: null });
  }, []);

  function buildContextItems(menu) {
    if (!menu) return [];
    const { docId } = menu;

    // Blank-area right-click → top-level document creation
    if (docId == null) {
      return [
        { label: 'New Scene',     action: () => binder.newDocument('scene',     null) },
        { label: 'New Chapter',   action: () => binder.newDocument('chapter',   null) },
        { label: 'New Folder',    action: () => binder.newDocument('folder',    null) },
        { label: 'New Character', action: () => binder.newDocument('character', null) },
        { label: 'New Research',  action: () => binder.newDocument('research',  null) },
      ];
    }

    const doc = binder.documents.find((d) => d.id === docId);
    if (!doc) return [];

    const isContainer = doc.type === 'folder' || doc.type === 'chapter';
    const addItems = isContainer
      ? [
          { label: 'Add Scene',     action: () => binder.newDocument('scene',     docId) },
          { label: 'Add Chapter',   action: () => binder.newDocument('chapter',   docId) },
          { label: 'Add Folder',    action: () => binder.newDocument('folder',    docId) },
          { label: 'Add Character', action: () => binder.newDocument('character', docId) },
          { label: 'Add Research',  action: () => binder.newDocument('research',  docId) },
          { separator: true },
        ]
      : [];

    return [
      ...addItems,
      { label: 'Rename', action: () => { setRenamingId(docId); setContextMenu(null); } },
      { separator: true },
      { label: 'Set Label…',  action: () => { setPicker({ type: 'label',  docId }); setContextMenu(null); } },
      { label: 'Set Status…', action: () => { setPicker({ type: 'status', docId }); setContextMenu(null); } },
      { separator: true },
      // Quick Export is only available on leaf documents, not folders/chapters
      // which have no compiled content of their own.
      ...(!isContainer ? [{ label: 'Quick Export…', action: () => { setQuickExport({ id: docId, title: doc.title }); setContextMenu(null); } }] : []),
      { label: 'Delete', danger: true, action: () => binder.delDocument(docId) },
    ];
  }

  // ── Drag-and-drop ────────────────────────────────────────────────────────────

  const handleDragStart = useCallback(({ active }) => {
    setActiveId(active.id);
    setContextMenu(null);
  }, []);

  const handleDragEnd = useCallback(({ active, over }) => {
    setActiveId(null);
    if (!over || active.id === over.id) return;

    const docs = binder.documents;
    // Recompute the flat list from current state (not a stale ref)
    const currentFlatItems = flattenVisible(docs, null, binder.expandedIds);
    const drop = computeDrop(docs, currentFlatItems, active.id, over.id);
    if (!drop) return;

    const dragged = docs.find((d) => d.id === active.id);
    if (!dragged) return;

    const parentChanged  = dragged.parent_id !== drop.parentId;
    const reorderItems   = drop.reorderItems;

    if (parentChanged) {
      binder.moveDocument(active.id, drop.parentId, drop.sortOrder);
      // Expand the target folder so the moved item is visible immediately
      if (drop.parentId != null && !binder.expandedIds.has(drop.parentId)) {
        binder.toggleExpanded(drop.parentId);
      }
    } else if (reorderItems) {
      binder.bulkReorder(reorderItems);
    }
  }, [binder]);

  // ── New project ──────────────────────────────────────────────────────────────

  const submitNewProject = useCallback(async () => {
    const title = newProjectTitle.trim();
    if (!title) { setShowNewProject(false); return; }
    await binder.newProject(title);
    setShowNewProject(false);
    setNewProjectTitle('');
  }, [newProjectTitle, binder]);

  // ── Rename project ────────────────────────────────────────────────────────────

  const submitRenameProject = useCallback(async () => {
    const title = renameProjectValue.trim();
    if (title && renamingProjectId != null) {
      await binder.renProject(renamingProjectId, title);
    }
    setRenamingProjectId(null);
    setRenameProjectValue('');
  }, [renameProjectValue, renamingProjectId, binder]);

  // ── Render ────────────────────────────────────────────────────────────────────

  const activeDoc = flatItems.find((d) => d.id === activeId);

  return (
    <aside
      ref={binderRef}
      className={`binder${isMobileOpen ? ' binder--mobile-open' : ''}`}
      aria-label="Binder"
      {...(isMobileOpen ? { role: 'dialog', 'aria-modal': 'true' } : {})}
    >
      {/* ── Header: project switcher ──────────────────────────────── */}
      <div className="binder-header">
        {renamingProjectId != null ? (
          <input
            autoFocus
            className="binder-rename-input binder-project-rename"
            value={renameProjectValue}
            onChange={(e) => setRenameProjectValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter')  submitRenameProject();
              if (e.key === 'Escape') { setRenamingProjectId(null); }
            }}
            onBlur={submitRenameProject}
            aria-label="Rename project"
          />
        ) : (
          <div className="binder-project-picker" ref={pickerRef}>
            <button
              type="button"
              className="binder-project-btn"
              aria-haspopup="listbox"
              aria-expanded={projectPickerOpen ? 'true' : 'false'}
              aria-label="Active project"
              onClick={(e) => { e.stopPropagation(); setProjectPickerOpen((p) => !p); }}
              onDoubleClick={() => {
                if (binder.activeProjectId == null) return;
                const p = binder.projects.find((p) => p.id === binder.activeProjectId);
                if (p) { setRenamingProjectId(p.id); setRenameProjectValue(p.title); }
              }}
            >
              <span className="binder-project-btn-text">
                {binder.projects.find((p) => p.id === binder.activeProjectId)?.title
                  ?? (binder.projects.length === 0 ? 'No projects yet' : 'Select project')}
              </span>
              <svg className="binder-project-arrow" viewBox="0 0 10 10" fill="none"
                stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <polyline points="2,3 5,7 8,3" />
              </svg>
            </button>
            {projectPickerOpen && (
              <ul className="binder-project-listbox" role="listbox" aria-label="Projects">
                {binder.projects.map((p) => (
                  <li
                    key={p.id}
                    role="option"
                    aria-selected={p.id === binder.activeProjectId}
                    className={`binder-project-option${p.id === binder.activeProjectId ? ' binder-project-option--active' : ''}`}
                    onClick={() => { binder.setActiveProject(p.id); setProjectPickerOpen(false); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        binder.setActiveProject(p.id);
                        setProjectPickerOpen(false);
                      }
                    }}
                    tabIndex={0}
                  >
                    {p.title}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <button
          className="binder-icon-btn"
          title="New Project"
          aria-label="Create new project"
          onClick={() => { setShowNewProject(true); setNewProjectTitle(''); }}
        >
          ＋
        </button>

        <button
          className="binder-icon-btn"
          title="Manage projects"
          aria-label="Open project manager"
          onClick={() => setPmOpen(true)}
        >
          ⊞
        </button>

        <button
          className="binder-close-btn"
          onClick={onMobileClose}
          aria-label="Close binder"
        >
          ✕
        </button>
      </div>

      {/* ── New-project input row ──────────────────────────────────── */}
      {showNewProject && (
        <div className="binder-input-row">
          <input
            autoFocus
            className="binder-rename-input"
            placeholder="Project title…"
            value={newProjectTitle}
            onChange={(e) => setNewProjectTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter')  submitNewProject();
              if (e.key === 'Escape') { setShowNewProject(false); setNewProjectTitle(''); }
            }}
            onBlur={() => { setShowNewProject(false); setNewProjectTitle(''); }}
            aria-label="New project title"
          />
        </div>
      )}

      {/* ── Document tree ──────────────────────────────────────────── */}
      {binder.activeProjectId ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={flatItems.map((d) => d.id)}
            strategy={verticalListSortingStrategy}
          >
            <div
              className="binder-tree"
              role="tree"
              aria-label="Document tree"
              onContextMenu={handleTreeContextMenu}
              onKeyDown={handleTreeKeyDown}
            >
              {flatItems.map((doc) => (
                <BinderNode
                  key={doc.id}
                  doc={doc}
                  isActive={binder.activeDocId === doc.id}
                  isExpanded={binder.expandedIds.has(doc.id)}
                  isDragging={activeId === doc.id}
                  isRenaming={renamingId === doc.id}
                  tabIndex={resolvedFocusId === doc.id ? 0 : -1}
                  labelMap={labelMap}
                  statusMap={statusMap}
                  onSelect={() => onSelect ? onSelect(doc.id) : binder.setActiveDoc(doc.id)}
                  onToggleExpand={() => binder.toggleExpanded(doc.id)}
                  onContextMenu={handleNodeContextMenu}
                  onStartRename={(id) => setRenamingId(id)}
                  onFinishRename={(id, title) => { binder.renDocument(id, title); setRenamingId(null); }}
                  onCancelRename={() => setRenamingId(null)}
                  onFocus={(id) => setFocusedId(id)}
                />
              ))}

              {flatItems.length === 0 && (
                <p className="binder-empty">Right-click to add documents</p>
              )}
            </div>
          </SortableContext>

          {/* Ghost overlay while dragging */}
          <DragOverlay>
            {activeDoc ? (
              <div className="binder-drag-ghost">{activeDoc.title}</div>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : (
        <p className="binder-empty">
          {binder.projects.length === 0
            ? 'Click ＋ to create a project'
            : 'Select a project above'}
        </p>
      )}


      {/* ── Context menu ───────────────────────────────────────────── */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={buildContextItems(contextMenu)}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* ── Quick Export ─────────────────────────────────────────── */}
      {/* Opened from the context menu on any non-folder binder node. */}
      {quickExport && (
        <QuickExportModal
          docId={quickExport.id}
          docTitle={quickExport.title}
          onClose={() => setQuickExport(null)}
        />
      )}

      {/* ── Label / Status picker ────────────────────────────────── */}
      {picker && (
        <LabelStatusPicker
          type={picker.type}
          docId={picker.docId}
          doc={binder.documents.find((d) => d.id === picker.docId)}
          items={picker.type === 'label' ? binder.labels : binder.statuses}
          activeProjectId={binder.activeProjectId}
          onAssign={(docId, id) => {
            if (picker.type === 'label')  binder.setDocLabel(docId, id);
            else                          binder.setDocStatus(docId, id);
          }}
          onNew={(name, color) => {
            if (picker.type === 'label')  return binder.newLabel(binder.activeProjectId, name, color);
            else                          return binder.newStatus(binder.activeProjectId, name, color);
          }}
          onClose={() => setPicker(null)}
        />
      )}

      <ProjectManager
        isOpen={pmOpen}
        onClose={() => setPmOpen(false)}
        activeProjectId={binder.activeProjectId}
        onActivate={(project) => {
          binder.setActiveProject(project.id);
          binder.refreshProjects();
        }}
        onProjectsChanged={binder.refreshProjects}
      />
    </aside>
  );
}
