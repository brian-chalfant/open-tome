// ============================================================
// Editor.jsx
// ============================================================
// Purpose:   TipTap editor core for a single document.
//            Owns all editor state (font, zoom, fullscreen,
//            autosave, synopsis, modal visibility) and delegates
//            all rendering of the toolbar, synopsis panel, and
//            utility overlays to EditorToolbar.
// Used by:   AppPage (single-pane), SplitEditor (dual-pane)
// Exports:   default Editor({ docId })
// Notes:     The parent MUST render <Editor key={docId} docId={docId} />.
//            The key forces a full remount on each document switch, which
//            keeps TipTap's internal ProseMirror state fresh and avoids
//            partial content bleed between documents.
// ============================================================

// --- IMPORTS -------------------------------------------------

import { useCallback, useEffect, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import CharacterCount from '@tiptap/extension-character-count';
import Placeholder from '@tiptap/extension-placeholder';
import { TextStyle, FontSize, LineHeight, Color } from '@tiptap/extension-text-style';
import Typography from '@tiptap/extension-typography';
import Superscript from '@tiptap/extension-superscript';
import Subscript from '@tiptap/extension-subscript';
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import { getDocumentContent, updateDocument } from '../api/projects.js';
import { useAutosave } from '../hooks/useAutosave.js';
import { useBinderStore } from '../store/binderStore.js';
import { prefs } from '../utils/storage.js';
import { rtfToProseMirror } from '../utils/rtfToProseMirror.js';
import DOMPurify from 'dompurify';
import Indent from '../extensions/indent.js';
import EditorToolbar from './EditorToolbar.jsx';
import '../styles/editor.css';

// --- EXTENSIONS ----------------------------------------------

// All TipTap extensions used by every editor instance.
// StarterKit bundles the most common marks and nodes (bold, italic, headings,
// lists, blockquote, code, strike, history). The rest are opt-in extras.
const EXTENSIONS = [
  StarterKit,
  Underline,
  TextStyle,
  FontSize,
  LineHeight,
  Color,
  Typography,
  Superscript,
  Subscript,
  Table.configure({ resizable: true }),
  TableRow,
  TableCell,
  TableHeader,
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  Highlight.configure({ multicolor: true }),
  CharacterCount,
  Placeholder.configure({ placeholder: 'Click anywhere to start writing…' }),
  Indent,
];

const LINE_SPACING_MAP = { 'tight': 1.0, '1': 1.15, '1.5': 1.5, 'double': 2.0 };

// --- EDITOR COMPONENT ----------------------------------------

// Main Editor component. Receives the document ID and owns all editor state.
// The parent renders <Editor key={docId} docId={docId} /> so this component
// fully remounts for each document — keeps the logic simple.
export default function Editor({ docId }) {

  // --- STATE ---------------------------------------------------

  // useAutosave opens a WebSocket connection and handles debounced saves.
  // `status` drives the save-status badge in EditorToolbar.
  const { save, status } = useAutosave(docId);

  // Pull helpers and the current document type from the global binder store.
  const updateDocumentInStore = useBinderStore((s) => s.updateDocumentInStore);
  const docType = useBinderStore((s) => s.documents.find((d) => d.id === docId)?.type);

  // Folder and chapter nodes display a notice and skip compilation.
  const isFolderType = docType === 'folder' || docType === 'chapter';

  const [loading, setLoading]         = useState(true);
  // prefs.x.get is the getter function — passing it (not calling it) lets React
  // invoke it once as a lazy initialiser, avoiding localStorage reads on every render.
  const [font, setFont]               = useState(prefs.editorFont.get);
  const [zoom, setZoom]               = useState(prefs.editorZoom.get);
  const [fontSize]      = useState(prefs.editorFontSize.get);
  const [lineSpacing]   = useState(prefs.editorLineSpacing.get);

  // Latch: once we see a 'saved' status for the first time, keep showing "Saved" at rest.
  const [hasSaved, setHasSaved] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (status === 'saved') setHasSaved(true);
  }, [status]);

  // fullscreen tracks whether distraction-free mode is active.
  const [fullscreen, setFullscreen] = useState(false);

  // Overlay state for editor utility modals.
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [jumpOpen,      setJumpOpen]      = useState(false);
  const [searchOpen,    setSearchOpen]    = useState(false);

  // --- SYNOPSIS ------------------------------------------------

  // Read the synopsis for this document from the binder store.
  // Changes made in the corkboard view flow back here through the store.
  const docSynopsis = useBinderStore(
    (s) => s.documents.find((d) => d.id === docId)?.synopsis ?? ''
  );
  const [synopsis,     setSynopsis]     = useState(docSynopsis);
  const [synopsisOpen, setSynopsisOpen] = useState(prefs.editorSynopsisOpen.get);

  // Keep local draft in sync when corkboard or another client updates the store.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setSynopsis(docSynopsis); }, [docSynopsis]);

  // Save the synopsis to the server only when it differs from the stored value.
  // Fires on textarea blur so we don't send a request on every keystroke.
  const commitSynopsis = useCallback(() => {
    // getState() reads the current store value at call time, bypassing the stale
    // closure that would arise if we captured docSynopsis from the outer scope.
    const stored = useBinderStore.getState().documents.find((d) => d.id === docId)?.synopsis ?? '';
    if (synopsis !== stored) {
      updateDocument(docId, { synopsis })
        .then((updated) => useBinderStore.getState().updateDocumentInStore(updated))
        .catch(() => {});
    }
  }, [docId, synopsis]);

  // Toggle the synopsis / notes panel and persist the preference.
  const toggleSynopsis = useCallback(() => {
    setSynopsisOpen((prev) => {
      const next = !prev;
      prefs.editorSynopsisOpen.set(next);
      return next;
    });
  }, []);

  // --- FONT & ZOOM ---------------------------------------------

  // Persist the font choice so it carries over to the next session.
  const handleFontChange = (f) => {
    setFont(f);
    prefs.editorFont.set(f);
  };

  // Clamp zoom between 80 % and 200 % to keep the text readable.
  // The zoom value is applied as a CSS `zoom` property on the scroll container.
  const handleZoom = useCallback((delta) => {
    setZoom(prev => {
      const next = Math.min(200, Math.max(80, prev + delta));
      prefs.editorZoom.set(next);
      return next;
    });
  }, []);

  // --- FULLSCREEN ----------------------------------------------

  // Enter or exit true browser fullscreen and simultaneously toggle the
  // body.editor-fullscreen class so the CSS in index.css hides the topbar
  // and binder inside the fullscreen viewport.
  //
  // Uses React `fullscreen` state (not document.fullscreenElement) to determine
  // enter vs exit so the logic is correct in headless environments (e.g. Playwright)
  // where requestFullscreen() is a no-op and fullscreenElement stays null.
  const toggleFullscreen = useCallback(() => {
    if (!fullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
      document.body.classList.add('editor-fullscreen');
      setFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      // Eagerly remove class so Escape works in headless where fullscreenchange
      // may never fire. The listener below is idempotent, so no double-removal issue.
      document.body.classList.remove('editor-fullscreen');
      setFullscreen(false);
    }
  }, [fullscreen]);

  // Sync React state when the browser exits fullscreen via Esc, browser controls,
  // or the button above. Only acts on exit (when element is gone).
  useEffect(() => {
    const handleChange = () => {
      if (!document.fullscreenElement) {
        document.body.classList.remove('editor-fullscreen');
        setFullscreen(false);
      }
    };
    document.addEventListener('fullscreenchange', handleChange);
    return () => document.removeEventListener('fullscreenchange', handleChange);
  }, []);

  // Clean up if the Editor unmounts while fullscreen so the app shell
  // is never left in a hidden state after navigating away.
  useEffect(() => () => {
    document.body.classList.remove('editor-fullscreen');
    if (document.fullscreenElement) document.exitFullscreen();
  }, []);

  // Allow Escape to exit the app-level fullscreen overlay in environments where
  // the browser fullscreen API is unavailable (e.g. headless Playwright).
  useEffect(() => {
    if (!fullscreen) return;
    const handle = (e) => { if (e.key === 'Escape') toggleFullscreen(); };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [fullscreen, toggleFullscreen]);

  // --- KEYBOARD SHORTCUTS --------------------------------------

  // Ctrl+G opens the quick-jump palette.
  useEffect(() => {
    const handle = (e) => {
      if (e.ctrlKey && e.key === 'g') { e.preventDefault(); setJumpOpen(true); }
    };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, []);

  // Ctrl+H opens the find & replace modal.
  useEffect(() => {
    const handle = (e) => {
      if (e.ctrlKey && e.key === 'h') { e.preventDefault(); setSearchOpen(true); }
    };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, []);

  // --- TIPTAP EDITOR SETUP -------------------------------------

  const editor = useEditor({
    extensions: EXTENSIONS,
    shouldRerenderOnTransaction: true,
    content: '',
    editorProps: {
      attributes: { class: 'editor-content', spellCheck: 'true' },

      // Intercept RTF clipboard data (Scrivener, Word, etc.) before ProseMirror's
      // default paste handler. If the clipboard has application/rtf or text/rtf,
      // parse it and insert the resulting ProseMirror content directly.
      handlePaste(view, event) {
        const rtf = event.clipboardData?.getData('application/rtf')
                 || event.clipboardData?.getData('text/rtf');
        if (!rtf) return false; // no RTF — let the default paste handler run
        const pmDoc = rtfToProseMirror(rtf);
        if (!pmDoc) return false; // parser returned null — fall back to default
        try {
          const { state, dispatch } = view;
          const content = state.schema.nodeFromJSON(pmDoc);
          dispatch(state.tr.replaceSelectionWith(content));
          return true; // handled — suppress default paste
        } catch {
          return false; // schema mismatch or other error — fall back to default
        }
      },

      // Sanitise pasted HTML so that bold/italic inline styles from external
      // sources (e.g. Google Docs) are converted to proper semantic tags.
      transformPastedHTML(html) {
        // DOMPurify first — strip any executable content from untrusted paste sources.
        const sanitized = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
        const doc = new DOMParser().parseFromString(sanitized, 'text/html');
        // Reverse order so innermost spans are replaced first.
        [...doc.querySelectorAll('span')].reverse().forEach(span => {
          const fw = span.style.fontWeight;
          const fs = span.style.fontStyle;
          const isBold   = fw === 'bold' || parseInt(fw, 10) >= 600;
          const isItalic = fs === 'italic' || fs === 'oblique';
          if (!isBold && !isItalic) return;

          const frag = doc.createDocumentFragment();
          let leaf = frag;
          if (isBold)   { const s = doc.createElement('strong'); leaf.appendChild(s); leaf = s; }
          if (isItalic) { const e = doc.createElement('em');     leaf.appendChild(e); leaf = e; }
          while (span.firstChild) leaf.appendChild(span.firstChild);
          span.replaceWith(frag);
        });
        return doc.body.innerHTML;
      },
    },

    // Fires after every content change — triggers autosave and syncs word count.
    onUpdate: ({ editor: e }) => {
      const json  = JSON.stringify(e.getJSON());
      const words = e.storage.characterCount.words();
      save(json, words);
      // Keep the binder's word count badge in sync without waiting for a server round-trip.
      updateDocumentInStore({ id: docId, word_count: words });
    },
  });

  // --- CONTENT LOADING -----------------------------------------

  // Fetch the document's stored JSON and load it into TipTap once the editor
  // instance is ready. emitUpdate: false prevents triggering an immediate autosave
  // on load — saves only fire after the user actually types something.
  useEffect(() => {
    if (!editor || !docId) return;
    // cancelled guards against a race where the component unmounts or the editor
    // is destroyed before the async fetch resolves — prevents setState on dead component.
    let cancelled = false;

    getDocumentContent(docId)
      .then(({ content }) => {
        if (cancelled) return;
        const parsed = content ? JSON.parse(content) : '';
        editor.commands.setContent(parsed, { emitUpdate: false });
        setLoading(false);
        editor.commands.focus('end');
      })
      .catch(() => {
        if (!cancelled) {
          editor.commands.setContent('', { emitUpdate: false });
          setLoading(false);
          editor.commands.focus('end');
        }
      });

    return () => { cancelled = true; };
  }, [editor]); // eslint-disable-line react-hooks/exhaustive-deps -- docId never changes within a mount (parent uses key={docId})

  const wordCount = editor ? editor.storage.characterCount.words() : 0;

  // --- RENDER --------------------------------------------------

  return (
    // editor-font-{font} drives the font-family CSS via class-based selectors in editor.css.
    <div
      className={`editor-wrapper editor-font-${font}`}
      style={{
        '--editor-font-size': `${fontSize}px`,
        '--editor-line-height': LINE_SPACING_MAP[lineSpacing] ?? 1.5,
      }}
    >

      <EditorToolbar
        editor={editor}
        font={font}
        zoom={zoom}
        fullscreen={fullscreen}
        wordCount={wordCount}
        status={status}
        hasSaved={hasSaved}
        isFolderType={isFolderType}
        synopsisOpen={synopsisOpen}
        synopsis={synopsis}
        shortcutsOpen={shortcutsOpen}
        jumpOpen={jumpOpen}
        searchOpen={searchOpen}
        onFontChange={handleFontChange}
        onZoom={handleZoom}
        onToggleFullscreen={toggleFullscreen}
        onToggleSynopsis={toggleSynopsis}
        onSynopsisChange={setSynopsis}
        onCommitSynopsis={commitSynopsis}
        onShortcutsOpen={() => setShortcutsOpen(true)}
        onShortcutsClose={() => setShortcutsOpen(false)}
        onJumpClose={() => setJumpOpen(false)}
        onSearchClose={() => setSearchOpen(false)}
      />

      {/* ── Editor area ──────────────────────────────────────── */}
      {/* Clicking the padding area below the content focuses the editor at the end,
          matching the Scrivener behaviour of "click anywhere to write". */}
      <div
        className="editor-scroll"
        style={{ zoom: zoom / 100 }}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) {
            e.preventDefault();
            editor?.chain().focus('end').run();
          }
        }}
      >
        {loading && <div className="editor-loading-overlay">Loading…</div>}
        <EditorContent editor={editor} />
      </div>

    </div>
  );
}
