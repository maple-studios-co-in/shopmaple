"use client";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { FlipHorizontal2, RotateCcw, RotateCw } from "lucide-react";
import { describeImageSize, type AllowedImageSize } from "@shopmaple/contracts/media-upload-rules";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Crop, turn and flip a library picture in the browser (owner, 23 Nov 2026: "an option for ... edit of images in media
 * gallery"). The result is a new picture: pages point at a file by its contents, so the original stays as it is and the
 * media library offers to put the copy where the draft used the original. A banner size from Settings crops to that
 * shape and makes the copy exactly that many pixels, so it passes the upload rule.
 */
export type Rect = { x: number; y: number; w: number; h: number };
type Corner = "nw" | "ne" | "sw" | "se";
export type CropShape = { kind: "free" } | { kind: "original" } | { kind: "exact"; width: number; height: number };
const minimum = 16;

/** The picture's size once turned a number of quarter turns. */
export const turnedSize = (width: number, height: number, turns: number) => (turns % 2 ? { width: height, height: width } : { width, height });

/** The largest area of the given shape centred in the picture, or the whole picture when the shape is free. */
export function fitRect(bounds: { width: number; height: number }, aspect: number | null): Rect {
  if (!aspect) return { x: 0, y: 0, w: bounds.width, h: bounds.height };
  const w = Math.min(bounds.width, bounds.height * aspect), h = w / aspect;
  return { x: (bounds.width - w) / 2, y: (bounds.height - h) / 2, w, h };
}

/** The area moved by (dx, dy), kept inside the picture. */
export function moveRect(rect: Rect, dx: number, dy: number, bounds: { width: number; height: number }): Rect {
  return { ...rect, x: Math.min(Math.max(0, rect.x + dx), bounds.width - rect.w), y: Math.min(Math.max(0, rect.y + dy), bounds.height - rect.h) };
}

/** The area with one corner dragged by (dx, dy), its opposite corner fixed, its shape kept when it has one. */
export function resizeRect(rect: Rect, corner: Corner, dx: number, dy: number, bounds: { width: number; height: number }, aspect: number | null): Rect {
  const left = corner === "nw" || corner === "sw", top = corner === "nw" || corner === "ne";
  const anchorX = left ? rect.x + rect.w : rect.x, anchorY = top ? rect.y + rect.h : rect.y;
  const roomX = left ? anchorX : bounds.width - anchorX, roomY = top ? anchorY : bounds.height - anchorY;
  let w = Math.min(Math.max(minimum, rect.w + (left ? -dx : dx)), roomX);
  let h = Math.min(Math.max(minimum, rect.h + (top ? -dy : dy)), roomY);
  if (aspect) {
    // Follow the larger of the two moves, then fit the shape inside the room on both sides.
    if (Math.abs(dx) >= Math.abs(dy) * aspect) h = w / aspect; else w = h * aspect;
    if (w > roomX) { w = roomX; h = w / aspect; }
    if (h > roomY) { h = roomY; w = h * aspect; }
  }
  return { x: left ? anchorX - w : anchorX, y: top ? anchorY - h : anchorY, w, h };
}

/** The copy's size: a banner size exactly, otherwise the chosen area's own pixels. */
export const outputSize = (rect: Rect, shape: CropShape) => shape.kind === "exact" ? { width: shape.width, height: shape.height } : { width: Math.max(1, Math.round(rect.w)), height: Math.max(1, Math.round(rect.h)) };

/** Draws the picture turned and flipped (flipped as it is seen, after turning) at `scale`. */
function drawTurned(canvas: HTMLCanvasElement, image: CanvasImageSource, width: number, height: number, turns: number, flip: boolean, scale: number) {
  const turned = turnedSize(width, height, turns);
  canvas.width = Math.max(1, Math.round(turned.width * scale)); canvas.height = Math.max(1, Math.round(turned.height * scale));
  const context = canvas.getContext("2d");
  if (!context) return;
  context.save();
  context.translate(canvas.width / 2, canvas.height / 2);
  context.scale(flip ? -1 : 1, 1);
  context.rotate((turns * Math.PI) / 2);
  context.drawImage(image, (-width * scale) / 2, (-height * scale) / 2, width * scale, height * scale);
  context.restore();
}
const toBlob = (canvas: HTMLCanvasElement, type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob((blob) => resolve(blob && blob.type === type ? blob : null), type, 0.92));

export function PictureEditor({ source, width, height, label, sizes, onCancel, onSave }: {
  /** The picture's address (the library's private preview) and its size in pixels. */
  source: string; width: number; height: number; label: string;
  /** Banner sizes to crop to exactly (Settings); when the rule is on, the first is chosen at the start. */
  sizes: { list: readonly AllowedImageSize[]; required: boolean };
  onCancel: () => void;
  /** Uploads the copy; resolves when it is in the library, rejects with the reason in plain words. */
  onSave: (picture: File, size: { width: number; height: number }) => Promise<void>;
}) {
  const [image, setImage] = useState<HTMLImageElement | null>(null), [loadFailed, setLoadFailed] = useState(false);
  const [turns, setTurns] = useState(0), [flip, setFlip] = useState(false);
  const firstShape: CropShape = sizes.required && sizes.list[0] ? { kind: "exact", width: sizes.list[0].width, height: sizes.list[0].height } : { kind: "free" };
  const [shape, setShape] = useState<CropShape>(firstShape);
  const bounds = turnedSize(width, height, turns);
  const aspectOf = (next: CropShape, turned: { width: number; height: number }) => next.kind === "exact" ? next.width / next.height : next.kind === "original" ? turned.width / turned.height : null;
  const [rect, setRect] = useState<Rect>(() => fitRect(bounds, aspectOf(firstShape, bounds)));
  const [saving, setSaving] = useState(false), [error, setError] = useState("");
  const preview = useRef<HTMLCanvasElement>(null), drag = useRef<{ mode: "move" | Corner; x: number; y: number; start: Rect } | null>(null);
  const ids = { shape: useId(), help: useId() };
  // Small enough that the whole editor, its buttons included, fits a 745px laptop window inside the dialog.
  const scale = Math.min(560 / bounds.width, 280 / bounds.height, 1);
  const aspect = aspectOf(shape, bounds);

  useEffect(() => {
    let live = true;
    const picture = new Image();
    picture.onload = () => { if (live) setImage(picture); };
    picture.onerror = () => { if (live) setLoadFailed(true); };
    picture.src = source;
    return () => { live = false; };
  }, [source]);
  useEffect(() => { if (image && preview.current) drawTurned(preview.current, image, width, height, turns, flip, scale); }, [image, width, height, turns, flip, scale]);

  function choose(next: CropShape, turnsNow = turns) { const turned = turnedSize(width, height, turnsNow); setShape(next); setRect(fitRect(turned, aspectOf(next, turned))); setError(""); }
  function turn(by: number) { const next = (turns + by + 4) % 4; setTurns(next); choose(shape, next); }
  function begin(mode: "move" | Corner) {
    return (event: PointerEvent<HTMLElement>) => {
      event.preventDefault(); event.stopPropagation();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      drag.current = { mode, x: event.clientX, y: event.clientY, start: rect };
    };
  }
  function follow(event: PointerEvent<HTMLElement>) {
    const now = drag.current;
    if (!now) return;
    const dx = (event.clientX - now.x) / scale, dy = (event.clientY - now.y) / scale;
    setRect(now.mode === "move" ? moveRect(now.start, dx, dy, bounds) : resizeRect(now.start, now.mode, dx, dy, bounds, aspect));
  }
  const end = () => { drag.current = null; };
  function keys(event: KeyboardEvent<HTMLDivElement>) {
    const step = Math.max(1, Math.round(Math.max(bounds.width, bounds.height) / 100)) * (event.altKey ? 10 : 1);
    const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key as "ArrowLeft"];
    if (!delta) return;
    event.preventDefault();
    setRect((current) => event.shiftKey ? resizeRect(current, "se", delta[0]!, delta[1]!, bounds, aspect) : moveRect(current, delta[0]!, delta[1]!, bounds));
  }
  async function save() {
    if (!image) return;
    const size = outputSize(rect, shape);
    setSaving(true); setError("");
    try {
      const turned = document.createElement("canvas");
      drawTurned(turned, image, width, height, turns, flip, 1);
      const result = document.createElement("canvas");
      result.width = size.width; result.height = size.height;
      const context = result.getContext("2d");
      if (!context) throw Error("This browser could not make the picture. Try another browser.");
      context.imageSmoothingQuality = "high";
      context.drawImage(turned, rect.x, rect.y, rect.w, rect.h, 0, 0, size.width, size.height);
      const webp = await toBlob(result, "image/webp");
      const blob = webp ?? await toBlob(result, "image/jpeg");
      if (!blob) throw Error("This browser could not make the picture. Try another browser.");
      const name = `${label.replace(/\.[a-z0-9]{2,5}$/i, "").slice(0, 140)} (edited).${webp ? "webp" : "jpg"}`;
      await onSave(new File([blob], name, { type: blob.type }), size);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The picture could not be saved. Please try again.");
    } finally { setSaving(false); }
  }

  const result = outputSize(rect, shape);
  const enlarged = shape.kind === "exact" && rect.w < shape.width - 0.5;
  const handles: Corner[] = ["nw", "ne", "sw", "se"];
  // The shape on a row of its own, its long names never under the buttons (owner, 23 Nov 2026), the turns and the flip below.
  return <div data-picture-editor className="grid gap-3">
    <div data-editor-tools className="grid gap-2.5">
      <div className="grid min-w-0 gap-1.5">
        <label htmlFor={ids.shape} className="text-xs font-medium text-foreground">Shape</label>
        <select id={ids.shape} value={shape.kind === "exact" ? `${shape.width}x${shape.height}` : shape.kind} disabled={saving}
          className="h-9 w-full min-w-0 truncate rounded-md border border-input bg-card px-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60"
          onChange={(event) => {
            const value = event.currentTarget.value;
            const exact = sizes.list.find((size) => `${size.width}x${size.height}` === value);
            choose(exact ? { kind: "exact", width: exact.width, height: exact.height } : value === "original" ? { kind: "original" } : { kind: "free" });
          }}>
          <option value="free">Free</option>
          <option value="original">The picture&apos;s own shape</option>
          {sizes.list.map((size) => <option key={`${size.width}x${size.height}`} value={`${size.width}x${size.height}`}>{describeImageSize(size)} px{size.label ? `, ${size.label}` : ""} (exact size)</option>)}
        </select>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Turn and flip">
        <Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => turn(-1)}><RotateCcw aria-hidden="true" className="size-4" strokeWidth={1.75} />Turn left</Button>
        <Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => turn(1)}><RotateCw aria-hidden="true" className="size-4" strokeWidth={1.75} />Turn right</Button>
        <Button type="button" variant="outline" size="sm" disabled={saving} aria-pressed={flip} className="aria-pressed:border-primary aria-pressed:text-primary" onClick={() => setFlip((now) => !now)}><FlipHorizontal2 aria-hidden="true" className="size-4" strokeWidth={1.75} />Flip</Button>
      </div>
    </div>
    {sizes.required && shape.kind !== "exact" && <p className="m-0 text-xs text-danger">Settings allow only certain banner sizes, so a copy of another size will not upload. Choose one of them under Shape.</p>}
    <div className="grid justify-items-center rounded-lg border border-border bg-sunken p-3">
      {loadFailed ? <p className="m-0 py-10 text-sm text-danger">The picture could not be opened for editing. Close this and try again.</p>
        : <div className="relative overflow-hidden" style={{ width: Math.round(bounds.width * scale), height: Math.round(bounds.height * scale) }}>
          <canvas ref={preview} aria-hidden="true" className="block size-full" />
          {image && <div data-crop-area role="group" tabIndex={0} aria-label={`Crop area, ${result.width} × ${result.height} px`} aria-describedby={ids.help}
            onPointerDown={begin("move")} onPointerMove={follow} onPointerUp={end} onPointerCancel={end} onKeyDown={keys}
            className="absolute cursor-move touch-none outline-none ring-2 ring-white focus-visible:ring-primary"
            style={{ left: rect.x * scale, top: rect.y * scale, width: rect.w * scale, height: rect.h * scale, boxShadow: "0 0 0 9999px rgba(20, 12, 8, 0.5)" }}>
            {handles.map((corner) => <span key={corner} data-handle={corner} onPointerDown={begin(corner)} onPointerMove={follow} onPointerUp={end} onPointerCancel={end}
              className={cn("absolute size-3.5 touch-none rounded-sm border-2 border-primary bg-white", corner === "nw" ? "-top-1.5 -left-1.5 cursor-nwse-resize" : corner === "ne" ? "-top-1.5 -right-1.5 cursor-nesw-resize" : corner === "sw" ? "-bottom-1.5 -left-1.5 cursor-nesw-resize" : "-right-1.5 -bottom-1.5 cursor-nwse-resize")} />)}
          </div>}
        </div>}
    </div>
    <p id={ids.help} className="m-0 text-xs text-muted-foreground">Drag the frame to move it and its corners to resize it. With the keyboard, the arrow keys move it, and Shift with an arrow key resizes it.</p>
    <p data-crop-result className="m-0 text-sm text-foreground">The copy will be <span className="font-semibold tabular-nums">{describeImageSize(result)} px</span>.{enlarged ? " The chosen area is smaller than that, so the picture will be enlarged and may look soft." : ""}</p>
    {error && <p role="alert" className="m-0 rounded-lg border border-danger/20 bg-danger-bg px-3 py-2 text-xs font-medium text-danger">{error}</p>}
    {/* Pinned to the foot of the dialog's scrolling part, so Cancel and Save are always in view. */}
    <div data-editor-actions className="sticky bottom-0 z-10 -mx-6 -mb-1 flex flex-wrap justify-end gap-2 border-t border-line-soft bg-card px-6 py-3">
      <Button type="button" variant="outline" disabled={saving} onClick={onCancel}>Cancel</Button>
      <Button type="button" disabled={saving || !image} onClick={() => void save()}>{saving ? "Saving…" : "Save as a new picture"}</Button>
    </div>
  </div>;
}
