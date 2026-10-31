"use client";
import { useState } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import { Bold, Italic, Link2, List, ListOrdered, Minus, Quote, Redo2, Underline, Undo2 } from "lucide-react";
import { safeLink, type EditorialNode } from "@shopmaple/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { fromEditorDoc, toEditorDoc } from "@/lib/editorial-rich-text";
import { cn } from "@/lib/utils";

type Style = "p" | "h2" | "h3" | "h4";
const styles: [Style, string][] = [["p", "Paragraph"], ["h2", "Heading"], ["h3", "Subheading"], ["h4", "Small heading"]];

/**
 * Rich text for policies and articles: write and format as in a document, and the editor keeps
 * to what the storefront renders safely (headings, paragraphs, lists, quotes, links, tables,
 * images, rules). Links are limited to store pages, Maple sites, email and phone.
 */
export function RichTextEditor({ label, value, onChange }: { label: string; value: EditorialNode[]; onChange: (value: EditorialNode[]) => void }) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ code: false, codeBlock: false, strike: false, link: { openOnClick: false, autolink: false, isAllowedUri: (url) => safeLink(url) } }),
      TableKit.configure({ table: { resizable: false } }),
      Image,
    ],
    content: toEditorDoc(value),
    editorProps: { attributes: { "aria-label": label, "aria-multiline": "true", role: "textbox", class: editorClass } },
    onUpdate: ({ editor }) => onChange(fromEditorDoc(editor.getJSON())),
  });
  return <div className="min-w-0 overflow-hidden rounded-lg border border-input bg-card shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/40">
    {editor && <Toolbar editor={editor} label={label} />}
    <EditorContent editor={editor} />
  </div>;
}

function Toolbar({ editor, label }: { editor: Editor; label: string }) {
  const state = useEditorState({ editor, selector: ({ editor: e }) => ({
    style: (["h2", "h3", "h4"] as const).find((tag) => e.isActive("heading", { level: Number(tag[1]) })) ?? "p",
    bold: e.isActive("bold"), italic: e.isActive("italic"), underline: e.isActive("underline"),
    bullet: e.isActive("bulletList"), ordered: e.isActive("orderedList"), quote: e.isActive("blockquote"), link: e.isActive("link"),
    href: String(e.getAttributes("link").href ?? ""), undo: e.can().undo(), redo: e.can().redo(),
  }) });
  const [linking, setLinking] = useState(false);
  const run = () => editor.chain().focus();
  const toggle = (name: string, pressed: boolean, icon: React.ReactNode, action: () => void) => (
    <Button key={name} type="button" variant="ghost" size="icon-sm" aria-label={name} title={name} aria-pressed={pressed} onClick={action}
      className="aria-pressed:bg-accent aria-pressed:text-foreground">{icon}</Button>
  );
  return <>
    <div role="toolbar" aria-label={`${label} formatting`} className="flex flex-wrap items-center gap-0.5 border-b border-line-soft bg-surface px-1.5 py-1 [&_svg]:size-4">
      <NativeSelect size="sm" aria-label="Text style" className="mr-1 w-36 bg-card" value={state.style} onChange={(event) => {
        const next = event.target.value as Style;
        if (next === "p") run().setParagraph().run(); else run().setHeading({ level: Number(next[1]) as 2 | 3 | 4 }).run();
      }}>
        {styles.map(([tag, name]) => <NativeSelectOption key={tag} value={tag}>{name}</NativeSelectOption>)}
      </NativeSelect>
      {toggle("Bold", state.bold, <Bold aria-hidden="true" />, () => run().toggleBold().run())}
      {toggle("Italic", state.italic, <Italic aria-hidden="true" />, () => run().toggleItalic().run())}
      {toggle("Underline", state.underline, <Underline aria-hidden="true" />, () => run().toggleUnderline().run())}
      <span aria-hidden="true" className="mx-1 h-5 w-px bg-line-soft" />
      {toggle("Bulleted list", state.bullet, <List aria-hidden="true" />, () => run().toggleBulletList().run())}
      {toggle("Numbered list", state.ordered, <ListOrdered aria-hidden="true" />, () => run().toggleOrderedList().run())}
      {toggle("Quote", state.quote, <Quote aria-hidden="true" />, () => run().toggleBlockquote().run())}
      {toggle("Divider", false, <Minus aria-hidden="true" />, () => run().setHorizontalRule().run())}
      {toggle("Link", state.link || linking, <Link2 aria-hidden="true" />, () => setLinking((open) => !open))}
      <span aria-hidden="true" className="mx-1 h-5 w-px bg-line-soft" />
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Undo" title="Undo" disabled={!state.undo} onClick={() => run().undo().run()}><Undo2 aria-hidden="true" /></Button>
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Redo" title="Redo" disabled={!state.redo} onClick={() => run().redo().run()}><Redo2 aria-hidden="true" /></Button>
    </div>
    {linking && <LinkForm key={state.href} href={state.href} onCancel={() => setLinking(false)} onApply={(href) => {
      if (href) run().extendMarkRange("link").setLink({ href }).run(); else run().extendMarkRange("link").unsetLink().run();
      setLinking(false);
    }} />}
  </>;
}

/** The link address for the selected words; only addresses the storefront will publish are accepted. */
function LinkForm({ href, onApply, onCancel }: { href: string; onApply: (href: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(href);
  const valid = !value || safeLink(value);
  return <div className="grid gap-1.5 border-b border-line-soft bg-surface px-3 py-2">
    <div className="flex flex-wrap items-center gap-2">
      <Input aria-label="Link address" aria-invalid={!valid} placeholder="/collections/chairs, mailto: or tel:" value={value} onChange={(event) => setValue(event.target.value.trim())}
        className="h-8 min-w-0 flex-1 bg-card text-sm" onKeyDown={(event) => { if (event.key === "Enter" && valid) { event.preventDefault(); onApply(value); } if (event.key === "Escape") onCancel(); }} />
      <Button type="button" size="sm" disabled={!valid} onClick={() => onApply(value)}>{value ? "Apply link" : "Remove link"}</Button>
      <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
    </div>
    {!valid && <p role="alert" className="text-xs text-danger">Use a store page such as /collections/chairs, a Maple Furnishers address, mailto: or tel:.</p>}
  </div>;
}

/** Document-like reading in the editor; the storefront renders the same tags with its own styles. */
const editorClass = cn(
  "min-h-64 max-h-[70dvh] overflow-y-auto px-4 py-3 text-sm leading-relaxed text-foreground outline-none",
  "[&_h1]:mt-5 [&_h1]:mb-2 [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-semibold",
  "[&_h3]:mt-4 [&_h3]:mb-1.5 [&_h3]:text-lg [&_h3]:font-semibold [&_h4]:mt-3 [&_h4]:mb-1 [&_h4]:font-semibold [&_h5]:mt-3 [&_h5]:font-semibold [&_h6]:mt-3 [&_h6]:font-semibold",
  "[&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_li_p]:my-0.5",
  "[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-line [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
  "[&_a]:text-primary [&_a]:underline [&_hr]:my-4 [&_hr]:border-line-soft [&_img]:my-3 [&_img]:max-w-full [&_img]:rounded-md",
  "[&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-line-soft [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-line-soft [&_th]:px-2 [&_th]:py-1 [&_th]:text-left",
);
