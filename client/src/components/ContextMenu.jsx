/**
 * @file components/ContextMenu.jsx
 * @description Floating right-click context menu used by the binder tree.
 *
 * Positioned at a given (x, y) screen coordinate and closed on outside click
 * (handled by the parent) or Escape keypress (handled here).
 */

import { useEffect, useRef } from 'react';

/**
 * Floating context menu positioned at absolute screen coordinates.
 *
 * @param {Object}   props
 * @param {number}   props.x        - Left position in client pixels.
 * @param {number}   props.y        - Top position in client pixels.
 * @param {Array<{label: string, action: Function, danger?: boolean, separator?: boolean}>} props.items
 *   - Menu items to render. A `separator: true` item renders a dividing line.
 * @param {Function} props.onClose  - Called when the menu should close (Escape key).
 * @returns {JSX.Element}
 */
export default function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null);

  // Close the menu when the user presses Escape
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Position the menu at the click coordinates
  const style = { left: x, top: y };

  return (
    <div
      ref={ref}
      className="context-menu"
      style={style}
      // Prevent the window click-to-close handler from firing immediately
      onClick={(e) => e.stopPropagation()}
      role="menu"
    >
      {items.map((item, i) =>
        item.separator ? (
          <div key={i} className="context-menu-separator" role="separator" />
        ) : (
          <button
            key={i}
            type="button"
            role="menuitem"
            className={`context-menu-item${item.danger ? ' context-menu-item--danger' : ''}`}
            onClick={() => { item.action(); onClose(); }}
          >
            {item.label}
          </button>
        )
      )}
    </div>
  );
}
