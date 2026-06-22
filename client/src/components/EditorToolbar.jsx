// ============================================================
// EditorToolbar.jsx
// ============================================================
// Purpose:   Toolbar, synopsis/notes panel, folder notice, and
//            utility modal overlays for the Editor. Purely
//            presentational — all state lives in Editor.jsx.
//            This component fires callbacks and renders; it
//            holds no state of its own.
// Used by:   Editor.jsx
// Exports:   default EditorToolbar(props)
// Notes:     ToolbarBtn, HIGHLIGHT_COLORS, and STATUS_LABEL were
//            extracted from Editor.jsx during the refactor-split-editor
//            refactor. The props interface is a direct mirror of the
//            Editor state that drives the toolbar UI.
// ============================================================

import { useState } from 'react';
import ShortcutsModal from './ShortcutsModal.jsx';
import QuickJump from './QuickJump.jsx';
import SearchModal from './SearchModal.jsx';

const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48];

// --- CONSTANTS -----------------------------------------------

// Pastel swatches shown in the highlight picker.
// Intentionally bright so they stay visible on both light and dark themes
// after the CSS filter in editor.css dims them for dark mode.
const HIGHLIGHT_COLORS = [
  { color: '#fde047', label: 'Yellow' },
  { color: '#86efac', label: 'Green' },
  { color: '#93c5fd', label: 'Blue' },
  { color: '#f9a8d4', label: 'Pink' },
  { color: '#fed7aa', label: 'Orange' },
];

const TEXT_COLORS = [
  { color: '#1f2937', label: 'Dark' },
  { color: '#9333ea', label: 'Purple' },
  { color: '#dc2626', label: 'Red' },
  { color: '#15803d', label: 'Green' },
  { color: '#2563eb', label: 'Blue' },
  { color: '#b45309', label: 'Orange' },
];

// Maps useAutosave status keys to the human-readable label shown in the badge.
// 'idle' maps to empty string so no badge text is rendered when the editor is at rest.
const STATUS_LABEL = {
  saving:  'Saving…',
  saved:   'Saved',
  offline: 'Offline',
  idle:    '',
};

// --- HELPER COMPONENTS ---------------------------------------

// Reusable toolbar button that highlights when its formatting mark is active.
// `active` drives the editor-btn--active CSS class and aria-pressed attribute.
function ToolbarBtn({ active, onClick, title, 'aria-label': ariaLabel, children }) {
  return (
    <button
      type="button"
      className={`editor-btn${active ? ' editor-btn--active' : ''}`}
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      aria-pressed={active ? 'true' : 'false'}
    >
      {children}
    </button>
  );
}

function ResetFormatting({ editor }) {
  const [confirming, setConfirming] = useState(false);
  if (confirming) {
    return (
      <span className="editor-reset-confirm">
        <span className="editor-reset-confirm-label">Reset?</span>
        <button
          type="button"
          className="editor-btn editor-btn--danger"
          onClick={() => {
            editor?.chain().focus().unsetAllMarks().clearNodes().run();
            setConfirming(false);
          }}
        >Yes</button>
        <button
          type="button"
          className="editor-btn"
          onClick={() => setConfirming(false)}
        >No</button>
      </span>
    );
  }
  return (
    <ToolbarBtn
      active={false}
      onClick={() => setConfirming(true)}
      title="Reset all formatting on selection"
    >&#x27F2;</ToolbarBtn>
  );
}

// --- COMPONENT -----------------------------------------------

export default function EditorToolbar({
  // TipTap editor instance — null while content is loading
  editor,
  // View state (all read-only here; mutations go through callbacks)
  font, zoom, fullscreen,
  wordCount, status, hasSaved,
  isFolderType,
  synopsisOpen, synopsis,
  shortcutsOpen, jumpOpen, searchOpen,
  // Callbacks
  onFontChange, onZoom,
  onToggleFullscreen,
  onToggleSynopsis, onSynopsisChange, onCommitSynopsis,
  onShortcutsOpen, onShortcutsClose,
  onJumpClose,
  onSearchClose,
}) {
  return (
    <>

      {/* ── Toolbar ─────────────────────────────────────────── */}
      <div className="editor-toolbar" role="toolbar" aria-label="Text formatting">

        {/* ── Text style ── */}
        <div role="group" aria-label="Text style">
          <ToolbarBtn
            active={editor?.isActive('bold')}
            onClick={() => editor?.chain().focus().toggleBold().run()}
            title="Bold (Ctrl+B)"
          ><strong>B</strong></ToolbarBtn>

          <ToolbarBtn
            active={editor?.isActive('italic')}
            onClick={() => editor?.chain().focus().toggleItalic().run()}
            title="Italic (Ctrl+I)"
          ><em>I</em></ToolbarBtn>

          <ToolbarBtn
            active={editor?.isActive('underline')}
            onClick={() => editor?.chain().focus().toggleUnderline().run()}
            title="Underline (Ctrl+U)"
          ><u>U</u></ToolbarBtn>

          <ToolbarBtn
            active={editor?.isActive('strike')}
            onClick={() => editor?.chain().focus().toggleStrike().run()}
            title="Strikethrough"
          ><s>S</s></ToolbarBtn>

          <ToolbarBtn
            active={editor?.isActive('superscript')}
            onClick={() => editor?.chain().focus().toggleSuperscript().run()}
            title="Superscript"
          >X<sup>2</sup></ToolbarBtn>

          <ToolbarBtn
            active={editor?.isActive('subscript')}
            onClick={() => editor?.chain().focus().toggleSubscript().run()}
            title="Subscript"
          >X<sub>2</sub></ToolbarBtn>
        </div>

        {/* ── Headings ── */}
        <div role="group" aria-label="Headings">
          <ToolbarBtn
            active={editor?.isActive('heading', { level: 1 })}
            onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
            title="Heading 1"
          >H1</ToolbarBtn>

          <ToolbarBtn
            active={editor?.isActive('heading', { level: 2 })}
            onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
            title="Heading 2"
          >H2</ToolbarBtn>

          <ToolbarBtn
            active={editor?.isActive('heading', { level: 3 })}
            onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
            title="Heading 3"
          >H3</ToolbarBtn>
        </div>

        {/* ── Highlight ── */}
        <div className="editor-highlight-swatches" role="group" aria-label="Highlight color">
          <label className="editor-select-label">Highlight</label>
          {HIGHLIGHT_COLORS.map(({ color, label }) => (
            <button
              key={color}
              type="button"
              className={`editor-highlight-swatch${editor?.isActive('highlight', { color }) ? ' editor-highlight-swatch--active' : ''}`}
              style={{ background: color }}
              onClick={() => editor?.chain().focus().toggleHighlight({ color }).run()}
              title={`Highlight: ${label}`}
              aria-label={`Highlight ${label}`}
              aria-pressed={editor?.isActive('highlight', { color }) ? 'true' : 'false'}
            />
          ))}
          <ToolbarBtn
            active={false}
            onClick={() => editor?.chain().focus().unsetHighlight().run()}
            title="Remove highlight"
            aria-label="Remove highlight"
          >✕</ToolbarBtn>
        </div>

        {/* ── Text color ── */}
        <div className="editor-text-color-swatches" role="group" aria-label="Text color">
          <label className="editor-select-label">Color</label>
          {TEXT_COLORS.map(({ color, label }) => (
            <button
              key={color}
              type="button"
              className={`editor-text-color-swatch${editor?.isActive('textStyle', { color }) ? ' editor-text-color-swatch--active' : ''}`}
              style={{ background: color }}
              onClick={() => editor?.chain().focus().setColor(color).run()}
              title={`Text: ${label}`}
              aria-label={`Text color ${label}`}
              aria-pressed={editor?.isActive('textStyle', { color }) ? 'true' : 'false'}
            />
          ))}
          <ToolbarBtn
            active={false}
            onClick={() => editor?.chain().focus().unsetColor().run()}
            title="Remove text color"
            aria-label="Remove text color"
          >✕</ToolbarBtn>
        </div>

        {/* ── Lists ── */}
        <div role="group" aria-label="Lists">
          <label className="editor-select-label">List</label>
          <ToolbarBtn
            active={editor?.isActive('bulletList')}
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
            title="Bullet list"
            aria-label="Bullet list"
          >&#8226;&#8212;</ToolbarBtn>

          <ToolbarBtn
            active={editor?.isActive('orderedList')}
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
            title="Numbered list"
            aria-label="Numbered list"
          >1.</ToolbarBtn>

          <ToolbarBtn
            active={editor?.isActive('blockquote')}
            onClick={() => editor?.chain().focus().toggleBlockquote().run()}
            title="Blockquote"
            aria-label="Blockquote"
          >&#8220;&#8221;</ToolbarBtn>
        </div>

        {/* ── Table ── */}
        <div role="group" aria-label="Table">
          <label className="editor-select-label">Table</label>
          <ToolbarBtn
            active={false}
            onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
            title="Insert table"
            aria-label="Insert table"
          >&#8862;</ToolbarBtn>

          {editor?.isActive('table') && <>
            <ToolbarBtn active={false} onClick={() => editor?.chain().focus().addRowAfter().run()} title="Add row">+Row</ToolbarBtn>
            <ToolbarBtn active={false} onClick={() => editor?.chain().focus().addColumnAfter().run()} title="Add column">+Col</ToolbarBtn>
            <ToolbarBtn active={false} onClick={() => editor?.chain().focus().deleteRow().run()} title="Delete row">&minus;Row</ToolbarBtn>
            <ToolbarBtn active={false} onClick={() => editor?.chain().focus().deleteColumn().run()} title="Delete column">&minus;Col</ToolbarBtn>
            <ToolbarBtn active={false} onClick={() => editor?.chain().focus().deleteTable().run()} title="Delete table">&#10005;Tbl</ToolbarBtn>
          </>}
        </div>

        {/* ── Indent ── */}
        <div role="group" aria-label="Indentation">
          <label className="editor-select-label">Indent</label>
          <ToolbarBtn
            active={false}
            onClick={() => editor?.chain().focus().outdent().run()}
            title="Decrease first-line indent (Shift+Tab)"
            aria-label="Decrease first-line indent"
          >&#8592;|</ToolbarBtn>

          <ToolbarBtn
            active={false}
            onClick={() => editor?.chain().focus().indent().run()}
            title="Increase first-line indent (Tab)"
            aria-label="Increase first-line indent"
          >|&#8594;</ToolbarBtn>

          <ToolbarBtn
            active={false}
            onClick={() => editor?.chain().focus().blockOutdent().run()}
            title="Decrease block indent"
            aria-label="Decrease block indent"
          >&#8656;</ToolbarBtn>

          <ToolbarBtn
            active={false}
            onClick={() => editor?.chain().focus().blockIndent().run()}
            title="Increase block indent"
            aria-label="Increase block indent"
          >&#8658;</ToolbarBtn>
        </div>

        {/* ── Alignment ── */}
        <div role="group" aria-label="Text alignment">
          <label className="editor-select-label">Align</label>
          <ToolbarBtn
            active={editor?.isActive({ textAlign: 'left' })}
            onClick={() => editor?.chain().focus().setTextAlign('left').run()}
            title="Align left"
            aria-label="Align left"
          >&#8676;</ToolbarBtn>

          <ToolbarBtn
            active={editor?.isActive({ textAlign: 'center' })}
            onClick={() => editor?.chain().focus().setTextAlign('center').run()}
            title="Center"
            aria-label="Align center"
          >&#8596;</ToolbarBtn>

          <ToolbarBtn
            active={editor?.isActive({ textAlign: 'right' })}
            onClick={() => editor?.chain().focus().setTextAlign('right').run()}
            title="Align right"
            aria-label="Align right"
          >&#8677;</ToolbarBtn>

          <ToolbarBtn
            active={editor?.isActive({ textAlign: 'justify' })}
            onClick={() => editor?.chain().focus().setTextAlign('justify').run()}
            title="Justify"
            aria-label="Justify"
          >&#8644;</ToolbarBtn>
        </div>

        {/* ── Font ── */}
        <div role="group" aria-label="Font">
          <select
            className="editor-font-select"
            value={font}
            onChange={(e) => onFontChange(e.target.value)}
            title="Font family"
            aria-label="Font family"
          >
            <option value="sans">Sans-serif</option>
            <option value="serif">EB Garamond</option>
            <option value="writer">Typewriter</option>
            <option value="georgia">Georgia</option>
            <option value="dyslexic">OpenDyslexic</option>
            <option value="comic">Comic Sans</option>
          </select>

          <label className="editor-select-label">Size</label>
          <select
            className="editor-font-select"
            value={(() => {
              const active = editor?.getAttributes('textStyle')?.fontSize;
              return active ? parseInt(active, 10) : 'default';
            })()}
            onChange={(e) => {
              const val = e.target.value;
              if (val === 'default') {
                editor?.chain().focus().unsetFontSize().run();
              } else {
                editor?.chain().focus().setFontSize(val + 'px').run();
              }
            }}
            title="Font size"
            aria-label="Font size"
          >
            <option value="default">Default</option>
            {FONT_SIZES.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <label className="editor-select-label">Spacing</label>
          <select
            className="editor-font-select"
            value={editor?.getAttributes('textStyle')?.lineHeight || 'default'}
            onChange={(e) => {
              const val = e.target.value;
              if (val === 'default') {
                editor?.chain().focus().unsetLineHeight().run();
              } else {
                editor?.chain().focus().setLineHeight(val).run();
              }
            }}
            title="Line spacing"
            aria-label="Line spacing"
          >
            <option value="default">Default</option>
            <option value="1">Tight (1.0)</option>
            <option value="1.15">Single</option>
            <option value="1.5">1.5</option>
            <option value="2">Double</option>
          </select>

          <ResetFormatting editor={editor} />
        </div>

        {/* ── Zoom ── */}
        <div role="group" aria-label="Zoom">
          <label className="editor-select-label">Zoom</label>
          <ToolbarBtn active={false} onClick={() => onZoom(-10)} title="Zoom out (−10%)" aria-label="Zoom out">A−</ToolbarBtn>
          <span className="zoom-display">{zoom}%</span>
          <ToolbarBtn active={false} onClick={() => onZoom(+10)} title="Zoom in (+10%)" aria-label="Zoom in">A+</ToolbarBtn>
        </div>

        {/* ── View ── */}
        <div role="group" aria-label="View">
          <ToolbarBtn active={fullscreen} onClick={onToggleFullscreen} title="Distraction-free fullscreen (Esc to exit)" aria-label="Fullscreen">⛶</ToolbarBtn>
          <ToolbarBtn active={false} onClick={() => window.print()} title="Print document" aria-label="Print">⎙</ToolbarBtn>
          <ToolbarBtn active={false} onClick={onShortcutsOpen} title="Keyboard shortcuts" aria-label="Keyboard shortcuts">?</ToolbarBtn>
        </div>

        {/* ── Right-side meta ──────────────────────────────────── */}
        <div className="editor-toolbar-right">
          <span className="editor-word-count">
            {wordCount} {wordCount === 1 ? 'word' : 'words'}
            {wordCount > 0 && <> &middot; {Math.ceil(wordCount / 200)} min read</>}
          </span>
          <span
            role="status"
            aria-label="Document save status"
            aria-live="polite"
            className={`editor-save-status${
              status !== 'idle' ? ` editor-save-status--${status}`
              : hasSaved        ? ' editor-save-status--saved'
              : ''
            }`}
          >
            {status !== 'idle' ? STATUS_LABEL[status] : hasSaved ? STATUS_LABEL.saved : ''}
          </span>
        </div>
      </div>

      {/* ── Folder/chapter notice ─────────────────────────────── */}
      {/* Shown instead of the synopsis bar when the document is structural,
          not a writable scene, so the user knows it won't appear in exports. */}
      {isFolderType && (
        <div className="editor-folder-notice">
          Folder — this content is not included in compilations.
        </div>
      )}

      {/* ── Synopsis panel ───────────────────────────────────── */}
      {/* Collapsible one-liner summary below the toolbar.
          For folder/chapter nodes the label changes to "Notes". */}
      <div className="editor-synopsis-bar">
        <button
          type="button"
          className="editor-synopsis-toggle"
          onClick={onToggleSynopsis}
          aria-expanded={synopsisOpen}
          aria-controls="editor-synopsis-body"
          title={synopsisOpen
            ? `Hide ${isFolderType ? 'notes' : 'synopsis'}`
            : `Show ${isFolderType ? 'notes' : 'synopsis'}`}
        >
          <span className="editor-synopsis-caret" aria-hidden="true">
            {synopsisOpen ? '▾' : '▸'}
          </span>
          {isFolderType ? 'Notes' : 'Synopsis'}
        </button>
        {synopsisOpen && (
          <textarea
            id="editor-synopsis-body"
            className="editor-synopsis-textarea"
            placeholder={isFolderType ? 'Add notes…' : 'Add a synopsis…'}
            value={synopsis}
            onChange={(e) => onSynopsisChange(e.target.value)}
            // Save on blur rather than every keystroke to avoid unnecessary API calls.
            onBlur={onCommitSynopsis}
            rows={3}
            aria-label={isFolderType ? 'Document notes' : 'Document synopsis'}
          />
        )}
      </div>

      {/* ── Utility overlays ────────────────────────────────── */}
      {/* Mounted only when open to avoid unnecessary renders.
          State lives in Editor; this component just closes them via callbacks. */}
      {shortcutsOpen && <ShortcutsModal onClose={onShortcutsClose} />}
      {jumpOpen      && <QuickJump      onClose={onJumpClose} />}
      {searchOpen    && <SearchModal    onClose={onSearchClose} />}

    </>
  );
}
