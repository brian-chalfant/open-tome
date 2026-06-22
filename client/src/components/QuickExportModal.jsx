// ============================================================
// QuickExportModal.jsx
// ============================================================
// Purpose:   Lightweight export modal for exporting a single binder
//            document without opening the full Compile modal.
//            The user picks a format and downloads immediately.
// Used by:   Binder.jsx — opened from the right-click context menu
//            on any scene, character, or research node.
// Exports:   QuickExportModal (default)
// Notes:     Reuses the same /api/projects/:id/compile endpoint as
//            CompileModal, but sends only one documentId. The blob
//            download trick (create URL → click anchor → revoke) is
//            the standard cross-browser way to trigger a file save
//            from a fetch response.
// ============================================================

import { useState } from 'react';
import { useBinderStore } from '../store/binderStore.js';
import api from '../api/axios.js';
import '../styles/quick-export-modal.css';

// --- CONSTANTS -----------------------------------------------

// The four formats this modal offers. Manuscript DOCX is omitted here
// because it requires author metadata set up in the full Compile modal.
const FORMATS = [
  { value: 'pdf',      label: 'PDF' },
  { value: 'docx',     label: 'DOCX' },
  { value: 'epub',     label: 'ePub' },
  { value: 'markdown', label: 'Markdown' },
];

// Fallback file extension if the server Content-Disposition header is missing.
const EXT_MAP = { pdf: 'pdf', docx: 'docx', epub: 'epub', markdown: 'md' };

// --- COMPONENT -----------------------------------------------

// Modal for exporting a single document from the binder context menu.
// Props:
//   docId    — the document to export
//   docTitle — shown in the modal header so the user can confirm the right doc
//   onClose  — called after a successful download or when the user cancels
export default function QuickExportModal({ docId, docTitle, onClose }) {
  // Pull the active project ID from the store — needed for the API route.
  const projectId = useBinderStore((s) => s.activeProjectId);

  const [format, setFormat]   = useState('pdf');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  // --- HANDLERS ------------------------------------------------

  // POST the compile request, receive a binary blob, and trigger a browser download.
  // The server sets Content-Disposition: attachment; filename="..." so we use that
  // filename directly rather than constructing one on the client.
  const handleExport = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.post(
        `/api/projects/${projectId}/compile`,
        { documentIds: [docId], format },
        // Tell axios to keep the response as a binary blob, not a string.
        { responseType: 'blob' },
      );

      // Extract the server-provided filename from the Content-Disposition header.
      const cd = response.headers['content-disposition'] ?? '';
      const match = cd.match(/filename="?([^";]+)"?/);
      const filename = match ? match[1] : `export.${EXT_MAP[format]}`;

      // Standard browser download: create a temporary object URL, click a hidden
      // anchor to trigger the Save dialog, then immediately clean up the URL.
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
      setError('Export failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // --- RENDER --------------------------------------------------

  return (
    // Clicking the backdrop closes the modal.
    <div className="qe-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      {/* Clicks inside the modal card don't bubble to the backdrop. */}
      <div className="qe-modal" onClick={(e) => e.stopPropagation()}>

        <div className="qe-header">
          <h2 className="qe-title">Export: {docTitle || 'Untitled'}</h2>
          <button className="qe-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="qe-body">
          <p className="qe-label">Format</p>
          {/* Pill-style radio group — the hidden <input> drives state,
              the <label> provides the visible clickable surface. */}
          <div className="qe-formats">
            {FORMATS.map(({ value, label }) => (
              <label key={value} className={`qe-format-option${format === value ? ' qe-format-option--active' : ''}`}>
                <input
                  type="radio"
                  name="qe-format"
                  value={value}
                  checked={format === value}
                  onChange={() => setFormat(value)}
                />
                {label}
              </label>
            ))}
          </div>
          {error && <p className="qe-error">{error}</p>}
        </div>

        <div className="qe-footer">
          <button className="qe-btn qe-btn--secondary" onClick={onClose}>Cancel</button>
          <button className="qe-btn qe-btn--primary" onClick={handleExport} disabled={loading}>
            {loading ? 'Exporting…' : 'Export'}
          </button>
        </div>

      </div>
    </div>
  );
}
