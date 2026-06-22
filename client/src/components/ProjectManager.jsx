// ============================================================
// ProjectManager.jsx
// ============================================================
// Purpose:   Modal orchestrator for project management.
//            Owns the project list state, create/import mutations,
//            and composes ProjectListPanel + LabelStatusEditor.
// Used by:   Binder.jsx (⊞ button in binder header)
// Exports:   default ProjectManager(props)
// Notes:     `projects` state is lifted here (not in ProjectListPanel)
//            so that create and import can prepend to the list.
//            Label/status state lives entirely in LabelStatusEditor.
// ============================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { getAllProjects, createProject, importProject } from '../api/projects.js';
import ProjectListPanel from './ProjectListPanel.jsx';
import LabelStatusEditor from './LabelStatusEditor.jsx';
import ZipExportModal from './ZipExportModal.jsx';
import '../styles/projects.css';
import '../styles/labels.css';

export default function ProjectManager({ isOpen, onClose, activeProjectId, onActivate, onProjectsChanged }) {
  const [projects,  setProjects]  = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [newTitle,  setNewTitle]  = useState('');
  const [creating,  setCreating]  = useState(false);
  const [importing, setImporting] = useState(false);
  // zipProject = { id, title } | null — drives the ZipExportModal portal
  const [zipProject, setZipProject] = useState(null);

  const importRef = useRef(null);

  // --- DATA LOADING ------------------------------------------

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all = await getAllProjects();
      setProjects(all);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isOpen) load();
  }, [isOpen, load]);

  // --- KEYBOARD ----------------------------------------------

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // --- MUTATIONS ---------------------------------------------

  const handleCreate = async () => {
    const title = newTitle.trim();
    if (!title || creating) return;
    setCreating(true);
    try {
      const project = await createProject(title);
      setProjects((ps) => [project, ...ps]);
      setNewTitle('');
      onProjectsChanged?.();
      onActivate?.(project);
      onClose();
    } finally {
      setCreating(false);
    }
  };

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setImporting(true);
    try {
      const project = await importProject(file);
      setProjects((ps) => [project, ...ps]);
      onProjectsChanged?.();
      onActivate?.(project);
      onClose();
    } catch {
      alert('Import failed — make sure the file is a valid Tome project export.');
    } finally {
      setImporting(false);
    }
  };

  // --- RENDER ------------------------------------------------

  if (!isOpen) return null;

  return <>
    { createPortal(
      <div className="pm-overlay" onClick={onClose} role="presentation">
        <div
          className="pm-modal"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="Project Manager"
        >
          {/* ── Header ──────────────────────────────────────────── */}
          <header className="pm-header">
            <h2 className="pm-title">Projects</h2>
            <button className="pm-close-btn" onClick={onClose} aria-label="Close">✕</button>
          </header>

          {/* ── Project list ────────────────────────────────────── */}
          <div className="pm-body">
            <ProjectListPanel
              projects={projects}
              setProjects={setProjects}
              loading={loading}
              activeProjectId={activeProjectId}
              onClose={onClose}
              onActivate={onActivate}
              onProjectsChanged={onProjectsChanged}
              onZipExport={setZipProject}
            />
          </div>

          {/* ── Labels & Statuses ───────────────────────────────── */}
          <LabelStatusEditor activeProjectId={activeProjectId} isOpen={isOpen} />

          {/* ── Footer ──────────────────────────────────────────── */}
          <footer className="pm-footer">
            <button
              className="pm-footer-btn pm-import-btn"
              onClick={() => importRef.current?.click()}
              disabled={importing}
              title="Import a project from an exported JSON file"
            >
              {importing ? 'Importing…' : '↑ Import'}
            </button>
            <input
              ref={importRef}
              type="file"
              accept=".json,application/json"
              style={{ display: 'none' }}
              onChange={handleImportFile}
              aria-hidden="true"
            />
            <input
              className="pm-new-input"
              placeholder="New project title…"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
              aria-label="New project title"
              maxLength={200}
            />
            <button
              className="pm-footer-btn pm-create-btn"
              onClick={handleCreate}
              disabled={creating || !newTitle.trim()}
            >
              {creating ? '…' : '＋ Create'}
            </button>
          </footer>
        </div>
      </div>,
      document.body
    ) }
    { zipProject && createPortal(
      <ZipExportModal
        projectId={zipProject.id}
        projectTitle={zipProject.title}
        onClose={() => setZipProject(null)}
      />,
      document.body
    ) }
  </>;
}
