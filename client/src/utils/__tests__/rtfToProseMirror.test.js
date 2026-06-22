import { describe, it, expect } from 'vitest';
import { rtfToProseMirror } from '../rtfToProseMirror.js';

// Helper: wrap body text in a minimal valid RTF document
const rtf = (body) => `{\\rtf1\\ansi\n${body}}`;

// Helper: extract the content of the first paragraph
const firstPara = (doc) => doc.content[0];
const firstRun  = (doc) => firstPara(doc).content[0];

describe('rtfToProseMirror', () => {

  // --- null / empty cases ---

  it('returns null for empty string', () => {
    expect(rtfToProseMirror('')).toBeNull();
  });

  it('returns null for null', () => {
    expect(rtfToProseMirror(null)).toBeNull();
  });

  it('returns null for non-RTF string', () => {
    expect(rtfToProseMirror('Hello world')).toBeNull();
  });

  it('returns null for RTF with no text content', () => {
    // RTF with only metadata, no body text
    expect(rtfToProseMirror(rtf('{\\fonttbl{\\f0 Arial;}}'))).toBeNull();
  });

  // --- plain text ---

  it('converts plain text to a single paragraph', () => {
    const doc = rtfToProseMirror(rtf('Hello world'));
    expect(doc).not.toBeNull();
    expect(doc.type).toBe('doc');
    expect(doc.content).toHaveLength(1);
    expect(firstRun(doc).text).toBe('Hello world');
    expect(firstRun(doc).marks).toBeUndefined();
  });

  // --- character marks ---

  it('applies bold mark inside \\b group', () => {
    const doc = rtfToProseMirror(rtf('{\\b bold text}'));
    const run = firstRun(doc);
    expect(run.text).toBe('bold text');
    expect(run.marks).toContainEqual({ type: 'bold' });
  });

  it('applies italic mark inside \\i group', () => {
    const doc = rtfToProseMirror(rtf('{\\i italic}'));
    const run = firstRun(doc);
    expect(run.text).toBe('italic');
    expect(run.marks).toContainEqual({ type: 'italic' });
  });

  it('applies underline mark for \\ul', () => {
    const doc = rtfToProseMirror(rtf('{\\ul underlined}'));
    const run = firstRun(doc);
    expect(run.marks).toContainEqual({ type: 'underline' });
  });

  it('applies strikethrough mark for \\strike', () => {
    const doc = rtfToProseMirror(rtf('{\\strike struck}'));
    const run = firstRun(doc);
    expect(run.marks).toContainEqual({ type: 'strike' });
  });

  it('applies multiple marks at once (\\b\\i)', () => {
    const doc = rtfToProseMirror(rtf('{\\b\\i bold italic}'));
    const run = firstRun(doc);
    const types = run.marks.map((m) => m.type);
    expect(types).toContain('bold');
    expect(types).toContain('italic');
  });

  it('restores marks after closing group', () => {
    // Produces 3 runs: plain "before", bold "inside", plain "after"
    const doc = rtfToProseMirror(rtf('before{\\b inside}after'));
    const content = firstPara(doc).content;
    expect(content).toHaveLength(3);
    expect(content[0].text).toBe('before');
    expect(content[0].marks).toBeUndefined();
    expect(content[1].text).toBe('inside');
    expect(content[1].marks).toContainEqual({ type: 'bold' });
    expect(content[2].text).toBe('after');
    expect(content[2].marks).toBeUndefined();
  });

  it('turns off bold with \\b0', () => {
    // Single space after \\b0 is consumed as RTF delimiter, so "plain" has no leading space.
    const doc = rtfToProseMirror(rtf('{\\b bold\\b0 plain}'));
    const para = firstPara(doc).content;
    const boldRun  = para.find((r) => r.marks?.some((m) => m.type === 'bold'));
    const plainRun = para.find((r) => !r.marks?.length && r.text === 'plain');
    expect(boldRun).toBeTruthy();
    expect(plainRun).toBeTruthy();
  });

  // --- paragraphs ---

  it('splits on \\par into multiple paragraphs', () => {
    const doc = rtfToProseMirror(rtf('first\\par second'));
    expect(doc.content).toHaveLength(2);
    expect(doc.content[0].content[0].text).toBe('first');
    expect(doc.content[1].content[0].text).toBe('second');
  });

  it('collapses consecutive \\par without inserting empty paragraph gaps', () => {
    // \par\par is the Scrivener Windows paragraph-separator pattern — the second
    // \par fires with an empty run buffer and must not create a blank paragraph.
    const doc = rtfToProseMirror(rtf('A\\par\\par B'));
    expect(doc.content).toHaveLength(2);
    expect(doc.content[0].content[0].text).toBe('A');
    expect(doc.content[1].content[0].text).toBe('B');
  });

  it('collapses triple \\par into two content paragraphs', () => {
    const doc = rtfToProseMirror(rtf('X\\par\\par\\par Y'));
    expect(doc.content).toHaveLength(2);
    expect(doc.content[0].content[0].text).toBe('X');
    expect(doc.content[1].content[0].text).toBe('Y');
  });

  // --- special characters ---

  it("converts hex escape \\'e9 to é", () => {
    const doc = rtfToProseMirror(rtf("caf\\'e9"));
    expect(firstRun(doc).text).toBe('café');
  });

  it("converts Windows-1252 smart quote \\'92 to '", () => {
    const doc = rtfToProseMirror(rtf("it\\'92s"));
    expect(firstRun(doc).text).toBe("it’s");
  });

  it('converts unicode escape \\u233 to é', () => {
    const doc = rtfToProseMirror(rtf('caf\\u233?'));
    expect(firstRun(doc).text).toBe('café');
  });

  // --- skip destinations ---

  it('skips \\* destination groups', () => {
    // The font table should not emit any text
    const doc = rtfToProseMirror(rtf('{\\*\\fonttbl{\\f0 Arial;}}real text'));
    expect(firstRun(doc).text).toBe('real text');
  });

  it('skips fonttbl group without \\*', () => {
    const doc = rtfToProseMirror(rtf('{\\fonttbl{\\f0 Arial;}}visible'));
    expect(firstRun(doc).text).toBe('visible');
  });

  // --- hard line breaks ---

  it('emits hardBreak node for \\line', () => {
    const doc = rtfToProseMirror(rtf('line one\\line line two'));
    const para = firstPara(doc).content;
    expect(para.some((n) => n.type === 'hardBreak')).toBe(true);
  });

  // --- realistic RTF snippet ---

  it('handles a realistic Scrivener-style RTF snippet', () => {
    const input = [
      '{\\rtf1\\ansi\\ansicpg1252',
      '{\\fonttbl{\\f0\\fswiss\\fcharset0 Helvetica;}}',
      '{\\colortbl;\\red0\\green0\\blue0;}',
      '\\pard\\tx560\\tx1120 \\f0\\fs24',
      'This is {\\b bold} and {\\i italic} text.\\par',
      'Second paragraph.}',
    ].join('\n');
    const doc = rtfToProseMirror(input);
    expect(doc).not.toBeNull();
    expect(doc.content.length).toBeGreaterThanOrEqual(2);
    // First paragraph should contain bold and italic runs
    const firstContent = doc.content[0].content;
    expect(firstContent.some((r) => r.marks?.some((m) => m.type === 'bold'))).toBe(true);
    expect(firstContent.some((r) => r.marks?.some((m) => m.type === 'italic'))).toBe(true);
  });

});
