"use client";
import { useEffect, useRef, useState } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Paragraph from "@tiptap/extension-paragraph";
import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import { Bold, ImagePlus, Italic, Link2, List, ListOrdered, Minus, Quote, Redo2, Underline, Undo2 } from "lucide-react";
import { contentImageSchema, editorialDocumentSchema, managedUpload, safeLink, type EditorialNode } from "@shopmaple/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { fromEditorDoc, toEditorDoc } from "@/lib/editorial-rich-text";
import { cn } from "@/lib/utils";
import type { StaffSession } from "./dashboard";
import { Field } from "./field";
import { MediaPicker, mediaPreviewUrl } from "./media-picker";

type Style = "p" | "h2" | "h3" | "h4" | "other";
const styles: [Exclude<Style, "other">, string][] = [["p", "Paragraph"], ["h2", "Heading"], ["h3", "Subheading"], ["h4", "Small heading"]];

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
          const preview = /^\/api\/admin\/media\/([a-f0-9]{64})\/preview$/.exec(src);
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
 * Rich text for policies, articles and pages: write and format as in a document, and the editor keeps
 * to what the storefront renders safely (headings, paragraphs, lists, quotes, links, tables,
 * images, rules). Links are limited to store pages, Maple sites, email and phone. An untouched
 * page is never rewritten: only real edits are reported, and a reloaded draft replaces the text.
 */
export function RichTextEditor({ label, value, onChange, disabled = false, media }: {
  label: string; value: EditorialNode[]; onChange: (value: EditorialNode[]) => void; disabled?: boolean; media?: Media;
}) {
  /** The stored form the editor last showed or reported; anything else arriving is a reload. */
  const shown = useRef(JSON.stringify(value));
  const [initial] = useState(() => toEditorDoc(value));
  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({ paragraph: false, trailingNode: false, code: false, codeBlock: false, strike: false,
        link: { openOnClick: false, autolink: false, isAllowedUri: (url) => safeLink(url) } }),
      StoredParagraph, Section,
      TableKit.configure({ table: { resizable: false } }),
      StoreImage,
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
  const problem = editorialDocumentSchema.safeParse(value).success ? null
    : "This page has more text or formatting than one page can hold. Split it into two pages, or remove some formatting.";
  return <div className="grid gap-2">
    <div className="min-w-0 overflow-hidden rounded-lg border border-input bg-card shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/40">
      {editor && <Toolbar editor={editor} label={label} disabled={disabled} media={media} />}
      <EditorContent editor={editor} />
    </div>
    {problem && <p role="alert" className="text-xs text-danger">{problem}</p>}
  </div>;
}

function Toolbar({ editor, label, disabled, media }: { editor: Editor; label: string; disabled: boolean; media?: Media }) {
  const state = useEditorState({ editor, selector: ({ editor: e }) => ({
    style: ((["h2", "h3", "h4"] as const).find((tag) => e.isActive("heading", { level: Number(tag[1]) }))
      ?? (e.isActive("heading") ? "other" : "p")) as Style,
    bold: e.isActive("bold"), italic: e.isActive("italic"), underline: e.isActive("underline"),
    bullet: e.isActive("bulletList"), ordered: e.isActive("orderedList"), quote: e.isActive("blockquote"), link: e.isActive("link"),
    href: String(e.getAttributes("link").href ?? ""), undo: e.can().undo(), redo: e.can().redo(),
  }) });
  const [linking, setLinking] = useState(false);
  const [picturing, setPicturing] = useState(false);
  /** Whether the writer has put the cursor somewhere; until then a picture goes at the end. */
  const placed = useRef(false);
  useEffect(() => {
    const mark = () => { placed.current = true; };
    editor.on("focus", mark);
    return () => { editor.off("focus", mark); };
  }, [editor]);
  const run = () => editor.chain().focus();
  const toggle = (name: string, pressed: boolean, icon: React.ReactNode, action: () => void) => (
    <Button key={name} type="button" variant="ghost" size="icon-sm" aria-label={name} title={name} aria-pressed={pressed} disabled={disabled} onClick={action}
      className="aria-pressed:bg-accent aria-pressed:text-foreground">{icon}</Button>
  );
  const action = (name: string, icon: React.ReactNode, onClick: () => void, off = false) => (
    <Button type="button" variant="ghost" size="icon-sm" aria-label={name} title={name} disabled={disabled || off} onClick={onClick}>{icon}</Button>
  );
  const close = () => { setLinking(false); editor.commands.focus(); };
  return <>
    <div role="group" aria-label={`${label} formatting`} className="flex flex-wrap items-center gap-0.5 border-b border-line-soft bg-surface px-1.5 py-1 [&_svg]:size-4">
      <NativeSelect size="sm" aria-label="Text style" className="mr-1 w-36 bg-card" value={state.style} disabled={disabled} onChange={(event) => {
        const next = event.target.value as Style;
        if (next === "p") run().setParagraph().run(); else if (next !== "other") run().setHeading({ level: Number(next[1]) as 2 | 3 | 4 }).run();
      }}>
        {styles.map(([tag, name]) => <NativeSelectOption key={tag} value={tag}>{name}</NativeSelectOption>)}
        {state.style === "other" && <NativeSelectOption value="other" disabled>Other heading</NativeSelectOption>}
      </NativeSelect>
      {toggle("Bold", state.bold, <Bold aria-hidden="true" />, () => run().toggleBold().run())}
      {toggle("Italic", state.italic, <Italic aria-hidden="true" />, () => run().toggleItalic().run())}
      {toggle("Underline", state.underline, <Underline aria-hidden="true" />, () => run().toggleUnderline().run())}
      <span aria-hidden="true" className="mx-1 h-5 w-px bg-line-soft" />
      {toggle("Bulleted list", state.bullet, <List aria-hidden="true" />, () => run().toggleBulletList().run())}
      {toggle("Numbered list", state.ordered, <ListOrdered aria-hidden="true" />, () => run().toggleOrderedList().run())}
      {toggle("Quote", state.quote, <Quote aria-hidden="true" />, () => run().toggleBlockquote().run())}
      {action("Divider", <Minus aria-hidden="true" />, () => run().setHorizontalRule().run())}
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Link" title="Link" aria-expanded={linking} disabled={disabled}
        onClick={() => setLinking((open) => !open)} className={cn((state.link || linking) && "bg-accent text-foreground")}><Link2 aria-hidden="true" /></Button>
      {media && <Button type="button" variant="ghost" size="sm" aria-expanded={picturing} disabled={disabled}
        onClick={() => setPicturing((open) => !open)} className={cn("gap-1.5 px-2", picturing && "bg-accent text-foreground")}><ImagePlus aria-hidden="true" />Image</Button>}
      <span aria-hidden="true" className="mx-1 h-5 w-px bg-line-soft" />
      {action("Undo", <Undo2 aria-hidden="true" />, () => run().undo().run(), !state.undo)}
      {action("Redo", <Redo2 aria-hidden="true" />, () => run().redo().run(), !state.redo)}
    </div>
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

/** A picture from the media library, with the description shoppers' screen readers announce. */
function PictureForm({ media, onInsert, onCancel }: { media: Media; onInsert: (src: string, alt: string) => void; onCancel: () => void }) {
  const [src, setSrc] = useState("");
  const [alt, setAlt] = useState("");
  const ready = (managedUpload.test(src) || (src.startsWith("https://") && contentImageSchema.safeParse(src).success)) && alt.trim().length > 0;
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
  "min-h-64 max-h-[70dvh] overflow-y-auto px-4 py-3 text-sm leading-relaxed text-foreground outline-none",
  "[&_h1]:mt-5 [&_h1]:mb-2 [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-semibold",
  "[&_h3]:mt-4 [&_h3]:mb-1.5 [&_h3]:text-lg [&_h3]:font-semibold [&_h4]:mt-3 [&_h4]:mb-1 [&_h4]:font-semibold [&_h5]:mt-3 [&_h5]:font-semibold [&_h6]:mt-3 [&_h6]:font-semibold",
  "[&_div[data-section]]:my-1 [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_li_p]:my-0.5",
  "[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-line [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
  "[&_a]:text-primary [&_a]:underline [&_hr]:my-4 [&_hr]:border-line-soft [&_img]:my-3 [&_img]:max-w-full [&_img]:rounded-md",
  "[&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-line-soft [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-line-soft [&_th]:px-2 [&_th]:py-1 [&_th]:text-left",
);
