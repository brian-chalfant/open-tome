/**
 * @file lib/pmToDocx.js
 * @description Convert TipTap / ProseMirror JSON to a DOCX file buffer.
 *
 * Called by the compile route when the user requests DOCX export.
 * The output is streamed back to the browser as a file download.
 *
 * Structure:
 *  - HEADING_MAP: maps ProseMirror heading levels (1–6) to docx HeadingLevel constants.
 *  - ALIGN_MAP: maps TipTap textAlign strings to AlignmentType constants.
 *  - nodeToRuns(): recursively flattens inline nodes into TextRun objects.
 *  - nodeToParagraphs(): maps block nodes to Paragraph objects.
 *  - buildDocx(): assembles a multi-chapter Document and returns a Buffer.
 */

import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  PageBreak,
  Paragraph,
  ShadingType,
  TextRun,
} from 'docx';

/** Maps ProseMirror heading level numbers to docx HeadingLevel constants. */
const HEADING_MAP = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6,
};

/** Maps TipTap textAlign strings to docx AlignmentType constants. */
const ALIGN_MAP = {
  left:    AlignmentType.LEFT,
  center:  AlignmentType.CENTER,
  right:   AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED,
};

/**
 * Flatten a ProseMirror inline node (or subtree) into an array of TextRun objects.
 *
 * Called recursively, accumulating marks from parent nodes so that nested
 * mark combinations (e.g., bold + italic) are correctly applied to the
 * innermost text nodes.
 *
 * @param {object} node           - A ProseMirror node object.
 * @param {object} [activeMarks]  - Map of mark type → mark object, accumulated from ancestors.
 * @returns {import('docx').TextRun[]}
 */
function nodeToRuns(node, activeMarks = {}) {
  if (!node) return [];

  if (node.type === 'text') {
    // Merge any marks directly on this text node with inherited marks from ancestors
    const marks = { ...activeMarks };
    for (const m of node.marks ?? []) marks[m.type] = m;

    return [
      new TextRun({
        text:      node.text ?? '',
        bold:      !!marks.bold,
        italics:   !!marks.italic,
        underline: marks.underline ? {} : undefined, // docx requires an object (not a boolean)
        strike:    !!marks.strike,
        font:      marks.code ? { name: 'Courier New' } : undefined, // Monospace for inline code
        size:      marks.code ? 18 : undefined,                       // 18 half-points = 9pt
        // ShadingType.CLEAR + fill renders as background highlight in Word
        shading:   marks.highlight
          ? { type: ShadingType.CLEAR, fill: (marks.highlight.attrs?.color ?? '#ffff00').replace('#', '') }
          : undefined,
      }),
    ];
  }

  if (node.type === 'hardBreak') {
    // docx line break within the same paragraph
    return [new TextRun({ text: '', break: 1 })];
  }

  // For non-text, non-break nodes, accumulate marks and recurse into children
  const newMarks = { ...activeMarks };
  for (const m of node.marks ?? []) newMarks[m.type] = m;
  return (node.content ?? []).flatMap((c) => nodeToRuns(c, newMarks));
}

/**
 * Convert a bullet/ordered list (and any nested sub-lists) to docx Paragraphs.
 *
 * ProseMirror nests lists as `listItem → [paragraph, bulletList?]`: each item's
 * content is its paragraph plus an optional nested list. We render the paragraph
 * as one Paragraph, then recurse into nested list children one level deeper.
 * Bulleted items use docx's native multi-level `bullet: { level }`; ordered items
 * keep the manual "N. " prefix with a left indent that grows with depth.
 *
 * @param {object} node  - A bulletList or orderedList node.
 * @param {number} level - Current nesting depth (0 = top level).
 * @returns {import('docx').Paragraph[]}
 */
function listToParagraphs(node, level) {
  const ordered = node.type === 'orderedList';
  return (node.content ?? []).flatMap((item, idx) => {
    const para     = (item.content ?? []).find((c) => c.type === 'paragraph');
    const runs     = (para?.content ?? []).flatMap((r) => nodeToRuns(r));
    const children = runs.length > 0 ? runs : [new TextRun({ text: '' })];
    const paragraph = ordered
      ? new Paragraph({
          indent:   { left: 720 * (level + 1) }, // 720 twips = 0.5in per level
          children: [new TextRun({ text: `${idx + 1}. ` }), ...children],
        })
      : new Paragraph({ bullet: { level }, children });

    // Append any nested lists belonging to this item, one level deeper.
    const out = [paragraph];
    for (const child of item.content ?? []) {
      if (child.type === 'bulletList' || child.type === 'orderedList') {
        out.push(...listToParagraphs(child, level + 1));
      }
    }
    return out;
  });
}

/**
 * Convert a ProseMirror block node (or the root doc) to an array of docx
 * Paragraph objects, handling all standard TipTap block types.
 *
 * @param {object} node - A ProseMirror node (block-level or root).
 * @returns {import('docx').Paragraph[]}
 */
function nodeToParagraphs(node) {
  if (!node) return [];

  switch (node.type) {
    case 'doc':
      // Root node — recursively process all block children
      return (node.content ?? []).flatMap(nodeToParagraphs);

    case 'paragraph': {
      const runs      = (node.content ?? []).flatMap((c) => nodeToRuns(c));
      const alignment = ALIGN_MAP[node.attrs?.textAlign] ?? AlignmentType.LEFT;
      return [new Paragraph({
        // docx requires at least one run — use an empty one for empty paragraphs
        children:  runs.length > 0 ? runs : [new TextRun({ text: '' })],
        alignment,
      })];
    }

    case 'heading': {
      // Clamp heading level to the valid 1–6 range
      const level     = Math.min(Math.max(parseInt(node.attrs?.level) || 1, 1), 6);
      const runs      = (node.content ?? []).flatMap((c) => nodeToRuns(c));
      const alignment = ALIGN_MAP[node.attrs?.textAlign] ?? AlignmentType.LEFT;
      return [new Paragraph({
        heading:   HEADING_MAP[level] ?? HeadingLevel.HEADING_1,
        children:  runs.length > 0 ? runs : [new TextRun({ text: '' })],
        alignment,
      })];
    }

    case 'blockquote':
      // Render each block child of the blockquote as a left-indented paragraph
      return (node.content ?? []).flatMap((inner) => {
        const runs = (inner.content ?? []).flatMap((c) => nodeToRuns(c));
        return [new Paragraph({
          indent:   { left: 720 }, // 720 twips = 0.5 inch indent
          children: runs.length > 0 ? runs : [new TextRun({ text: '' })],
        })];
      });

    case 'bulletList':
    case 'orderedList':
      // Render recursively so nested sub-lists are preserved (see listToParagraphs)
      return listToParagraphs(node, 0);

    case 'codeBlock': {
      // Flatten the entire code block into a single string (no child nesting needed)
      const text = (node.content ?? [])
        .filter((n) => n.type === 'text')
        .map((n) => n.text ?? '')
        .join('');
      return [new Paragraph({
        children: [new TextRun({ text, font: { name: 'Courier New' }, size: 18 })],
      })];
    }

    case 'horizontalRule':
      // Render as an empty paragraph with a bottom border (visible as a horizontal line)
      return [new Paragraph({
        border: { bottom: { color: 'auto', space: 1, style: 'single', size: 6 } },
        children: [new TextRun({ text: '' })],
      })];

    default:
      // Unknown block types: process children to avoid silently dropping content
      return (node.content ?? []).flatMap(nodeToParagraphs);
  }
}

/**
 * Assemble a multi-chapter DOCX document and return it as a Buffer.
 *
 * Each chapter becomes:
 *  1. A HEADING_1 paragraph with the document title.
 *  2. The body paragraphs from the ProseMirror document tree.
 *  3. A page break (except after the last chapter).
 *
 * @param {{ title: string, pmDoc: object|null }[]} chapters - Ordered list of chapters.
 *   `pmDoc` is the parsed TipTap JSON object, or null for an untouched document.
 * @param {{ projectTitle: string, author: string }} meta - DOCX document metadata.
 * @returns {Promise<Buffer>} A Buffer containing the .docx file bytes.
 */
/**
 * Build a single-document DOCX buffer for use in the ZIP archive export.
 *
 * @param {{ title: string, synopsis?: string }} doc    - Document metadata.
 * @param {object|null}                          pmDoc  - Parsed ProseMirror JSON, or null.
 * @param {{ name: string, value: string }[]}    fields - Character sheet fields (may be empty).
 * @returns {Promise<Buffer>}
 */
export async function buildSingleDocx(doc, pmDoc, fields = []) {
  const children = [];
  const synopsis = (doc.synopsis ?? '').trim();

  children.push(new Paragraph({ children: [new TextRun({ text: doc.title, bold: true, size: 28 })] }));
  if (synopsis) {
    children.push(new Paragraph({ children: [new TextRun({ text: `Synopsis: ${synopsis}` })] }));
  }
  if (fields.length > 0) {
    children.push(new Paragraph({ children: [new TextRun({ text: '' })] }));
    for (const f of fields) {
      children.push(new Paragraph({ children: [new TextRun({ text: `${f.name}: ${f.value}` })] }));
    }
  }
  // Horizontal rule separator between header and body
  children.push(new Paragraph({
    border: { bottom: { color: 'auto', space: 1, style: 'single', size: 6 } },
    children: [new TextRun({ text: '' })],
  }));

  if (pmDoc) children.push(...nodeToParagraphs(pmDoc));

  const document = new Document({ title: doc.title, sections: [{ children }] });
  return Packer.toBuffer(document);
}

export async function buildDocx(chapters, { projectTitle, author }) {
  const children = []; // Flat list of all Paragraph objects for the single section

  for (let i = 0; i < chapters.length; i++) {
    const { title, pmDoc } = chapters[i];

    // Chapter heading (always present, even for untouched documents)
    children.push(new Paragraph({
      heading:  HeadingLevel.HEADING_1,
      children: [new TextRun({ text: title })],
    }));

    // Chapter body — render from ProseMirror JSON, or use a blank paragraph
    if (pmDoc) {
      children.push(...nodeToParagraphs(pmDoc));
    } else {
      children.push(new Paragraph({ children: [new TextRun({ text: '' })] }));
    }

    // Insert a page break between chapters (never after the last chapter)
    if (i < chapters.length - 1) {
      children.push(new Paragraph({ children: [new PageBreak()] }));
    }
  }

  // Build the Document with metadata for the DOCX properties panel
  const doc = new Document({
    creator: author,       // Appears in File → Properties → Author
    title:   projectTitle, // Appears in File → Properties → Title
    sections: [{ children }],
  });

  return Packer.toBuffer(doc);
}
