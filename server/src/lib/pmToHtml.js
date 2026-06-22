/**
 * @file lib/pmToHtml.js
 * @description Convert a TipTap / ProseMirror JSON document to an HTML string.
 *
 * This is used by the compile route to render document content into HTML before
 * passing it to Puppeteer (PDF) or epub-gen (ePub).
 *
 * Security model:
 *  - ALL text content is HTML-escaped via escapeHtml() before output.
 *  - HTML tags are only generated from the fixed node-type switch statement —
 *    no user data ever flows into tag names or attribute names.
 *  - The only user-controlled values that reach HTML attributes are:
 *      textAlign → validated against a 4-value allowlist before use in style=""
 *      highlight color → validated as a hex string (#RGB or #RRGGBBAA) before
 *                        use in style="background-color:..."
 *  - Unknown node types fall through to childrenHtml(), rendering their children
 *    rather than silently dropping content.
 */

/**
 * Escape a string for safe HTML output.
 * Replaces &, <, >, ", and ' with their HTML entity equivalents.
 *
 * @param {string} str - Raw text content.
 * @returns {string} HTML-safe string.
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Validate a text-align value against a strict allowlist.
 * Prevents CSS injection via user-supplied alignment attributes.
 *
 * @param {string|undefined} align - Raw alignment value from node attrs.
 * @returns {string|null} The value if valid, or null to omit the style attribute.
 */
function validateAlign(align) {
  return ['left', 'center', 'right', 'justify'].includes(align) ? align : null;
}

/**
 * Recursively render an array of ProseMirror nodes to an HTML string.
 *
 * @param {object[]|undefined} content - The `content` array of a ProseMirror node.
 * @param {number} depth - Current nesting depth; rendering stops at 100 to prevent DoS.
 * @returns {string}
 */
function childrenHtml(content, depth = 0) {
  if (!Array.isArray(content)) return '';
  if (depth > 100) return ''; // guard against pathological nesting (CWE-674)
  return content.map(n => nodeHtml(n, depth + 1)).join('');
}

/**
 * Apply a list of ProseMirror marks (bold, italic, etc.) to an already-escaped
 * text string, wrapping it in the appropriate HTML tags.
 *
 * Marks are applied in order from the array, innermost first (each wraps the
 * accumulated result from the previous iteration).
 *
 * @param {string} text    - HTML-escaped text content.
 * @param {object[]} marks - ProseMirror mark objects from a `text` node.
 * @returns {string} Text wrapped in mark HTML tags.
 */
function applyMarks(text, marks) {
  if (!Array.isArray(marks)) return text;
  return marks.reduce((acc, mark) => {
    switch (mark.type) {
      case 'bold':      return `<strong>${acc}</strong>`;
      case 'italic':    return `<em>${acc}</em>`;
      case 'underline': return `<u>${acc}</u>`;
      case 'strike':    return `<s>${acc}</s>`;
      case 'code':      return `<code>${acc}</code>`;
      case 'highlight': {
        // Only allow hex colour values (#RGB, #RRGGBB, #RRGGBBAA) to prevent CSS injection
        const color = mark.attrs?.color;
        const safeColor =
          typeof color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(color)
            ? color
            : null;
        return safeColor
          ? `<mark style="background-color:${safeColor}">${acc}</mark>`
          : `<mark>${acc}</mark>`;
      }
      default: return acc; // Unknown marks are ignored (content preserved)
    }
  }, text);
}

/**
 * Render a single ProseMirror node to an HTML string.
 * Called recursively via childrenHtml() for nested nodes.
 *
 * @param {object} node  - A ProseMirror node object with at minimum a `type` field.
 * @param {number} depth - Current nesting depth (passed from childrenHtml).
 * @returns {string}
 */
function nodeHtml(node, depth = 0) {
  if (!node || typeof node !== 'object') return '';

  switch (node.type) {
    case 'doc':
      // Root node — just render all children
      return childrenHtml(node.content, depth);

    case 'paragraph': {
      const align = validateAlign(node.attrs?.textAlign);
      const style = align ? ` style="text-align:${align}"` : '';
      return `<p${style}>${childrenHtml(node.content, depth)}</p>\n`;
    }

    case 'heading': {
      // Clamp level to 1–6 to produce valid <h1>–<h6> tags
      const level = Math.min(Math.max(parseInt(node.attrs?.level) || 1, 1), 6);
      const align = validateAlign(node.attrs?.textAlign);
      const style = align ? ` style="text-align:${align}"` : '';
      return `<h${level}${style}>${childrenHtml(node.content, depth)}</h${level}>\n`;
    }

    case 'text':
      // Text nodes carry the actual content — escape first, then apply marks
      return applyMarks(escapeHtml(node.text ?? ''), node.marks);

    case 'hardBreak':
      return '<br>';

    case 'bulletList':
      return `<ul>\n${childrenHtml(node.content, depth)}</ul>\n`;

    case 'orderedList':
      return `<ol>\n${childrenHtml(node.content, depth)}</ol>\n`;

    case 'listItem':
      return `<li>${childrenHtml(node.content, depth)}</li>\n`;

    case 'blockquote':
      return `<blockquote>\n${childrenHtml(node.content, depth)}</blockquote>\n`;

    case 'codeBlock':
      return `<pre><code>${childrenHtml(node.content, depth)}</code></pre>\n`;

    case 'horizontalRule':
      return '<hr>\n';

    default:
      // Unknown node types: render their children to avoid silently dropping content
      return childrenHtml(node.content, depth);
  }
}

/**
 * Convert a ProseMirror document JSON object to an HTML string.
 *
 * The output is safe for use in Puppeteer (after DOMPurify sanitization in the
 * compile route) and epub-gen HTML chapter content.
 *
 * @param {object|null} doc - ProseMirror JSON object with `type: 'doc'`.
 * @returns {string} HTML string representing the document content.
 */
export function pmToHtml(doc) {
  if (!doc) return '';
  return nodeHtml(doc);
}
