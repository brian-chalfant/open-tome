// ============================================================
// BinderIcons.jsx
// ============================================================
// Purpose:   SVG icon components for the five binder document types.
//            All icons share the same visual language: 16×16 viewport,
//            no fill, 1.5px stroke, inherits currentColor from CSS.
// Used by:   BinderNode.jsx
// Exports:   SceneIcon, FolderIcon, ResearchIcon, CharacterIcon, ChapterIcon
// ============================================================

export function SceneIcon() {
  return (
    <svg className="binder-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="3" y="2" width="10" height="12" rx="1" />
      <line x1="5" y1="5.5" x2="11" y2="5.5" />
      <line x1="5" y1="8"   x2="11" y2="8"   />
      <line x1="5" y1="10.5" x2="9" y2="10.5" />
    </svg>
  );
}

export function FolderIcon() {
  return (
    <svg className="binder-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M2 5a1 1 0 0 1 1-1h3l1.5 1.5H13a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5z" />
    </svg>
  );
}

export function ResearchIcon() {
  return (
    <svg className="binder-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <circle cx="7" cy="7" r="4" />
      <line x1="10.5" y1="10.5" x2="13.5" y2="13.5" strokeLinecap="round" />
    </svg>
  );
}

export function CharacterIcon() {
  return (
    <svg className="binder-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <circle cx="8" cy="5" r="3" />
      <path d="M2.5 14c0-2.761 2.462-5 5.5-5s5.5 2.239 5.5 5" strokeLinecap="round" />
    </svg>
  );
}

export function ChapterIcon() {
  return (
    <svg className="binder-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      {/* Open book: two pages meeting at a spine */}
      <path d="M8 13V4" strokeLinecap="round" />
      <path d="M8 4C7 2.5 4.5 2 2 3v9c2.5-1 5-0.5 6 1" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 4c1-1.5 3.5-2 6-1v9c-2.5-1-5-0.5-6 1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
