// ============================================================
// pmToRtf.js
// ============================================================
// Purpose:   Convert a parsed TipTap / ProseMirror JSON document
//            into a complete, standalone RTF 1.5 document string.
//            Used when the user requests RTF format in the ZIP archive export.
// Used by:   routes/projects.js — GET /api/projects/:id/archive?format=rtf
// Exports:   pmToRtf(doc) → string
// Notes:     RTF is plain ASCII with escape sequences, so no external library
//            is needed. The output is a full RTF file (header + font table +
//            body) that can be written directly to a .rtf file and opened in
//            any word processor — Word, LibreOffice, TextEdit, etc.
//            Node coverage mirrors pmToMarkdown.js. Unknown node types fall
//            through to render their children so no content is silently lost.
// ============================================================


// --- CHARACTER ESCAPING --------------------------------------

// Walk every character in a string and convert it to RTF-safe output.
// RTF uses ASCII control sequences, so three characters are special and must
// be escaped, and anything outside the 7-bit ASCII range needs numeric encoding.
//
// Three escaping strategies are used depending on the code point:
//   • ASCII (0–127) except \ { }  → written as-is
//   • Backslash, { and }           → escaped as \\ \{ \} (RTF control chars)
//   • 128–255 (WinAnsi / cp1252)  → \'xx  hex escape
//   • 256 and above               → \uN?  RTF Unicode escape
//
// Called before any mark wrapping so the escape layer never double-escapes
// the RTF control words that applyMarks injects.
function escRtf(text) {
  let out = '';
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (ch === '\\') { out += '\\\\'; }
    else if (ch === '{')  { out += '\\{'; }
    else if (ch === '}')  { out += '\\}'; }
    else if (code >= 128 && code <= 255) {
      // WinAnsi hex escape — readable by all RTF readers
      out += `\\'${code.toString(16).padStart(2, '0')}`;
    } else if (code > 255) {
      // RTF Unicode escape: \uN uses a signed 16-bit integer.
      // Values above 32767 wrap into negative signed range (N − 65536).
      // The trailing '?' is the fallback character shown when the reader
      // cannot render the Unicode glyph (rare for modern readers).
      const signed = code > 32767 ? code - 65536 : code;
      out += `\\u${signed}?`;
    } else {
      out += ch;
    }
  }
  return out;
}


// --- HIGHLIGHT COLOUR PRE-SCAN --------------------------------

// Walk the entire document tree and collect every unique highlight colour into
// a 1-indexed Map<hex, index>.  RTF colour tables are 1-indexed (0 = automatic).
// The map is built once in pmToRtf() and threaded through the render functions
// so applyMarks can emit the correct \highlightN index for each mark.
function collectHighlights(node) {
  const seen = new Set();
  function walk(n) {
    if (!n) return;
    if (Array.isArray(n.marks)) {
      for (const m of n.marks) {
        if (m.type === 'highlight' && m.attrs?.color) seen.add(m.attrs.color);
      }
    }
    if (Array.isArray(n.content)) n.content.forEach(walk);
  }
  walk(node);
  const map = new Map();
  let idx = 1;
  for (const color of seen) map.set(color, idx++);
  return map;
}

// Convert a '#rrggbb' hex string to integer { r, g, b } components for the
// RTF colour table entry format: \redR\greenG\blueB;
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}


// --- INLINE RENDERING ----------------------------------------

// Wrap already-escaped text in RTF control words for each ProseMirror mark.
// Each mark type becomes an RTF group { \controlword text } so marks nest
// safely — e.g. bold + italic becomes {\b {\i the text}}.
// Marks are applied in the order the ProseMirror node lists them (innermost first).
// colorMap is the Map<hex, index> built by collectHighlights() — needed for \highlight.
function applyMarks(text, marks, colorMap) {
  if (!Array.isArray(marks) || marks.length === 0) return text;
  return marks.reduce((acc, mark) => {
    switch (mark.type) {
      case 'bold':      return `{\\b ${acc}}`;
      case 'italic':    return `{\\i ${acc}}`;
      case 'underline': return `{\\ul ${acc}}`;
      case 'strike':    return `{\\strike ${acc}}`;
      // \f1 switches to font slot 1 (Courier New); \fs18 = 9pt (half-points).
      // Reset back to f0/fs24 happens at the paragraph level, not here.
      case 'code':      return `{\\f1\\fs18 ${acc}}`;
      case 'highlight': {
        const idx = colorMap?.get(mark.attrs?.color) ?? 0;
        // \highlightN applies background colour N from the RTF colour table.
        // Falls back to unstyled text when the colour is not in the table (idx 0).
        return idx > 0 ? `{\\highlight${idx} ${acc}}` : acc;
      }
      default:          return acc;
    }
  }, text);
}

// Render a single inline node — either a text leaf with optional marks,
// a hard line break, or a container whose children we recurse into.
// This is the leaf-level renderer; blockNode calls inlineContent which calls this.
function inlineNode(node, colorMap) {
  if (!node || typeof node !== 'object') return '';
  if (node.type === 'text')      return applyMarks(escRtf(node.text ?? ''), node.marks, colorMap);
  // \line is a soft line break within the same paragraph (unlike \par which ends it)
  if (node.type === 'hardBreak') return '\\line\n';
  // Unknown inline type — render any children to avoid losing content
  return (node.content ?? []).map(n => inlineNode(n, colorMap)).join('');
}

// Render an array of inline nodes to a single RTF string fragment.
// Used by blockNode to turn a paragraph's child list into its text content.
function inlineContent(content, colorMap) {
  if (!Array.isArray(content)) return '';
  return content.map(n => inlineNode(n, colorMap)).join('');
}


// --- BLOCK RENDERING -----------------------------------------

// Bullet glyphs by nesting depth, cycling for deeper levels. Each is an RTF
// Unicode escape with '?' as the ANSI fallback: • (U+2022), ◦ (U+25E6), ▪ (U+25AA).
// Mirrors the marker progression in the editor's CSS (editor.css ul/ul ul/ul ul ul).
const RTF_BULLETS = ['\\u8226?', '\\u9702?', '\\u9642?'];

// Render a bullet/ordered list (and any nested sub-lists) to RTF paragraphs.
// ProseMirror nests lists as `listItem → [paragraph, bulletList?]`. We render
// each item's paragraph as one hanging-indent paragraph, then recurse into any
// nested list child one level deeper. \li scales with depth (720 twips = 0.5in
// per level) so sub-items sit further right; \fi-360 keeps the hanging marker.
function listToRtf(node, level, colorMap) {
  const ordered = node.type === 'orderedList';
  const li      = 720 * (level + 1);
  return (node.content ?? []).map((item, idx) => {
    const para   = (item.content ?? []).find((c) => c.type === 'paragraph');
    const text   = inlineContent(para?.content, colorMap);
    const marker = ordered ? `${idx + 1}.  ` : `${RTF_BULLETS[level % RTF_BULLETS.length]} `;
    let out = `\\pard\\fi-360\\li${li}\\sa160\\f0\\fs24 ${marker}${text}\\par\n`;
    for (const child of item.content ?? []) {
      if (child.type === 'bulletList' || child.type === 'orderedList') {
        out += listToRtf(child, level + 1, colorMap);
      }
    }
    return out;
  }).join('');
}

// Convert a single ProseMirror block node into one or more RTF paragraph strings.
// Each case emits fully self-contained RTF paragraphs — \pard resets all
// formatting inherited from the previous paragraph before applying new styles.
//
// RTF sizing note: all font sizes are in half-points (\fs).
//   \fs24 = 12pt (body), \fs36 = 18pt (h3), \fs44 = 22pt (h2), \fs56 = 28pt (h1)
//
// RTF spacing note: \sa200 = 200 twips (≈ 10pt) of space after the paragraph.
//   1 inch = 1440 twips; \li / \ri / \fi are left/right indent and first-line indent.
function blockNode(node, colorMap) {
  if (!node || typeof node !== 'object') return '';

  switch (node.type) {
    // Root node — just render all children in order
    case 'doc':
      return blockContent(node.content, colorMap);

    case 'paragraph': {
      const text = inlineContent(node.content, colorMap);
      // \pard resets paragraph formatting back to defaults before each paragraph.
      // \sa200 adds a small gap below so paragraphs don't run together visually.
      return `\\pard\\sa200\\f0\\fs24 ${text}\\par\n`;
    }

    case 'heading': {
      const level = Math.min(Math.max(parseInt(node.attrs?.level) || 1, 1), 6);
      // Map heading levels to font sizes (in half-points):
      //   h1 = 56hp (28pt), h2 = 44hp (22pt), h3 = 36hp (18pt), h4–6 = 28hp (14pt)
      const sizes = { 1: 56, 2: 44, 3: 36, 4: 28, 5: 28, 6: 28 };
      const fs    = sizes[level] ?? 28;
      const text  = inlineContent(node.content, colorMap);
      // \b turns on bold; \b0 explicitly turns it off so body text after the
      // heading is not accidentally bold (RTF bold state is sticky within a paragraph).
      return `\\pard\\sa200\\b\\fs${fs} ${text}\\b0\\par\n`;
    }

    case 'bulletList':
    case 'orderedList':
      // Top-level list — render recursively so nested sub-lists indent further.
      return listToRtf(node, 0, colorMap);

    case 'blockquote':
      return (node.content ?? []).map((inner) => {
        const text = inlineContent(inner.content, colorMap);
        // \li720 and \ri720 indent both margins by 0.5 inch — the standard visual
        // treatment for a blockquote in print-oriented formats.
        return `\\pard\\li720\\ri720\\sa200\\f0\\fs24 ${text}\\par\n`;
      }).join('');

    case 'codeBlock': {
      // Code blocks contain raw text nodes only — no inline marks to process.
      // We still run them through escRtf so backtick/brace chars don't break the RTF.
      const code = (node.content ?? [])
        .filter((n) => n.type === 'text')
        .map((n) => escRtf(n.text ?? ''))
        .join('');
      // Render at 9pt Courier New (\f1\fs18); \f0\fs24 resets back to body font/size
      // for whatever paragraph comes next (RTF formatting is inherited until reset).
      return `\\pard\\sa200\\f1\\fs18 ${code}\\f0\\fs24\\par\n`;
    }

    case 'horizontalRule':
      // RTF has no dedicated HR element. A paragraph with a bottom border
      // produces the same visual effect — a full-width horizontal line.
      // \brdrb = bottom border, \brdrs = single line, \brdrw10 = 0.75pt width.
      return `\\pard\\brdrb\\brdrs\\brdrw10\\brsp20 \\par\n`;

    default:
      // Unknown block type — recurse into children rather than silently drop content.
      return blockContent(node.content, colorMap);
  }
}

// Render a list of block nodes by calling blockNode on each and joining the results.
// Mirrors blockContent in pmToMarkdown.js and pmToHtml.js for consistency.
function blockContent(content, colorMap) {
  if (!Array.isArray(content)) return '';
  return content.map(n => blockNode(n, colorMap)).join('');
}


// --- EXPORT --------------------------------------------------

// Build a complete, standalone RTF 1.5 document from a ProseMirror JSON tree.
//
// The returned string contains the full RTF file — header, font table, page
// settings, and body — so it can be written directly to a .rtf file without
// any post-processing.
//
// RTF header breakdown:
//   \rtf1\ansi\ansicpg1252  — RTF version 1, ANSI encoding, Windows codepage 1252
//   \deff0\deflang1033       — default font is slot 0, default language is US English
//   \fonttbl                 — declares font slots: f0 = Times New Roman, f1 = Courier New
//   \colortbl                — colour table; populated dynamically with highlight colours found in the document
//   \widowctrl               — prevent orphaned single lines at page breaks
//   \wpaper / \wpaperh       — US Letter page size (15840 × 12240 twips = 11 × 8.5 in)
//   \margl/r/t/b             — 1.25 inch side margins, 1 inch top/bottom (in twips)
//   \fs24\f0                 — default body text: 12pt Times New Roman
//
// Called from: routes/projects.js — GET /api/projects/:id/archive?format=rtf
export function pmToRtf(doc) {
  // Pre-scan to collect all highlight colours; build the RTF colour table entries.
  // The colour table is 1-indexed — index 0 means "automatic/no colour".
  const colorMap = collectHighlights(doc);
  const colorEntries = [...colorMap.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([hex]) => {
      const { r, g, b } = hexToRgb(hex);
      return `\\red${r}\\green${g}\\blue${b};`;
    })
    .join('');

  const body = doc ? blockNode(doc, colorMap) : '';
  return [
    '{\\rtf1\\ansi\\ansicpg1252\\deff0\\deflang1033',
    '{\\fonttbl{\\f0\\froman\\fcharset0 Times New Roman;}{\\f1\\fmodern\\fcharset0 Courier New;}}',
    // Colour table: one entry per unique highlight colour found in the document.
    // When no highlights are present this collapses to {\\colortbl ;} (empty table).
    `{\\colortbl ;${colorEntries}}`,
    '\\widowctrl\\wpaper15840\\wpaperh12240\\margl1800\\margr1800\\margt1440\\margb1440',
    '\\fs24\\f0',
    body.trimEnd(),
    '}',
  ].join('\n');
}
