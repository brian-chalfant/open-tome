// ============================================================
// ZipExportModal.jsx
// ============================================================
// Purpose:   Format-picker modal for downloading a project as a
//            human-readable ZIP archive. The user picks TXT, RTF,
//            or DOCX; each document in the binder becomes a file
//            in that format, mirroring the folder tree exactly.
// Used by:   ProjectManager.jsx — opened from the ⬇ ZIP button
//            on each project row.
// Exports:   ZipExportModal (default)
// ============================================================

import { useState } from 'react';
import { downloadProjectZip } from '../api/projects.js';
import '../styles/zip-export-modal.css';

const FORMATS = [
  { value: 'txt',  label: 'TXT',  desc: 'Plain text, opens anywhere' },
  { value: 'rtf',  label: 'RTF',  desc: 'Formatted, opens in any word processor' },
  { value: 'docx', label: 'DOCX', desc: 'Full formatting, opens in Word' },
];

// Modal for downloading a project as a ZIP archive.
// Props:
//   projectId    — numeric ID of the project to archive
//   projectTitle — shown in the header
//   onClose      — called after download completes or user cancels
export default function ZipExportModal({ projectId, projectTitle, onClose }) {
  const [format,  setFormat]  = useState('txt');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const handleDownload = async () => {
    setLoading(true);
    setError(null);
    try {
      await downloadProjectZip(projectId, projectTitle, format);
      onClose();
    } catch {
      setError('Download failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ze-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="ze-modal" onClick={(e) => e.stopPropagation()}>

        <div className="ze-header">
          <h2 className="ze-title">Download ZIP: {projectTitle || 'Untitled'}</h2>
          <button className="ze-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="ze-body">
          <p className="ze-label">Document format</p>
          <div className="ze-formats">
            {FORMATS.map(({ value, label, desc }) => (
              <label
                key={value}
                className={`ze-format-option${format === value ? ' ze-format-option--active' : ''}`}
                title={desc}
              >
                <input
                  type="radio"
                  name="ze-format"
                  value={value}
                  checked={format === value}
                  onChange={() => setFormat(value)}
                />
                <span className="ze-format-label">{label}</span>
                <span className="ze-format-desc">{desc}</span>
              </label>
            ))}
          </div>
          {error && <p className="ze-error">{error}</p>}
        </div>

        <div className="ze-footer">
          <button className="ze-btn ze-btn--secondary" onClick={onClose}>Cancel</button>
          <button className="ze-btn ze-btn--primary" onClick={handleDownload} disabled={loading}>
            {loading ? 'Building ZIP…' : 'Download ZIP'}
          </button>
        </div>

      </div>
    </div>
  );
}
