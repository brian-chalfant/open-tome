// ============================================================
// ShortcutsModal.jsx
// ============================================================
// Purpose:   Displays a modal overlay listing all editor keyboard
//            shortcuts the user can trigger while writing.
// Used by:   Editor.jsx — rendered when shortcutsOpen is true
// Exports:   ShortcutsModal (default)
// Notes:     Entirely static — no state, no API calls. If a shortcut
//            changes (e.g. Ctrl+G was once Ctrl+P), update SHORTCUTS
//            here and in the Quick Jump handler in Editor.jsx.
// ============================================================

import { useEffect } from 'react';
import '../styles/shortcuts-modal.css';

// --- CONSTANTS -----------------------------------------------

// Every row the modal table will display.
// Keep this in sync with the actual TipTap keybindings and any
// custom global listeners registered in Editor.jsx.
const SHORTCUTS = [
  { action: 'Bold',                key: 'Ctrl+B' },
  { action: 'Italic',              key: 'Ctrl+I' },
  { action: 'Underline',           key: 'Ctrl+U' },
  { action: 'Strikethrough',       key: 'Ctrl+Shift+X' },
  { action: 'Heading 1',           key: 'Ctrl+Alt+1' },
  { action: 'Heading 2',           key: 'Ctrl+Alt+2' },
  { action: 'Heading 3',           key: 'Ctrl+Alt+3' },
  { action: 'Bullet list',         key: 'Ctrl+Shift+8' },
  { action: 'Numbered list',       key: 'Ctrl+Shift+7' },
  { action: 'Blockquote',          key: 'Ctrl+Shift+B' },
  { action: 'Undo',                key: 'Ctrl+Z' },
  { action: 'Redo',                key: 'Ctrl+Y' },
  { action: 'Quick document jump', key: 'Ctrl+G' },
  { action: 'Find & replace',      key: 'Ctrl+H' },
  { action: 'Exit fullscreen',     key: 'Esc' },
];

// --- COMPONENT -----------------------------------------------

// Modal overlay listing all editor keyboard shortcuts.
// Clicking the backdrop or the ✕ button calls onClose.
// The inner panel stops click propagation so clicks inside
// don't accidentally dismiss the modal.
export default function ShortcutsModal({ onClose }) {
  useEffect(() => {
    const handle = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [onClose]);

  return (
    <div className="shortcuts-overlay" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" onClick={onClose}>
      <div className="shortcuts-modal" onClick={(e) => e.stopPropagation()}>
        <div className="shortcuts-header">
          <h2 className="shortcuts-title">Keyboard Shortcuts</h2>
          <button className="shortcuts-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <table className="shortcuts-table">
          <tbody>
            {SHORTCUTS.map(({ action, key }) => (
              <tr key={action}>
                <td className="shortcuts-action">{action}</td>
                {/* <kbd> renders the key combo in a styled chip */}
                <td className="shortcuts-key"><kbd>{key}</kbd></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
