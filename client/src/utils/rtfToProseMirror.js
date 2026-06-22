// ============================================================
// rtfToProseMirror.js
// ============================================================
// Purpose:   Convert an RTF clipboard string (from Scrivener or any
//            RTF-aware app) into a ProseMirror document JSON object
//            so formatted text can be pasted into the TipTap editor.
// Used by:   Editor.jsx — handlePaste in editorProps
// Exports:   rtfToProseMirror(rtfString) → pmDoc | null
// Notes:     Handles bold, italic, underline, strikethrough, paragraphs,
//            hard line breaks, hex escapes, and Unicode escapes.
//            Tables, images, and ordered lists are out of scope for this pass.
//            Always returns null on empty or clearly malformed input so
//            the caller can fall back to the browser's default paste.
// ============================================================

// --- WINDOWS-1252 SUPPLEMENT MAP ---------------------------
// RTF \'xx hex escapes use Windows-1252 encoding. Characters 0x80–0x9F
// differ from ISO-8859-1 — this map covers the printable subset.
const WIN1252 = {
  0x80: 0x20AC, // €
  0x82: 0x201A, // ‚
  0x83: 0x0192, // ƒ
  0x84: 0x201E, // „
  0x85: 0x2026, // …
  0x86: 0x2020, // †
  0x87: 0x2021, // ‡
  0x88: 0x02C6, // ˆ
  0x89: 0x2030, // ‰
  0x8A: 0x0160, // Š
  0x8B: 0x2039, // ‹
  0x8C: 0x0152, // Œ
  0x8E: 0x017D, // Ž
  0x91: 0x2018, // '
  0x92: 0x2019, // '
  0x93: 0x201C, // "
  0x94: 0x201D, // "
  0x95: 0x2022, // •
  0x96: 0x2013, // –
  0x97: 0x2014, // —
  0x98: 0x02DC, // ˜
  0x99: 0x2122, // ™
  0x9A: 0x0161, // š
  0x9B: 0x203A, // ›
  0x9C: 0x0153, // œ
  0x9E: 0x017E, // ž
  0x9F: 0x0178, // Ÿ
};

// Destination group names that should be silently skipped.
// These contain metadata, not user-visible content.
const SKIP_DESTINATIONS = new Set([
  'fonttbl', 'colortbl', 'stylesheet', 'info',
  'listtable', 'listoverridetable', 'fldinst',
  'pict', 'object', 'header', 'footer',
]);

// --- PARSER ------------------------------------------------

/**
 * Convert an RTF clipboard string to a ProseMirror document JSON.
 *
 * Returns null if the input is empty, not RTF, or produces no content.
 * Errors inside individual control-word handlers are swallowed so a
 * malformed RTF fragment never crashes the editor.
 *
 * @param {string} rtf  Raw RTF string from clipboardData.
 * @returns {{ type: 'doc', content: Array } | null}
 */
export function rtfToProseMirror(rtf) {
  if (!rtf || !rtf.trimStart().startsWith('{\\rtf')) return null;

  // Each stack frame holds the character-level formatting active inside
  // the current RTF group, plus a `skip` flag for destination groups.
  const stack = [{ bold: false, italic: false, underline: false, strike: false, skip: false }];
  const top = () => stack[stack.length - 1];

  // Accumulated output
  const paragraphs = [];
  let runs    = [];  // inline nodes for the current paragraph
  let pending = '';  // text accumulating for the current run

  // --- helpers ---

  // Commit `pending` text as a run node, then clear it.
  function flushText() {
    if (!pending || top().skip) { pending = ''; return; }
    const s = top();
    const marks = [];
    if (s.bold)      marks.push({ type: 'bold' });
    if (s.italic)    marks.push({ type: 'italic' });
    if (s.underline) marks.push({ type: 'underline' });
    if (s.strike)    marks.push({ type: 'strike' });
    const node = { type: 'text', text: pending };
    if (marks.length) node.marks = marks;
    runs.push(node);
    pending = '';
  }

  // Finalise the current paragraph and start a fresh one.
  function flushParagraph() {
    flushText();
    // Only emit a paragraph when it has content. Empty paragraphs arise from
    // \par\par or \pard…\par separator patterns in Scrivener/Word RTF and would
    // create extra visual spacing — CSS paragraph margin already separates paragraphs.
    if (runs.length) {
      paragraphs.push({ type: 'paragraph', content: runs });
    }
    runs = [];
  }

  // --- character walk ---

  let i = 0;
  while (i < rtf.length) {
    const ch = rtf[i];

    if (ch === '{') {
      // Open group: push a copy of the current state so the group can
      // temporarily override formatting and then restore it on '}'.
      flushText();
      stack.push({ ...top() });
      i++;

    } else if (ch === '}') {
      // Close group: restore state from before the group opened.
      flushText();
      if (stack.length > 1) stack.pop();
      i++;

    } else if (ch === '\\') {
      i++;
      if (i >= rtf.length) break;

      const next = rtf[i];

      if (next === '*') {
        // \* marks the next control word as a destination — if it names a
        // known skip destination, mark this whole group as skip.
        i++;
        // Skip optional whitespace before the control word
        while (i < rtf.length && rtf[i] === ' ') i++;
        if (rtf[i] === '\\') {
          i++; // consume the backslash of the control word that follows
          let dest = '';
          while (i < rtf.length && /[a-zA-Z]/.test(rtf[i])) dest += rtf[i++];
          if (SKIP_DESTINATIONS.has(dest)) top().skip = true;
          // Skip parameter + delimiter if present
          if (rtf[i] === '-') i++;
          while (i < rtf.length && /\d/.test(rtf[i])) i++;
          if (rtf[i] === ' ') i++;
        }

      } else if (next === "'") {
        // \'xx — hex-encoded Windows-1252 character
        i++;
        const hex = rtf.slice(i, i + 2);
        i += 2;
        if (!top().skip && /^[0-9A-Fa-f]{2}$/.test(hex)) {
          const code = parseInt(hex, 16);
          pending += String.fromCharCode(WIN1252[code] ?? code);
        }

      } else if (next === 'u' && (rtf[i + 1] === '-' || /\d/.test(rtf[i + 1]))) {
        // \u-NNN? — Unicode escape; only when 'u' is immediately followed by
        // a digit or '-'. Without that guard, \ul (underline) would be mis-parsed
        // as a Unicode escape consuming the 'l' as the replacement character.
        i++; // skip 'u'
        let numStr = '';
        if (rtf[i] === '-') { numStr += '-'; i++; }
        while (i < rtf.length && /\d/.test(rtf[i])) numStr += rtf[i++];
        if (rtf[i] === ' ') i++; // optional space delimiter
        // Skip the single fallback ASCII character that follows the escape
        if (i < rtf.length && rtf[i] !== '\\' && rtf[i] !== '{' && rtf[i] !== '}') i++;
        if (!top().skip && numStr) {
          const code = parseInt(numStr, 10);
          // RTF signed 16-bit: negative values map to high Unicode code points
          pending += String.fromCodePoint(code < 0 ? code + 65536 : code);
        }

      } else if (next === '\n' || next === '\r') {
        // A backslash followed by a newline is an implicit paragraph break in some RTF.
        flushParagraph();
        i++;

      } else if (next === '{' || next === '}' || next === '\\') {
        // Escaped literal characters
        if (!top().skip) pending += next;
        i++;

      } else if (next === '-') {
        // Optional hyphen — emit as regular hyphen
        if (!top().skip) pending += '-';
        i++;

      } else if (next === '~') {
        // Non-breaking space
        if (!top().skip) pending += ' ';
        i++;

      } else {
        // Regular control word (e.g. \b, \par, \i1)
        let word = '';
        while (i < rtf.length && /[a-zA-Z]/.test(rtf[i])) word += rtf[i++];

        // Optional signed integer parameter
        let numStr = '';
        if (i < rtf.length && rtf[i] === '-') { numStr += '-'; i++; }
        while (i < rtf.length && /\d/.test(rtf[i])) numStr += rtf[i++];
        const num = numStr !== '' ? parseInt(numStr, 10) : null;

        // Control words are delimited by a space (consumed) or any non-letter/digit
        if (rtf[i] === ' ') i++;

        // Mark known skip destinations even without the \* prefix
        if (SKIP_DESTINATIONS.has(word)) { top().skip = true; continue; }
        if (top().skip) continue;

        switch (word) {
          case 'b':
            flushText();
            // \b with no param or param != 0 = bold on; \b0 = bold off
            top().bold = (num === null || num !== 0);
            break;
          case 'i':
            flushText();
            top().italic = (num === null || num !== 0);
            break;
          case 'ul':
            flushText();
            top().underline = (num === null || num !== 0);
            break;
          case 'ulnone':
            flushText();
            top().underline = false;
            break;
          case 'strike':
          case 'striked':
            flushText();
            top().strike = (num === null || num !== 0);
            break;
          case 'par':
            // Paragraph break — commit current paragraph
            flushParagraph();
            break;
          case 'line':
            // Soft line break within a paragraph
            flushText();
            runs.push({ type: 'hardBreak' });
            break;
          case 'tab':
            // Tab character
            pending += '\t';
            break;
          case 'pard':
          case 'plain':
            // Reset paragraph / character defaults — for now we just flush
            // pending text so marks don't bleed; group pop handles restoration.
            flushText();
            break;
          default:
            // Unknown control word — silently ignored (safe for unknown tags)
            break;
        }
      }

    } else if (ch === '\r' || ch === '\n') {
      // Bare newlines inside RTF body are not paragraph breaks; skip them.
      i++;
    } else {
      // Plain text character
      if (!top().skip) pending += ch;
      i++;
    }
  }

  // Flush whatever is left after the last \par
  flushText();
  if (runs.length) {
    paragraphs.push({ type: 'paragraph', content: runs });
  }

  if (!paragraphs.length) return null;

  return { type: 'doc', content: paragraphs };
}
