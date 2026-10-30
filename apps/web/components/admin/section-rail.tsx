"use client";
import { useEffect, useRef, useState } from "react";
import { ImageOff, Plus } from "lucide-react";
import type { StorefrontContent } from "@shopmaple/contracts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NativeCheckbox } from "@/components/ui/native-checkbox";
import { previewFrameUrl } from "@/lib/live-preview";
import { sectionName, sectionSignature, type HomeSectionKey } from "@/lib/section-thumbnails";
import { cn } from "@/lib/utils";
import { MoveButtons, focusRing, rowCard } from "./kit";
import { SortableList } from "./sortable-list";

type Section = StorefrontContent["homeSections"][number];
export type SectionScreen = "Campaigns" | "Merchandising" | "Instagram";
/** Where a section's content is edited: a panel or field on the Homepage screen, or another screen. */
type EditTarget = { kind: "panel" } | { kind: "field"; label: string } | { kind: "screen"; screen: SectionScreen };
const editTargets: Record<HomeSectionKey, EditTarget> = {
  hero: { kind: "panel" }, difference: { kind: "panel" }, nimbus: { kind: "panel" }, testimonial: { kind: "panel" },
  newsletter: { kind: "panel" }, values: { kind: "panel" }, cities: { kind: "panel" }, project: { kind: "panel" },
  ticker: { kind: "field", label: "Brand ticker" },
  announcement: { kind: "screen", screen: "Campaigns" }, "dining-banner": { kind: "screen", screen: "Campaigns" },
  "seating-banner": { kind: "screen", screen: "Campaigns" }, promos: { kind: "screen", screen: "Campaigns" },
  categories: { kind: "screen", screen: "Merchandising" }, offers: { kind: "screen", screen: "Merchandising" },
  bestsellers: { kind: "screen", screen: "Merchandising" }, chairs: { kind: "screen", screen: "Merchandising" },
  instagram: { kind: "screen", screen: "Instagram" },
};

/** The width the storefront is drawn at inside a thumbnail, and how much of the section's top it shows. */
const frameWidth = 1280;
const frameHeight = 480;

export type ThumbnailSource = {
  /** The shared preview token for the current draft version, or null while there is none. */
  token: string | null;
  /** The draft has unsaved edits: the token's version is not what the editor shows, so nothing reloads yet. */
  dirty: boolean;
  /** No thumbnail can be drawn (no saved draft yet, or the token could not be minted). */
  unavailable: boolean;
  /** Called once the first thumbnail is on screen, so the editor mints a token for it. */
  onWanted: () => void;
};

/**
 * One section drawn by the real storefront from the draft, scaled down. The frame address is
 * served with a script policy that lets no app bundle load (next.config.ts), so nothing hydrates;
 * it takes no input, loads once the card is on screen and reloads only when the section's own
 * content was saved with a change (sectionSignature), never on reorder or hide.
 */
export function SectionThumbnail({ section, content, source, width }: {
  section: HomeSectionKey; content: StorefrontContent; source: ThumbnailSource; width: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [frame, setFrame] = useState<{ src: string; signature: string } | null>(null);
  const [ready, setReady] = useState(false);
  const signature = sectionSignature(content, section);
  const { token, dirty, unavailable, onWanted } = source;

  useEffect(() => {
    const node = box.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setVisible(true);
      observer.disconnect();
    }, { rootMargin: "200px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => { if (visible) onWanted(); }, [visible, onWanted]);
  useEffect(() => {
    if (!visible || !token || dirty || frame?.signature === signature) return;
    setFrame({ src: `${previewFrameUrl({ path: "home", token, view: "draft" })}&section=${section}`, signature });
    setReady(false);
  }, [visible, token, dirty, signature, frame, section]);

  const height = Math.round(width * frameHeight / frameWidth);
  return (
    <div ref={box} className="relative shrink-0 overflow-hidden rounded-md bg-sunken ring-1 ring-line-soft" style={{ width, height }}>
      {frame && (
        <iframe data-section-thumbnail-frame src={frame.src} title={`${sectionName(section)} thumbnail`} aria-hidden="true"
          tabIndex={-1} loading="lazy" scrolling="no" referrerPolicy="same-origin" onLoad={() => setReady(true)}
          className="pointer-events-none absolute top-0 left-0 origin-top-left border-0 bg-white"
          style={{ width: frameWidth, height: frameHeight, transform: `scale(${width / frameWidth})` }} />
      )}
      {!ready && (
        <div aria-hidden="true" className={cn("absolute inset-0 grid place-items-center bg-sunken text-faint", !unavailable && "motion-safe:animate-pulse")}>
          {unavailable && <ImageOff className="size-4" strokeWidth={1.5} />}
        </div>
      )}
    </div>
  );
}

/**
 * The Homepage screen's section list as a website builder shows it: a card per section with a
 * live thumbnail, visibility, drag and Move buttons, and the way to its content. Hidden
 * sections keep their place, dimmed; "Add section" brings one back after the selected card.
 */
export function SectionRail({ content, edit, selected, onSelect, onOpenScreen, source }: {
  content: StorefrontContent;
  edit: (next: StorefrontContent) => void;
  selected: string | null;
  onSelect: (section: string) => void;
  onOpenScreen: (screen: SectionScreen) => void;
  source: ThumbnailSource;
}) {
  const [picking, setPicking] = useState(false);
  const sections = content.homeSections;
  const hidden = sections.filter((section) => !section.enabled);
  const setSections = (homeSections: Section[]) => edit({ ...content, homeSections });
  // A section selected from the live preview brings its card into view.
  useEffect(() => {
    if (!selected) return;
    document.querySelector<HTMLElement>(`[data-section-card="${selected}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [selected]);

  function openContent(section: Section) {
    onSelect(section.key);
    const target = editTargets[section.key];
    if (target.kind === "screen") { onOpenScreen(target.screen); return; }
    const panel = target.kind === "panel" ? document.querySelector<HTMLDetailsElement>(`details[data-preview-section="${section.key}"]`) : null;
    const node = panel ?? (target.kind === "field" ? document.querySelector<HTMLElement>(`[aria-label="${target.label}"]`) : null);
    if (!node) return;
    if (panel) panel.open = true;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    node.scrollIntoView?.({ behavior: reduce ? "auto" : "smooth", block: "start" });
    (panel?.querySelector<HTMLElement>("summary") ?? node).focus({ preventScroll: true });
  }
  function add(key: HomeSectionKey) {
    const rest = sections.filter((section) => section.key !== key);
    const after = rest.findIndex((section) => section.key === selected);
    const at = after < 0 ? rest.length : after + 1;
    setSections([...rest.slice(0, at), { key, enabled: true }, ...rest.slice(at)]);
    setPicking(false);
    onSelect(key);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-section-card="${key}"] [data-section-select]`)?.focus());
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground tabular-nums">{sections.length - hidden.length} of {sections.length} visible</span>
        <Button type="button" variant="outline" size="sm" disabled={hidden.length === 0} onClick={() => setPicking(true)}>
          <Plus aria-hidden="true" strokeWidth={1.5} />Add section
        </Button>
      </div>
      <SortableList
        items={sections}
        getId={(section) => section.key}
        getLabel={(section) => sectionName(section.key)}
        // Beside the live preview the list is narrow: cards drop their subtitle and Move buttons
        // there (the drag handle still moves a card by keyboard) so the name stays readable.
        className="@container"
        rowClassName={cn(rowCard, "gap-2.5 py-2 aria-[current=true]:border-primary aria-[current=true]:shadow-[0_0_0_1px_var(--primary)]")}
        onReorder={setSections}
        rowProps={(section) => ({
          "data-section-card": section.key,
          "data-preview-section": section.key,
          "data-hidden": section.enabled ? undefined : "true",
          "aria-current": selected === section.key ? "true" : undefined,
          className: cn(!section.enabled && "bg-surface"),
        })}
        renderItem={(section, index, handle) => {
          const name = sectionName(section.key);
          const target = editTargets[section.key];
          const elsewhere = target.kind === "screen" ? target.screen : null;
          return (
            <>
              {handle}
              <button type="button" data-section-select aria-label={`Select ${name}`} onClick={() => onSelect(section.key)}
                className={cn("shrink-0 rounded-md transition-opacity duration-200 ease-admin", focusRing, !section.enabled && "opacity-45 grayscale")}>
                <SectionThumbnail section={section.key} content={content} source={source} width={128} />
              </button>
              <div className="grid min-w-0 flex-1 gap-0.5">
                <label className="flex min-w-0 cursor-pointer items-center gap-2">
                  <NativeCheckbox aria-label={`Show ${name}`} checked={section.enabled}
                    onChange={(event) => setSections(sections.map((item) => item.key === section.key ? { ...item, enabled: event.target.checked } : item))} />
                  <span className={cn("truncate text-sm font-medium", !section.enabled && "text-muted-foreground line-through decoration-faint/60")}>{name}</span>
                </label>
                <span className="truncate pl-6 text-xs text-muted-foreground @max-md:hidden">{section.enabled ? elsewhere ? `Content in ${elsewhere}` : "Content on this screen" : "Hidden from visitors"}</span>
              </div>
              <Button type="button" variant="ghost" size="sm" className="shrink-0"
                aria-label={elsewhere ? (name === elsewhere ? `Edit ${name}` : `Edit ${name} in ${elsewhere}`) : `Edit ${name} content`}
                onClick={() => openContent(section)}>Edit</Button>
              <MoveButtons className="@max-md:hidden" name={name} index={index} length={sections.length} onMove={(direction) => {
                const next = [...sections];
                [next[index], next[index + direction]] = [next[index + direction]!, next[index]!];
                setSections(next);
              }} />
            </>
          );
        }}
      />
      <Dialog open={picking} onOpenChange={setPicking}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add a section</DialogTitle>
            <DialogDescription>Hidden sections, as they look in your draft. The one you choose is shown{selected ? ` after ${sectionName(selected)}` : " at the end of the page"}.</DialogDescription>
          </DialogHeader>
          <ul className="grid max-h-[60dvh] grid-cols-[repeat(auto-fill,minmax(256px,1fr))] gap-3 overflow-y-auto p-0.5">
            {hidden.map((section) => {
              const name = sectionName(section.key);
              return (
                <li key={section.key} data-section-choice={section.key} className="grid gap-2 rounded-lg border border-border bg-card p-2 shadow-xs">
                  <SectionThumbnail section={section.key} content={content} source={{ ...source, dirty: false }} width={256} />
                  <div className="flex items-center justify-between gap-2 px-1">
                    <span className="truncate text-sm font-medium">{name}</span>
                    <Button type="button" size="sm" aria-label={`Add ${name}`} onClick={() => add(section.key)}>Add</Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
