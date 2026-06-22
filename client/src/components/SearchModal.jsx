// ============================================================
// SearchModal.jsx
// ============================================================
// Purpose:   Project-wide find & replace modal. Searches all documents
//            in the active project server-side, shows match context,
//            and applies plain-text replacements by walking ProseMirror JSON.
// Used by:   Editor.jsx — rendered when searchOpen is true (Ctrl+H)
// Exports:   SearchModal (default)
// Notes:     Replace mutates ProseMirror JSON text nodes directly and saves
//            via the existing REST endpoint. Cross-node matches (term split
//            across two adjacent text nodes with different marks) are skipped
//            in v1 — they are rare in practice.
// ============================================================

import { useState } from 'react';
import { useBinderStore } from '../store/binderStore.js';
import { searchProject, getDocumentContent, updateDocumentContent } from '../api/projects.js';
import '../styles/search-modal.css';

// --- HELPERS -------------------------------------------------

// Escape a string for literal use inside a RegExp constructor.
// Needed so that punctuation in the search term is treated as plain text.
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Build a RegExp that mirrors the server-side findMatches logic so that
// replacements hit exactly the same text the search results highlighted.
function buildRegex(term, { caseSensitive, wholeWord }) {
  const escaped = escapeRegex(term);
  const pattern = wholeWord ? `\\b${escaped}\\b` : escaped;
  const flags   = caseSensitive ? 'g' : 'gi';
  return new RegExp(pattern, flags);
}

// Walk a ProseMirror JSON tree and replace all occurrences of term in text nodes.
// Only the `text` field of leaf nodes is modified; marks (bold, italic, etc.) are
// preserved because the node structure itself is unchanged.
function replaceInProseMirrorJson(jsonStr, term, replacement, opts) {
  const re = buildRegex(term, opts);

  function walk(node) {
    if (!node) return node;
    if (node.type === 'text' && typeof node.text === 'string') {
      return { ...node, text: node.text.replace(re, replacement) };
    }
    if (Array.isArray(node.content)) {
      return { ...node, content: node.content.map(walk) };
    }
    return node;
  }

  const doc     = walk(JSON.parse(jsonStr));
  const content = JSON.stringify(doc);

  // Recount words after replacement using the same whitespace-token approach
  // as the server's countWordsInContent.
  function extractText(node) {
    if (!node) return '';
    if (node.type === 'text') return node.text || '';
    if (!Array.isArray(node.content)) return '';
    return node.content.map(extractText).join(' ');
  }
  const wordCount = (extractText(doc).match(/\S+/g) ?? []).length;

  return { content, wordCount };
}

// --- SUB-COMPONENTS ------------------------------------------

// Render the context string with the first occurrence of term wrapped in <mark>.
// This matches what the user sees in the result list to the actual match.
function HighlightContext({ context, term, caseSensitive }) {
  const search   = caseSensitive ? term : term.toLowerCase();
  const haystack = caseSensitive ? context : context.toLowerCase();
  const idx      = haystack.indexOf(search);
  if (idx === -1) return <span className="fr-context-text">{context}</span>;
  return (
    <span className="fr-context-text">
      {context.slice(0, idx)}
      <mark>{context.slice(idx, idx + term.length)}</mark>
      {context.slice(idx + term.length)}
    </span>
  );
}

// --- COMPONENT -----------------------------------------------

export default function SearchModal({ onClose }) {
  const activeProjectId = useBinderStore((s) => s.activeProjectId);
  const activeDocId     = useBinderStore((s) => s.activeDocId);
  const bumpDocVersion  = useBinderStore((s) => s.bumpDocVersion);

  const [term,          setTerm]          = useState('');
  const [replaceTerm,   setReplaceTerm]   = useState('');
  const [opts,          setOpts]          = useState({ caseSensitive: false, wholeWord: false });
  const [results,       setResults]       = useState(null);   // null = not yet searched
  const [loading,       setLoading]       = useState(false);
  const [replacing,     setReplacing]     = useState(false);
  const [error,         setError]         = useState('');
  const [replaceStatus, setReplaceStatus] = useState(null);  // { done, total }

  const totalMatches = results
    ? results.reduce((sum, r) => sum + r.matches.length, 0)
    : 0;

  // --- SEARCH ------------------------------------------------

  async function handleSearch() {
    if (!term.trim()) { setError('Please enter a search term.'); return; }
    setError('');
    setLoading(true);
    setResults(null);
    setReplaceStatus(null);
    try {
      const data = await searchProject(activeProjectId, term, opts);
      setResults(data.results);
    } catch (e) {
      setError(e?.response?.data?.error || 'Search failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // --- REPLACE -----------------------------------------------

  // Fetch one document's content, apply the replacement, and save it back.
  async function replaceInDoc(docId) {
    const { content } = await getDocumentContent(docId);
    if (!content) return;
    const { content: newContent, wordCount } = replaceInProseMirrorJson(content, term, replaceTerm, opts);
    await updateDocumentContent(docId, newContent, wordCount);
  }

  async function handleReplaceDoc(docId) {
    setReplacing(true);
    try {
      await replaceInDoc(docId);
      // If the replaced document is currently open in the editor, signal it to
      // remount so the user sees the updated content immediately.
      if (docId === activeDocId) bumpDocVersion(docId);
    } catch { /* leave error silent; the re-search will show the updated state */ }
    // Re-run search so the result list reflects the replacement.
    await handleSearch();
    setReplacing(false);
  }

  async function handleReplaceAll() {
    if (!results || results.length === 0) return;
    setReplacing(true);
    setReplaceStatus({ done: 0, total: results.length });
    for (let i = 0; i < results.length; i++) {
      try {
        await replaceInDoc(results[i].id);
        // Notify the editor to reload if this doc is currently open.
        if (results[i].id === activeDocId) bumpDocVersion(results[i].id);
      } catch { /* continue with next doc */ }
      setReplaceStatus({ done: i + 1, total: results.length });
    }
    await handleSearch();
    setReplacing(false);
    setReplaceStatus(null);
  }

  // --- EVENT HANDLERS ----------------------------------------

  function handleKeyDown(e) {
    if (e.key === 'Enter')  handleSearch();
    if (e.key === 'Escape') onClose();
  }

  function toggleOpt(key) {
    // Reset results when options change so stale results aren't shown.
    setResults(null);
    setOpts((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  // --- RENDER ------------------------------------------------

  return (
    <div
      className="fr-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="fr-panel" role="dialog" aria-modal="true" aria-label="Find & Replace">

        {/* Header */}
        <div className="fr-header">
          <span className="fr-title">Find &amp; Replace</span>
          <button className="fr-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Search + replace inputs and option toggles */}
        <div className="fr-inputs">
          <div className="fr-input-row">
            <span className="fr-icon" aria-hidden="true">🔍</span>
            <input
              className="fr-input"
              type="text"
              placeholder="Find…"
              value={term}
              onChange={(e) => { setTerm(e.target.value); setResults(null); }}
              onKeyDown={handleKeyDown}
              autoFocus
            />
            <button className="fr-search-btn" onClick={handleSearch} disabled={loading || replacing}>
              {loading ? 'Searching…' : 'Search'}
            </button>
          </div>

          <div className="fr-input-row">
            <span className="fr-icon" aria-hidden="true">✎</span>
            <input
              className="fr-input"
              type="text"
              placeholder="Replace with… (leave empty to delete)"
              value={replaceTerm}
              onChange={(e) => setReplaceTerm(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
            />
          </div>

          <div className="fr-opts">
            <label className="fr-opt-label">
              <input
                type="checkbox"
                checked={opts.caseSensitive}
                onChange={() => toggleOpt('caseSensitive')}
              />
              {' '}Case sensitive
            </label>
            <label className="fr-opt-label">
              <input
                type="checkbox"
                checked={opts.wholeWord}
                onChange={() => toggleOpt('wholeWord')}
              />
              {' '}Whole word
            </label>
          </div>

          {error && <p className="fr-error" role="alert">{error}</p>}
        </div>

        {/* Results list */}
        {results !== null && (
          <div className="fr-results">
            {results.length === 0 ? (
              <p className="fr-no-results">No matches found.</p>
            ) : (
              <>
                <div className="fr-summary">
                  {results.length} {results.length === 1 ? 'document' : 'documents'} &middot;{' '}
                  {totalMatches} {totalMatches === 1 ? 'match' : 'matches'}
                </div>
                {results.map((doc) => (
                  <div key={doc.id} className="fr-doc">
                    <div className="fr-doc-header">
                      <span className="fr-doc-title">{doc.title}</span>
                      <span className="fr-doc-count">({doc.matches.length})</span>
                      <button
                        className="fr-replace-doc-btn"
                        onClick={() => handleReplaceDoc(doc.id)}
                        disabled={replacing}
                      >
                        Replace in doc
                      </button>
                    </div>
                    {doc.matches.map((m, i) => (
                      // Each context snippet is a button so keyboard users can navigate to it.
                      <button
                        key={i}
                        className="fr-context"
                        onClick={() => {
                          useBinderStore.getState().setActiveDoc(doc.id);
                          onClose();
                        }}
                        title="Click to open this document"
                      >
                        <HighlightContext
                          context={m.context}
                          term={term}
                          caseSensitive={opts.caseSensitive}
                        />
                      </button>
                    ))}
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* Replace All footer — only visible when there are results */}
        {results !== null && results.length > 0 && (
          <div className="fr-footer">
            {replaceStatus ? (
              <span className="fr-replace-status">
                Replacing… {replaceStatus.done} / {replaceStatus.total}
              </span>
            ) : (
              <button
                className="fr-replace-all-btn"
                onClick={handleReplaceAll}
                disabled={replacing}
              >
                Replace All
              </button>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
