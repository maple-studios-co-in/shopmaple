"use client";
import { useEffect, useId, useRef, useState, type DragEvent } from "react";
import { ChevronDown, Clapperboard, Copy, ImageIcon, Images, LoaderCircle, RotateCcw, Upload, WandSparkles } from "lucide-react";
import {
  contentFilmSchema, contentImageSchema, contentLinkSchema, heroSlideLimit,
  type HeroCaption, type HeroCaptionPosition, type HeroSlide, type HomeDetails, type TemplateMedia,
} from "@shopmaple/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { heroHeadline, heroIntro } from "@/lib/hero-film";
import {
  heroCaptionOf, heroCollectionPage, heroDefaultStills, heroSlideIsOwn, heroSlideStill, resizeHeroSlides,
  type HeroDefaultWords, type HeroStillKey,
} from "@/lib/hero-slides";
import { siteWordDefaults } from "@/lib/site-word-defaults";
import { resolveTemplateMedia } from "@/lib/template-media-defaults";
import { cn } from "@/lib/utils";
import { Notice } from "./crm-primitives";
import type { StaffSession } from "./dashboard";
import { Field } from "./field";
import { filmPoster } from "./film-poster";
import { ActionButton, CheckField, ConfirmPanel, MoveButtons, RemoveButton, SelectField, Subsection, focusRing, swap } from "./kit";
import { MediaLibrary, MediaSessionExpired, uploadAccept, uploadProblem, uploadToLibrary, type MediaAsset, type MediaKind } from "./media-library";
import { MediaPicker, mediaPreviewUrl } from "./media-picker";
import { usePreviewSlide } from "./preview-slide";
import { phoneFilmHint } from "./template-film-fields";
import { useAdminRequest } from "./use-admin-request";

/*
 * The hero slider's editor (owner, 19 Nov 2026: "in the live preview there should be an option to select how many slides
 * there should be, and in each slide an option to upload an image or a video, as well as what and how to put the caption
 * text"). It sits first in the hero section's inspector beside the live preview:
 * - Number of slides: 1 to 8. The first choice starts from the slides already showing (Maple's default ones), so nothing
 *   on the page changes until a slide is changed; more slides are made the same way, with the look of the last one; fewer
 *   asks first when a slide that goes holds staff's own picture, film or words.
 * - Each slide: a picture or a video, uploaded right there (a video's cover picture is made from it) or chosen from the
 *   media library; Maple's own photo until then. Its words (a small label, the headline, a line, a button and its page) and
 *   how they look (where they sit, light or dark words, the shade behind them, the headline's size).
 * - The slide whose card is open shows in the live preview and stays there while it is edited.
 */

type Hero = HomeDetails["hero"];
type Row = { id: string; slide: HeroSlide };
type SlideUpdate = (change: (slide: HeroSlide) => HeroSlide) => void;

/** Rows keep a stable identity while they are edited, moved or uploaded to, so a card keeps its place, focus and upload. */
let nextRow = 0;
const rowId = () => `hero-slide-${++nextRow}`;

const isFilm = (src: string | undefined): src is string => Boolean(src) && contentFilmSchema.safeParse(src).success;
const isPicture = (src: string | undefined): src is string => Boolean(src) && contentImageSchema.safeParse(src).success;
/** A picture as the admin can show it: library uploads through the staff preview route, the store's own files as they are. */
const shown = (src: string | undefined) => (isPicture(src) ? mediaPreviewUrl(src) : null);

/** The slide without these keys. */
function without(slide: HeroSlide, keys: readonly (keyof HeroSlide)[]): HeroSlide {
  if (!keys.some(key => key in slide)) return slide;
  const next = { ...slide };
  for (const key of keys) delete next[key];
  return next;
}
/** Optional words: emptied words are no words (the key goes), as every saved word must have letters in it. */
function withText(slide: HeroSlide, key: "eyebrow" | "headline" | "intro" | "alt", value: string): HeroSlide {
  return value.trim() ? { ...slide, [key]: value } : without(slide, [key]);
}
/** What a slide's button is: its own, none (`null`), or for a slide from before buttons were its own, the hero's. */
const buttonOf = (slide: HeroSlide, cta: string) => (slide.button === undefined ? { label: cta, href: heroCollectionPage() } : slide.button);

const positions: readonly (readonly [HeroCaptionPosition, string])[] = [
  ["top-left", "Top left"], ["top", "Top centre"], ["top-right", "Top right"],
  ["left", "Middle left"], ["center", "Centre"], ["right", "Middle right"],
  ["bottom-left", "Bottom left"], ["bottom", "Bottom centre"], ["bottom-right", "Bottom right"],
];
/** Store pages offered for a button's link; any store address can be typed. */
const linkSuggestions: readonly (readonly [string, string])[] = [
  ["/nimbus-collection", "The Nimbus Collection"], ["/terra-collection", "The Terra Collection"], ["/sofas", "Sofas"], ["/chairs", "Chairs"],
  ["/tables", "Tables"], ["/collections/beds", "Beds"], ["/collections/all", "All furniture"], ["/our-story", "Our story"],
];

/** A row of choices, one pressed: for a slide's kind and the words' colour, shade and size. */
function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly (readonly [T, string])[]; onChange: (value: T) => void }) {
  const id = useId();
  return <div role="group" aria-labelledby={id} className="grid min-w-0 gap-1.5">
    <span id={id} className="text-xs font-medium text-foreground">{label}</span>
    <div className="inline-flex w-fit max-w-full flex-wrap gap-0.5 rounded-full bg-black/[0.06] p-[3px]">
      {options.map(([option, text]) => (
        <button key={option} type="button" aria-pressed={value === option} onClick={() => onChange(option)}
          className={cn("h-7 rounded-full px-3 text-xs font-semibold text-muted-foreground transition-colors duration-150 ease-admin hover:text-foreground",
            focusRing, "aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow-xs")}>{text}</button>
      ))}
    </div>
  </div>;
}

/** Nine places for the words, laid out as they sit on the slide; each shows two lines of words where they would go. */
function PositionGrid({ name, value, onChange }: { name: string; value: HeroCaptionPosition; onChange: (value: HeroCaptionPosition) => void }) {
  const id = useId();
  return <div role="group" aria-labelledby={id} className="grid min-w-0 gap-1.5">
    <span id={id} className="text-xs font-medium text-foreground">Where the words sit</span>
    <div className="grid w-fit grid-cols-3 gap-1 rounded-lg border border-line-soft bg-sunken p-1.5">
      {positions.map(([position, label]) => {
        const column = position.endsWith("left") ? "items-start" : position.endsWith("right") ? "items-end" : "items-center";
        const row = position.startsWith("top") ? "justify-start" : position.startsWith("bottom") ? "justify-end" : "justify-center";
        return <button key={position} type="button" aria-pressed={value === position} aria-label={`${name}: words ${label.toLowerCase()}`} title={label}
          data-caption-choice={position} onClick={() => onChange(position)}
          className={cn("flex h-9 w-14 flex-col gap-[3px] rounded-md border border-transparent p-1.5 text-faint transition-colors duration-150 ease-admin hover:bg-card hover:text-muted-foreground",
            focusRing, column, row, "aria-pressed:border-primary/30 aria-pressed:bg-card aria-pressed:text-primary aria-pressed:shadow-xs")}>
          <span aria-hidden="true" className="block h-[3px] w-6 rounded-full bg-current" />
          <span aria-hidden="true" className="block h-[3px] w-4 rounded-full bg-current opacity-70" />
        </button>;
      })}
    </div>
  </div>;
}

/** A button that opens the computer's file chooser for one kind of file. */
function UploadButton({ kind, label, disabled, onFile, primary = false }: { kind: MediaKind; label: string; disabled?: boolean; onFile: (file: File) => void; primary?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  return <>
    <ActionButton icon={Upload} variant={primary ? "default" : "outline"} disabled={disabled} onClick={() => input.current?.click()}>{label}</ActionButton>
    <input ref={input} type="file" hidden aria-label={label} accept={uploadAccept(kind)} disabled={disabled}
      onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) onFile(file); }} />
  </>;
}

/** A store address for a slide's button, with the store's main pages offered as it is typed. */
function LinkField({ label, value, list, name, onChange }: { label: string; value: string; list: string; name: string; onChange: (value: string) => void }) {
  const valid = contentLinkSchema.safeParse(value).success;
  return <div className="grid min-w-0 gap-2">
    <label className="grid min-w-0 gap-2">
      <span className="text-xs font-medium text-foreground">{label}</span>
      <Input type="text" aria-label={label} name={name} list={list} value={value} maxLength={500} aria-invalid={valid ? undefined : true}
        className="h-10 bg-card text-sm" onInput={event => onChange(event.currentTarget.value)} onChange={() => {}} />
    </label>
    <span className={cn("text-2xs", valid ? "text-muted-foreground" : "text-danger")}>
      {valid ? "A page of the store. Pick one, or type its address." : "Use a store address that starts with /, such as /collections/sofas."}
    </span>
  </div>;
}

type Busy = { text: string; progress: number | null; abort?: { abort?: () => void } };

/** One slide's card: its picture or video, its words and how they look. */
function SlideCard({ row, index, count, open, onOpen, update, onMove, onDuplicate, onRemove, onKind, cta, session, onExpired, templateMedia, links }: {
  row: Row; index: number; count: number; open: boolean; onOpen: (open: boolean) => void; update: SlideUpdate;
  onMove: (direction: -1 | 1) => void; onDuplicate: () => void; onRemove: () => void; onKind: (kind: HeroSlide["kind"]) => void;
  cta: string; session?: StaffSession; onExpired?: () => void; templateMedia?: TemplateMedia; links: string;
}) {
  const { slide } = row;
  const n = index + 1, name = `Slide ${n}`, target = `hero-slide:${index}`;
  const video = slide.kind === "video";
  const still = heroSlideStill(slide, index);
  const stillPicture = !video && !slide.src ? resolveTemplateMedia(still.key, templateMedia) : null;
  const picture = video ? shown(slide.poster) : slide.src ? shown(slide.src) : shown(stillPicture?.image || undefined);
  const caption = heroCaptionOf(slide);
  const button = buttonOf(slide, cta);
  const send = useAdminRequest();
  const [busy, setBusy] = useState<Busy | null>(null);
  const [error, setError] = useState(""), [note, setNote] = useState("");
  const [library, setLibrary] = useState<"image" | "video" | "cover" | null>(null);
  const [dropping, setDropping] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const alive = useRef(true);
  /** The film upload in flight, stopped if the slide is removed meanwhile. */
  const inFlight = useRef<{ abort?: () => void } | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; inFlight.current?.abort?.(); }; }, []);
  const latestSlide = useRef(slide);
  latestSlide.current = slide;

  const setCaption = <K extends keyof HeroCaption>(key: K, value: HeroCaption[K]) => update(current => ({ ...current, caption: { ...heroCaptionOf(current), [key]: value } }));
  const setButton = (next: { label: string; href: string } | null) => update(current => ({ ...current, button: next }));
  const failed = (err: unknown) => {
    if (!alive.current) return;
    if (err instanceof MediaSessionExpired) { onExpired?.(); return; }
    if (err instanceof Error && err.name === "AbortError") { setNote("Upload cancelled."); return; }
    setError(err instanceof Error ? err.message : "Upload failed. Please try again.");
  };
  /**
   * Makes the video's cover picture from the film (a library film's preview) and puts it on the slide, unless the slide has
   * another film by then.
   */
  async function makeCover(source: string, filmName: string, film: string) {
    if (!session) return;
    try {
      const cover = await filmPoster(source, filmName);
      const asset = await uploadToLibrary(cover, "image", { csrfToken: session.csrfToken, send });
      if (!alive.current) return;
      update(current => current.kind === "video" && current.src === film ? { ...current, poster: asset.url } : current);
    } catch (err) {
      if (err instanceof MediaSessionExpired) { failed(err); return; }
      if (alive.current) setNote(err instanceof Error ? err.message : "A cover picture could not be made from this film. Choose a picture for its cover below.");
    }
  }
  /** A file from the computer: the slide's picture, its video (with a cover made from it), or the video's cover. */
  async function upload(file: File, as: "image" | "video" | "cover") {
    if (!session) return;
    const kind: MediaKind = as === "video" ? "video" : "image";
    const problem = uploadProblem(file, kind);
    if (problem) { setError(problem); return; }
    setError(""); setNote(""); setLibrary(null);
    const abort: { abort?: () => void } = {};
    inFlight.current = abort;
    setBusy({ text: `Uploading ${file.name}`, progress: kind === "video" ? 0 : null, abort });
    // The cover is made from the file itself while the film uploads. A new film always gets a new cover: one from another
    // film would flash a different picture while this one loads.
    const cover = as === "video" ? filmPoster(file, file.name).catch((err: unknown) => err as Error) : null;
    try {
      const asset = await uploadToLibrary(file, kind, {
        csrfToken: session.csrfToken, send, abort, onProgress: fraction => { if (alive.current) setBusy(now => now && { ...now, progress: fraction }); },
      });
      if (!alive.current) return;
      if (as === "image") update(current => current.kind === "image" ? { ...current, src: asset.url } : current);
      else if (as === "cover") update(current => current.kind === "video" ? { ...current, poster: asset.url } : current);
      else {
        update(current => current.kind === "video" ? { ...current, src: asset.url } : current);
        if (cover) {
          setBusy({ text: "Making a cover picture from the video", progress: null });
          const made = await cover;
          if (made instanceof File) {
            const image = await uploadToLibrary(made, "image", { csrfToken: session.csrfToken, send });
            if (alive.current) update(current => current.kind === "video" && current.src === asset.url ? { ...current, poster: image.url } : current);
          } else if (alive.current) setNote(made?.message ?? "A cover picture could not be made from this film. Choose a picture for its cover below.");
        }
      }
    } catch (err) { failed(err); }
    finally { inFlight.current = null; if (alive.current) setBusy(null); }
  }
  /** A file dropped on the slide's picture: a picture makes it a picture slide, a video a video slide. */
  function drop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDropping(false);
    const file = event.dataTransfer.files?.[0];
    if (!file || busy || !session) return;
    const as = file.type.startsWith("video/") || /\.(mp4|m4v|webm)$/i.test(file.name) ? "video" : "image";
    if ((as === "video") !== video) onKind(as);
    void upload(file, as);
  }
  /** A file chosen from the library. A film gets a cover made from it, as an uploaded one does. */
  function choose(asset: MediaAsset) {
    const as = library;
    setLibrary(null); setError(""); setNote("");
    if (as === "image") update(current => current.kind === "image" ? { ...current, src: asset.url } : current);
    else if (as === "cover") update(current => current.kind === "video" ? { ...current, poster: asset.url } : current);
    else if (as === "video") {
      update(current => current.kind === "video" ? { ...current, src: asset.url } : current);
      setBusy({ text: "Making a cover picture from the video", progress: null });
      void makeCover(asset.previewUrl, asset.label, asset.url).finally(() => { if (alive.current) setBusy(null); });
    }
  }
  const remakeCover = () => {
    if (!isFilm(slide.src)) return;
    setError(""); setNote("");
    setBusy({ text: "Making a cover picture from the video", progress: null });
    void makeCover(mediaPreviewUrl(slide.src), `${name} video`, slide.src).finally(() => { if (alive.current) setBusy(null); });
  };

  const summary = [video ? (isFilm(slide.src) ? "Video" : "Video, not chosen yet") : slide.src ? "Your picture" : `Maple's photo: ${still.name}`,
    slide.headline ?? (slide.eyebrow || slide.intro ? "" : "No words")].filter(Boolean).join(" · ");
  const working = busy !== null;
  return (
    <details open={open} onToggle={event => onOpen(event.currentTarget.open)} data-hero-slide-card={index}
      className="group rounded-xl border border-border bg-card shadow-xs transition-shadow duration-200 ease-admin open:shadow-sm">
      <summary className={cn("flex cursor-pointer list-none items-center gap-3 rounded-xl px-3 py-2.5 [&::-webkit-details-marker]:hidden", focusRing)}>
        <span aria-hidden="true" className="grid h-10 w-16 shrink-0 place-items-center overflow-hidden rounded-md border border-line-soft bg-sunken">
          {picture ? <img src={picture} alt="" width={64} height={40} className="size-full object-cover" />
            : video ? <Clapperboard strokeWidth={1.5} className="size-4 text-muted-foreground" /> : <ImageIcon strokeWidth={1.5} className="size-4 text-muted-foreground" />}
        </span>
        <span className="grid min-w-0 flex-1">
          <span className="text-sm font-semibold text-foreground">{name}</span>
          <span className="truncate text-xs text-muted-foreground">{summary}</span>
        </span>
        <ChevronDown aria-hidden="true" strokeWidth={1.5} className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-admin group-open:rotate-180" />
      </summary>
      <div className="grid gap-6 border-t border-line-soft px-3 pt-4 pb-5 sm:px-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Choice label={`${name}: show`} value={slide.kind} options={[["image", "A picture"], ["video", "A video"]] as const} onChange={onKind} />
          <div className="flex items-center gap-0.5 self-end">
            <MoveButtons name={name.toLowerCase()} index={index} length={count} onMove={onMove} />
            <Button type="button" variant="ghost" size="icon-sm" aria-label={`Duplicate ${name.toLowerCase()}`} title="Duplicate" disabled={count >= heroSlideLimit} onClick={onDuplicate}>
              <Copy aria-hidden="true" strokeWidth={1.5} />
            </Button>
            <RemoveButton label={`Remove ${name.toLowerCase()}`} disabled={count <= 1}
              onClick={() => (row.slide.src || row.slide.poster ? setConfirmRemove(true) : onRemove())} />
          </div>
        </div>
        {confirmRemove && <ConfirmPanel confirm="Remove the slide" cancel="Keep it" onConfirm={() => { setConfirmRemove(false); onRemove(); }} onCancel={() => setConfirmRemove(false)}>
          {name} and its words come off the slider. Its {video ? "video" : "picture"} stays in the media library.
        </ConfirmPanel>}

        {/* Picture or video. The live preview names this block (hero-slide:<n>), so a click on the slide there opens it. */}
        <section aria-label={`${name} ${video ? "video" : "picture"}`} data-picture-target={target} data-hero-slide-media={slide.kind} className="grid min-w-0 gap-3">
          <div onDragOver={event => { if (session && !working) { event.preventDefault(); setDropping(true); } }} onDragLeave={() => setDropping(false)} onDrop={drop}
            className={cn("relative grid aspect-[16/10] w-full max-w-[420px] place-items-center overflow-hidden rounded-lg border border-line-soft bg-sunken",
              dropping && "border-primary ring-[3px] ring-primary/25")}>
            {video && isFilm(slide.src)
              ? <video key={slide.src} src={mediaPreviewUrl(slide.src)} poster={shown(slide.poster) ?? undefined} aria-label={`${name} video preview`} controls muted playsInline preload="metadata" className="size-full object-cover" />
              : picture
                ? <img src={picture} alt={`${name} picture preview`} className="size-full object-cover" />
                : <span className="grid justify-items-center gap-1.5 px-6 text-center text-xs text-muted-foreground">
                  {video ? <Clapperboard aria-hidden="true" strokeWidth={1.5} className="size-6" /> : <ImageIcon aria-hidden="true" strokeWidth={1.5} className="size-6" />}
                  {video ? "No video yet. Upload one or choose it from the library." : `Maple's photo of the ${still.name.toLowerCase()} comes from a Keeri product; it shows on the page.`}
                </span>}
            {session && <span aria-hidden="true" className="pointer-events-none absolute right-2 bottom-2 rounded-full bg-black/55 px-2 py-0.5 text-2xs font-medium text-white">
              {dropping ? "Drop to upload" : "Drop a file here"}</span>}
          </div>
          <p className="text-xs text-muted-foreground">
            {video
              ? isFilm(slide.src) ? "The video plays on its own, muted and looping, while this slide shows." : "Upload a video (MP4 or WebM, up to 80 MB, exported for the web) or choose one from the library."
              : slide.src ? "Your picture." : `Maple's own photo for now (${still.name}). Upload a picture to use your own.`}
          </p>
          {session && onExpired ? <>
            <div className="flex flex-wrap gap-2">
              <UploadButton kind={video ? "video" : "image"} label={video ? "Upload video" : "Upload image"} primary disabled={working} onFile={file => void upload(file, video ? "video" : "image")} />
              <ActionButton icon={Images} aria-expanded={library === (video ? "video" : "image")} disabled={working}
                onClick={() => setLibrary(now => (now === (video ? "video" : "image") ? null : video ? "video" : "image"))}>{video ? "Choose film" : "Choose image"}</ActionButton>
              {!video && slide.src && <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" disabled={working}
                onClick={() => update(current => without(current, ["src", "mobileImage", "alt"]))}>Use Maple&apos;s photo</Button>}
            </div>
            {!video && !slide.src && <SelectField label={`${name}: which of Maple's photos`} value={still.key} className="max-w-[320px]"
              onChange={event => { const key = event.currentTarget.value as HeroStillKey; update(current => ({ ...current, still: key })); }}>
              {heroDefaultStills.map(item => <option key={item.key} value={item.key}>{item.name}</option>)}
            </SelectField>}
          </> : <p className="text-xs text-muted-foreground">Sign in again to upload or choose pictures and videos.</p>}
          {busy && <div role="status" className="grid gap-2">
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <LoaderCircle aria-hidden="true" strokeWidth={1.5} className="size-4 motion-safe:animate-spin" /><span className="truncate">{busy.text}</span>
              {busy.progress !== null && <span className="ml-auto tabular-nums">{Math.floor(busy.progress * 100)}%</span>}
              {busy.abort?.abort && busy.progress !== null && <Button type="button" variant="ghost" size="xs" onClick={() => busy.abort?.abort?.()}>Cancel</Button>}
            </p>
            {busy.progress !== null && <div role="progressbar" aria-label={busy.text} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(busy.progress * 100)}
              className="h-1.5 overflow-hidden rounded-full bg-sunken"><div className="h-full bg-primary transition-[width] duration-150 ease-admin" style={{ width: `${busy.progress * 100}%` }} /></div>}
          </div>}
          {error && <Notice tone="error">{error}</Notice>}
          {note && <Notice tone="info">{note}</Notice>}
          {library && session && onExpired && <div className="grid gap-3 border-t border-line-soft pt-3">
            <Button type="button" variant="ghost" size="sm" className="justify-self-end text-muted-foreground" onClick={() => setLibrary(null)}>Close library</Button>
            <MediaLibrary session={session} onExpired={onExpired} accept={library === "video" ? "video" : "image"} onSelect={choose} />
          </div>}
          {video && session && onExpired && <div data-hero-slide-cover="" className="grid gap-3 rounded-lg border border-line-soft bg-surface p-3">
            <div className="flex items-center gap-3">
              <span className="grid h-[54px] w-[86px] shrink-0 place-items-center overflow-hidden rounded-md border border-line-soft bg-sunken">
                {shown(slide.poster) ? <img src={shown(slide.poster)!} alt={`${name} cover preview`} className="size-full object-cover" />
                  : <ImageIcon aria-hidden="true" strokeWidth={1.5} className="size-4 text-muted-foreground" />}
              </span>
              <div className="grid min-w-0 gap-0.5 text-xs">
                <span className="font-medium text-foreground">Cover picture</span>
                <span className="text-muted-foreground">{slide.poster ? "Shows while the video loads, and to visitors who turn motion off." : "Made from the video when you add one, or choose your own."}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {isFilm(slide.src) && <ActionButton icon={WandSparkles} disabled={working} onClick={remakeCover}>Make from the video</ActionButton>}
              <UploadButton kind="image" label="Upload cover" disabled={working} onFile={file => void upload(file, "cover")} />
              <ActionButton icon={Images} aria-expanded={library === "cover"} disabled={working} onClick={() => setLibrary(now => (now === "cover" ? null : "cover"))}>Choose cover</ActionButton>
            </div>
          </div>}
          {session && onExpired && (video || slide.src) && <details className="group/phone rounded-lg border border-line-soft">
            <summary className={cn("flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs font-medium text-foreground [&::-webkit-details-marker]:hidden", focusRing)}>
              {video ? "Phone video (optional)" : "Phone picture (optional)"}
              <ChevronDown aria-hidden="true" strokeWidth={1.5} className="size-3.5 text-muted-foreground transition-transform group-open/phone:rotate-180" />
            </summary>
            <div className="grid gap-2 px-3 pb-3">
              {video
                ? <><MediaPicker label={`${name} phone video`} accept="video" value={slide.mobileSrc ?? ""} session={session} onExpired={onExpired}
                  onChange={url => update(current => url ? { ...current, mobileSrc: url } : without(current, ["mobileSrc"]))} />
                  <p className="text-xs text-muted-foreground">{phoneFilmHint}</p></>
                : <><MediaPicker label={`${name} phone picture`} value={slide.mobileImage ?? ""} session={session} onExpired={onExpired}
                  onChange={url => update(current => url ? { ...current, mobileImage: url } : without(current, ["mobileImage"]))} />
                  <p className="text-xs text-muted-foreground">Optional. Phones (screens up to 749px wide) show this one instead, for example a tall crop of the same photo.</p></>}
            </div>
          </details>}
        </section>

        <fieldset className="m-0 grid min-w-0 gap-4 border-0 p-0">
          <legend className="mb-3 text-sm font-semibold text-foreground">Words on the slide</legend>
          <Field label={`${name} small label`} name={`${target}:eyebrow`} value={slide.eyebrow ?? ""} maxLength={60}
            hint="Optional. A few words over the headline, such as a collection's name." onChange={value => update(current => withText(current, "eyebrow", value))} />
          <Field label={`${name} headline`} name={`${target}:headline`} value={slide.headline ?? ""} maxLength={120}
            onChange={value => update(current => withText(current, "headline", value))} />
          <Field label={`${name} line under the headline`} name={`${target}:intro`} value={slide.intro ?? ""} maxLength={300} multiline
            onChange={value => update(current => withText(current, "intro", value))} />
          <CheckField label="Show a button" checked={button !== null}
            onChange={event => setButton(event.currentTarget.checked ? { label: cta, href: heroCollectionPage() } : null)} />
          {button && <div className="grid gap-4 @md:grid-cols-2">
            <Field label={`${name} button words`} name={`${target}:button`} value={button.label} maxLength={80} onChange={label => setButton({ ...button, label })} />
            <LinkField label={`${name} button link`} name={`${target}:link`} list={links} value={button.href} onChange={href => setButton({ ...button, href })} />
          </div>}
          {(video || slide.src) && <Field label={`${name} picture description`} value={slide.alt ?? ""} maxLength={200}
            hint="Optional. Describes the picture for people who can't see it; worth writing when the slide has few words."
            onChange={value => update(current => withText(current, "alt", value))} />}
        </fieldset>

        <fieldset className="m-0 grid min-w-0 gap-4 border-0 p-0">
          <legend className="mb-3 text-sm font-semibold text-foreground">How the words look</legend>
          <PositionGrid name={name} value={caption.position} onChange={value => setCaption("position", value)} />
          <div className="flex flex-wrap gap-x-6 gap-y-4">
            <Choice label="Words" value={caption.tone} options={[["light", "Light"], ["dark", "Dark"]] as const} onChange={value => setCaption("tone", value)} />
            <Choice label="Shade behind them" value={caption.shade} options={[["none", "None"], ["soft", "Soft"], ["strong", "Strong"]] as const} onChange={value => setCaption("shade", value)} />
            <Choice label="Headline size" value={caption.size} options={[["small", "Small"], ["medium", "Medium"], ["large", "Large"]] as const} onChange={value => setCaption("size", value)} />
          </div>
          <p className="text-xs text-muted-foreground">Light words read best on a darker picture, dark words on a lighter one. The live preview shows this slide as you change it.</p>
        </fieldset>
      </div>
    </details>
  );
}

/**
 * The hero slider: how many slides, and each slide's picture or video, words and look. With no slides of its own the hero
 * shows Maple's default slides; the first choice of a number starts from those.
 */
export function HeroSliderFields({ hero, onChange, session, onExpired, templateMedia, siteWords }: {
  hero: Hero; onChange: (hero: Hero) => void; session?: StaffSession; onExpired?: () => void;
  /** The Artwork placements, so Maple's photos show here as the page shows them. */
  templateMedia?: TemplateMedia;
  /** Site words staff changed (the collections' small headings), so slides start with the words the page shows. */
  siteWords?: Readonly<Record<string, string | undefined>>;
}) {
  // The latest hero, including a change made a moment ago that has not drawn yet: an upload finishing right after another
  // edit must not undo it.
  const current = useRef(hero);
  current.current = hero;
  const known = useRef<string[]>([]).current;
  const kinds = useRef(new Map<string, HeroSlide>()).current;
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "count"; count: number } | { kind: "reset" } | null>(null);
  const showSlide = usePreviewSlide();
  const countLabel = useId(), links = useId();
  const slides = hero.slides;
  const rows: Row[] = (slides ?? []).map((slide, index) => ({ id: (known[index] ??= rowId()), slide }));
  const words: HeroDefaultWords = {
    headline: hero.headline ?? heroHeadline, intro: hero.intro ?? heroIntro, cta: hero.cta,
    labels: {
      nimbus: siteWords?.["home.hero.nimbusLabel"] ?? siteWordDefaults["home.hero.nimbusLabel"],
      terra: siteWords?.["home.hero.terraLabel"] ?? siteWordDefaults["home.hero.terraLabel"],
    },
  };
  const commit = (next: HeroSlide[]) => {
    const { slides: _removed, ...rest } = current.current;
    const value: Hero = next.length ? { ...rest, slides: next } : rest;
    current.current = value;
    onChange(value);
  };
  /** Changes one slide, found by its row (it may have moved since an upload began); gone, nothing happens. */
  const updateRow = (id: string, change: (slide: HeroSlide) => HeroSlide) => {
    const list = current.current.slides ?? [];
    const index = known.indexOf(id);
    const before = list[index];
    if (index < 0 || !before) return;
    const after = change(before);
    if (after !== before) commit(list.map((slide, i) => (i === index ? after : slide)));
  };
  const openIndex = openId === null ? -1 : rows.findIndex(row => row.id === openId);
  // The open slide shows in the live preview and stays there; closing it (or leaving the hero) lets the slider run.
  useEffect(() => { showSlide("hero", openIndex >= 0 ? openIndex : null); }, [openIndex]);
  useEffect(() => () => showSlide("hero", null), []);

  function applyCount(count: number) {
    const list = current.current.slides ?? [];
    const next = resizeHeroSlides(list, count, words);
    known.length = Math.min(known.length, next.length);
    commit(next);
    setConfirm(null);
    // A first or an added slide opens, to be given its picture and words; one that went closes.
    if (next.length > list.length) setOpenId((known[list.length] ??= rowId()));
    else if (openIndex >= next.length) setOpenId(null);
  }
  function chooseCount(count: number) {
    const list = current.current.slides ?? [];
    if (list.length === count) return;
    const going = list.slice(count);
    if (going.some((slide, k) => heroSlideIsOwn(slide, count + k, words))) { setConfirm({ kind: "count", count }); return; }
    applyCount(count);
  }
  function reset() {
    known.length = 0;
    kinds.clear();
    setOpenId(null);
    setConfirm(null);
    commit([]);
  }
  function move(index: number, direction: -1 | 1) {
    const list = current.current.slides ?? [];
    const ids = swap(known.slice(0, list.length), index, direction);
    known.splice(0, ids.length, ...ids);
    commit(swap(list, index, direction));
  }
  function duplicate(index: number) {
    const list = current.current.slides ?? [];
    if (list.length >= heroSlideLimit) return;
    const id = rowId();
    known.splice(index + 1, 0, id);
    commit([...list.slice(0, index + 1), structuredClone(list[index]!), ...list.slice(index + 1)]);
    setOpenId(id);
  }
  function remove(index: number) {
    const list = current.current.slides ?? [];
    if (list.length <= 1) return;
    const [id] = known.splice(index, 1);
    if (id === openId) setOpenId(null);
    commit(list.filter((_, i) => i !== index));
  }
  /**
   * A slide becomes a picture or a video. Its words and look stay; what it showed is kept aside while this editor is open,
   * so switching back brings back its picture, or its film and cover.
   */
  function switchKind(id: string, index: number, kind: HeroSlide["kind"]) {
    updateRow(id, slide => {
      if (slide.kind === kind) return slide;
      kinds.set(`${id}:${slide.kind}`, slide);
      const kept = kinds.get(`${id}:${kind}`);
      const { eyebrow, headline, intro, button, caption } = slide;
      const text = { ...(eyebrow ? { eyebrow } : {}), ...(headline ? { headline } : {}), ...(intro ? { intro } : {}), ...(button !== undefined ? { button } : {}), ...(caption ? { caption } : {}) };
      if (kind === "video") {
        const media = kept?.kind === "video" ? { ...(kept.src ? { src: kept.src } : {}), ...(kept.poster ? { poster: kept.poster } : {}), ...(kept.mobileSrc ? { mobileSrc: kept.mobileSrc } : {}), ...(kept.alt ? { alt: kept.alt } : {}) } : {};
        return { kind: "video", ...media, ...text };
      }
      const media = kept?.kind === "image"
        ? { ...(kept.src ? { src: kept.src } : {}), ...(kept.mobileImage ? { mobileImage: kept.mobileImage } : {}), ...(kept.alt ? { alt: kept.alt } : {}), still: kept.still ?? heroSlideStill(kept, index).key }
        : { still: heroSlideStill(slide, index).key };
      return { kind: "image", ...media, ...text };
    });
  }

  const count = slides?.length ?? 0;
  const going = confirm?.kind === "count" ? count - confirm.count : 0;
  return (
    <Subsection title="Hero slider" data-hero-slider-editor=""
      description="The big tile on the left of the hero. Choose how many slides it has, then give each slide a picture or a video, its words, and how they look. The slide you open shows in the live preview.">
      <div role="group" aria-labelledby={countLabel} className="grid gap-2">
        <span id={countLabel} className="text-xs font-medium text-foreground">Number of slides</span>
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: heroSlideLimit }, (_, i) => i + 1).map(n => (
            <button key={n} type="button" aria-pressed={count === n} aria-label={`${n} ${n === 1 ? "slide" : "slides"}`} data-slide-count={n} onClick={() => chooseCount(n)}
              className={cn("grid size-9 place-items-center rounded-lg border border-border bg-card text-sm font-semibold text-foreground tabular-nums shadow-xs",
                "transition-colors duration-150 ease-admin hover:border-primary/40 hover:bg-accent", focusRing,
                "aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground")}>{n}</button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground" data-hero-slider-state="">
          {count ? `${count} ${count === 1 ? "slide" : "slides"}, each with its own picture or video and words.`
            : `Now showing Maple's ${heroDefaultStills.length} default slides. Choose a number to make them yours: they start as they are, so nothing on the page changes until you change a slide.`}
        </p>
      </div>
      {confirm?.kind === "count" && <ConfirmPanel confirm={`Keep ${confirm.count} ${confirm.count === 1 ? "slide" : "slides"}`} cancel="Cancel"
        onConfirm={() => applyCount(confirm.count)} onCancel={() => setConfirm(null)}>
        {going === 1 ? `Slide ${count} comes off the slider` : `Slides ${confirm.count + 1} to ${count} come off the slider`}, with {going === 1 ? "its" : "their"} words. Pictures and videos stay in the media library.
      </ConfirmPanel>}
      {rows.length > 0 && <ol className="m-0 grid list-none gap-2 p-0" aria-label="Slides">
        {rows.map((row, index) => (
          <li key={row.id}>
            <SlideCard row={row} index={index} count={rows.length} open={row.id === openId} cta={hero.cta} links={links}
              session={session} onExpired={onExpired} templateMedia={templateMedia}
              onOpen={open => setOpenId(now => (open ? row.id : now === row.id ? null : now))}
              update={change => updateRow(row.id, change)}
              onMove={direction => move(index, direction)} onDuplicate={() => duplicate(index)} onRemove={() => remove(index)}
              onKind={kind => switchKind(row.id, index, kind)} />
          </li>
        ))}
      </ol>}
      <datalist id={links}>{linkSuggestions.map(([href, label]) => <option key={href} value={href}>{label}</option>)}</datalist>
      {rows.length > 0 && (confirm?.kind === "reset"
        ? <ConfirmPanel confirm="Use Maple's default slides" cancel="Keep my slides" onConfirm={reset} onCancel={() => setConfirm(null)}>
          The slider goes back to Maple&apos;s {heroDefaultStills.length} default slides and your slides come off it. Pictures and videos stay in the media library.
        </ConfirmPanel>
        : <div><ActionButton icon={RotateCcw} variant="ghost" className="text-muted-foreground"
          onClick={() => (rows.some((row, index) => heroSlideIsOwn(row.slide, index, words)) ? setConfirm({ kind: "reset" }) : reset())}>Go back to Maple&apos;s default slides</ActionButton></div>)}
    </Subsection>
  );
}
