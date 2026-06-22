/**
 * @file lib/buildManuscript.js
 * @description Generate an industry-standard manuscript DOCX for publisher submission.
 *
 * Standard Manuscript Format (SMF) spec applied:
 *  - US Letter (8.5 × 11 in), 1-inch margins all sides
 *  - Courier New 12pt throughout
 *  - Double-spaced (line height 480 twips)
 *  - 0.5-inch first-line indent on all body paragraphs EXCEPT the first paragraph
 *    of each new chapter (standard convention)
 *  - Running header: LAST NAME / SHORT TITLE / page# (right-aligned, every page
 *    except the title page — achieved via titlePage: true + empty first header)
 *  - Title page: author contact block top-left, word count top-right,
 *    title + byline centered ~1/3 down
 *  - Chapter headings: plain centered text (NOT a Word heading style)
 *  - Scene breaks (horizontalRule): centered '#'
 *
 * Uses the `docx` library (v9.6.1, already installed).
 */

import {
  AlignmentType,
  Document,
  Header,
  Packer,
  PageBreak,
  SimpleField,
  Paragraph,
  TextRun,
  convertInchesToTwip,
} from 'docx';

// ── Shared formatting constants ────────────────────────────────────────────────

const COURIER  = 'Courier New';
const SIZE_12  = 24;             // docx uses half-points: 12pt × 2 = 24
const DBL_SPACING = { line: 480, lineRule: 'auto' };  // 240 = single, 480 = double
const INDENT_05   = { firstLine: convertInchesToTwip(0.5) };
const NO_SPACE    = { before: 0, after: 0 };

/** Build a TextRun in the manuscript font. */
function msRun(text, opts = {}) {
  return new TextRun({ text, font: COURIER, size: SIZE_12, ...opts });
}

// ── ProseMirror inline helpers ─────────────────────────────────────────────────

/**
 * Flatten a ProseMirror inline node tree into an array of docx TextRuns.
 * Mirrors nodeToRuns() in pmToDocx.js but always applies Courier New 12pt.
 *
 * @param {object}  node
 * @param {object}  [activeMarks]
 * @returns {import('docx').TextRun[]}
 */
function nodeToRuns(node, activeMarks = {}) {
  if (!node) return [];

  if (node.type === 'text') {
    const marks = { ...activeMarks };
    for (const m of node.marks ?? []) marks[m.type] = m;
    return [
      new TextRun({
        text:      node.text ?? '',
        font:      COURIER,
        size:      SIZE_12,
        bold:      !!marks.bold,
        italics:   !!marks.italic,
        underline: marks.underline ? {} : undefined,
        strike:    !!marks.strike,
      }),
    ];
  }

  if (node.type === 'hardBreak') {
    return [new TextRun({ text: '', break: 1 })];
  }

  const newMarks = { ...activeMarks };
  for (const m of node.marks ?? []) newMarks[m.type] = m;
  return (node.content ?? []).flatMap((c) => nodeToRuns(c, newMarks));
}

// ── ProseMirror block helpers ──────────────────────────────────────────────────

/**
 * Convert a bullet/ordered list (and any nested sub-lists) to manuscript Paragraphs.
 *
 * ProseMirror nests lists as `listItem → [paragraph, bulletList?]`. We render each
 * item's paragraph as one double-spaced Paragraph, then recurse into nested list
 * children one level deeper. Bulleted items use docx's native multi-level
 * `bullet: { level }`; ordered items keep the manual "N. " prefix with a left
 * indent that grows 0.5" per level.
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
    const children = runs.length ? runs : [msRun('')];
    const paragraph = ordered
      ? new Paragraph({
          spacing:  { ...DBL_SPACING, ...NO_SPACE },
          indent:   { left: convertInchesToTwip(0.5) * (level + 1) },
          children: [msRun(`${idx + 1}. `), ...children],
        })
      : new Paragraph({
          bullet:   { level },
          spacing:  { ...DBL_SPACING, ...NO_SPACE },
          children,
        });

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
 * Convert a ProseMirror block node into an array of docx Paragraphs.
 * Applies manuscript formatting: Courier 12pt, double-spaced, 0.5" indent.
 *
 * @param {object}  node
 * @param {boolean} [isFirstAfterHeading] - When true, first paragraph has no indent.
 * @returns {import('docx').Paragraph[]}
 */
function nodeToParagraphs(node, isFirstAfterHeading = false) {
  if (!node) return [];

  switch (node.type) {
    case 'doc': {
      const paras = [];
      let firstFlag = false; // set to true after each chapter heading
      for (const child of node.content ?? []) {
        paras.push(...nodeToParagraphs(child, firstFlag));
        firstFlag = false;
      }
      return paras;
    }

    case 'paragraph': {
      const runs = (node.content ?? []).flatMap((c) => nodeToRuns(c));
      return [
        new Paragraph({
          children:  runs.length ? runs : [msRun('')],
          spacing:   { ...DBL_SPACING, ...NO_SPACE },
          indent:    isFirstAfterHeading ? undefined : INDENT_05,
        }),
      ];
    }

    case 'heading': {
      const runs = (node.content ?? []).flatMap((c) => nodeToRuns(c));
      return [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children:  runs.length ? runs : [msRun('')],
          spacing:   { ...DBL_SPACING, ...NO_SPACE },
        }),
      ];
    }

    case 'blockquote':
      return (node.content ?? []).flatMap((inner) => {
        const runs = (inner.content ?? []).flatMap((c) => nodeToRuns(c));
        return [
          new Paragraph({
            indent:  { left: convertInchesToTwip(0.5), firstLine: convertInchesToTwip(0.5) },
            spacing: { ...DBL_SPACING, ...NO_SPACE },
            children: runs.length ? runs : [msRun('')],
          }),
        ];
      });

    case 'bulletList':
    case 'orderedList':
      // Render recursively so nested sub-lists are preserved (see listToParagraphs)
      return listToParagraphs(node, 0);

    case 'codeBlock': {
      const text = (node.content ?? [])
        .filter((n) => n.type === 'text')
        .map((n) => n.text ?? '')
        .join('');
      return [
        new Paragraph({
          spacing: { ...DBL_SPACING, ...NO_SPACE },
          children: [msRun(text)],
        }),
      ];
    }

    case 'horizontalRule':
      // Scene break — manuscript convention: centered '#'
      return [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing:   { ...DBL_SPACING, ...NO_SPACE },
          children:  [msRun('#')],
        }),
      ];

    default:
      return (node.content ?? []).flatMap((c) => nodeToParagraphs(c));
  }
}

// ── Manuscript assembly ────────────────────────────────────────────────────────

/**
 * Build an industry-standard manuscript DOCX and return it as a Buffer.
 *
 * @param {{ title: string, pmDoc: object|null }[]} chapters
 * @param {{
 *   projectTitle: string,
 *   legalName:    string,
 *   penName:      string,
 *   address:      string,
 *   phone:        string,
 *   email:        string,
 *   wordCount:    number,
 * }} meta
 * @returns {Promise<Buffer>}
 */
export async function buildManuscript(chapters, {
  projectTitle,
  legalName,
  penName,
  address,
  phone,
  email,
  wordCount,
}) {
  const lastName  = (legalName || 'Author').trim().split(/\s+/).at(-1).toUpperCase();
  const shortTitle = projectTitle.trim().slice(0, 25).toUpperCase();
  const approxWords = `~${Math.round(wordCount / 1000) * 1000 || wordCount} words`;

  // ── Running header (pages 2+) ──────────────────────────────────────────────
  const runningHeader = new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [
          new TextRun({ text: `${lastName} / ${shortTitle} / `, font: COURIER, size: SIZE_12 }),
          new SimpleField({ instruction: 'PAGE', cachedValue: '1', font: COURIER, size: SIZE_12 }),
        ],
      }),
    ],
  });

  // ── Title page ─────────────────────────────────────────────────────────────

  // Contact block — top left. Split address into lines; filter empty lines.
  const contactLines = [
    legalName,
    ...address.split('\n').filter(Boolean),
    phone,
    email,
  ].filter(Boolean);

  // Build left-aligned contact block and right-aligned word count on the same row.
  // Use a two-column table is complex — instead: contact block first (left),
  // then word count as a right-aligned paragraph immediately after.
  const titlePageParagraphs = [
    // Contact info (left-aligned)
    ...contactLines.map((line) =>
      new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing:   { line: 240, lineRule: 'auto', before: 0, after: 0 }, // single-spaced for contact block
        children:  [msRun(line)],
      }),
    ),

    // Word count (right-aligned, same vertical area)
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing:   { line: 240, lineRule: 'auto', before: 0, after: 0 },
      children:  [msRun(approxWords)],
    }),

    // ~10 blank double-spaced lines to push title down ~1/3 of the page
    ...Array.from({ length: 10 }, () =>
      new Paragraph({ spacing: DBL_SPACING, children: [msRun('')] }),
    ),

    // Title (centered)
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing:   DBL_SPACING,
      children:  [msRun(projectTitle.toUpperCase(), { bold: true })],
    }),

    // "by"
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing:   DBL_SPACING,
      children:  [msRun('by')],
    }),

    // Pen name / byline
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing:   DBL_SPACING,
      children:  [msRun(penName || legalName)],
    }),
  ];

  // ── Body ───────────────────────────────────────────────────────────────────

  const bodyParagraphs = [];

  for (let i = 0; i < chapters.length; i++) {
    const { title, pmDoc } = chapters[i];

    // Page break before each chapter (including the first, which separates it from the title page)
    bodyParagraphs.push(
      new Paragraph({ children: [new PageBreak()] }),
    );

    // Chapter heading — centered, no indent, uppercase plain text
    bodyParagraphs.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing:   { ...DBL_SPACING, ...NO_SPACE },
        children:  [msRun(title.toUpperCase(), { bold: true })],
      }),
    );

    // Blank line after chapter heading
    bodyParagraphs.push(
      new Paragraph({ spacing: DBL_SPACING, children: [msRun('')] }),
    );

    // Chapter body — first content paragraph has no indent
    if (pmDoc) {
      const chapterParas = nodeToParagraphs(pmDoc);
      // Mark first non-empty paragraph as having no indent (flush left)
      let markedFirst = false;
      for (const para of chapterParas) {
        if (!markedFirst && para.options?.indent) {
          para.options.indent = undefined;
          markedFirst = true;
        }
        bodyParagraphs.push(para);
      }
    } else {
      bodyParagraphs.push(new Paragraph({ spacing: DBL_SPACING, children: [msRun('')] }));
    }
  }

  // ── Assemble document ──────────────────────────────────────────────────────

  const doc = new Document({
    creator: legalName || 'Author',
    title:   projectTitle,
    sections: [
      {
        properties: {
          titlePage: true,  // enables separate first-page header (empty = no header on title page)
          page: {
            size: {
              width:  convertInchesToTwip(8.5),
              height: convertInchesToTwip(11),
            },
            margin: {
              top:    convertInchesToTwip(1),
              right:  convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left:   convertInchesToTwip(1),
            },
          },
        },
        headers: {
          first:   new Header({ children: [] }),  // title page: no running header
          default: runningHeader,
        },
        children: [...titlePageParagraphs, ...bodyParagraphs],
      },
    ],
  });

  return Packer.toBuffer(doc);
}
