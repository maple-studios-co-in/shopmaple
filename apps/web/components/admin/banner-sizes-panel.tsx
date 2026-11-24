"use client";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import {
  allowedImageSizeSchema, defaultMaxImageBytes, describeFileSize, describeImageSize, imageFileSizeChoices, mediaUploadRulesSchema, suggestedBannerSizes,
  type AllowedImageSize, type MediaUploadRules,
} from "@shopmaple/contracts/media-upload-rules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { StaffSession } from "./dashboard";
import { Notice } from "./crm-primitives";
import { ActionButton, PanelHeader, SectionHeading } from "./kit";
import { mediaUploadRulesPath, parseMediaUploadRulesState, publishMediaUploadRules, type MediaUploadRulesState } from "./media-upload-rules";
import { useAdminRequest } from "./use-admin-request";

const sameSize = (a: { width: number; height: number }, b: { width: number; height: number }) => a.width === b.width && a.height === b.height;
const whenSaved = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

/**
 * Settings, Banner sizes (owner, 23 Nov 2026): the only picture sizes the media library takes. While the rule is on, a
 * picture of any other size is refused with an alert, in the admin before it is sent and by the API. Everybody with the
 * website's content sees the rules; a publisher changes them, and the change applies at once (no publishing).
 */
export function BannerSizesPanel({ session, onExpired }: { session: StaffSession; onExpired: () => void }) {
  const send = useAdminRequest();
  const publisher = session.user.role === "publisher";
  const [saved, setSaved] = useState<MediaUploadRulesState | null>(null);
  const [draft, setDraft] = useState<MediaUploadRules | null>(null);
  const [loading, setLoading] = useState(true), [loadError, setLoadError] = useState(""), [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "status" | "error"; text: string } | null>(null);
  const [width, setWidth] = useState(""), [height, setHeight] = useState(""), [label, setLabel] = useState(""), [addError, setAddError] = useState("");
  const active = useRef(true), widthBox = useRef<HTMLInputElement>(null);
  const ids = { rule: useId(), ruleHint: useId(), width: useId(), height: useId(), label: useId(), addError: useId() };

  async function load() {
    setLoading(true); setLoadError("");
    try {
      const response = await send(mediaUploadRulesPath, { cache: "no-store", credentials: "same-origin" });
      if (!active.current) return;
      if (response.status === 401) { onExpired(); return; }
      if (!response.ok) throw Error("load");
      const state = parseMediaUploadRulesState(await response.json());
      publishMediaUploadRules(state); setSaved(state); setDraft(state.rules);
    } catch (error) {
      if (active.current && !(error instanceof Error && error.name === "AbortError")) setLoadError("We couldn't load the banner sizes. Please try again.");
    } finally { if (active.current) setLoading(false); }
  }
  useEffect(() => { active.current = true; void load(); return () => { active.current = false; }; }, [send]);

  const dirty = Boolean(saved && draft && JSON.stringify(draft) !== JSON.stringify(saved.rules));
  const editable = publisher && !saving && !loading && draft !== null;
  function change(next: MediaUploadRules) { setDraft(next); setMessage(null); }

  function addSize(size: AllowedImageSize) {
    if (!draft) return false;
    if (draft.sizes.some((item) => sameSize(item, size))) { setAddError(`${describeImageSize(size)} px is already on the list.`); return false; }
    if (draft.sizes.length >= 40) { setAddError("The list holds up to 40 sizes. Remove one first."); return false; }
    change({ ...draft, sizes: [...draft.sizes, size] }); setAddError("");
    return true;
  }
  function submitAdd(event: FormEvent) {
    event.preventDefault();
    const parsed = allowedImageSizeSchema.safeParse({ width: Number(width), height: Number(height), label });
    if (!/^\d+$/.test(width.trim()) || !/^\d+$/.test(height.trim()) || !parsed.success) {
      setAddError(parsed.success ? "Enter the width and height in whole pixels, for example 2784 and 400." : parsed.error.issues[0]?.message === "Choose a size of up to 24 million pixels"
        ? "Choose a size of up to 24 million pixels: the library cannot take a larger picture." : "Enter the width and height in whole pixels, from 1 to 20000, for example 2784 and 400.");
      return;
    }
    if (addSize(parsed.data)) { setWidth(""); setHeight(""); setLabel(""); widthBox.current?.focus(); }
  }
  async function save() {
    if (!draft) return;
    const checked = mediaUploadRulesSchema.safeParse(draft);
    if (!checked.success) { setMessage({ tone: "error", text: checked.error.issues[0]?.message ?? "Check the sizes and try again." }); return; }
    setSaving(true); setMessage(null);
    try {
      const response = await send(mediaUploadRulesPath, {
        method: "PUT", credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": session.csrfToken },
        body: JSON.stringify({ rules: checked.data }),
      });
      if (!active.current) return;
      if (response.status === 401) { onExpired(); return; }
      const body = await response.json().catch(() => null) as { message?: unknown } | null;
      if (!response.ok) { setMessage({ tone: "error", text: typeof body?.message === "string" ? body.message : "We couldn't save the banner sizes. Please try again." }); return; }
      const state = parseMediaUploadRulesState(body);
      publishMediaUploadRules(state); setSaved(state); setDraft(state.rules);
      setMessage({ tone: "status", text: `${state.rules.restrictSizes
        ? `Saved. From now on only ${state.rules.sizes.length === 1 ? "this size" : `these ${state.rules.sizes.length} sizes`} can be uploaded`
        : "Saved. Pictures of any size can be uploaded"}, in files up to ${describeFileSize(state.rules.maxImageBytes)}.` });
    } catch (error) {
      if (active.current && !(error instanceof Error && error.name === "AbortError")) setMessage({ tone: "error", text: "We couldn't save the banner sizes. Check your connection and try again." });
    } finally { if (active.current) setSaving(false); }
  }

  const header = <PanelHeader title="Banner sizes" description="Choose the only picture sizes that can be uploaded to the media library, and the largest file a picture may be. A picture of another size, or a larger file, is refused with an alert, and nothing of it is kept." />;
  if (loading && !draft) return <div aria-busy="true">{header}<p role="status" className="sr-only">Loading the banner sizes</p><Skeleton className="h-40 w-full motion-reduce:animate-none" /></div>;
  if (!draft) return <div>{header}<Notice tone="error" className="items-center justify-between">{loadError || "We couldn't load the banner sizes."} <Button type="button" size="xs" variant="outline" onClick={() => void load()}>Retry</Button></Notice></div>;

  return <div data-banner-sizes>
    {header}
    {!publisher && <p role="note" className="mb-4 rounded-md bg-neutral-bg px-3 py-2 text-xs text-muted-foreground">Only a publisher can change these rules. You can see them here, and the media library follows them when you upload.</p>}
    <div className="grid gap-6">
      <section aria-labelledby={ids.rule} className="rounded-xl border border-border bg-surface p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="grid gap-1">
            <label id={ids.rule} htmlFor={`${ids.rule}-switch`} className="text-sm font-semibold text-foreground">Only allow the sizes below</label>
            <p id={ids.ruleHint} className="text-xs leading-relaxed text-muted-foreground">
              {draft.restrictSizes
                ? "On: every image upload must be exactly one of these sizes, in pixels as the file is made. This covers the media library and pictures uploaded on the Homepage hero, including the cover pictures made from films. Films themselves are not checked."
                : "Off: pictures of any size can be uploaded, as before. Turn it on once the list holds every size you use."}
            </p>
          </div>
          <Switch id={`${ids.rule}-switch`} aria-describedby={ids.ruleHint} checked={draft.restrictSizes} disabled={!editable}
            onCheckedChange={(on) => change({ ...draft, restrictSizes: on })} />
        </div>
      </section>

      <section aria-labelledby={`${ids.rule}-list`}>
        <SectionHeading className="mt-0">{<span id={`${ids.rule}-list`}>Allowed sizes</span>}</SectionHeading>
        {draft.sizes.length === 0
          ? <p data-empty-sizes className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">No sizes yet. Add the sizes your banners are made at, or pick from this website&apos;s own below.</p>
          : <ul aria-label="Allowed sizes" className="grid gap-2">
            {draft.sizes.map((size) => <li key={`${size.width}x${size.height}`} data-allowed-size={`${size.width}x${size.height}`} className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
              <span className="min-w-[7.5rem] text-sm font-semibold tabular-nums text-foreground">{describeImageSize(size)} px</span>
              <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{size.label || "No description"}</span>
              {publisher && <Button type="button" size="sm" variant="ghost" className="text-danger hover:bg-danger-bg hover:text-danger" disabled={!editable}
                onClick={() => change({ ...draft, sizes: draft.sizes.filter((item) => !sameSize(item, size)), restrictSizes: draft.sizes.length > 1 && draft.restrictSizes })}>
                <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.75} />Remove<span className="sr-only"> {describeImageSize(size)} px</span></Button>}
            </li>)}
          </ul>}
        {draft.restrictSizes && draft.sizes.length === 0 && <Notice tone="error" className="mt-3">Add at least one size, or turn the rule off.</Notice>}
      </section>

      {publisher && <section aria-labelledby={`${ids.rule}-add`} className="grid gap-4">
        <SectionHeading className="mt-0">{<span id={`${ids.rule}-add`}>Add a size</span>}</SectionHeading>
        <form noValidate onSubmit={submitAdd} className="grid gap-3 sm:grid-cols-[7rem_auto_7rem_minmax(0,1fr)_auto] sm:items-end">
          <div className="grid gap-1.5"><label htmlFor={ids.width} className="text-xs font-medium text-foreground">Width (px)</label>
            <Input ref={widthBox} id={ids.width} inputMode="numeric" autoComplete="off" value={width} disabled={!editable} aria-invalid={addError ? true : undefined} aria-describedby={addError ? ids.addError : undefined} onChange={(event) => { setWidth(event.currentTarget.value); setAddError(""); }} /></div>
          <span aria-hidden="true" className="hidden pb-2 text-muted-foreground sm:block">×</span>
          <div className="grid gap-1.5"><label htmlFor={ids.height} className="text-xs font-medium text-foreground">Height (px)</label>
            <Input id={ids.height} inputMode="numeric" autoComplete="off" value={height} disabled={!editable} aria-invalid={addError ? true : undefined} aria-describedby={addError ? ids.addError : undefined} onChange={(event) => { setHeight(event.currentTarget.value); setAddError(""); }} /></div>
          <div className="grid gap-1.5"><label htmlFor={ids.label} className="text-xs font-medium text-foreground">What it is for <span className="font-normal text-muted-foreground">(optional)</span></label>
            <Input id={ids.label} maxLength={60} autoComplete="off" value={label} disabled={!editable} placeholder="Collection banner" onChange={(event) => setLabel(event.currentTarget.value)} /></div>
          <ActionButton icon={Plus} type="submit" variant="outline" disabled={!editable}>Add size</ActionButton>
        </form>
        {addError && <p id={ids.addError} role="alert" className="m-0 text-xs font-medium text-danger">{addError}</p>}
        <div className="grid gap-2">
          <p className="m-0 text-xs font-medium text-foreground">Sizes this website&apos;s banners use</p>
          <div className="flex flex-wrap gap-2">
            {suggestedBannerSizes.map((size) => {
              const listed = draft.sizes.some((item) => sameSize(item, size));
              return <Button key={`${size.width}x${size.height}`} type="button" size="sm" variant="outline" disabled={!editable || listed} aria-pressed={listed}
                className={cn("h-auto gap-1.5 py-1.5 text-left", listed && "opacity-60")} onClick={() => addSize(size)}>
                <Plus aria-hidden="true" className="size-3.5" strokeWidth={1.75} /><span className="font-semibold tabular-nums">{describeImageSize(size)}</span><span className="font-normal text-muted-foreground">{size.label}</span>
              </Button>;
            })}
          </div>
        </div>
      </section>}

      <p className="m-0 rounded-md bg-neutral-bg px-3 py-2 text-xs leading-relaxed text-muted-foreground">
        The size checked is the picture&apos;s own size in pixels as it is uploaded. The library then saves every picture as a WebP of at most 2560 px on its longer side, so a 2784 × 400 banner is kept at 2560 × 368, which stays sharp on every screen.
      </p>

      {/* The largest picture file (owner, 23 Nov 2026: 5 MB): the server takes 8 MB at most, and each picture must arrive
          within 15 seconds, so the speed each choice needs is shown beside it. */}
      <section aria-labelledby={`${ids.rule}-file`} className="grid gap-2">
        <SectionHeading className="mt-0">{<span id={`${ids.rule}-file`}>Largest picture file</span>}</SectionHeading>
        <div role="radiogroup" aria-labelledby={`${ids.rule}-file`} className="grid gap-2 sm:grid-cols-2">
          {imageFileSizeChoices.map((bytes) => <label key={bytes} data-file-size={bytes}
            className={cn("flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-card px-3 py-2.5 has-[input:checked]:border-primary has-[input:checked]:ring-2 has-[input:checked]:ring-primary/20", !editable && "cursor-default opacity-80")}>
            <input type="radio" name={`${ids.rule}-file-choice`} value={bytes} checked={draft.maxImageBytes === bytes} disabled={!editable}
              onChange={() => change({ ...draft, maxImageBytes: bytes })} className="mt-1 accent-primary" />
            <span className="grid gap-0.5">
              <span className="text-sm font-semibold tabular-nums text-foreground">{describeFileSize(bytes)}{bytes === defaultMaxImageBytes ? " (recommended)" : bytes === imageFileSizeChoices[imageFileSizeChoices.length - 1] ? " (the most the server takes)" : ""}</span>
              <span className="text-xs text-muted-foreground">Needs an upload speed of about {((bytes * 8) / 15 / 1_000_000).toFixed(1)} Mbit/s</span>
            </span>
          </label>)}
        </div>
        <p className="m-0 text-xs text-muted-foreground">Every picture must finish uploading within 15 seconds. The library keeps each one as a WebP that is usually well under 1 MB, so a larger file does not look better on the website. Films keep their own limit of 80 MB.</p>
      </section>

      {publisher && <div className="flex flex-wrap items-center gap-3 border-t border-line-soft pt-4">
        <ActionButton icon={Save} disabled={!dirty || saving || (draft.restrictSizes && draft.sizes.length === 0)} onClick={() => void save()}>{saving ? "Saving…" : "Save changes"}</ActionButton>
        {dirty && <ActionButton icon={RotateCcw} variant="ghost" disabled={saving} onClick={() => { if (saved) change(saved.rules); setAddError(""); }}>Discard changes</ActionButton>}
        {dirty && !message && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
      </div>}
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      {saved?.updatedAt && <p data-settings-saved className="m-0 text-xs text-muted-foreground">Last changed{saved.updatedBy ? ` by ${saved.updatedBy}` : ""} on {whenSaved(saved.updatedAt)}.</p>}
    </div>
  </div>;
}
