import { Extension } from '@tiptap/core';

const INDENT_MIN = 0;
const INDENT_MAX = 8;

const Indent = Extension.create({
  name: 'indent',

  addOptions() {
    return {
      types: ['paragraph', 'heading', 'blockquote', 'bulletList', 'orderedList'],
      step: 1,
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          indent: {
            default: 0,
            parseHTML: (element) => parseInt(element.getAttribute('data-indent'), 10) || 0,
            renderHTML: (attributes) => {
              if (!attributes.indent || attributes.indent <= 0) return {};
              return {
                'data-indent': attributes.indent,
                style: `text-indent: ${attributes.indent * 1.5}em`,
              };
            },
          },
          blockIndent: {
            default: 0,
            parseHTML: (element) => parseInt(element.getAttribute('data-block-indent'), 10) || 0,
            renderHTML: (attributes) => {
              if (!attributes.blockIndent || attributes.blockIndent <= 0) return {};
              return {
                'data-block-indent': attributes.blockIndent,
                style: `margin-left: ${attributes.blockIndent * 2}em`,
              };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    const makeCommand = (attr, delta) => () => ({ tr, state, dispatch }) => {
      const { from, to } = state.selection;
      let changed = false;
      state.doc.nodesBetween(from, to, (node, pos) => {
        if (!this.options.types.includes(node.type.name)) return;
        const current = node.attrs[attr] || 0;
        const next = Math.max(INDENT_MIN, Math.min(INDENT_MAX, current + delta));
        if (next !== current) {
          if (dispatch) {
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, [attr]: next });
          }
          changed = true;
        }
      });
      return changed;
    };

    return {
      indent: makeCommand('indent', 1),
      outdent: makeCommand('indent', -1),
      blockIndent: makeCommand('blockIndent', 1),
      blockOutdent: makeCommand('blockIndent', -1),
    };
  },

  addKeyboardShortcuts() {
    return {
      // When the cursor is inside a list, Tab/Shift-Tab nest/un-nest the item
      // (TipTap's built-in sinkListItem/liftListItem from StarterKit). These return
      // false when not applicable — not in a list, or the item is the first child
      // and has nothing to nest under — so we fall back to first-line indentation.
      'Tab': () => this.editor.commands.sinkListItem('listItem') || this.editor.commands.indent(),
      'Shift-Tab': () => this.editor.commands.liftListItem('listItem') || this.editor.commands.outdent(),
      'Escape': () => {
        this.editor.commands.blur();
        const toolbar = document.querySelector('.editor-toolbar [role="group"] button');
        toolbar?.focus();
        return true;
      },
    };
  },
});

export default Indent;
