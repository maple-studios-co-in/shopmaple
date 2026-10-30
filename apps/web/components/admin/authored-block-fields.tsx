"use client";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { AuthoredBlock } from "@shopmaple/contracts";
import type { StaffSession } from "./dashboard";
import { Field } from "./field";
import { MediaPicker } from "./media-picker";
import { SortableList } from "./sortable-list";
import { ChevronDown, ChevronUp, ImagePlus, Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelectOption } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { Notice } from "./crm-primitives";
import { CheckField, FieldGrid, SectionHeading, SelectField, rowCard } from "./kit";

const blockTypeLabels: Record<AuthoredBlock["type"], string> = { paragraph: "Paragraph", heading: "Heading", quote: "Quotation", list: "List", link: "Link", image: "Image" };
/** A short hint under a block's fields. */
function Hint({ children }: { children: ReactNode }) {
  return <p data-span="full" className="text-xs leading-relaxed text-muted-foreground">{children}</p>;
}

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
  const atLimit = value.length >= 60;
  return <div className="mt-8" ref={region} onKeyDown={event => {
    if (event.key === "Enter" && event.target instanceof window.HTMLInputElement && event.target.type === "text") event.preventDefault();
  }}>
    <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
      <SectionHeading className="m-0" description="Keep at least one block. Drag blocks into order or use the Move buttons. HTML is displayed as text.">{blockLabel}s</SectionHeading>
      <p className="text-xs text-muted-foreground tabular-nums">{value.length} of 60 blocks</p>
    </div>
    <SortableList items={value} getId={block => block.id} getLabel={(_, index) => `Block ${index + 1}`} tag="div" rowTag="fieldset" onReorder={blocks => onChange(blocks)}
      rowClassName={cn(rowCard, "grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-3 p-3 sm:p-4")}
      rowProps={block => ({ "aria-label": blockLabel, "data-block-id": block.id })}
      renderItem={(block, index, handle) => <>
      <legend className="float-left col-start-1 row-start-1 flex min-h-8 items-center gap-2 text-sm font-semibold text-foreground">
        Block {index + 1}
        <Badge variant="secondary" className="rounded-md border-0 bg-neutral-bg font-medium text-neutral">{blockTypeLabels[block.type]}</Badge>
      </legend>
      <FieldGrid className="col-span-2 row-start-2">
        {(block.type === "paragraph" || block.type === "quote" || block.type === "heading") && <Field label={`Block ${index + 1} text`} value={block.text} maxLength={block.type === "heading" ? 300 : 8000} multiline={block.type !== "heading"} onChange={text => replaceBlock(block.id, { ...block, text })} />}
        {block.type === "heading" && <SelectField label="Heading level" aria-label={`Block ${index + 1} heading level`} value={block.level} onChange={event => replaceBlock(block.id, { ...block, level: Number(event.target.value) as 2 | 3 })}>
          <NativeSelectOption value={2}>Heading 2</NativeSelectOption>
          <NativeSelectOption value={3}>Heading 3</NativeSelectOption>
        </SelectField>}
        {block.type === "list" && <>
          <Field label={`Block ${index + 1} list items`} value={block.items.join("\n")} maxLength={40019} multiline onChange={text => replaceBlock(block.id, { ...block, items: text.split("\n") })} />
          <Hint>One item per line; up to 20 items, 2,000 characters each.</Hint>
          <CheckField label="Numbered list" aria-label={`Block ${index + 1} numbered list`} checked={block.ordered} onChange={event => replaceBlock(block.id, { ...block, ordered: event.target.checked })} />
        </>}
        {block.type === "link" && <>
          <Field label={`Block ${index + 1} link label`} value={block.text} maxLength={300} onChange={text => replaceBlock(block.id, { ...block, text })} />
          <Field label={`Block ${index + 1} link destination`} value={block.href} maxLength={500} onChange={href => replaceBlock(block.id, { ...block, href })} />
          <Hint>Use a store address such as /collections/all.</Hint>
        </>}
        {block.type === "image" && <>
          {session && onExpired ? <MediaPicker label={`Block ${index + 1} image`} value={block.src} session={session} onExpired={onExpired} onChange={src => replaceBlock(block.id, { ...block, src })} /> : <div data-span="full"><Notice tone="info">Sign in to choose an image from the media library.</Notice></div>}
          <Field label={`Block ${index + 1} image description`} value={block.alt} maxLength={200} className="sm:col-span-2" onChange={alt => replaceBlock(block.id, { ...block, alt })} />
        </>}
      </FieldGrid>
      {/* The fields come first in the DOM so focus after a reorder lands on the block's text, not its controls. */}
      <div className="col-start-2 row-start-1 flex items-center gap-0.5">
        {handle}
        <Button type="button" variant="ghost" size="icon-sm" title="Move up" disabled={index === 0} onClick={() => moveBlock(index, -1)}>
          <ChevronUp aria-hidden="true" strokeWidth={1.5} /><span className="sr-only">Move up</span>
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" title="Move down" disabled={index === value.length - 1} onClick={() => moveBlock(index, 1)}>
          <ChevronDown aria-hidden="true" strokeWidth={1.5} /><span className="sr-only">Move down</span>
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" title="Remove block" className="text-muted-foreground hover:bg-danger-bg hover:text-danger" disabled={value.length <= 1} onClick={() => removeBlock(index)}>
          <X aria-hidden="true" strokeWidth={1.5} /><span className="sr-only">Remove block</span>
        </Button>
      </div>
    </>} />
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <span className="mr-1 text-xs font-medium text-muted-foreground">Add a block</span>
      {(["paragraph", "heading", "quote", "list", "link"] as const).map(type => <Button key={type} type="button" variant="outline" size="sm" disabled={atLimit} onClick={() => addBlock(newAuthoredBlock(type))}><Plus aria-hidden="true" strokeWidth={1.5} />Add {type}</Button>)}
      <Button type="button" variant="outline" size="sm" disabled={atLimit || addingImage || !session || !onExpired} onClick={() => setAddingImage(true)}><ImagePlus aria-hidden="true" strokeWidth={1.5} />Add image</Button>
    </div>
    {addingImage && session && onExpired && <div aria-label="New image block" className="mt-3 grid gap-3 rounded-lg border border-border bg-card p-3 shadow-xs sm:p-4">
      <MediaPicker label="New block image" value="" session={session} onExpired={onExpired} onChange={src => { if (src) { addBlock({ id: crypto.randomUUID(), type: "image", src, alt: "" }); setAddingImage(false); } }} />
      <Button type="button" variant="ghost" size="sm" className="justify-self-start text-muted-foreground" onClick={() => setAddingImage(false)}>Cancel image block</Button>
    </div>}
  </div>;
}
