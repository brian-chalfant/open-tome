/**
 * @file components/BinderNode.jsx
 * @description Single row in the binder document tree.
 *
 * Renders an icon, an expand/collapse chevron (for folders), the document title
 * (or an inline rename input), a note badge, and a drag handle. Integrates with
 * @dnd-kit/sortable for drag-and-drop reordering in the parent Binder component.
 */

import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { SceneIcon, FolderIcon, ResearchIcon, CharacterIcon, ChapterIcon } from './icons/BinderIcons.jsx';

const TYPE_ICONS = { scene: SceneIcon, folder: FolderIcon, chapter: ChapterIcon, research: ResearchIcon, character: CharacterIcon };

// ── BinderNode ────────────────────────────────────────────────────────────────

/**
 * Single row in the binder tree.
 *
 * @param {Object}   props
 * @param {Object}   props.doc            - Document object ({ id, title, type, depth }).
 * @param {boolean}  props.isActive       - Whether this is the currently selected document.
 * @param {boolean}  props.isExpanded     - Whether this folder node is expanded (folders only).
 * @param {boolean}  props.isDragging     - Whether this node is the current drag source (dims it).
 * @param {boolean}  props.isRenaming     - Whether the inline rename input should be shown.
 * @param {Function} props.onSelect       - Called when the row is clicked to select the document.
 * @param {Function} props.onToggleExpand - Called to toggle expand/collapse on a folder node.
 * @param {Function} props.onContextMenu  - Called with (event, docId) on right-click.
 * @param {Function} props.onStartRename  - Called with (docId) to begin inline rename.
 * @param {Function} props.onFinishRename - Called with (docId, newTitle) to commit rename.
 * @param {Function} props.onCancelRename - Called to cancel rename without saving.
 * @returns {JSX.Element}
 */
export default function BinderNode({
  doc,
  isActive,
  isExpanded,
  isDragging,
  isRenaming,
  tabIndex,
  labelMap,
  statusMap,
  onSelect,
  onToggleExpand,
  onContextMenu,
  onStartRename,
  onFinishRename,
  onCancelRename,
  onFocus,
}) {
  const [editValue, setEditValue] = useState(doc.title);
  // Derived-state pattern: reset editValue to doc.title when rename starts
  // (handles the case where doc.title changed since component mounted)
  const [prevIsRenaming, setPrevIsRenaming] = useState(isRenaming);
  if (prevIsRenaming !== isRenaming) {
    setPrevIsRenaming(isRenaming);
    if (isRenaming) setEditValue(doc.title);
  }

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: doc.id });

  const style = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    transition,
    paddingLeft: `${(doc.depth ?? 0) * 16 + 8}px`,
    opacity: isSortableDragging ? 0.3 : 1,
  };

  const Icon = TYPE_ICONS[doc.type] ?? SceneIcon;
  const isFolder = doc.type === 'folder' || doc.type === 'chapter';

  const commitRename = () => {
    const trimmed = editValue.trim();
    onFinishRename(doc.id, trimmed || doc.title);
  };

  const handleRenameKeyDown = (e) => {
    e.stopPropagation(); // prevent dnd-kit keyboard sensor from intercepting
    if (e.key === 'Enter')  { e.preventDefault(); commitRename(); }
    if (e.key === 'Escape') { setEditValue(doc.title); onCancelRename(); }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        'binder-node',
        isActive    ? 'binder-node--active'   : '',
        isDragging  ? 'binder-node--dragging' : '',
      ].join(' ').trim()}
      onContextMenu={(e) => onContextMenu(e, doc.id)}
      // Spread dnd-kit attributes + listeners first; our ARIA overrides come after.
      {...attributes}
      {...listeners}
      // ARIA overrides: placed after spread so they win over dnd-kit defaults.
      role="treeitem"
      aria-selected={isActive}
      aria-expanded={isFolder ? isExpanded : undefined}
      aria-level={(doc.depth ?? 0) + 1}
      data-nodeid={doc.id}
      tabIndex={tabIndex ?? 0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !isRenaming) {
          e.preventDefault();
          onSelect();
        }
      }}
      onFocus={() => onFocus?.(doc.id)}
      onClick={() => { if (!isRenaming) onSelect(); }}
    >
      {/* Expand/collapse chevron (folders only) */}
      <button
        className={`binder-expand-btn${!isFolder ? ' binder-expand-btn--hidden' : ''}`}
        tabIndex={-1}
        aria-label={isExpanded ? 'Collapse folder' : 'Expand folder'}
        data-expanded={isExpanded ? 'true' : 'false'}
        onClick={(e) => {
          e.stopPropagation();
          if (isFolder) onToggleExpand();
          // Clicking the expand/collapse chevron also selects the folder so
          // clicking anywhere on the left side of a row triggers selection.
          if (!isRenaming) onSelect();
        }}
        // Stop drag sensors from triggering on button press
        onPointerDown={(e) => e.stopPropagation()}
      >
        {isFolder && (
          <svg
            className="binder-chevron"
            viewBox="0 0 10 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <polyline points="2,3 5,7 8,3" />
          </svg>
        )}
      </button>

      {/* Type icon */}
      <Icon />

      {/* Title / inline rename input */}
      {isRenaming ? (
        <input
          autoFocus
          className="binder-rename-input"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleRenameKeyDown}
          onBlur={commitRename}
          // Prevent drag from triggering while typing
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          aria-label="Rename document"
        />
      ) : (
        <span
          className="binder-node-title"
          onClick={(e) => { e.stopPropagation(); onSelect(); }}
          onDoubleClick={(e) => { e.stopPropagation(); onStartRename(doc.id); }}
        >
          {doc.title}
        </span>
      )}
      {/* ⋮ button — fades in on row hover; keeps right-click as a shortcut */}
      {!isRenaming && (
        <button
          type="button"
          className="binder-menu-btn"
          aria-label="Document options"
          title="Document options"
          onClick={(e) => { e.stopPropagation(); onContextMenu(e, doc.id); }}
          onPointerDown={(e) => e.stopPropagation()}
          tabIndex={-1}
        >
          ⋮
        </button>
      )}
      {doc.label_id && labelMap?.[doc.label_id] && (
        <span
          className="binder-color-dot"
          style={{ background: labelMap[doc.label_id].color }}
          title={`Label: ${labelMap[doc.label_id].name}`}
          aria-hidden="true"
        />
      )}
      {doc.status_id && statusMap?.[doc.status_id] && (
        <span
          className="binder-color-dot binder-color-dot--status"
          style={{ background: statusMap[doc.status_id].color }}
          title={`Status: ${statusMap[doc.status_id].name}`}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
