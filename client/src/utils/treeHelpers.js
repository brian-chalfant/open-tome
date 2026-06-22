// ============================================================
// treeHelpers.js
// ============================================================
// Purpose:   Pure utility functions for the binder document tree.
//            No React or store dependencies — importable anywhere.
// Used by:   Binder.jsx (flattenVisible, computeDrop)
// Exports:   flattenVisible, computeDrop
// ============================================================

/**
 * Flatten the visible (non-collapsed) tree into an ordered list.
 * Each item gains a `depth` property for indentation.
 */
export function flattenVisible(docs, parentId, expandedIds, depth = 0) {
  const children = docs
    .filter((d) => d.parent_id === parentId)
    .sort((a, b) => {
      const aIsFolder = a.type === 'folder' ? 1 : 0;
      const bIsFolder = b.type === 'folder' ? 1 : 0;
      // Structural containers (folders, chapters) sort after content nodes (scenes)
      // at the same level — gives new projects a predictable default order.
      if (aIsFolder !== bIsFolder) return aIsFolder - bIsFolder;
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' });
    });
  const result = [];
  for (const doc of children) {
    result.push({ ...doc, depth });
    if ((doc.type === 'folder' || doc.type === 'chapter') && expandedIds.has(doc.id)) {
      result.push(...flattenVisible(docs, doc.id, expandedIds, depth + 1));
    }
  }
  return result;
}

/**
 * Compute the new (parentId, sortOrder) when the user drops `draggedId` onto `overId`.
 *
 * Rules:
 *   - Drop onto a folder  → move inside that folder (inserted before existing children)
 *   - Drop onto anything else → reorder siblings; insert relative to dragDirection
 *
 * Returns { parentId, sortOrder, reorderItems } where reorderItems is the full
 * sibling list with sequential sort_orders (avoids float precision drift).
 */
export function computeDrop(docs, flatItems, draggedId, overId) {
  const dragged = docs.find((d) => d.id === draggedId);
  const over    = docs.find((d) => d.id === overId);
  if (!dragged || !over || draggedId === overId) return null;

  // ── Drop onto a folder or chapter (reparent) ───────────────────────────────
  if ((over.type === 'folder' || over.type === 'chapter') && over.id !== dragged.parent_id) {
    const folderChildren = docs
      .filter((d) => d.parent_id === over.id)
      .sort((a, b) => a.sort_order - b.sort_order);

    // Undercut the lowest existing child's sort_order so the drop lands at the top.
    const firstOrder = folderChildren.length > 0 ? folderChildren[0].sort_order : 1000;
    return {
      parentId:     over.id,
      // -1000 places the item before all current children; the next reorder will renumber everything.
      sortOrder:    firstOrder - 1000,
      reorderItems: null,
    };
  }

  // ── Reorder within same parent (or move to same level as target) ───────────
  const newParentId = over.parent_id ?? null;

  // All siblings at the target level, excluding the dragged item
  const siblings = docs
    .filter((d) => d.parent_id === newParentId && d.id !== draggedId)
    .sort((a, b) => a.sort_order - b.sort_order);

  // Determine insert direction using flat-list positions
  const flatIds = flatItems.map((d) => d.id);
  const oldFlatIdx = flatIds.indexOf(draggedId);
  const newFlatIdx = flatIds.indexOf(overId);
  const draggedDown = oldFlatIdx < newFlatIdx;

  // Find target position in the sibling list.
  // When dragging DOWN we insert AFTER the target; when dragging UP we insert BEFORE.
  // This matches the visual expectation: drop indicator appears below the target when
  // moving down, and above it when moving up.
  const targetIdx = siblings.findIndex((d) => d.id === overId);
  const insertIdx = draggedDown ? targetIdx + 1 : targetIdx;

  // Insert dragged into siblings at the new position
  const reordered = [...siblings];
  reordered.splice(insertIdx, 0, dragged);

  // Assign sequential sort_orders (× 1000 to leave room for future inserts)
  const reorderItems = reordered.map((d, i) => ({ id: d.id, sort_order: i * 1000 }));

  const newSortItem = reorderItems.find((r) => r.id === draggedId);

  return {
    parentId:     newParentId,
    sortOrder:    newSortItem?.sort_order ?? 0,
    reorderItems,
  };
}
