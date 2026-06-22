/**
 * @file lib/pmToMarkdown.js
 * @description Convert TipTap / ProseMirror JSON chapters to a Markdown string buffer.
 *
 * Called by the compile route when the user requests Markdown export.
 * The output is a UTF-8 .md file — no HTML, no sanitization needed.
 *
 * Node coverage mirrors pmToHtml.js: all standard TipTap block and inline types.
 * Unknown node types fall through to render their children (no content loss).
 */

/**
 * Apply ProseMirror marks to a plain-text string, wrapping it in Markdown syntax.
 * Marks are applied innermost-first (each wraps the previous result).
 *
 * @param {string}   text  - Raw (unescaped) text content.
 * @param {object[]} marks - ProseMirror mark objects from a `text` node.
 * @returns {string}
 */
function applyMarks(text, marks) {
  if (!Array.isArray(marks)) return text;
  return marks.reduce((acc, mark) => {
    switch (mark.type) {
      case 'bold':      return `**${acc}**`;
      case 'italic':    return `_${acc}_`;
      case 'underline': return `<u>${acc}</u>`;   // No Markdown standard; HTML fallback
      case 'strike':    return `~~${acc}~~`;
      case 'code':      return `\`${acc}\``;
      case 'highlight': return acc;               // No Markdown equivalent; render plain
      default:          return acc;
    }
  }, text);
}

/**
 * Recursively render an array of ProseMirror inline nodes to a Markdown string.
 *
 * @param {object[]|undefined} content
 * @returns {string}
 */
function inlineContent(content) {
  if (!Array.isArray(content)) return '';
  return content.map(inlineNode).join('');
}

/**
 * Render a single inline ProseMirror node (text, hardBreak, etc.).
 *
 * @param {object} node
 * @returns {string}
 */
function inlineNode(node) {
  if (!node || typeof node !== 'object') return '';
  if (node.type === 'text')      return applyMarks(node.text ?? '', node.marks);
  if (node.type === 'hardBreak') return '\n';
  return inlineContent(node.content); // Unknown inline types: render children
}

/**
 * Render a bullet/ordered list (and any nested sub-lists) to Markdown.
 *
 * ProseMirror nests lists as `listItem → [paragraph, bulletList?]`: each item's
 * content is its paragraph followed by an optional nested list. We render the
 * paragraph as the item line, then recurse into nested list children one level
 * deeper. Each level is indented by two spaces — the CommonMark convention for
 * sub-list nesting.
 *
 * @param {object} node  - A bulletList or orderedList node.
 * @param {number} level - Current nesting depth (0 = top level).
 * @returns {string}
 */
function listToMarkdown(node, level) {
  const indent  = '  '.repeat(level);
  const ordered = node.type === 'orderedList';
  return (node.content ?? []).map((item, idx) => {
    const marker = ordered ? `${idx + 1}.` : '-';
    const para   = (item.content ?? []).find((c) => c.type === 'paragraph');
    let line     = `${indent}${marker} ${inlineContent(para?.content)}\n`;
    // Append any nested lists belonging to this item, one level deeper.
    for (const child of item.content ?? []) {
      if (child.type === 'bulletList' || child.type === 'orderedList') {
        line += listToMarkdown(child, level + 1);
      }
    }
    return line;
  }).join('');
}

/**
 * Render a single ProseMirror block node to a Markdown string.
 * Called recursively via blockContent() for nested containers.
 *
 * @param {object} node
 * @returns {string}
 */
function blockNode(node) {
  if (!node || typeof node !== 'object') return '';

  switch (node.type) {
    case 'doc':
      return blockContent(node.content);

    case 'paragraph':
      return `${inlineContent(node.content)}\n\n`;

    case 'heading': {
      const level  = Math.min(Math.max(parseInt(node.attrs?.level) || 1, 1), 6);
      const hashes = '#'.repeat(level);
      return `${hashes} ${inlineContent(node.content)}\n\n`;
    }

    case 'bulletList':
    case 'orderedList':
      // Top-level list — render recursively (handles sub-lists), then a blank
      // line to separate it from following blocks.
      return listToMarkdown(node, 0) + '\n';

    case 'blockquote':
      // Indent each line of the blockquote's rendered content with '> '
      return blockContent(node.content)
        .trimEnd()
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n') + '\n\n';

    case 'codeBlock': {
      const code = (node.content ?? [])
        .filter((n) => n.type === 'text')
        .map((n) => n.text ?? '')
        .join('');
      return `\`\`\`\n${code}\n\`\`\`\n\n`;
    }

    case 'horizontalRule':
      return '---\n\n';

    default:
      return blockContent(node.content);
  }
}

/**
 * Render an array of block-level ProseMirror nodes.
 *
 * @param {object[]|undefined} content
 * @returns {string}
 */
function blockContent(content) {
  if (!Array.isArray(content)) return '';
  return content.map(blockNode).join('');
}

/**
 * Render a single ProseMirror document to a Markdown string.
 *
 * @param {object|null} doc - ProseMirror JSON with `type: 'doc'`.
 * @returns {string}
 */
function pmToMarkdown(doc) {
  if (!doc) return '';
  return blockNode(doc);
}

/**
 * Compile an ordered list of chapters to a UTF-8 Markdown Buffer.
 *
 * Each chapter is rendered as:
 *   ## Chapter Title
 *
 *   [body]
 *
 *   ---          ← scene separator (omitted after the last chapter)
 *
 * @param {{ title: string, pmDoc: object|null }[]} chapters
 * @returns {Buffer} UTF-8 encoded Markdown file content.
 */
export function buildMarkdown(chapters) {
  const parts = chapters.map(({ title, pmDoc }, i) => {
    const body      = pmToMarkdown(pmDoc ?? { type: 'doc', content: [] }).trimEnd();
    const separator = i < chapters.length - 1 ? '\n\n---\n' : '';
    return `## ${title}\n\n${body}${separator}`;
  });

  return Buffer.from(parts.join('\n\n'), 'utf-8');
}
