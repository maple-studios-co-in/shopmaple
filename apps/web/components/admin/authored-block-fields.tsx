"use client";
import { useLayoutEffect, useRef, useState } from "react";
import type { AuthoredBlock } from "@shopmaple/contracts";
import type { StaffSession } from "./dashboard";
import { Field } from "./field";
import { MediaPicker } from "./media-picker";
import { SortableList } from "./sortable-list";

export function newAuthoredBlock(type: Exclude<AuthoredBlock["type"], "image">): AuthoredBlock {
  const id = crypto.randomUUID();
  switch (type) {
    case "heading": return { id, type, level: 2, text: "" };
    case "quote": return { id, type, text: "" };
    case "list": return { id, type, ordered: false, items: [""] };
    case "link": return { id, type, text: "", href: "/collections/all" };
    default: return { id, type, text: "" };
  }
}

export function AuthoredBlockFields({ value, onChange, session, onExpired, blockLabel = "Article block" }: {
  value: AuthoredBlock[];
  onChange: (value: AuthoredBlock[]) => void;
  session?: StaffSession;
  onExpired?: () => void;
  blockLabel?: string;
}) {
  const [addingImage, setAddingImage] = useState(false);
  const region = useRef<HTMLDivElement>(null);
  const focusBlock = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!focusBlock.current) return;
    const id = focusBlock.current;
    focusBlock.current = null;
    const block = [...(region.current?.querySelectorAll<HTMLElement>("[data-block-id]") ?? [])].find(element => element.dataset.blockId === id);
    block?.querySelector<HTMLElement>("textarea, input, button")?.focus();
  }, [value]);
  function addBlock(block: AuthoredBlock) {
    if (value.length < 60) onChange([...value, block]);
  }
  function replaceBlock(id: string, next: AuthoredBlock) {
    onChange(value.map(block => block.id === id ? next : block));
  }
  function moveBlock(index: number, direction: -1 | 1) {
    if (index + direction < 0 || index + direction >= value.length) return;
    const blocks = [...value];
    [blocks[index], blocks[index + direction]] = [blocks[index + direction]!, blocks[index]!];
    // Boundary moves disable their control; retain keyboard focus in the moved block.
    if (index + direction === 0 || index + direction === blocks.length - 1) focusBlock.current = blocks[index + direction]!.id;
    onChange(blocks);
  }
  function removeBlock(index: number) {
    if (value.length <= 1) return;
    const blocks = value.filter((_, i) => i !== index);
    focusBlock.current = blocks[Math.min(index, blocks.length - 1)]!.id;
    onChange(blocks);
  }
  return <div className="admin-block-fields" ref={region} onKeyDown={event => {
    if (event.key === "Enter" && event.target instanceof window.HTMLInputElement && event.target.type === "text") event.preventDefault();
  }}>
    <h3>{blockLabel}s</h3><p>Keep at least one block. Drag blocks into order or use the Move buttons. HTML is displayed as text.</p>
    <SortableList items={value} getId={block => block.id} getLabel={(_, index) => `Block ${index + 1}`} tag="div" rowTag="fieldset" onReorder={blocks => onChange(blocks)}
      rowProps={block => ({ "aria-label": blockLabel, "data-block-id": block.id })}
      renderItem={(block, index, handle) => <>
      <legend>Block {index + 1} · {block.type}</legend>
      {(block.type === "paragraph" || block.type === "quote" || block.type === "heading") && <Field label={`Block ${index + 1} text`} value={block.text} maxLength={block.type === "heading" ? 300 : 8000} multiline={block.type !== "heading"} onChange={text => replaceBlock(block.id, { ...block, text })} />}
      {block.type === "heading" && <label className="admin-field"><span>Heading level</span><select aria-label={`Block ${index + 1} heading level`} value={block.level} onChange={event => replaceBlock(block.id, { ...block, level: Number(event.target.value) as 2 | 3 })}><option value={2}>Heading 2</option><option value={3}>Heading 3</option></select></label>}
      {block.type === "list" && <>
        <Field label={`Block ${index + 1} list items`} value={block.items.join("\n")} maxLength={40019} multiline onChange={text => replaceBlock(block.id, { ...block, items: text.split("\n") })} />
        <p>One item per line; up to 20 items, 2,000 characters each.</p>
        <label><input type="checkbox" aria-label={`Block ${index + 1} numbered list`} checked={block.ordered} onChange={event => replaceBlock(block.id, { ...block, ordered: event.target.checked })} />Numbered list</label>
      </>}
      {block.type === "link" && <>
        <Field label={`Block ${index + 1} link label`} value={block.text} maxLength={300} onChange={text => replaceBlock(block.id, { ...block, text })} />
        <Field label={`Block ${index + 1} link destination`} value={block.href} maxLength={500} onChange={href => replaceBlock(block.id, { ...block, href })} />
        <p>Use a store address such as /collections/all.</p>
      </>}
      {block.type === "image" && <>
        {session && onExpired ? <MediaPicker label={`Block ${index + 1} image`} value={block.src} session={session} onExpired={onExpired} onChange={src => replaceBlock(block.id, { ...block, src })} /> : <p>Sign in to choose an image from the media library.</p>}
        <Field label={`Block ${index + 1} image description`} value={block.alt} maxLength={200} onChange={alt => replaceBlock(block.id, { ...block, alt })} />
      </>}
      {handle}
      <button type="button" disabled={index === 0} onClick={() => moveBlock(index, -1)}>Move up</button>
      <button type="button" disabled={index === value.length - 1} onClick={() => moveBlock(index, 1)}>Move down</button>
      <button type="button" disabled={value.length <= 1} onClick={() => removeBlock(index)}>Remove block</button>
    </>} />
    <p>{value.length} of 60 blocks</p>
    <div className="admin-actions">{(["paragraph", "heading", "quote", "list", "link"] as const).map(type => <button key={type} type="button" disabled={value.length >= 60} onClick={() => addBlock(newAuthoredBlock(type))}>Add {type}</button>)}
      <button type="button" disabled={value.length >= 60 || addingImage || !session || !onExpired} onClick={() => setAddingImage(true)}>Add image</button>
    </div>
    {addingImage && session && onExpired && <div aria-label="New image block"><MediaPicker label="New block image" value="" session={session} onExpired={onExpired} onChange={src => { if (src) { addBlock({ id: crypto.randomUUID(), type: "image", src, alt: "" }); setAddingImage(false); } }} /><button type="button" onClick={() => setAddingImage(false)}>Cancel image block</button></div>}
  </div>;
}
