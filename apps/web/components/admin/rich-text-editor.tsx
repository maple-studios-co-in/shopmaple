"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Paragraph from "@tiptap/extension-paragraph";
import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import {
  TextAlignCenter, TextAlignJustify, TextAlignStart, TextAlignEnd, Baseline, BetweenHorizontalEnd, BetweenHorizontalStart, BetweenVerticalEnd, BetweenVerticalStart,
  Bold, Highlighter, ImagePlus, ListIndentDecrease, ListIndentIncrease, Italic, Link2, List, ListOrdered, Maximize2, Minimize2, Minus, Quote, Redo2,
  RemoveFormatting, Strikethrough, Subscript as SubscriptIcon, Superscript as SuperscriptIcon, Table2, Trash2, Underline, Undo2,
} from "lucide-react";
import { contentImageSchema, editorialColors, editorialDocumentSchema, safeLink, storeMedia, type EditorialColor, type EditorialNode } from "@shopmaple/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { fromEditorDoc, toEditorDoc } from "@/lib/editorial-rich-text";
import { cn } from "@/lib/utils";
import type { StaffSession } from "./dashboard";
import { Field } from "./field";
import { MediaPicker, mediaPreviewUrl } from "./media-picker";
import { Highlight, Placeholder, Subscript, Superscript, TextAlign, TextColor } from "./rich-text-extensions";

type Style = "p" | "h2" | "h3" | "h4" | "other";
const styles: [Exclude<Style, "other">, string][] = [["p", "Paragraph"], ["h2", "Heading"], ["h3", "Subheading"], ["h4", "Small heading"]];
/** The most a policy, article or page body may hold (contracts editorial-content.ts). */
const documentBytes = 48 * 1024;

/** A stored div section: kept as a container, because the storefront styles its sections. */
const Section = Node.create({
  name: "div", group: "block", content: "block+", defining: true,
  parseHTML: () => [{ tag: "div" }],
  renderHTML: ({ HTMLAttributes }) => ["div", mergeAttributes(HTMLAttributes, { "data-section": "" }), 0],
});
/** `bare`: text the store keeps outside a <p>; it is saved back the same way. A split starts a real paragraph. */
const StoredParagraph = Paragraph.extend({
  addAttributes: () => ({ bare: { default: false, keepOnSplit: false, rendered: false } }),
});

/**
 * Pictures: a media library upload is shown through the private preview address (it may not be
 * public yet) but keeps its canonical address in the document, including when copied and pasted.
 */
const StoreImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      src: {
        default: null,
        parseHTML: (element) => {
          const src = element.getAttribute("src") ?? "";
          // Browsers often copy the preview address with its origin.
          const preview = /^(?:https?:\/\/[^/]+)?\/api\/admin\/media\/([a-f0-9]{64})\/preview$/.exec(src);
          return preview ? `/media/uploads/${preview[1]}.webp` : src;
        },
        renderHTML: (attributes) => ({ src: typeof attributes.src === "string" ? mediaPreviewUrl(attributes.src) : null }),
      },
    };
  },
});
/** The media library, when the editor may add pictures from it. */
type Media = { session: StaffSession; onExpired: () => void };

/**
 * Rich text for policies, articles and pages (owner, 24 Nov 2026: "in place of this editor I want a rich text editor"):
 * write and format as in a word processor, and the editor keeps to what the storefront renders safely: headings,
 * paragraphs, bold, italic, underline, strikethrough, superscript and subscript, the store's text colours and
 * highlighter, alignment, lists with indents, quotes, links, tables, pictures and rules. Links are limited to store
 * pages, Maple sites, email and phone. The writing area grows with the text, the toolbar stays in view, and Full
 * screen gives the whole window to the text. An untouched page is never rewritten: only real edits are reported, and
 * a reloaded draft replaces the text.
 */
export function RichTextEditor({ label, value, onChange, disabled = false, media, placeholder = "" }: {
  label: string; value: EditorialNode[]; onChange: (value: EditorialNode[]) => void; disabled?: boolean; media?: Media;
  /** Words shown while the text is empty (never saved). */
  placeholder?: string;
}) {
  /** The stored form the editor last showed or reported; anything else arriving is a reload. */
  const shown = useRef(JSON.stringify(value));
  const [initial] = useState(() => toEditorDoc(value));
  const [full, setFull] = useState(false);
  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({ paragraph: false, trailingNode: false, code: false, codeBlock: false,
        link: { openOnClick: false, autolink: false, isAllowedUri: (url) => safeLink(url) } }),
      StoredParagraph, Section,
      TableKit.configure({ table: { resizable: false } }),
      StoreImage, Highlight, Superscript, Subscript, TextColor, TextAlign, Placeholder.configure({ text: placeholder }),
    ],
    content: initial,
    editorProps: { attributes: { "aria-label": label, "aria-multiline": "true", role: "textbox", class: editorClass } },
    onUpdate: ({ editor, transaction }) => {
      if (!transaction.docChanged) return;
      const next = fromEditorDoc(editor.getJSON()), text = JSON.stringify(next);
      if (text === shown.current) return;
      shown.current = text;
      onChange(next);
    },
  });
  // A reloaded or restored draft replaces the editor's text (without reporting it back as an edit).
  useEffect(() => {
    const text = JSON.stringify(value);
    if (!editor || text === shown.current) return;
    shown.current = text;
    editor.commands.setContent(toEditorDoc(value), { emitUpdate: false });
  }, [editor, value]);
  useEffect(() => { editor?.setEditable(!disabled); }, [editor, disabled]);
  // Full screen: the page behind keeps still, and Escape gives the page back.
  useEffect(() => {
    if (!full) return;
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // The text editor claims Escape for itself; a menu or the link box that used Escape to close only closes.
      const inText = Boolean((event.target as HTMLElement | null)?.closest?.(".ProseMirror"));
      queueMicrotask(() => { if (inText || !event.defaultPrevented) setFull(false); });
    };
    // The page behind keeps its place: it is where staff return to when they leave full screen.
    const overflow = document.body.style.overflow, top = window.scrollY;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", key);
    editor?.commands.focus();
    return () => { document.removeEventListener("keydown", key); document.body.style.overflow = overflow; window.scrollTo({ top }); };
  }, [full, editor]);
  const size = new TextEncoder().encode(JSON.stringify(value)).length;
  const problem = editorialDocumentSchema.safeParse(value).success ? null
    : "This page has more text or formatting than one page can hold. Split it into two pages, or remove some formatting.";
  return <div className="grid gap-2" data-rich-text-editor>
    <div data-full-screen={full || undefined} role={full ? "dialog" : undefined} aria-modal={full || undefined} aria-label={full ? `${label}, full screen` : undefined}
      className={cn("min-w-0 rounded-lg border border-input bg-card shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/40",
        full && "fixed inset-0 z-[80] flex flex-col rounded-none border-0 shadow-none focus-within:ring-0")}>
      {editor && <Toolbar editor={editor} label={label} disabled={disabled} media={media} full={full} onFull={() => setFull((open) => !open)} />}
      <div className={cn(full && "min-h-0 flex-1 overflow-y-auto bg-surface px-3 py-6")}>
        <div className={cn(full && "mx-auto max-w-[860px] rounded-lg border border-line-soft bg-card shadow-xs")}>
          <EditorContent editor={editor} />
        </div>
      </div>
      {editor && <StatusBar editor={editor} size={size} />}
    </div>
    {problem && <p role="alert" className="text-xs text-danger">{problem}</p>}
  </div>;
}

/** Words, reading time, and a warning as the text nears what one page can hold. */
function StatusBar({ editor, size }: { editor: Editor; size: number }) {
  const words = useEditorState({ editor, selector: ({ editor: e }) => e.state.doc.textBetween(0, e.state.doc.content.size, " ", " ").split(/\s+/).filter(Boolean).length });
  const used = Math.round((size / documentBytes) * 100);
  return <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-b-lg border-t border-line-soft bg-surface px-3 py-1.5 text-xs text-muted-foreground">
    <span data-word-count>{words} {words === 1 ? "word" : "words"} · {Math.max(1, Math.round(words / 200))} min read</span>
    {used >= 70 && <span data-space-used className={cn(used >= 100 && "font-medium text-danger")}>{Math.min(used, 999)}% of the space one page can hold</span>}
  </div>;
}

function Toolbar({ editor, label, disabled, media, full, onFull }: { editor: Editor; label: string; disabled: boolean; media?: Media; full: boolean; onFull: () => void }) {
  const state = useEditorState({ editor, selector: ({ editor: e }) => ({
    style: ((["h2", "h3", "h4"] as const).find((tag) => e.isActive("heading", { level: Number(tag[1]) }))
      ?? (e.isActive("heading") ? "other" : "p")) as Style,
    bold: e.isActive("bold"), italic: e.isActive("italic"), underline: e.isActive("underline"), strike: e.isActive("strike"),
    superscript: e.isActive("superscript"), subscript: e.isActive("subscript"), highlight: e.isActive("highlight"),
    color: (e.getAttributes("textColor").color ?? null) as EditorialColor | null,
    align: ((["center", "right", "justify"] as const).find((align) => e.isActive({ textAlign: align })) ?? "left") as "left" | "center" | "right" | "justify",
    bullet: e.isActive("bulletList"), ordered: e.isActive("orderedList"), quote: e.isActive("blockquote"), link: e.isActive("link"),
    table: e.isActive("table"), header: e.isActive("tableHeader"),
    sink: e.can().sinkListItem("listItem"), lift: e.can().liftListItem("listItem"),
    href: String(e.getAttributes("link").href ?? ""), undo: e.can().undo(), redo: e.can().redo(),
  }) });
  const [linking, setLinking] = useState(false);
  const [picturing, setPicturing] = useState(false);
  /** Whether the writer has put the cursor somewhere; until then a picture goes at the end. */
  const placed = useRef(false);
  useEffect(() => {
    // Only the writer's own click or key press places the cursor; the toolbar also focuses the editor.
    const mark = () => { placed.current = true; };
    const text = editor.view.dom;
    text.addEventListener("pointerdown", mark);
    text.addEventListener("keydown", mark);
    return () => { text.removeEventListener("pointerdown", mark); text.removeEventListener("keydown", mark); };
  }, [editor]);
  const run = () => editor.chain().focus();
  const tool = (name: string, icon: ReactNode, action: () => void, { pressed, off = false, keys }: { pressed?: boolean; off?: boolean; keys?: string } = {}) => (
    <Button key={name} type="button" variant="ghost" size="icon-sm" aria-label={name} title={keys ? `${name} (${keys})` : name} aria-pressed={pressed}
      disabled={disabled || off} onClick={action} className="aria-pressed:bg-accent aria-pressed:text-foreground">{icon}</Button>
  );
  const close = () => { setLinking(false); editor.commands.focus(); };
  return <>
    {/* On a laptop or wider the toolbar stays in view just below the admin's top bar (top-16, its height) while the text scrolls. */}
    <div role="toolbar" aria-label={`${label} formatting`} data-editor-toolbar
      className={cn("z-[5] flex flex-wrap items-center gap-0.5 rounded-t-lg border-b border-line-soft bg-surface px-1.5 py-1 [&_svg]:size-4", full ? "rounded-none" : "lg:sticky lg:top-16")}>
      {tool("Undo", <Undo2 aria-hidden="true" />, () => run().undo().run(), { off: !state.undo, keys: "Ctrl+Z" })}
      {tool("Redo", <Redo2 aria-hidden="true" />, () => run().redo().run(), { off: !state.redo, keys: "Ctrl+Y" })}
      <Divider />
      <NativeSelect size="sm" aria-label="Text style" className="mr-1 w-36 bg-card" value={state.style} disabled={disabled} onChange={(event) => {
        const next = event.target.value as Style;
        if (next === "p") run().setParagraph().run(); else if (next !== "other") run().setHeading({ level: Number(next[1]) as 2 | 3 | 4 }).run();
      }}>
        {styles.map(([tag, name]) => <NativeSelectOption key={tag} value={tag}>{name}</NativeSelectOption>)}
        {state.style === "other" && <NativeSelectOption value="other" disabled>Other heading</NativeSelectOption>}
      </NativeSelect>
      {tool("Bold", <Bold aria-hidden="true" />, () => run().toggleBold().run(), { pressed: state.bold, keys: "Ctrl+B" })}
      {tool("Italic", <Italic aria-hidden="true" />, () => run().toggleItalic().run(), { pressed: state.italic, keys: "Ctrl+I" })}
      {tool("Underline", <Underline aria-hidden="true" />, () => run().toggleUnderline().run(), { pressed: state.underline, keys: "Ctrl+U" })}
      {tool("Strikethrough", <Strikethrough aria-hidden="true" />, () => run().toggleStrike().run(), { pressed: state.strike, keys: "Ctrl+Shift+S" })}
      {tool("Superscript", <SuperscriptIcon aria-hidden="true" />, () => run().toggleSuperscript().run(), { pressed: state.superscript, keys: "Ctrl+." })}
      {tool("Subscript", <SubscriptIcon aria-hidden="true" />, () => run().toggleSubscript().run(), { pressed: state.subscript, keys: "Ctrl+," })}
      <Divider />
      <ColorMenu current={state.color} disabled={disabled} onPick={(color) => color ? run().setTextColor(color).run() : run().unsetTextColor().run()} />
      {tool("Highlight", <Highlighter aria-hidden="true" />, () => run().toggleHighlight().run(), { pressed: state.highlight, keys: "Ctrl+Shift+H" })}
      <Divider />
      {tool("Align left", <TextAlignStart aria-hidden="true" />, () => run().setTextAlign("left").run(), { pressed: state.align === "left", keys: "Ctrl+Shift+L" })}
      {tool("Align centre", <TextAlignCenter aria-hidden="true" />, () => run().setTextAlign("center").run(), { pressed: state.align === "center", keys: "Ctrl+Shift+E" })}
      {tool("Align right", <TextAlignEnd aria-hidden="true" />, () => run().setTextAlign("right").run(), { pressed: state.align === "right", keys: "Ctrl+Shift+R" })}
      {tool("Justify", <TextAlignJustify aria-hidden="true" />, () => run().setTextAlign("justify").run(), { pressed: state.align === "justify", keys: "Ctrl+Shift+J" })}
      <Divider />
      {tool("Bulleted list", <List aria-hidden="true" />, () => run().toggleBulletList().run(), { pressed: state.bullet, keys: "Ctrl+Shift+8" })}
      {tool("Numbered list", <ListOrdered aria-hidden="true" />, () => run().toggleOrderedList().run(), { pressed: state.ordered, keys: "Ctrl+Shift+7" })}
      {tool("Decrease indent", <ListIndentDecrease aria-hidden="true" />, () => run().liftListItem("listItem").run(), { off: !state.lift, keys: "Shift+Tab" })}
      {tool("Increase indent", <ListIndentIncrease aria-hidden="true" />, () => run().sinkListItem("listItem").run(), { off: !state.sink, keys: "Tab" })}
      <Divider />
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Link" title="Link (select words first)" aria-expanded={linking} disabled={disabled}
        onClick={() => setLinking((open) => !open)} className={cn((state.link || linking) && "bg-accent text-foreground")}><Link2 aria-hidden="true" /></Button>
      {media && <Button type="button" variant="ghost" size="sm" aria-expanded={picturing} disabled={disabled}
        onClick={() => setPicturing((open) => !open)} className={cn("gap-1.5 px-2", picturing && "bg-accent text-foreground")}><ImagePlus aria-hidden="true" />Image</Button>}
      {tool("Insert table", <Table2 aria-hidden="true" />, () => run().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), { off: state.table })}
      {tool("Quote", <Quote aria-hidden="true" />, () => run().toggleBlockquote().run(), { pressed: state.quote, keys: "Ctrl+Shift+B" })}
      {tool("Divider line", <Minus aria-hidden="true" />, () => run().setHorizontalRule().run())}
      <Divider />
      {tool("Clear formatting", <RemoveFormatting aria-hidden="true" />, () => run().unsetAllMarks().setTextAlign("left").run())}
      <span className="ml-auto" />
      {full
        ? <Button type="button" variant="ghost" size="sm" aria-pressed onClick={onFull} className="gap-1.5 px-2 aria-pressed:bg-accent" title="Exit full screen (Esc)">
          <Minimize2 aria-hidden="true" />Exit full screen</Button>
        : <Button type="button" variant="ghost" size="icon-sm" aria-label="Full screen" aria-pressed={false} onClick={onFull} title="Full screen"><Maximize2 aria-hidden="true" /></Button>}
    </div>
    {state.table && <div role="group" aria-label="Table" data-table-tools className="flex flex-wrap items-center gap-1 border-b border-line-soft bg-card px-2 py-1 text-xs [&_svg]:size-3.5">
      <span className="mr-1 font-medium text-muted-foreground">Table</span>
      <TableTool label="Row above" icon={<BetweenHorizontalStart aria-hidden="true" />} disabled={disabled} onClick={() => run().addRowBefore().run()} />
      <TableTool label="Row below" icon={<BetweenHorizontalEnd aria-hidden="true" />} disabled={disabled} onClick={() => run().addRowAfter().run()} />
      <TableTool label="Column left" icon={<BetweenVerticalStart aria-hidden="true" />} disabled={disabled} onClick={() => run().addColumnBefore().run()} />
      <TableTool label="Column right" icon={<BetweenVerticalEnd aria-hidden="true" />} disabled={disabled} onClick={() => run().addColumnAfter().run()} />
      <TableTool label="Delete row" icon={<Trash2 aria-hidden="true" />} disabled={disabled} onClick={() => run().deleteRow().run()} />
      <TableTool label="Delete column" icon={<Trash2 aria-hidden="true" />} disabled={disabled} onClick={() => run().deleteColumn().run()} />
      <TableTool label="Header row" pressed={state.header} disabled={disabled} onClick={() => run().toggleHeaderRow().run()} />
      <TableTool label="Delete table" icon={<Trash2 aria-hidden="true" />} disabled={disabled} danger onClick={() => run().deleteTable().run()} />
    </div>}
    {linking && <LinkForm key={state.href} href={state.href} onCancel={close} onApply={(href) => {
      if (href) editor.chain().focus().extendMarkRange("link").setLink({ href }).run(); else editor.chain().focus().extendMarkRange("link").unsetLink().run();
      setLinking(false);
    }} />}
    {picturing && media && <PictureForm media={media} onCancel={() => { setPicturing(false); editor.commands.focus(); }} onInsert={(src, alt) => {
      editor.chain().focus(placed.current ? null : "end", { scrollIntoView: false }).setImage({ src, alt }).run();
      setPicturing(false);
    }} />}
  </>;
}

const Divider = () => <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-line-soft" />;

function TableTool({ label, icon, onClick, disabled, pressed, danger = false }: { label: string; icon?: ReactNode; onClick: () => void; disabled: boolean; pressed?: boolean; danger?: boolean }) {
  return <Button type="button" variant="ghost" size="sm" disabled={disabled} aria-pressed={pressed} onClick={onClick}
    className={cn("h-7 gap-1 px-2 text-xs aria-pressed:bg-accent", danger && "text-danger hover:text-danger")}>{icon}{label}</Button>;
}

/** The store's text colours (by name, so only these can be saved), and Default to take a colour off. */
function ColorMenu({ current, disabled, onPick }: { current: EditorialColor | null; disabled: boolean; onPick: (color: EditorialColor | null) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => { if (!box.current?.contains(event.target as globalThis.Node)) setOpen(false); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); setOpen(false); } };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", key); };
  }, [open]);
  const pick = (color: EditorialColor | null) => { onPick(color); setOpen(false); };
  return <div ref={box} className="relative">
    <Button type="button" variant="ghost" size="icon-sm" aria-label="Text colour" title="Text colour" aria-expanded={open} aria-haspopup="true" disabled={disabled}
      onClick={() => setOpen((value) => !value)} className={cn("relative", current && "bg-accent")}>
      <Baseline aria-hidden="true" />
      <span aria-hidden="true" className="absolute inset-x-1.5 bottom-0.5 h-0.5 rounded-full" style={{ backgroundColor: current ? editorialColors[current].hex : "currentColor" }} />
    </Button>
    {open && <div role="group" aria-label="Text colours" className="absolute top-full left-0 z-30 mt-1 grid w-44 gap-0.5 rounded-md border border-line-soft bg-card p-1.5 shadow-md">
      <ColorChoice label="Default" pressed={!current} onClick={() => pick(null)} />
      {(Object.entries(editorialColors) as [EditorialColor, (typeof editorialColors)[EditorialColor]][]).map(([key, color]) =>
        <ColorChoice key={key} label={color.label} hex={color.hex} pressed={current === key} onClick={() => pick(key)} />)}
    </div>}
  </div>;
}

function ColorChoice({ label, hex, pressed, onClick }: { label: string; hex?: string; pressed: boolean; onClick: () => void }) {
  return <button type="button" aria-pressed={pressed} onClick={onClick}
    className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring aria-pressed:bg-accent aria-pressed:font-medium">
    <span aria-hidden="true" className="size-4 shrink-0 rounded-full border border-line-soft" style={{ backgroundColor: hex ?? "var(--color-foreground, #1c1c1c)" }} />
    <span style={hex ? { color: hex } : undefined}>{label}</span>
  </button>;
}

/** A picture from the media library, with the description shoppers' screen readers announce. */
function PictureForm({ media, onInsert, onCancel }: { media: Media; onInsert: (src: string, alt: string) => void; onCancel: () => void }) {
  const [src, setSrc] = useState("");
  const [alt, setAlt] = useState("");
  const ready = (storeMedia(src) || (src.startsWith("https://") && contentImageSchema.safeParse(src).success)) && alt.trim().length > 0;
  return <div role="group" aria-label="Insert a picture" className="grid gap-3 border-b border-line-soft bg-surface px-3 py-3">
    <MediaPicker label="Picture" value={src} onChange={setSrc} session={media.session} onExpired={media.onExpired} />
    <Field label="Image description" value={alt} maxLength={200} onChange={setAlt} />
    <p className="text-xs text-muted-foreground">Describe what the picture shows; it is read out to shoppers who cannot see it.</p>
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" disabled={!ready} onClick={() => onInsert(src, alt.trim())}>Insert image</Button>
      <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
    </div>
  </div>;
}

/** The link address for the selected words; only addresses the storefront will publish are accepted. */
function LinkForm({ href, onApply, onCancel }: { href: string; onApply: (href: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(href);
  const valid = !value || safeLink(value);
  return <div className="grid gap-1.5 border-b border-line-soft bg-surface px-3 py-2">
    <div className="flex flex-wrap items-center gap-2">
      <Input autoFocus aria-label="Link address" aria-invalid={!valid} aria-describedby={valid ? "link-help" : "link-error"} placeholder="/collections/chairs, mailto: or tel:" value={value}
        onChange={(event) => setValue(event.target.value.trim())} className="h-8 min-w-0 flex-1 bg-card text-sm"
        onKeyDown={(event) => { if (event.key === "Enter" && valid) { event.preventDefault(); onApply(value); } if (event.key === "Escape") { event.preventDefault(); onCancel(); } }} />
      <Button type="button" size="sm" disabled={!valid} onClick={() => onApply(value)}>{value ? "Apply link" : "Remove link"}</Button>
      <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
    </div>
    {valid ? <p id="link-help" className="text-xs text-muted-foreground">Select words first; the link applies to them.</p>
      : <p id="link-error" role="alert" className="text-xs text-danger">Use a store page such as /collections/chairs, a Maple Furnishers address, mailto: or tel:.</p>}
  </div>;
}

/** Document-like reading in the editor; the storefront renders the same tags with its own styles. */
const editorClass = cn(
  "min-h-[420px] px-5 py-4 text-[15px] leading-relaxed text-foreground outline-none",
  "[&_h1]:mt-5 [&_h1]:mb-2 [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-semibold",
  "[&_h3]:mt-5 [&_h3]:mb-1.5 [&_h3]:text-lg [&_h3]:font-semibold [&_h4]:mt-4 [&_h4]:mb-1 [&_h4]:font-semibold [&_h5]:mt-3 [&_h5]:font-semibold [&_h6]:mt-3 [&_h6]:font-semibold",
  "[&_div[data-section]]:my-1 [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_li_p]:my-0.5 [&_li>ul]:list-[circle] [&_li>ol]:list-[lower-alpha]",
  "[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-line [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
  "[&_a]:text-primary [&_a]:underline [&_hr]:my-4 [&_hr]:border-line-soft [&_img]:my-3 [&_img]:max-w-full [&_img]:rounded-md [&_img.ProseMirror-selectednode]:outline-2 [&_img.ProseMirror-selectednode]:outline-ring",
  "[&_mark]:rounded-[2px] [&_mark]:px-0.5 [&_sup]:text-[0.75em] [&_sub]:text-[0.75em]",
  "[&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-line-soft [&_td]:px-2 [&_td]:py-1 [&_td]:align-top [&_th]:border [&_th]:border-line-soft [&_th]:bg-surface [&_th]:px-2 [&_th]:py-1 [&_th]:text-left",
  "[&_.selectedCell]:bg-accent",
  "[&_.is-empty]:before:pointer-events-none [&_.is-empty]:before:float-left [&_.is-empty]:before:h-0 [&_.is-empty]:before:text-muted-foreground [&_.is-empty]:before:content-[attr(data-placeholder)]",
);
