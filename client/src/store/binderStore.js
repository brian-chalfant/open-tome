/**
 * @file store/binderStore.js
 * @description Zustand store for binder (project + document tree) state.
 *
 * State shape:
 *   projects        - Array of all projects owned by the current user.
 *   activeProjectId - ID of the currently selected project.
 *   documents       - Flat array of all documents for the active project (tree built on render).
 *   activeDocId     - ID of the currently selected (open) document.
 *   expandedIds     - Set of folder document IDs that are expanded in the binder UI.
 *                     Persisted to localStorage per project.
 *
 * Modal / panel visibility (moved from AppPage local state):
 *   compileOpen     - Compile & Export modal.
 *   targetsOpen     - Writing Targets widget. Persisted to localStorage.
 *   sprintOpen      - Sprint Timer panel.
 *   corkboardActive - Corkboard view mode. Persisted to localStorage.
 */

import { create } from 'zustand';
import { prefs } from '../utils/storage.js';

/**
 * Load the set of expanded folder IDs for a given project.
 * Falls back to an empty Set if localStorage is unavailable or the data is corrupt.
 *
 * @param {number} projectId
 * @returns {Set<number>}
 */
function loadExpanded(projectId) {
  return new Set(prefs.binderExpanded(projectId).get());
}

/**
 * Persist the current set of expanded folder IDs.
 *
 * @param {number}     projectId
 * @param {Set<number>} set - The expanded IDs to save.
 */
function saveExpanded(projectId, set) {
  prefs.binderExpanded(projectId).set([...set]);
}

export const useBinderStore = create((set, get) => ({
  projects:        [],
  activeProjectId: null,
  documents:       [],   // flat from server; tree is built on render
  activeDocId:     null,
  expandedIds:     new Set(),
  labels:          [],
  statuses:        [],
  requestGoalsOpen: false,

  setRequestGoalsOpen: (v) => set({ requestGoalsOpen: v }),

  // ── Modal / panel visibility ──────────────────────────────────────────────
  // Centralised here so any component (e.g. TargetsWidget's "Set goal" button)
  // can open or close a panel without prop-drilling through AppPage.

  compileOpen:     false,
  setCompileOpen:  (v) => set({ compileOpen: v }),

  // targetsOpen and corkboardActive are persisted to localStorage so they
  // survive page reloads. prefs.X.get() is called once at store creation time.
  targetsOpen:     prefs.targetsOpen.get(),
  toggleTargets:   () => set((s) => {
    const v = !s.targetsOpen;
    prefs.targetsOpen.set(v);
    return { targetsOpen: v };
  }),

  sprintOpen:      false,
  setSprintOpen:   (v) => set({ sprintOpen: v }),

  corkboardActive: prefs.corkboardActive.get(),
  toggleCorkboard: () => set((s) => {
    const v = !s.corkboardActive;
    prefs.corkboardActive.set(v);
    return { corkboardActive: v };
  }),

  setProjects: (projects) => set({ projects }),

  setActiveProject: (projectId) => {
    const expanded = loadExpanded(projectId);
    set({ activeProjectId: projectId, documents: [], activeDocId: null, expandedIds: expanded, labels: [], statuses: [] });
  },

  setDocuments: (documents) => set({ documents }),

  setActiveDoc: (docId) => set({ activeDocId: docId }),

  // Increment the version counter for a document after an external mutation
  // (e.g. find-and-replace). AppPage includes this in the Editor key so the
  // Editor remounts and reloads fresh content from the server.
  docVersions: {},
  bumpDocVersion: (docId) => set((s) => ({
    docVersions: { ...s.docVersions, [docId]: (s.docVersions[docId] ?? 0) + 1 },
  })),

  setLabels:  (labels)   => set({ labels }),
  setStatuses:(statuses) => set({ statuses }),

  addLabel:   (l) => set((s) => ({ labels:   [...s.labels,   l] })),
  addStatus:  (newStatus) => set((s) => ({ statuses: [...s.statuses, newStatus] })),

  updateLabelInStore:  (l) => set((s) => ({ labels:   s.labels.map(x   => x.id === l.id ? l : x) })),
  updateStatusInStore: (u) => set((s) => ({ statuses: s.statuses.map(x => x.id === u.id ? u : x) })),

  removeLabelInStore:  (id) => set((s) => ({ labels:   s.labels.filter(l => l.id !== id) })),
  removeStatusInStore: (id) => set((s) => ({ statuses: s.statuses.filter(s => s.id !== id) })),

  toggleExpanded: (docId) => {
    const { expandedIds, activeProjectId } = get();
    const next = new Set(expandedIds);
    if (next.has(docId)) next.delete(docId);
    else next.add(docId);
    saveExpanded(activeProjectId, next);
    set({ expandedIds: next });
  },

  addProject: (project) =>
    set((s) => ({ projects: [project, ...s.projects] })),

  removeProject: (id) =>
    set((s) => ({
      projects:        s.projects.filter((p) => p.id !== id),
      activeProjectId: s.activeProjectId === id ? null : s.activeProjectId,
      documents:       s.activeProjectId === id ? [] : s.documents,
    })),

  updateProject: (updated) =>
    set((s) => ({ projects: s.projects.map((p) => (p.id === updated.id ? updated : p)) })),

  addDocument: (doc) => set((s) => ({ documents: [...s.documents, doc] })),

  removeDocument: (id) =>
    set((s) => ({ documents: s.documents.filter((d) => d.id !== id) })),

  updateDocumentInStore: (updated) =>
    set((s) => ({ documents: s.documents.map((d) => (d.id === updated.id ? { ...d, ...updated } : d)) })),
}));
