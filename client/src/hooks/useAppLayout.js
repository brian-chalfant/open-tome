// ============================================================
// useAppLayout.js
// ============================================================
// Purpose:   Encapsulates all layout and drawer state for AppPage:
//            mobile binder/overflow drawers, desktop binder collapse,
//            split editor, pane focus, and swipe gesture wiring.
//            Extracted from AppPage.jsx to separate layout concerns
//            from document routing and modal visibility.
// Used by:   AppPage.jsx
// Exports:   useAppLayout(isMobile)
// Notes:     All refs (shellRef, overflowRef, hamburgerBtnRef,
//            userMenuRef) are created here and returned so AppPage
//            can attach them to the correct DOM nodes in JSX.
//            Modal visibility (compile, targets, sprint, corkboard)
//            lives in binderStore, not here — those panels are
//            conceptually different from layout.
// ============================================================

import { useCallback, useRef, useEffect, useState } from 'react';
import { useSwipeGesture } from './useSwipeGesture.js';
import { useBinderStore } from '../store/binderStore.js';
import { prefs } from '../utils/storage.js';

// --- HOOK ----------------------------------------------------

/**
 * Manages all layout-level state for the AppPage shell.
 *
 * @param {boolean} isMobile - True when the viewport is below the mobile breakpoint.
 * @returns {object} Layout state and handlers for AppPage to consume.
 */
export function useAppLayout(isMobile) {
  // setActiveDoc is needed by handleBinderSelect to open documents in the main pane.
  const setActiveDoc = useBinderStore((s) => s.setActiveDoc);

  // --- REFS --------------------------------------------------

  // shellRef is the app-shell root — used by the swipe gesture hook.
  const shellRef        = useRef(null);
  // overflowRef wraps the mobile overflow menu — used for outside-click detection.
  const overflowRef     = useRef(null);
  // hamburgerBtnRef is the mobile hamburger button — receives focus when binder closes.
  const hamburgerBtnRef = useRef(null);
  // userMenuRef wraps the desktop user menu — used for outside-click + Escape detection.
  const userMenuRef     = useRef(null);
  // Tracks the previous binderOpen value so we know when it transitions false→true.
  const prevBinderOpen  = useRef(false);

  // --- STATE -------------------------------------------------

  // Mobile drawers — binder slides in from the left, overflow is a dropdown menu.
  const [binderOpen,   setBinderOpen]   = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);
  // Desktop user profile menu.
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  // Desktop binder rail: collapsed = icon-only rail, expanded = full panel.
  const [binderCollapsed, setBinderCollapsed] = useState(prefs.binderCollapsed.get);
  const toggleBinderCollapsed = useCallback(() => {
    setBinderCollapsed((prev) => {
      prefs.binderCollapsed.set(!prev);
      return !prev;
    });
  }, []);

  // Split editor: active flag, the right-pane document ID, and which pane is targeted.
  const [splitActive, setSplitActive] = useState(prefs.editorSplit.get);
  const [splitDocId,  setSplitDocId]  = useState(null);
  const [focusedPane, setFocusedPane] = useState('left');

  // --- EFFECTS -----------------------------------------------

  // Disable split editor when switching to mobile — it can't fit two panes.
  useEffect(() => {
    if (isMobile && splitActive) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSplitActive(false);
      setSplitDocId(null);
      setFocusedPane('left');
      prefs.editorSplit.set(false);
    }
  }, [isMobile, splitActive]);

  // Close mobile-only drawers when resizing back to desktop.
  useEffect(() => {
    if (!isMobile) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBinderOpen(false);
      setOverflowOpen(false);
    }
  }, [isMobile]);

  // Mutual exclusion: opening the binder drawer closes the overflow menu.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (binderOpen) setOverflowOpen(false);
  }, [binderOpen]);

  // Return focus to the hamburger button when the binder drawer closes on mobile
  // so that keyboard users don't lose their place in the document.
  useEffect(() => {
    if (prevBinderOpen.current && !binderOpen && isMobile) {
      hamburgerBtnRef.current?.focus();
    }
    prevBinderOpen.current = binderOpen;
  }, [binderOpen, isMobile]);

  // Close the overflow menu when the user clicks anywhere outside it.
  useEffect(() => {
    if (!overflowOpen) return;
    const handler = (e) => {
      if (overflowRef.current && !overflowRef.current.contains(e.target)) {
        setOverflowOpen(false);
      }
    };
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [overflowOpen]);

  // Close the desktop user menu on outside click or Escape.
  useEffect(() => {
    if (!userMenuOpen) return;
    const handler    = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setUserMenuOpen(false);
      }
    };
    const keyHandler = (e) => { if (e.key === 'Escape') setUserMenuOpen(false); };
    window.addEventListener('click', handler);
    window.addEventListener('keydown', keyHandler);
    return () => {
      window.removeEventListener('click', handler);
      window.removeEventListener('keydown', keyHandler);
    };
  }, [userMenuOpen]);

  // --- SWIPE GESTURE -----------------------------------------

  // Right-swipe anywhere on the shell opens the binder drawer on mobile.
  const onSwipeRight = useCallback(() => { if (isMobile) setBinderOpen(true); }, [isMobile]);
  useSwipeGesture(shellRef, { onSwipeRight });

  // --- CALLBACKS ---------------------------------------------

  // Toggle split editor and clean up the right pane when disabling.
  const toggleSplit = useCallback(() => {
    setSplitActive((prev) => {
      const next = !prev;
      prefs.editorSplit.set(next);
      if (!next) { setSplitDocId(null); setFocusedPane('left'); }
      return next;
    });
  }, []);

  // Route a binder selection to the correct pane (main or split right).
  // Also closes the mobile binder drawer after selection.
  const handleBinderSelect = useCallback((docId) => {
    if (splitActive && focusedPane === 'right') {
      setSplitDocId(docId);
    } else {
      setActiveDoc(docId);
    }
    if (isMobile) setBinderOpen(false);
  }, [splitActive, focusedPane, setActiveDoc, isMobile]);

  // Target a specific split pane for binder selections.
  // No-op when split is not active — avoids stale pane focus state.
  const focusPane = useCallback((pane) => {
    if (splitActive) setFocusedPane(pane);
  }, [splitActive]);

  // --- DERIVED -----------------------------------------------

  // anyDrawerOpen drives aria-hidden on the workspace and the mobile backdrop.
  const anyDrawerOpen = isMobile && binderOpen;

  // --- RETURN ------------------------------------------------

  return {
    // Refs — attach to DOM nodes in AppPage JSX
    shellRef,
    overflowRef,
    hamburgerBtnRef,
    userMenuRef,
    // Drawer / menu state
    binderOpen,   setBinderOpen,
    overflowOpen, setOverflowOpen,
    userMenuOpen, setUserMenuOpen,
    // Desktop binder collapse
    binderCollapsed, toggleBinderCollapsed,
    // Split editor
    splitActive, toggleSplit,
    splitDocId,  setSplitDocId,
    focusedPane, setFocusedPane, focusPane,
    // Binder selection handler
    handleBinderSelect,
    // Derived
    anyDrawerOpen,
  };
}
