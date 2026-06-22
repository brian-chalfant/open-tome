/**
 * @file api/projects.js
 * @description Thin wrapper functions for all Projects and Documents API endpoints.
 * Each function returns the response data directly (not the Axios response object).
 */

import api from './axios.js';

// ── Projects ──────────────────────────────────────────────────────────────────

/** @returns {Promise<Object[]>} Non-archived projects (binder list). */
export const getProjects      = ()             => api.get('/api/projects').then(r => r.data);

/** @returns {Promise<Object[]>} All projects including archived (project manager). */
export const getAllProjects    = ()             => api.get('/api/projects/all').then(r => r.data);

/** @param {number} id @param {boolean} archived @returns {Promise<Object>} Updated project record. */
export const archiveProject   = (id, archived) => api.patch(`/api/projects/${id}/archive`, { archived }).then(r => r.data);

/** @param {number} id @param {number|null} targetWords @param {string|null} deadline @returns {Promise<Object>} Updated project record. */
export const updateProjectTargets = (id, targetWords, deadline) =>
  api.patch(`/api/projects/${id}/targets`, { target_words: targetWords, deadline }).then(r => r.data);

/** @param {string} title @returns {Promise<Object>} Newly created project record. */
export const createProject    = (title)        => api.post('/api/projects', { title }).then(r => r.data);

/** @param {number} id @param {string} title @returns {Promise<Object>} Updated project record. */
export const renameProject    = (id, title)    => api.patch(`/api/projects/${id}`, { title }).then(r => r.data);

/** @param {number} id @returns {Promise<void>} */
export const deleteProject    = (id)           => api.delete(`/api/projects/${id}`);

// ── Documents ─────────────────────────────────────────────────────────────────

/** @param {number} projectId @returns {Promise<Object[]>} Full document tree array. */
export const getDocuments     = (projectId)    => api.get(`/api/projects/${projectId}/documents`).then(r => r.data);

/** @param {number} projectId @param {{title: string, type: string, parent_id?: number|null}} d @returns {Promise<Object>} Created document. */
export const createDocument   = (projectId, d) => api.post(`/api/projects/${projectId}/documents`, d).then(r => r.data);

/** @param {number} id @param {{title?: string, parent_id?: number|null, sort_order?: number}} d @returns {Promise<Object>} Updated document. */
export const updateDocument   = (id, d)        => api.patch(`/api/documents/${id}`, d).then(r => r.data);

/** @param {number} id @returns {Promise<void>} */
export const deleteDocument   = (id)           => api.delete(`/api/documents/${id}`);

/** @param {Array<{id: number, sort_order: number, parent_id: number|null}>} items @returns {Promise<void>} */
export const reorderDocuments = (items)        => api.patch('/api/documents/reorder', items);

// ── Import / Export ───────────────────────────────────────────────────────────

/**
 * Download the full project (documents + notes) as a JSON file.
 * Triggers a browser file-save dialog.
 * @param {number} id
 * @param {string} title - Used as the suggested filename.
 */
export const exportProject = async (id, title) => {
  const response = await api.get(`/api/projects/${id}/export`, { responseType: 'blob' });
  const url = URL.createObjectURL(response.data);
  const a = document.createElement('a');
  a.href = url;
  const disposition = response.headers['content-disposition'] ?? '';
  const match = disposition.match(/filename="([^"]+)"/);
  a.download = match ? match[1] : `${title || 'project'}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

/**
 * Download the full project as a ZIP archive with documents laid out as the binder tree.
 * Each document is exported in the chosen format (txt, rtf, or docx).
 * This is a non-reimportable human-readable backup — the JSON export is unchanged.
 * @param {number} id
 * @param {string} title  - Used as fallback filename.
 * @param {'txt'|'rtf'|'docx'} format
 */
export const downloadProjectZip = async (id, title, format = 'txt') => {
  const response = await api.get(`/api/projects/${id}/archive`, {
    params:       { format },
    responseType: 'blob',
  });
  const cd       = response.headers['content-disposition'] ?? '';
  const match    = cd.match(/filename="?([^";]+)"?/);
  const filename = match ? match[1] : `${title || 'project'}.zip`;
  const url      = URL.createObjectURL(new Blob([response.data]));
  const a        = document.createElement('a');
  a.href         = url;
  a.download     = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

/**
 * Import a project from an exported .json file.
 * @param {File} file - The File object from a file input.
 * @returns {Promise<Object>} The newly created project record.
 */
export const importProject = async (file) => {
  const text = await file.text();
  const data = JSON.parse(text);
  return api.post('/api/projects/import', data).then((r) => r.data);
};

// ── Labels ────────────────────────────────────────────────────────────────────

export const getLabels    = (projectId)    => api.get(`/api/projects/${projectId}/labels`).then(r => r.data);
export const createLabel  = (projectId, d) => api.post(`/api/projects/${projectId}/labels`, d).then(r => r.data);
export const updateLabel  = (id, d)        => api.patch(`/api/labels/${id}`, d).then(r => r.data);
export const deleteLabel  = (id)           => api.delete(`/api/labels/${id}`);

// ── Statuses ──────────────────────────────────────────────────────────────────

export const getStatuses  = (projectId)    => api.get(`/api/projects/${projectId}/statuses`).then(r => r.data);
export const createStatus = (projectId, d) => api.post(`/api/projects/${projectId}/statuses`, d).then(r => r.data);
export const updateStatus = (id, d)        => api.patch(`/api/statuses/${id}`, d).then(r => r.data);
export const deleteStatus = (id)           => api.delete(`/api/statuses/${id}`);

// ── Document Content ──────────────────────────────────────────────────────────

/** @param {number} id @returns {Promise<{content: string|null, word_count: number}>} Document content object. */
export const getDocumentContent    = (id)                  => api.get(`/api/documents/${id}/content`).then(r => r.data);

/**
 * REST fallback for saving document content (used when WebSocket is unavailable).
 * @param {number} id
 * @param {string} content      - ProseMirror JSON string.
 * @param {number} wordCount    - Current word count.
 * @returns {Promise<Object>}
 */
export const updateDocumentContent = (id, content, wordCount) =>
  api.patch(`/api/documents/${id}/content`, { content, word_count: wordCount }).then(r => r.data);

// ── Search ────────────────────────────────────────────────────────────────────

/**
 * Search all documents in a project for a given term.
 * Returns matched documents with context snippets around each hit.
 * @param {number} projectId
 * @param {string} term
 * @param {{ caseSensitive?: boolean, wholeWord?: boolean }} opts
 * @returns {Promise<{ results: { id: number, title: string, type: string, matches: object[] }[] }>}
 */
export const searchProject = (projectId, term, { caseSensitive = false, wholeWord = false } = {}) =>
  api.post(`/api/projects/${projectId}/search`, { term, caseSensitive, wholeWord }).then(r => r.data);
