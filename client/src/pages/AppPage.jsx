import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { useBinderStore } from '../store/binderStore.js';
import { useBinder } from '../hooks/useBinder.js';
import { useMobileLayout } from '../hooks/useMobileLayout.js';
import { useAppLayout } from '../hooks/useAppLayout.js';
import Binder from '../components/Binder.jsx';
import Editor from '../components/Editor.jsx';
import CorkboardView from '../components/CorkboardView.jsx';
import CompileModal from '../components/CompileModal.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import TargetsWidget from '../components/TargetsWidget.jsx';
import SprintTimer from '../components/SprintTimer.jsx';

export default function AppPage() {
  const { projectId: urlProjectId } = useParams();
  const parsedUrlProjectId = urlProjectId ? (parseInt(urlProjectId, 10) || undefined) : undefined;

  const { user, logout } = useAuth();
  const isMobile         = useMobileLayout();

  // ── Layout state (drawers, split, binder collapse) ───────────────────────
  const {
    shellRef, overflowRef, hamburgerBtnRef, userMenuRef,
    binderOpen,   setBinderOpen,
    overflowOpen, setOverflowOpen,
    userMenuOpen, setUserMenuOpen,
    binderCollapsed, toggleBinderCollapsed,
    splitActive, toggleSplit,
    splitDocId,
    focusedPane, setFocusedPane, focusPane,
    handleBinderSelect,
    anyDrawerOpen,
  } = useAppLayout(isMobile);

  // ── Modal / panel visibility (from store) ─────────────────────────────────
  const compileOpen     = useBinderStore((s) => s.compileOpen);
  const setCompileOpen  = useBinderStore((s) => s.setCompileOpen);
  const targetsOpen     = useBinderStore((s) => s.targetsOpen);
  const toggleTargets   = useBinderStore((s) => s.toggleTargets);
  const sprintOpen      = useBinderStore((s) => s.sprintOpen);
  const setSprintOpen   = useBinderStore((s) => s.setSprintOpen);
  const corkboardActive = useBinderStore((s) => s.corkboardActive);
  const toggleCorkboard = useBinderStore((s) => s.toggleCorkboard);

  // ── Document / project state ──────────────────────────────────────────────
  const activeDocId     = useBinderStore((s) => s.activeDocId);
  const activeProjectId = useBinderStore((s) => s.activeProjectId);
  const docVersions     = useBinderStore((s) => s.docVersions);
  const docs            = useBinderStore((s) => s.documents);
  const binder          = useBinder(parsedUrlProjectId, { init: true });

  function docTitle(id) {
    const doc = docs.find((d) => d.id === id);
    return doc ? doc.title : 'Untitled';
  }

  const selectedDoc   = docs.find((d) => d.id === activeDocId);
  const showCorkboard = corkboardActive && (selectedDoc?.type === 'folder' || selectedDoc?.type === 'chapter');

  return (
    <div className="app-shell" ref={shellRef}>

      {/* ── Top nav bar ─────────────────────────────────────────── */}
      <header
        className="app-topbar"
        aria-label="Application toolbar"
        aria-hidden={anyDrawerOpen ? 'true' : undefined}
      >
        {isMobile ? (
          /* ── Mobile topbar ── */
          <>
            <button
              ref={hamburgerBtnRef}
              type="button"
              className="app-hamburger-btn"
              onClick={() => setBinderOpen(true)}
              aria-label="Open binder"
              aria-expanded={binderOpen ? 'true' : 'false'}
            >
              &#9776;
            </button>

            <span className="app-logo" style={{ flex: 1, marginLeft: 8 }}>Tome</span>

            <ThemeToggle />

            <div ref={overflowRef} style={{ position: 'relative' }}>
              <button
                type="button"
                className="app-overflow-menu-btn toolbar-btn"
                style={{ display: 'flex', minHeight: 44, padding: '0 10px', letterSpacing: 2 }}
                onClick={(e) => { e.stopPropagation(); setOverflowOpen((p) => !p); }}
                aria-label="More options"
                aria-expanded={overflowOpen ? 'true' : 'false'}
                aria-haspopup="menu"
              >
                ···
              </button>

              {overflowOpen && (
                <div className="app-overflow-menu" role="menu">
                  <button
                    type="button"
                    className="app-overflow-item"
                    onClick={() => { toggleTargets(); setOverflowOpen(false); }}
                    disabled={!activeProjectId}
                    role="menuitem"
                  >
                    &#9678; Targets {targetsOpen ? '(on)' : ''}
                  </button>
                  <button
                    type="button"
                    className="app-overflow-item"
                    onClick={() => { setSprintOpen(!sprintOpen); setOverflowOpen(false); }}
                    role="menuitem"
                  >
                    &#9201; Sprint {sprintOpen ? '(on)' : ''}
                  </button>
                  <button
                    type="button"
                    className="app-overflow-item"
                    onClick={() => { toggleCorkboard(); setOverflowOpen(false); }}
                    disabled={!corkboardActive && (!activeDocId || (selectedDoc?.type !== 'folder' && selectedDoc?.type !== 'chapter'))}
                    role="menuitem"
                  >
                    &#9638; Corkboard {corkboardActive ? '(on)' : ''}
                  </button>
                  <button
                    type="button"
                    className="app-overflow-item"
                    onClick={() => { setCompileOpen(true); setOverflowOpen(false); }}
                    disabled={!activeProjectId}
                    role="menuitem"
                  >
                    &#9636; Compile
                  </button>
                  {user && (
                    <Link
                      to="/profile"
                      className="app-overflow-item"
                      onClick={() => setOverflowOpen(false)}
                      role="menuitem"
                    >
                      {user.avatar_url && (
                        <img
                          src={user.avatar_url}
                          alt=""
                          width={20}
                          height={20}
                          className="app-avatar"
                          referrerPolicy="no-referrer"
                        />
                      )}
                      {user.display_name} · Profile
                    </Link>
                  )}
                  <Link
                    to="/help"
                    className="app-overflow-item"
                    onClick={() => setOverflowOpen(false)}
                    role="menuitem"
                  >
                    ? Help
                  </Link>
                  <button
                    type="button"
                    className="app-overflow-item"
                    onClick={() => { logout(); setOverflowOpen(false); }}
                    role="menuitem"
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          /* ── Desktop topbar ── */
          <>
            <span className="app-logo">Open Tome</span>

            {/* Group 1: View toggles */}
            <div className="app-topbar-group">
              <button
                type="button"
                className={`toolbar-btn${binderCollapsed ? ' toolbar-btn--active' : ''}`}
                onClick={toggleBinderCollapsed}
                title={binderCollapsed ? 'Show binder' : 'Hide binder'}
                aria-label={binderCollapsed ? 'Show binder' : 'Hide binder'}
                aria-pressed={binderCollapsed ? 'true' : 'false'}
              >
                <span aria-hidden="true">&#9776;</span> Binder
              </button>
              <button
                type="button"
                className={`toolbar-btn${splitActive ? ' toolbar-btn--active' : ''}`}
                onClick={toggleSplit}
                title={splitActive ? 'Close split view' : 'Split editor'}
                aria-label={splitActive ? 'Close split view' : 'Open split editor'}
                aria-pressed={splitActive ? 'true' : 'false'}
              >
                <span aria-hidden="true">&#9707;</span> Split
              </button>
              <button
                type="button"
                className={`toolbar-btn${corkboardActive ? ' toolbar-btn--active' : ''}`}
                onClick={toggleCorkboard}
                title={corkboardActive ? 'Switch to editor view' : 'Switch to corkboard view'}
                aria-label={corkboardActive ? 'Close corkboard view' : 'Open corkboard view'}
                aria-pressed={corkboardActive ? 'true' : 'false'}
                disabled={!corkboardActive && (!activeDocId || (selectedDoc?.type !== 'folder' && selectedDoc?.type !== 'chapter'))}
              >
                <span aria-hidden="true">&#9638;</span> Corkboard
              </button>
            </div>

            <span className="app-topbar-sep" aria-hidden="true" />

            {/* Group 2: Writing tools */}
            <div className="app-topbar-group">
              <button
                type="button"
                className={`toolbar-btn${targetsOpen ? ' toolbar-btn--active' : ''}`}
                onClick={toggleTargets}
                title={targetsOpen ? 'Hide targets' : 'Show writing targets'}
                aria-label={targetsOpen ? 'Hide writing targets' : 'Show writing targets'}
                aria-pressed={targetsOpen ? 'true' : 'false'}
                disabled={!activeProjectId}
              >
                <span aria-hidden="true">&#9678;</span> Targets
              </button>
              <button
                type="button"
                className={`toolbar-btn${sprintOpen ? ' toolbar-btn--active' : ''}`}
                onClick={() => setSprintOpen(!sprintOpen)}
                title={sprintOpen ? 'Hide sprint timer' : 'Sprint timer'}
                aria-label={sprintOpen ? 'Hide sprint timer' : 'Open sprint timer'}
                aria-pressed={sprintOpen ? 'true' : 'false'}
              >
                <span aria-hidden="true">&#9201;</span> Sprint
              </button>
            </div>

            <span className="app-topbar-sep" aria-hidden="true" />

            {/* Group 3: CTA + Help */}
            <div className="app-topbar-group">
              <button
                type="button"
                className="toolbar-btn toolbar-btn--cta"
                onClick={() => setCompileOpen(true)}
                title="Compile &amp; Export"
                aria-label="Compile and export"
                disabled={!activeProjectId}
              >
                <span aria-hidden="true">&#9636;</span> Compile
              </button>
              <Link to="/help" className="toolbar-btn" title="Help" aria-label="Help">
                <span aria-hidden="true">?</span> Help
              </Link>
            </div>

            {user && (
              <div className="app-topbar-user" ref={userMenuRef}>
                <ThemeToggle />
                <button
                  type="button"
                  className="app-profile-btn"
                  aria-haspopup="menu"
                  aria-expanded={userMenuOpen ? 'true' : 'false'}
                  aria-label={`${user.display_name} — account menu`}
                  onClick={(e) => { e.stopPropagation(); setUserMenuOpen((p) => !p); }}
                >
                  {user.avatar_url && (
                    <img
                      src={user.avatar_url}
                      alt=""
                      width={22}
                      height={22}
                      className="app-avatar"
                      referrerPolicy="no-referrer"
                    />
                  )}
                  <span className="app-display-name">{user.display_name}</span>
                  <span className="app-profile-btn-arrow" aria-hidden="true">▾</span>
                </button>
                {userMenuOpen && (
                  <div className="app-user-menu" role="menu">
                    <Link
                      to="/profile"
                      className="app-user-menu-item"
                      role="menuitem"
                      onClick={() => setUserMenuOpen(false)}
                    >
                      Your Profile
                    </Link>
                    <button
                      type="button"
                      className="app-user-menu-item app-user-menu-item--danger"
                      role="menuitem"
                      onClick={() => { logout(); setUserMenuOpen(false); }}
                    >
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </header>

      {/* ── Backdrop — closes whichever drawer is open ──────────── */}
      {anyDrawerOpen && (
        <div
          className="mobile-backdrop"
          style={{ display: 'block' }}
          role="presentation"
          aria-hidden="true"
          onClick={() => setBinderOpen(false)}
        />
      )}

      {/* ── Sprint timer panel ──────────────────────────────────── */}
      <SprintTimer
        isOpen={sprintOpen}
        onClose={() => setSprintOpen(false)}
        onForceOpen={() => setSprintOpen(true)}
      />

      {/* ── Targets widget ──────────────────────────────────────── */}
      {targetsOpen && activeProjectId && <TargetsWidget />}

      {/* ── Main workspace ──────────────────────────────────────── */}
      <div
        className="app-workspace"
        aria-hidden={anyDrawerOpen ? 'true' : undefined}
      >
        <div className={`binder-rail${binderCollapsed && !isMobile ? ' binder-rail--collapsed' : ''}`}>
          <Binder
            onSelect={handleBinderSelect}
            isMobileOpen={isMobile && binderOpen}
            onMobileClose={() => setBinderOpen(false)}
          />
        </div>

        {/* ── Editor area ─────────────────────────────────────── */}
        <main id="main-content" className="app-editor-area" tabIndex={-1}>
          {/* Left / primary pane */}
          <div
            className={`editor-pane${splitActive && focusedPane === 'left' ? ' editor-pane--focused' : ''}`}
            onClick={() => focusPane('left')}
          >
            {splitActive && (
              <div className="editor-pane-label">
                <span>{activeDocId ? docTitle(activeDocId) : 'No document selected'}</span>
                <button
                  type="button"
                  title="Target this pane for binder selection"
                  onClick={(e) => { e.stopPropagation(); setFocusedPane('left'); }}
                  aria-label="Focus left pane"
                >
                  {focusedPane === 'left' ? '●' : '○'}
                </button>
              </div>
            )}
            {activeDocId ? (
              showCorkboard
                ? <CorkboardView />
                : <Editor key={`${activeDocId}-${docVersions[activeDocId] ?? 0}`} docId={activeDocId} />
            ) : isMobile ? (
              <div className="editor-empty-pane">
                Tap &#9776; to open the binder and select a document.
              </div>
            ) : (
              <div className="editor-empty-pane editor-empty-pane--rich">
                <span className="editor-empty-icon" aria-hidden="true">&#9998;</span>
                <p className="editor-empty-heading">No document open</p>
                <p className="editor-empty-sub">
                  Select a document from the binder to begin writing, or create a new one.
                </p>
                {activeProjectId && (
                  <button
                    type="button"
                    className="editor-empty-cta"
                    onClick={() => binder.newDocument('scene', null).then(doc => {
                      if (doc) binder.setActiveDoc(doc.id);
                    })}
                  >
                    New Document
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Right / split pane — desktop only */}
          {splitActive && !isMobile && (
            <>
              <div className="app-split-divider" aria-hidden="true" />
              <div
                className={`editor-pane${focusedPane === 'right' ? ' editor-pane--focused' : ''}`}
                onClick={() => focusPane('right')}
              >
                <div className="editor-pane-label">
                  <span>{splitDocId ? docTitle(splitDocId) : 'No document selected'}</span>
                  <button
                    type="button"
                    title="Target this pane for binder selection"
                    onClick={(e) => { e.stopPropagation(); setFocusedPane('right'); }}
                    aria-label="Focus right pane"
                  >
                    {focusedPane === 'right' ? '●' : '○'}
                  </button>
                </div>
                {splitDocId ? (
                  <Editor key={`${splitDocId}-${docVersions[splitDocId] ?? 0}`} docId={splitDocId} />
                ) : (
                  <div className="editor-empty-pane editor-empty-pane--rich">
                    <span className="editor-empty-icon" aria-hidden="true">&#9998;</span>
                    <p className="editor-empty-heading">No document selected</p>
                    <p className="editor-empty-sub">
                      Click ● above to target this pane, then select a document from the binder.
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </main>

      </div>

      {/* ── Compile modal ──────────────────────────────────────── */}
      {compileOpen && activeProjectId && (
        <CompileModal
          projectId={activeProjectId}
          onClose={() => setCompileOpen(false)}
        />
      )}
    </div>
  );
}
