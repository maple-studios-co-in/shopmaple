import { Extension, Mark, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { editorialAligns, editorialColors, editorialHighlight, type EditorialAlign, type EditorialColor } from "@shopmaple/contracts";

/**
 * The rich text editor's formatting beyond StarterKit (owner, 24 Nov 2026): highlight, superscript, subscript, a text
 * colour from the store's palette, and paragraph and heading alignment. Each keeps to what the storefront renders
 * (contracts editorial-content.ts): a colour is stored by name, so text pasted in another colour comes in uncoloured.
 */
declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    highlight: { toggleHighlight: () => ReturnType };
    superscript: { toggleSuperscript: () => ReturnType };
    subscript: { toggleSubscript: () => ReturnType };
    textColor: { setTextColor: (color: EditorialColor) => ReturnType; unsetTextColor: () => ReturnType };
    textAlign: { setTextAlign: (align: "left" | EditorialAlign) => ReturnType };
  }
}

const colorOf = (value: unknown): EditorialColor | null => typeof value === "string" && Object.hasOwn(editorialColors, value) ? value as EditorialColor : null;
const alignOf = (value: unknown): EditorialAlign | null => (editorialAligns as readonly unknown[]).includes(value) ? value as EditorialAlign : null;

export const Highlight = Mark.create({
  name: "highlight",
  parseHTML: () => [{ tag: "mark" }],
  renderHTML: ({ HTMLAttributes }) => ["mark", mergeAttributes(HTMLAttributes, { style: `background-color:${editorialHighlight};color:inherit` }), 0],
  addCommands() { return { toggleHighlight: () => ({ commands }) => commands.toggleMark(this.name) }; },
  addKeyboardShortcuts() { return { "Mod-Shift-h": () => this.editor.commands.toggleHighlight() }; },
});

export const Superscript = Mark.create({
  name: "superscript", excludes: "subscript",
  parseHTML: () => [{ tag: "sup" }],
  renderHTML: ({ HTMLAttributes }) => ["sup", HTMLAttributes, 0],
  addCommands() { return { toggleSuperscript: () => ({ commands }) => commands.toggleMark(this.name) }; },
  addKeyboardShortcuts() { return { "Mod-.": () => this.editor.commands.toggleSuperscript() }; },
});

export const Subscript = Mark.create({
  name: "subscript", excludes: "superscript",
  parseHTML: () => [{ tag: "sub" }],
  renderHTML: ({ HTMLAttributes }) => ["sub", HTMLAttributes, 0],
  addCommands() { return { toggleSubscript: () => ({ commands }) => commands.toggleMark(this.name) }; },
  addKeyboardShortcuts() { return { "Mod-,": () => this.editor.commands.toggleSubscript() }; },
});

export const TextColor = Mark.create({
  name: "textColor",
  addAttributes: () => ({
    color: {
      default: null,
      parseHTML: (element) => colorOf(element.getAttribute("data-color")),
      renderHTML: (attributes) => {
        const color = colorOf(attributes.color);
        return color ? { "data-color": color, style: `color:${editorialColors[color].hex}` } : {};
      },
    },
  }),
  parseHTML: () => [{ tag: "span[data-color]", getAttrs: (element) => colorOf((element as HTMLElement).getAttribute("data-color")) ? null : false }],
  renderHTML: ({ HTMLAttributes }) => ["span", HTMLAttributes, 0],
  addCommands() {
    return {
      setTextColor: (color) => ({ commands }) => commands.setMark(this.name, { color }),
      unsetTextColor: () => ({ commands }) => commands.unsetMark(this.name),
    };
  },
});

const aligned = ["paragraph", "heading"];
export const TextAlign = Extension.create({
  name: "textAlign",
  addGlobalAttributes() {
    return [{
      types: aligned,
      attributes: {
        textAlign: {
          default: null,
          parseHTML: (element) => alignOf(element.style.textAlign),
          renderHTML: (attributes) => alignOf(attributes.textAlign) ? { style: `text-align:${attributes.textAlign}` } : {},
        },
      },
    }];
  },
  addCommands() {
    return {
      setTextAlign: (align) => ({ commands }) => aligned
        .map((type) => align === "left" ? commands.resetAttributes(type, "textAlign") : commands.updateAttributes(type, { textAlign: align }))
        .some(Boolean),
    };
  },
  addKeyboardShortcuts() {
    return {
      "Mod-Shift-l": () => this.editor.commands.setTextAlign("left"),
      "Mod-Shift-e": () => this.editor.commands.setTextAlign("center"),
      "Mod-Shift-r": () => this.editor.commands.setTextAlign("right"),
      "Mod-Shift-j": () => this.editor.commands.setTextAlign("justify"),
    };
  },
});

/** Words shown in an empty editor, until the first character is typed (never saved). */
export const Placeholder = Extension.create<{ text: string }>({
  name: "placeholder",
  addOptions: () => ({ text: "" }),
  addProseMirrorPlugins() {
    const text = this.options.text;
    return [new Plugin({
      key: new PluginKey("placeholder"),
      props: {
        decorations: ({ doc }) => {
          const first = doc.firstChild;
          if (!text || doc.childCount !== 1 || !first?.isTextblock || first.content.size > 0) return null;
          return DecorationSet.create(doc, [Decoration.node(0, first.nodeSize, { class: "is-empty", "data-placeholder": text })]);
        },
      },
    })];
  },
});
