// ============================================================
// ProjectListPanel.jsx
// ============================================================
// Purpose:   Renders the active and archived project lists inside
//            ProjectManager, and owns the rename/delete/archive/goals
//            mutation handlers. Extracted from ProjectManager.jsx to
//            give it a single responsibility.
// Used by:   ProjectManager.jsx
// Exports:   default ProjectListPanel(props)
// Notes:     `projects` and `setProjects` are lifted to ProjectManager
//            so the footer (create/import) can also update the list.
//            `onZipExport` bubbles up to ProjectManager which owns
//            the ZipExportModal portal.
// ============================================================

import { useState, useEffect } from 'react';
import {
  renameProject, deleteProject, archiveProject, updateProjectTargets, exportProject,
} from '../api/projects.js';
import { useBinderStore } from '../store/binderStore.js';

// --- COMPONENT -----------------------------------------------

export default function ProjectListPanel({
  projects, setProjects,
  loading,
  activeProjectId,
  onClose, onActivate, onProjectsChanged, onZipExport,
}) {
  const [renamingId,      setRenamingId]      = useState(null);
  const [renameValue,     setRenameValue]     = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [showArchived,    setShowArchived]    = useState(false);

  const active   = projects.filter((p) => !p.archived);
  const archived = projects.filter((p) =>  p.archived);

  // --- HANDLERS ------------------------------------------------

  const handleRename = async (id) => {
    const title = renameValue.trim();
    if (title) {
      await renameProject(id, title);
      setProjects((ps) => ps.map((p) => (p.id === id ? { ...p, title } : p)));
      onProjectsChanged?.();
    }
    setRenamingId(null);
  };

  const handleDelete = async (id) => {
    await deleteProject(id);
    setProjects((ps) => ps.filter((p) => p.id !== id));
    setConfirmDeleteId(null);
    onProjectsChanged?.();
  };

  const handleArchive = async (id, archive) => {
    await archiveProject(id, archive);
    setProjects((ps) => ps.map((p) => (p.id === id ? { ...p, archived: archive } : p)));
    onProjectsChanged?.();
  };

  const handleSaveTargets = async (id, targetWords, deadline) => {
    const updated = await updateProjectTargets(id, targetWords || null, deadline || null);
    setProjects((ps) => ps.map((p) => (p.id === id ? { ...p, ...updated } : p)));
    onProjectsChanged?.();
  };

  // --- RENDER --------------------------------------------------

  if (loading) return <p className="pm-loading">Loading…</p>;

  return (
    <>
      {/* Active projects */}
      <section className="pm-section">
        <div className="pm-section-header">
          <span className="pm-section-title">
            Active
            <span className="pm-count">{active.length}</span>
          </span>
        </div>
        {active.length === 0 ? (
          <p className="pm-empty">No active projects — create one below.</p>
        ) : (
          <ul className="pm-list" role="list">
            {active.map((p) => (
              <ProjectRow
                key={p.id}
                project={p}
                isActive={p.id === activeProjectId}
                renamingId={renamingId}
                renameValue={renameValue}
                confirmDeleteId={confirmDeleteId}
                onStartRename={() => { setRenamingId(p.id); setRenameValue(p.title); }}
                onRenameChange={setRenameValue}
                onRenameSubmit={() => handleRename(p.id)}
                onRenameCancel={() => setRenamingId(null)}
                onExport={() => exportProject(p.id, p.title)}
                onZipExport={() => onZipExport({ id: p.id, title: p.title })}
                onArchive={() => handleArchive(p.id, true)}
                onConfirmDelete={() => { setConfirmDeleteId(p.id); setRenamingId(null); }}
                onCancelDelete={() => setConfirmDeleteId(null)}
                onDelete={() => handleDelete(p.id)}
                onActivate={() => { onActivate?.(p); onClose(); }}
                onSaveTargets={(tw, dl) => handleSaveTargets(p.id, tw, dl)}
                isArchived={false}
              />
            ))}
          </ul>
        )}
      </section>

      {/* Archived projects */}
      <section className="pm-section pm-section--archived">
        <button
          className="pm-section-header pm-section-toggle"
          onClick={() => setShowArchived((v) => !v)}
          aria-expanded={showArchived}
          disabled={archived.length === 0}
        >
          <span className="pm-section-title">
            Archived
            <span className="pm-count">{archived.length}</span>
          </span>
          {archived.length > 0 && (
            <span className="pm-chevron" aria-hidden="true">{showArchived ? '▲' : '▼'}</span>
          )}
        </button>
        {showArchived && archived.length > 0 && (
          <ul className="pm-list" role="list">
            {archived.map((p) => (
              <ProjectRow
                key={p.id}
                project={p}
                isActive={false}
                renamingId={renamingId}
                renameValue={renameValue}
                confirmDeleteId={confirmDeleteId}
                onStartRename={() => { setRenamingId(p.id); setRenameValue(p.title); }}
                onRenameChange={setRenameValue}
                onRenameSubmit={() => handleRename(p.id)}
                onRenameCancel={() => setRenamingId(null)}
                onExport={() => exportProject(p.id, p.title)}
                onZipExport={() => onZipExport({ id: p.id, title: p.title })}
                onRestore={() => handleArchive(p.id, false)}
                onConfirmDelete={() => { setConfirmDeleteId(p.id); setRenamingId(null); }}
                onCancelDelete={() => setConfirmDeleteId(null)}
                onDelete={() => handleDelete(p.id)}
                onSaveTargets={(tw, dl) => handleSaveTargets(p.id, tw, dl)}
                isArchived={true}
              />
            ))}
          </ul>
        )}
        {showArchived && archived.length === 0 && (
          <p className="pm-empty">No archived projects.</p>
        )}
      </section>
    </>
  );
}

// --- SUB-COMPONENTS ------------------------------------------

// Renders a single project row with rename, action buttons, and goals inline form.
function ProjectRow({
  project, isActive,
  renamingId, renameValue, confirmDeleteId,
  onStartRename, onRenameChange, onRenameSubmit, onRenameCancel,
  onExport, onZipExport, onArchive, onRestore,
  onConfirmDelete, onCancelDelete, onDelete,
  onActivate, onSaveTargets, isArchived,
}) {
  const isRenaming   = renamingId   === project.id;
  const isConfirming = confirmDeleteId === project.id;

  const [showGoals,   setShowGoals]   = useState(false);
  const [targetWords, setTargetWords] = useState(project.target_words ?? '');
  const [deadline,    setDeadline]    = useState(project.deadline ? project.deadline.slice(0, 10) : '');

  const requestGoalsOpen    = useBinderStore((s) => s.requestGoalsOpen);
  const setRequestGoalsOpen = useBinderStore((s) => s.setRequestGoalsOpen);

  // Open the goals form when TargetsWidget's "Set goal →" button is clicked.
  useEffect(() => {
    if (isActive && requestGoalsOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowGoals(true);
      setRequestGoalsOpen(false);
    }
  }, [isActive, requestGoalsOpen, setRequestGoalsOpen]);

  const handleGoalsSave = async () => {
    await onSaveTargets(targetWords ? Number(targetWords) : null, deadline || null);
    setShowGoals(false);
  };

  return (
    <li className={`pm-row${isActive ? ' pm-row--active' : ''}`}>
      {/* Title — click to open, double-click to rename */}
      <div className="pm-row-title">
        {isRenaming ? (
          <input
            autoFocus
            className="pm-rename-input"
            value={renameValue}
            onChange={(e) => onRenameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter')  onRenameSubmit();
              if (e.key === 'Escape') onRenameCancel();
            }}
            onBlur={onRenameSubmit}
            maxLength={200}
            aria-label="Rename project"
          />
        ) : (
          <button
            className="pm-title-btn"
            onClick={isArchived ? undefined : onActivate}
            onDoubleClick={onStartRename}
            title={isArchived ? 'Double-click to rename' : 'Click to open · Double-click to rename'}
          >
            {isActive && <span className="pm-active-dot" aria-label="Active" />}
            {project.title}
          </button>
        )}
      </div>

      {/* Last-updated timestamp */}
      <time className="pm-row-date" dateTime={project.updated_at}>
        {formatRelative(project.updated_at)}
      </time>

      {/* Action buttons */}
      <div className="pm-row-actions">
        {isConfirming ? (
          <>
            <span className="pm-confirm-label">Delete?</span>
            <button className="pm-action-btn pm-action-btn--danger" onClick={onDelete}>Yes</button>
            <button className="pm-action-btn" onClick={onCancelDelete}>No</button>
          </>
        ) : (
          <>
            <button
              className={`pm-action-btn${showGoals ? ' pm-action-btn--active' : ''}`}
              title="Set word count target and deadline"
              onClick={() => setShowGoals((v) => !v)}
              aria-expanded={showGoals}
            >
              Goals
            </button>
            <button className="pm-action-btn" title="Export as JSON" onClick={onExport}>↓ JSON</button>
            <button className="pm-action-btn" title="Download as ZIP archive" onClick={onZipExport}>⬇ ZIP</button>
            {isArchived
              ? <button className="pm-action-btn pm-action-btn--restore" title="Restore to active" onClick={onRestore}>Restore</button>
              : <button className="pm-action-btn" title="Archive project" onClick={onArchive}>Archive</button>
            }
            <button className="pm-action-btn pm-action-btn--danger" title="Delete project permanently" onClick={onConfirmDelete}>Delete</button>
          </>
        )}
      </div>

      {/* Goals inline form */}
      {showGoals && (
        <div className="pm-goals-form">
          <label className="pm-goals-label">
            Word target
            <input
              type="number"
              className="pm-goals-input"
              placeholder="e.g. 80000"
              min="1"
              value={targetWords}
              onChange={(e) => setTargetWords(e.target.value)}
            />
          </label>
          <label className="pm-goals-label">
            Deadline
            <input
              type="date"
              className="pm-goals-input"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </label>
          <div className="pm-goals-actions">
            <button className="pm-action-btn pm-action-btn--save" onClick={handleGoalsSave}>Save</button>
            <button className="pm-action-btn" onClick={() => setShowGoals(false)}>Cancel</button>
            {(project.target_words || project.deadline) && (
              <button
                className="pm-action-btn pm-action-btn--danger"
                onClick={() => { setTargetWords(''); setDeadline(''); onSaveTargets(null, null); setShowGoals(false); }}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

// --- HELPERS -------------------------------------------------

// Format an ISO timestamp as a human-friendly relative string.
function formatRelative(iso) {
  if (!iso) return '';
  const diffMs   = Date.now() - new Date(iso).getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7)   return `${diffDays}d ago`;
  if (diffDays < 30)  return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}
