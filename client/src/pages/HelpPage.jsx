import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import '../styles/help.css';

export default function HelpPage() {
  useEffect(() => { document.documentElement.dataset.prerendered = 'true'; }, []);
  const { user } = useAuth();

  return (
    <>
      <title>Help — Tome</title>
      <meta
        name="description"
        content="Complete help guide for Tome: binder organisation, rich text editor, corkboard, compile and export, writing targets, sprint timer, and keyboard shortcuts."
      />
      <main className="help-page">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header className="help-header">
        <Link to={user ? '/app' : '/login'} className="help-back-btn">
          {user ? '← Back to Writing' : '← Sign in'}
        </Link>
        <h1 className="help-title">Tome Help</h1>
        <p className="help-subtitle">
          A quick reference for everything in the app.
        </p>
      </header>

      {/* ── 1. Getting Started ────────────────────────────────────────────── */}
      <section className="help-section">
        <h2 className="help-section-title">Getting Started</h2>
        <p>
          After signing in, you land on the main workspace. If this is your first
          time, your binder is empty. Click the <strong>＋</strong> button to create your first project and get started writing!
        </p>
        <ul>
          <li>
            Click the <strong>＋</strong> button at the top of the binder (left sidebar)
            to create a new project. Type a title and press <kbd className="help-kbd">Enter</kbd>.
          </li>
          <li>
            Click the <strong>⊞</strong> button to open the Project Manager, where you
            can rename, archive, delete, import, or export projects.
          </li>
          <li>
            Switch between projects using the dropdown at the top of the binder.
          </li>
        </ul>
      </section>

      {/* ── 2. The Binder ─────────────────────────────────────────────────── */}
      <section className="help-section">
        <h2 className="help-section-title">The Binder</h2>
        <p>
          The binder is the left sidebar that holds your entire project as a
          tree of documents. Every project starts with a <strong>Story</strong> folder
          containing a Chapter and a Scene, plus a <strong>Notes</strong> folder for
          Characters and Research.
        </p>
        <h3 className="help-subsection-title">Document types</h3>
        <ul>
          <li><strong>Scene</strong> — a leaf document you write in. Holds rich text and counts words.</li>
          <li><strong>Chapter</strong> — a container for scenes. Shown with an open-book icon. Use chapters to group the scenes that make up a narrative chapter.</li>
          <li><strong>Folder</strong> — a generic container. Use folders to organise characters, research, or anything outside the story itself.</li>
          <li><strong>Character</strong> — opens with a pre-filled character sheet template.</li>
          <li><strong>Research</strong> — opens with a pre-filled research note template.</li>
        </ul>
        <h3 className="help-subsection-title">Adding documents</h3>
        <ul>
          <li>
            <strong>Right-click</strong> on any blank area of the binder to create a
            top-level document (New Scene, New Chapter, New Folder, etc.).
          </li>
          <li>
            <strong>Right-click</strong> on an existing chapter or folder to add a
            child document inside it (Add Scene, Add Chapter, Add Folder, etc.).
          </li>
        </ul>
        <h3 className="help-subsection-title">Renaming and deleting</h3>
        <ul>
          <li>
            <strong>Double-click</strong> a document title to rename it inline.
            Press <kbd className="help-kbd">Enter</kbd> to save or <kbd className="help-kbd">Esc</kbd> to cancel.
          </li>
          <li>Right-click a document and choose <strong>Rename</strong> for the same effect.</li>
          <li>Right-click and choose <strong>Delete</strong> to permanently remove a document and all its children.</li>
        </ul>
        <h3 className="help-subsection-title">More binder features</h3>
        <ul>
          <li>
            <strong>Binder toggle</strong> — on desktop, use the collapse/expand button in
            the top bar to hide or show the binder and give your writing more horizontal
            space. Click it again to bring the binder back.
          </li>
          <li>
            <strong>Quick export</strong> — right-click any scene and choose{' '}
            <strong>Export</strong> to download just that document as PDF, DOCX, ePub,
            Markdown, or Manuscript, without opening the full compile dialog.
          </li>
        </ul>
      </section>

      {/* ── 3. Drag-and-Drop Organisation ────────────────────────────────── */}
      <section className="help-section">
        <h2 className="help-section-title">Drag-and-Drop Organisation</h2>
        <p>
          Every document in the binder is draggable. Click and hold any row, then
          drag it to a new position.
        </p>
        <ul>
          <li>
            <strong>Drop onto a chapter or folder</strong> to move the document
            inside it. The chapter or folder expands automatically.
          </li>
          <li>
            <strong>Drop between documents</strong> at the same level to reorder
            them. The order you set here is the order used during compilation.
          </li>
        </ul>
      </section>

      {/* ── 4. The Corkboard ──────────────────────────────────────────────── */}
      <section className="help-section">
        <h2 className="help-section-title">The Corkboard</h2>
        <p>
          When a chapter or folder is selected in the binder, click the{' '}
          <strong>&#9638; Corkboard</strong> button in the top bar to switch from
          the text editor to an index-card view of all children.
        </p>
        <ul>
          <li>Each child document is shown as an index card with its title, synopsis, label stripe, and status badge.</li>
          <li>Drag cards to reorder them — the new order is saved immediately and reflected in the binder.</li>
          <li>Edit a card&apos;s <strong>synopsis</strong> by clicking into the text area on the card.</li>
          <li>
            <strong>Double-click</strong> a chapter or folder card to drill down and
            see its own children.
          </li>
          <li>Click <strong>&#9638; Corkboard</strong> again to return to the editor.</li>
        </ul>
      </section>

      {/* ── 5. The Editor ─────────────────────────────────────────────────── */}
      <section className="help-section">
        <h2 className="help-section-title">The Editor</h2>
        <p>
          Select any scene, character, or research document to open it in the editor.
          The toolbar at the top provides formatting options.
        </p>
        <ul>
          <li>Bold, italic, underline, strikethrough, and code span formatting.</li>
          <li>Headings (H1–H3), blockquote, bullet list, and numbered list.</li>
          <li>Word count shown in the toolbar, updated live as you type.</li>
          <li>
            A <strong>synopsis</strong> field below the editor title bar lets you
            write a short summary that appears on the corkboard index card.
          </li>
          <li>
            The <strong>Save status</strong> indicator in the top-right shows{' '}
            <em>Saving…</em>, <em>Saved</em>, or <em>Offline</em> depending on the
            connection state.
          </li>
        </ul>
        <h3 className="help-subsection-title">Editor tools</h3>
        <ul>
          <li>
            <strong>Font</strong> — use the font dropdown in the toolbar to switch between
            Serif, Sans-Serif, Monospace, or OpenDyslexic (a dyslexia-friendly typeface).
          </li>
          <li>
            <strong>Text size</strong> — use the <strong>−</strong> / <strong>+</strong>{' '}
            zoom buttons to scale the on-screen text up or down. This only affects
            what you see while writing; the exported file is always full-size.
          </li>
          <li>
            <strong>Fullscreen / distraction-free mode</strong> — click the fullscreen
            button in the toolbar to hide the browser chrome, top bar, and binder,
            leaving only the page. Press <kbd className="help-kbd">Esc</kbd> or click the
            button again to exit.
          </li>
          <li>
            <strong>Print</strong> — click the print button to send the current document
            to your printer or save it as a PDF via the browser&apos;s print dialog.
          </li>
          <li>
            <strong>Reading time</strong> — an estimated reading time is shown in the
            toolbar alongside the word count.
          </li>
          <li>
            <strong>Keyboard shortcuts reference</strong> — click the <strong>?</strong>{' '}
            button in the toolbar to open a quick-reference modal of all editor
            keyboard shortcuts.
          </li>
        </ul>
      </section>

      {/* ── 6. Autosave & Sync ────────────────────────────────────────────── */}
      <section className="help-section">
        <h2 className="help-section-title">Autosave &amp; Sync</h2>
        <p>
          Changes are saved automatically via WebSocket as you type, with a
          two-second debounce after the last keystroke. You never need to press
          a save button.
        </p>
        <ul>
          <li>If the WebSocket connection drops, the editor switches to REST-based saving and shows <em>Offline</em>. It retries the connection automatically with exponential back-off.</li>
          <li>Opening the same project in two browser tabs keeps both in sync — edits in one tab appear in the other within seconds.</li>
        </ul>
      </section>

      {/* ── 7. Split Editor ───────────────────────────────────────────────── */}
      <section className="help-section">
        <h2 className="help-section-title">Split Editor</h2>
        <p>
          On desktop, click <strong>&#9707; Split</strong> to open a second editor
          pane side by side.
        </p>
        <ul>
          <li>Click the <strong>○ / ●</strong> target button above a pane to focus it.</li>
          <li>The focused pane receives the next document you click in the binder.</li>
          <li>This lets you reference one scene while writing another, or compare two chapters.</li>
          <li>Click <strong>&#9707; Split</strong> again to close the second pane.</li>
        </ul>
      </section>

      {/* ── 8. Writing Goals & Targets ────────────────────────────────────── */}
      <section className="help-section">
        <h2 className="help-section-title">Writing Goals &amp; Targets</h2>
        <p>
          Click <strong>&#9678; Targets</strong> to open the targets widget.
        </p>
        <ul>
          <li>Set a <strong>word count goal</strong> for the project (e.g. 80,000 words).</li>
          <li>Optionally set a <strong>deadline</strong> — the widget calculates the daily pace required to finish on time.</li>
          <li>A progress bar shows how far through the total word count you are across all scenes.</li>
          <li>Your daily writing history is tracked on your <Link to="/profile" className="help-link">Profile page</Link>.</li>
        </ul>
      </section>

      {/* ── 9. Sprint Timer ───────────────────────────────────────────────── */}
      <section className="help-section">
        <h2 className="help-section-title">Sprint Timer</h2>
        <p>
          Click <strong>&#9201; Sprint</strong> to open a countdown timer for
          timed writing sessions.
        </p>
        <ul>
          <li>Set a duration (e.g. 25 minutes) and start the sprint.</li>
          <li>The timer counts down and notifies you when time is up.</li>
          <li>Use sprints to build a focused writing habit and avoid distraction.</li>
        </ul>
      </section>

      {/* ── 10. Labels & Statuses ─────────────────────────────────────────── */}
      <section className="help-section">
        <h2 className="help-section-title">Labels &amp; Statuses</h2>
        <p>
          Every document can have a colored <strong>label</strong> and a{' '}
          <strong>status</strong>. Both are shown as small coloured dots in the binder.
        </p>
        <ul>
          <li>
            Right-click a document and choose <strong>Set Label…</strong> or{' '}
            <strong>Set Status…</strong> to open the picker.
          </li>
          <li>
            In the picker you can select an existing label/status, create a new one
            (choose a name and color), or clear the current assignment.
          </li>
          <li>
            New projects come with three default statuses:{' '}
            <strong>Not Started</strong>, <strong>In Progress</strong>, and{' '}
            <strong>Complete</strong>. You can rename, recolor, or delete these from
            the Project Manager.
          </li>
          <li>
            On the corkboard, the status badge is shown on each index card and can be
            changed by clicking it.
          </li>
        </ul>
      </section>

      {/* ── 11. Compile & Export ──────────────────────────────────────────── */}
      <section className="help-section">
        <h2 className="help-section-title">Compile &amp; Export</h2>
        <p>
          Click <strong>&#9636; Compile</strong> to open the export dialog.
        </p>
        <ul>
          <li>The binder tree is shown with checkboxes — check the scenes you want to include. Folders and chapters appear as structural headers and are not directly exported.</li>
          <li>Drag scenes within the compile list to change their order without affecting the binder.</li>
          <li>
            Choose an output format:
            <ul>
              <li><strong>PDF</strong> — print-ready PDF via headless Chrome.</li>
              <li><strong>DOCX</strong> — Microsoft Word document.</li>
              <li><strong>ePub</strong> — e-reader format; each scene becomes a chapter.</li>
              <li><strong>Markdown</strong> — plain Markdown text file.</li>
              <li><strong>Manuscript</strong> — standard manuscript format DOCX with title page, running header, and double-spaced 12pt Courier. Author info is set on your <Link to="/profile" className="help-link">Profile page</Link>.</li>
            </ul>
          </li>
          <li>Click <strong>Export</strong> and the file downloads automatically.</li>
        </ul>
      </section>

      {/* ── 12. Quick Document Jump ───────────────────────────────────────── */}
      <section className="help-section">
        <h2 className="help-section-title">Quick Document Jump</h2>
        <p>
          Press <kbd className="help-kbd">Ctrl+G</kbd> anywhere in the app to open the
          Quick Jump panel.
        </p>
        <ul>
          <li>Start typing any part of a document title — matching results appear instantly as you type.</li>
          <li>Press <kbd className="help-kbd">↑</kbd> / <kbd className="help-kbd">↓</kbd> to move through results, then <kbd className="help-kbd">Enter</kbd> to open the highlighted document.</li>
          <li>Click any result to open it directly.</li>
          <li>Press <kbd className="help-kbd">Esc</kbd> to dismiss the panel without navigating.</li>
        </ul>
      </section>

      {/* ── 13. Find & Replace ────────────────────────────────────────────── */}
      <section className="help-section">
        <h2 className="help-section-title">Find &amp; Replace</h2>
        <p>
          Press <kbd className="help-kbd">Ctrl+H</kbd> to open the Find &amp; Replace
          panel. Unlike a single-document search, this searches{' '}
          <strong>every document</strong> in the active project at once.
        </p>
        <ul>
          <li>Type a search term and press <kbd className="help-kbd">Enter</kbd> or click <strong>Search</strong>. Results are grouped by document, each showing a short context snippet with the matched term highlighted.</li>
          <li>Click any context snippet to navigate directly to that document.</li>
          <li>
            Two search options are available:
            <ul>
              <li><strong>Case sensitive</strong> — when off (the default), &quot;the&quot; matches &quot;The&quot; and &quot;THE&quot;. Turn it on to match exact capitalisation only.</li>
              <li><strong>Whole word</strong> — when on, &quot;cast&quot; will not match inside &quot;broadcast&quot;.</li>
            </ul>
          </li>
          <li><strong>Replace in doc</strong> — the button beside each document replaces all matches in that document only, then re-runs the search.</li>
          <li><strong>Replace All</strong> — replaces all matches across every matched document. A progress indicator shows <em>Replacing… N / N</em> while it works.</li>
          <li>Leave the Replace field empty to <strong>delete</strong> all occurrences of the search term.</li>
        </ul>
      </section>

      {/* ── 14. Keyboard Shortcuts ────────────────────────────────────────── */}
      <section className="help-section">
        <h2 className="help-section-title">Keyboard Shortcuts</h2>
        <p>
          The full list is also available inside the editor — click the{' '}
          <strong>?</strong> button in the toolbar at any time.
        </p>
        <table className="help-shortcuts-table">
          <tbody>
            <tr><td><kbd className="help-kbd">Ctrl+B</kbd></td><td>Bold</td></tr>
            <tr><td><kbd className="help-kbd">Ctrl+I</kbd></td><td>Italic</td></tr>
            <tr><td><kbd className="help-kbd">Ctrl+U</kbd></td><td>Underline</td></tr>
            <tr><td><kbd className="help-kbd">Ctrl+Shift+X</kbd></td><td>Strikethrough</td></tr>
            <tr><td><kbd className="help-kbd">Ctrl+Alt+1</kbd></td><td>Heading 1</td></tr>
            <tr><td><kbd className="help-kbd">Ctrl+Alt+2</kbd></td><td>Heading 2</td></tr>
            <tr><td><kbd className="help-kbd">Ctrl+Alt+3</kbd></td><td>Heading 3</td></tr>
            <tr><td><kbd className="help-kbd">Ctrl+Shift+8</kbd></td><td>Bullet list</td></tr>
            <tr><td><kbd className="help-kbd">Ctrl+Shift+7</kbd></td><td>Numbered list</td></tr>
            <tr><td><kbd className="help-kbd">Ctrl+Shift+B</kbd></td><td>Blockquote</td></tr>
            <tr><td><kbd className="help-kbd">Ctrl+Z</kbd></td><td>Undo</td></tr>
            <tr><td><kbd className="help-kbd">Ctrl+Y</kbd></td><td>Redo</td></tr>
            <tr><td><kbd className="help-kbd">Ctrl+G</kbd></td><td>Quick document jump</td></tr>
            <tr><td><kbd className="help-kbd">Ctrl+H</kbd></td><td>Find &amp; replace</td></tr>
            <tr><td><kbd className="help-kbd">Esc</kbd></td><td>Exit fullscreen</td></tr>
          </tbody>
        </table>
      </section>

    </main>
    </>
  );
}
