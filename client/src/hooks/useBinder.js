/**
 * @file hooks/useBinder.js
 * @description Bridge hook between the binder Zustand store and the Projects/Documents API.
 *
 * Loads projects on mount and documents when the active project changes.
 * Provides action functions that update the server and then update the store,
 * keeping the UI in sync without manual cache invalidation.
 *
 * @returns {Object} All binder state and action functions (see return statement).
 */

import { useEffect, useCallback } from 'react';
import { useBinderStore } from '../store/binderStore.js';
import {
  getProjects, createProject, renameProject, deleteProject,
  getDocuments, createDocument, updateDocument, deleteDocument, reorderDocuments,
  getLabels, createLabel, updateLabel, deleteLabel,
  getStatuses, createStatus, updateStatus, deleteStatus,
} from '../api/projects.js';
export { getProjects };

function nextDocTitle(documents, type) {
  const label  = type.charAt(0).toUpperCase() + type.slice(1);
  const prefix = `${label} `;
  const taken  = new Set(
    documents
      .filter((d) => d.type === type && d.title.startsWith(prefix))
      .map((d) => parseInt(d.title.slice(prefix.length), 10))
      .filter((n) => Number.isInteger(n) && n > 0)
  );
  let n = 1;
  while (taken.has(n)) n++;
  return `${label} ${n}`;
}

// Fetch documents + labels + statuses for a project in parallel; failures are
// per-resource so a slow/failed labels endpoint never blocks documents.
function loadProjectResources(projectId, store) {
  // `allSettled` is intentional here: each store slice should refresh even if
  // another endpoint is flaky, instead of failing the whole project load.
  return Promise.allSettled([
    getDocuments(projectId).then(store.setDocuments),
    getLabels(projectId).then(store.setLabels),
    getStatuses(projectId).then(store.setStatuses),
  ]);
}

export function useBinder(preferredProjectId, { init = false } = {}) {
  const store = useBinderStore();

  // Always sets the active project AND fetches its documents — even if the project
  // ID hasn't changed. This is necessary because the HTML <select> onChange only fires
  // when the value changes, so clicking the already-selected project (common when only
  // one project exists) would otherwise never trigger a document load.
  const activateProject = useCallback((projectId) => {
    store.setActiveProject(projectId);
    loadProjectResources(projectId, store);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load projects once on mount; auto-select a project if none is active.
  // Only runs when `init: true` (i.e. the root AppPage call). Child components
  // that call useBinder() get store state reactively without triggering their
  // own fetch, preventing multiple concurrent auto-select races.
  // When a preferredProjectId is provided (e.g. from a /app/:projectId URL),
  // select it instead of defaulting to the first project in the list.
  useEffect(() => {
    if (!init) return;
    getProjects().then((projects) => {
      store.setProjects(projects);
      if (!useBinderStore.getState().activeProjectId && projects.length > 0) {
        const target = preferredProjectId && projects.some((p) => p.id === preferredProjectId)
          ? preferredProjectId
          : projects[0].id;
        activateProject(target);
      }
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Safety-net: reload resources if something else sets activeProjectId directly
  // (e.g. deep-links, future code). activateProject covers the normal path.
  useEffect(() => {
    if (!store.activeProjectId) return;
    loadProjectResources(store.activeProjectId, store);
  }, [store.activeProjectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const newProject = useCallback(async (title) => {
    const project = await createProject(title);
    store.addProject(project);
    store.setActiveProject(project.id);
    return project;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const registerImportedProject = useCallback((project) => {
    store.addProject(project);
    store.setActiveProject(project.id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshProjects = useCallback(async () => {
    const projects = await getProjects();
    store.setProjects(projects);
    // If the active project was deleted, clear binder state
    const { activeProjectId } = useBinderStore.getState();
    if (activeProjectId && !projects.some((p) => p.id === activeProjectId)) {
      useBinderStore.setState({ activeProjectId: null, documents: [] });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const renProject = useCallback(async (id, title) => {
    const updated = await renameProject(id, title);
    store.updateProject(updated);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const delProject = useCallback(async (id) => {
    await deleteProject(id);
    store.removeProject(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const newDocument = useCallback(async (type, parentId) => {
    // Read fresh state at call time — avoids stale closure over store.documents
    // when documents are added/removed within the same project session.
    const { activeProjectId, documents } = useBinderStore.getState();
    if (!activeProjectId) return;
    const siblings = documents.filter((d) => (d.parent_id ?? null) === (parentId ?? null));
    const maxOrder = siblings.reduce((m, d) => Math.max(m, d.sort_order), -1);
    const doc = await createDocument(activeProjectId, {
      title: nextDocTitle(documents, type),
      type,
      parent_id: parentId ?? null,
      sort_order: maxOrder + 1,
    });
    store.addDocument(doc);
    // Expand parent folder if it isn't already open (toggleExpanded would collapse it)
    if (parentId) {
      const { expandedIds } = useBinderStore.getState();
      if (!expandedIds.has(parentId)) store.toggleExpanded(parentId);
    }
    return doc;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const renDocument = useCallback(async (id, title) => {
    const updated = await updateDocument(id, { title });
    store.updateDocumentInStore(updated);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const delDocument = useCallback(async (id) => {
    await deleteDocument(id);
    store.removeDocument(id);
    // Also remove descendants from local state
    useBinderStore.setState((s) => ({
      documents: s.documents.filter((d) => !isDescendant(s.documents, id, d.id)),
    }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const moveDocument = useCallback(async (id, parentId, sortOrder) => {
    const updated = await updateDocument(id, { parent_id: parentId, sort_order: sortOrder });
    store.updateDocumentInStore(updated);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const bulkReorder = useCallback(async (items) => {
    // Optimistically update store
    items.forEach(({ id, sort_order }) => store.updateDocumentInStore({ id, sort_order }));
    await reorderDocuments(items);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Label CRUD ────────────────────────────────────────────────────────────────

  const newLabel = useCallback(async (projectId, name, color) => {
    const label = await createLabel(projectId, { name, color });
    store.addLabel(label);
    return label;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const renLabel = useCallback(async (id, name, color) => {
    const updated = await updateLabel(id, { name, color });
    store.updateLabelInStore(updated);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const delLabel = useCallback(async (id) => {
    await deleteLabel(id);
    store.removeLabelInStore(id);
    // Clear label_id from any documents that had it assigned
    useBinderStore.setState((s) => ({
      documents: s.documents.map((d) => d.label_id === id ? { ...d, label_id: null } : d),
    }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Status CRUD ───────────────────────────────────────────────────────────────

  const newStatus = useCallback(async (projectId, name, color) => {
    const status = await createStatus(projectId, { name, color });
    store.addStatus(status);
    return status;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const renStatus = useCallback(async (id, name, color) => {
    const updated = await updateStatus(id, { name, color });
    store.updateStatusInStore(updated);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const delStatus = useCallback(async (id) => {
    await deleteStatus(id);
    store.removeStatusInStore(id);
    // Clear status_id from any documents that had it assigned
    useBinderStore.setState((s) => ({
      documents: s.documents.map((d) => d.status_id === id ? { ...d, status_id: null } : d),
    }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Doc assignment ────────────────────────────────────────────────────────────

  const patchDocument = useCallback(async (id, fields) => {
    const updated = await updateDocument(id, fields);
    store.updateDocumentInStore(updated);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setDocLabel = useCallback(async (docId, labelId) => {
    const updated = await updateDocument(docId, { label_id: labelId });
    store.updateDocumentInStore(updated);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setDocStatus = useCallback(async (docId, statusId) => {
    const updated = await updateDocument(docId, { status_id: statusId });
    store.updateDocumentInStore(updated);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    projects:        store.projects,
    activeProjectId: store.activeProjectId,
    documents:       store.documents,
    activeDocId:     store.activeDocId,
    expandedIds:     store.expandedIds,
    labels:          store.labels,
    statuses:        store.statuses,
    setActiveProject: activateProject,
    setActiveDoc:    store.setActiveDoc,
    toggleExpanded:  store.toggleExpanded,
    newProject,
    registerImportedProject,
    refreshProjects,
    renProject,
    delProject,
    newDocument,
    renDocument,
    patchDocument,
    delDocument,
    moveDocument,
    bulkReorder,
    newLabel,
    renLabel,
    delLabel,
    newStatus,
    renStatus,
    delStatus,
    setDocLabel,
    setDocStatus,
  };
}

// Returns true if `candidateId` is a descendant of `ancestorId`
function isDescendant(docs, ancestorId, candidateId) {
  let current = docs.find((d) => d.id === candidateId);
  while (current) {
    if (current.parent_id === ancestorId) return true;
    current = docs.find((d) => d.id === current.parent_id);
  }
  return false;
}
