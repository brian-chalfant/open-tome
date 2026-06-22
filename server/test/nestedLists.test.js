import { describe, it, expect } from 'vitest';
import { pmToHtml } from '../src/lib/pmToHtml.js';
import { pmToRtf } from '../src/lib/pmToRtf.js';
import { buildMarkdown } from '../src/lib/pmToMarkdown.js';

// A bullet list with one parent item that contains a nested sub-list.
// ProseMirror structure: listItem → [paragraph, bulletList].
const nestedDoc = {
  type: 'doc',
  content: [
    {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Parent' }] },
            {
              type: 'bulletList',
              content: [
                {
                  type: 'listItem',
                  content: [
                    { type: 'paragraph', content: [{ type: 'text', text: 'Child' }] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

describe('nested list export — Markdown', () => {
  it('indents sub-bullets by two spaces under their parent', () => {
    const md = buildMarkdown([{ title: 'T', pmDoc: nestedDoc }]).toString('utf-8');
    expect(md).toContain('- Parent');
    expect(md).toContain('  - Child'); // two-space indent = one nesting level
  });
});

describe('nested list export — RTF', () => {
  it('increases the left indent for nested items', () => {
    const rtf = pmToRtf(nestedDoc);
    expect(rtf).toContain('\\li720');  // parent at level 0
    expect(rtf).toContain('\\li1440'); // child at level 1 (720 * 2)
    expect(rtf).toContain('Parent');
    expect(rtf).toContain('Child');
  });

  it('uses a distinct bullet glyph for the nested level', () => {
    const rtf = pmToRtf(nestedDoc);
    expect(rtf).toContain('\\u8226?'); // • at level 0
    expect(rtf).toContain('\\u9702?'); // ◦ at level 1
  });
});

describe('nested list export — HTML (PDF/ePub)', () => {
  it('renders the sub-list as a nested <ul> inside the parent <li>', () => {
    const html = pmToHtml(nestedDoc);
    expect(html).toContain('Parent');
    expect(html).toContain('Child');
    // Two <ul> tags — the outer list and the nested sub-list.
    expect((html.match(/<ul>/g) ?? []).length).toBe(2);
  });
});
