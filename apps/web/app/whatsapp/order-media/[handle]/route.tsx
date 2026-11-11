import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { brotliDecompressSync } from "node:zlib";
import { ImageResponse } from "next/og";
import { getProduct } from "@/lib/catalog";
import { isProductHandle } from "@/lib/recent-products";
import { previewSampleHandle } from "@/lib/whatsapp-media";

/**
 * The header image of the WhatsApp order confirmation (Figma 404:1410, 1200 × 630; owner, 11 Nov 2026): the sage panel's
 * three lines beside the product's first photo, the 400 × 210 strip of the message (394:1456) drawn three times larger.
 * The template's IMAGE header links here (`orderConfirmationMediaPath` in @shopmaple/contracts/whatsapp). It holds no
 * customer data, so caches may keep it for a week.
 */
export const runtime = "nodejs";

const width = 1200;
const height = 630;
const photoWidth = 504;
const photoByteLimit = 15_000_000;
const cacheControl = "public, max-age=604800, stale-while-revalidate=2592000";

// Development only (lib/whatsapp-media.ts): the Figma frames' own Nola photograph in the real header image.
const previewSamplePhoto = ["public", "media", "previews", "nola-accent-chair.webp"];

export async function GET(_request: Request, { params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  if (!isProductHandle(handle)) return notFound();
  if (handle === previewSampleHandle && process.env.NODE_ENV !== "production") {
    const bytes = await readFile(join(process.cwd(), ...previewSamplePhoto)).catch(() => null);
    const [fonts, photo] = await Promise.all([mediaFonts(), bytes ? slotPhoto(bytes, "image/webp") : null]);
    return new ImageResponse(<OrderMedia photo={photo} />, { width, height, fonts, headers: { "cache-control": "no-store" } });
  }
  let product: Awaited<ReturnType<typeof getProduct>>;
  try {
    product = await getProduct(handle);
  } catch {
    return new Response("The catalogue is temporarily unavailable.", {
      status: 503,
      headers: { "cache-control": "no-store", "retry-after": "60", "content-type": "text/plain; charset=utf-8" },
    });
  }
  if (!product) return notFound();
  const [fonts, photo] = await Promise.all([mediaFonts(), productPhoto(product.images[0])]);
  return new ImageResponse(<OrderMedia photo={photo} />, {
    width,
    height,
    fonts,
    // Lower case, so it replaces next/og's own cache header rather than joining it.
    headers: { "cache-control": cacheControl },
  });
}

function notFound() {
  return new Response("Not found.", { status: 404, headers: { "cache-control": "public, max-age=300", "content-type": "text/plain; charset=utf-8" } });
}

/** Figma 404:1410 at its own size. A product without a photo keeps the sage panel across the whole image. */
function OrderMedia({ photo }: { photo: string | null }) {
  return (
    <div style={{ display: "flex", width, height, background: "#eceee7" }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: photo ? width - photoWidth : width,
          height,
          padding: 66,
        }}
      >
        <div style={{ fontFamily: "Red Hat Display", fontSize: 27.6, lineHeight: 1.4, color: "#515b4a" }}>MAPLE FURNISHERS</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 21.6 }}>
          <div style={{ display: "flex", flexDirection: "column", fontFamily: "DM Sans", fontWeight: 500, fontSize: 76.8, lineHeight: 1.4, color: "#272822" }}>
            <span>A beautiful</span>
            <span>choice.</span>
          </div>
          <div style={{ fontFamily: "Red Hat Display", fontSize: 28.8, lineHeight: 1.4, color: "#676b61" }}>Made for your everyday.</div>
        </div>
      </div>
      {photo ? <img src={photo} alt="" width={photoWidth} height={height} style={{ width: photoWidth, height, objectFit: "cover" }} /> : null}
    </div>
  );
}

/**
 * The product's first photo as a data URL cut to its slot, or null when it can't be read. next/og draws with sharp when
 * sharp is installed, and sharp's SVG renderer leaves an embedded WebP blank (Shopify serves WebP), so the photo is
 * handed over as a JPEG. Without sharp, next/og draws with resvg, which reads the original.
 */
async function productPhoto(source: string | undefined): Promise<string | null> {
  if (!source || !URL.canParse(source)) return null;
  const url = new URL(source);
  if (url.protocol !== "https:") return null;
  // Shopify's CDN scales on request; the slot is 504px wide.
  if (url.hostname === "cdn.shopify.com") url.searchParams.set("width", String(photoWidth * 2));
  try {
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    const type = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
    if (!response.ok || !/^image\/(?:jpeg|png|webp|gif|avif)$/.test(type)) return null;
    if (Number(response.headers.get("content-length") ?? 0) > photoByteLimit) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength > photoByteLimit) return null;
    return await slotPhoto(bytes, type);
  } catch {
    return null;
  }
}

/** A photo's bytes cut to the 504 × 630 slot as a JPEG data URL (the original when sharp is not installed). */
async function slotPhoto(bytes: Buffer, type: string): Promise<string | null> {
  try {
    const sharp = await import("sharp").then((module) => module.default).catch(() => null);
    if (!sharp) return `data:${type};base64,${bytes.toString("base64")}`;
    const jpeg = await sharp(bytes).rotate().resize(photoWidth, height, { fit: "cover" }).jpeg({ quality: 86 }).toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  } catch {
    return null;
  }
}

type MediaFont = { name: string; data: ArrayBuffer; weight: 400 | 500; style: "normal" };
let fontsOnce: Promise<MediaFont[]> | undefined;
const exactBuffer = (bytes: Uint8Array) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

/** A file of an installed package. `next dev` and `next start` run in apps/web; npm workspaces install to the root. */
async function packageFile(file: string) {
  for (const base of [process.cwd(), join(process.cwd(), "..", "..")]) {
    try {
      return await readFile(join(base, "node_modules", file));
    } catch {
      // Not installed here: try the repository root.
    }
  }
  throw new Error(`Missing font file ${file}`);
}

/**
 * Red Hat Display Regular from @fontsource, and DM Sans Medium cut from @fontsource-variable's WOFF2 at weight 500 and
 * optical size 40: the browser's automatic optical size for 76.8px type, which the Figma render matches (Satori reads
 * neither WOFF2 nor variable fonts). Prepared once per server process.
 */
function mediaFonts() {
  if (!fontsOnce) {
    fontsOnce = loadFonts();
    // A failed read is tried again on the next request.
    fontsOnce.catch(() => {
      fontsOnce = undefined;
    });
  }
  return fontsOnce;
}
async function loadFonts(): Promise<MediaFont[]> {
  const [text, heading] = await Promise.all([
    packageFile("@fontsource/red-hat-display/files/red-hat-display-latin-400-normal.woff"),
    packageFile("@fontsource-variable/dm-sans/files/dm-sans-latin-opsz-normal.woff2"),
  ]);
  let medium: ArrayBuffer;
  try {
    medium = exactBuffer(staticInstance(heading, { wght: 500, opsz: 40 }));
  } catch (error) {
    console.error("WhatsApp order media: DM Sans could not be prepared, so the headline uses Red Hat Display.", error);
    medium = exactBuffer(text);
  }
  return [
    { name: "Red Hat Display", data: exactBuffer(text), weight: 400, style: "normal" },
    { name: "DM Sans", data: medium, weight: 500, style: "normal" },
  ];
}

// ---------------------------------------------------------------------------------------------------------------------
// A static TrueType instance of a variable WOFF2 font: the WOFF2 container decoded (its glyf/loca transform included,
// WOFF2 §5), gvar applied at the wanted axis values with avar, IUP and phantom-point advances as fontTools' instancer
// does, hinting and the variation tables dropped, and a plain sfnt written out.
// ---------------------------------------------------------------------------------------------------------------------

type Point = { x: number; y: number; on: boolean };
type Box = [number, number, number, number];
type Component = { flags: number; glyph: number; a1: number; a2: number; transform: Uint8Array };
type Glyph =
  | { kind: "empty" }
  | { kind: "simple"; ends: number[]; points: Point[]; box: Box }
  | { kind: "composite"; components: Component[]; box: Box };

class Reader {
  constructor(
    readonly bytes: Uint8Array,
    public at = 0,
  ) {}
  u8() {
    if (this.at >= this.bytes.length) throw new Error("Font data ends early");
    return this.bytes[this.at++]!;
  }
  i8() {
    const value = this.u8();
    return value > 127 ? value - 256 : value;
  }
  u16() {
    return (this.u8() << 8) | this.u8();
  }
  i16() {
    const value = this.u16();
    return value > 32767 ? value - 65536 : value;
  }
  u32() {
    return this.u16() * 65536 + this.u16();
  }
  i32() {
    const value = this.u32();
    return value > 2147483647 ? value - 4294967296 : value;
  }
  f2dot14() {
    return this.i16() / 16384;
  }
  take(length: number) {
    if (this.at + length > this.bytes.length) throw new Error("Font data ends early");
    this.at += length;
    return this.bytes.subarray(this.at - length, this.at);
  }
  /** WOFF2's UIntBase128. */
  base128() {
    let value = 0;
    for (let i = 0; i < 5; i++) {
      const byte = this.u8();
      if (i === 0 && byte === 0x80) throw new Error("Invalid WOFF2 number");
      value = value * 128 + (byte & 0x7f);
      if (!(byte & 0x80)) return value;
    }
    throw new Error("Invalid WOFF2 number");
  }
  /** WOFF2's 255UInt16. */
  u255() {
    const code = this.u8();
    if (code === 253) return this.u16();
    if (code === 255) return this.u8() + 253;
    if (code === 254) return this.u8() + 506;
    return code;
  }
}

class Writer {
  bytes: number[] = [];
  u8(value: number) {
    this.bytes.push(value & 0xff);
  }
  u16(value: number) {
    this.bytes.push((value >> 8) & 0xff, value & 0xff);
  }
  u32(value: number) {
    this.u16(Math.floor(value / 65536) & 0xffff);
    this.u16(value & 0xffff);
  }
  raw(data: Uint8Array) {
    for (const byte of data) this.bytes.push(byte);
  }
  pad() {
    while (this.bytes.length % 4) this.bytes.push(0);
  }
}

/** WOFF2's known table tags, by their index in a table directory entry. */
const knownTags = (
  "cmap head hhea hmtx maxp name OS/2 post cvt  fpgm glyf loca prep CFF  VORG EBDT EBLC gasp hdmx kern LTSH PCLT VDMX " +
  "vhea vmtx BASE GDEF GPOS GSUB EBSC JSTF MATH CBDT CBLC COLR CPAL SVG  sbix acnt avar bdat bloc bsln cvar fdsc feat " +
  "fmtx fvar gvar hsty just lcar mort morx opbd prop trak Zapf Silf Glat Gloc Feat Sill"
)
  .match(/.{4} ?/g)!
  .map((tag) => tag.slice(0, 4));

function woff2Tables(file: Uint8Array) {
  const head = new Reader(file);
  if (head.u32() !== 0x774f4632) throw new Error("Not a WOFF2 font");
  if (head.u32() !== 0x00010000) throw new Error("Only TrueType WOFF2 fonts are supported");
  head.at = 12;
  const count = head.u16();
  head.at = 20;
  const compressedLength = head.u32();
  head.at = 48;
  const entries: { tag: string; transformed: boolean; length: number }[] = [];
  for (let i = 0; i < count; i++) {
    const flags = head.u8();
    const tag = (flags & 0x3f) === 63 ? String.fromCharCode(...head.take(4)) : knownTags[flags & 0x3f]!;
    const version = flags >> 6;
    const length = head.base128();
    const transformed = tag === "glyf" || tag === "loca" ? version === 0 : version !== 0;
    if (transformed && tag !== "glyf" && tag !== "loca") throw new Error(`Unsupported WOFF2 transform of ${tag}`);
    entries.push({ tag, transformed, length: transformed ? head.base128() : length });
  }
  if (!entries.some((entry) => entry.tag === "glyf" && entry.transformed)) throw new Error("Expected a transformed glyf table");
  const data = new Uint8Array(brotliDecompressSync(file.subarray(head.at, head.at + compressedLength)));
  const tables = new Map<string, Uint8Array>();
  let at = 0;
  for (const entry of entries) {
    tables.set(entry.tag, data.subarray(at, at + entry.length));
    at += entry.length;
  }
  return tables;
}

const signed = (flag: number, value: number) => (flag & 1 ? value : -value);
const round = (value: number) => Math.floor(value + 0.5);
function bounds(points: Point[]): Box {
  if (!points.length) return [0, 0, 0, 0];
  const box: Box = [Infinity, Infinity, -Infinity, -Infinity];
  for (const { x, y } of points) {
    box[0] = Math.min(box[0], x);
    box[1] = Math.min(box[1], y);
    box[2] = Math.max(box[2], x);
    box[3] = Math.max(box[3], y);
  }
  return box;
}

/** The glyphs of WOFF2's transformed glyf table. Hinting instructions are skipped. */
function decodeGlyphs(glyf: Uint8Array): Glyph[] {
  const header = new Reader(glyf, 4);
  const numGlyphs = header.u16();
  header.u16();
  let at = 36;
  const [contourCounts, pointCounts, flags, triplets, composites, boxes, instructions] = Array.from({ length: 7 }, () => {
    const size = header.u32();
    const stream = new Reader(glyf.subarray(at, at + size));
    at += size;
    return stream;
  }) as [Reader, Reader, Reader, Reader, Reader, Reader, Reader];
  const boxBitmap = boxes.take(((numGlyphs + 31) >> 5) << 2);
  const explicitBox = (glyph: number) => (boxBitmap[glyph >> 3]! & (0x80 >> (glyph & 7))) !== 0;
  const readBox = (): Box => [boxes.i16(), boxes.i16(), boxes.i16(), boxes.i16()];
  const glyphs: Glyph[] = [];
  for (let glyph = 0; glyph < numGlyphs; glyph++) {
    const contours = contourCounts.i16();
    if (contours === 0) {
      glyphs.push({ kind: "empty" });
    } else if (contours > 0) {
      const ends: number[] = [];
      let total = 0;
      for (let contour = 0; contour < contours; contour++) ends.push((total += pointCounts.u255()) - 1);
      const points: Point[] = [];
      let x = 0;
      let y = 0;
      for (let point = 0; point < total; point++) {
        const flag = flags.u8();
        const f = flag & 0x7f;
        let dx: number;
        let dy: number;
        if (f < 10) {
          dx = 0;
          dy = signed(f, ((f & 14) << 7) + triplets.u8());
        } else if (f < 20) {
          dx = signed(f, (((f - 10) & 14) << 7) + triplets.u8());
          dy = 0;
        } else if (f < 84) {
          const b0 = f - 20;
          const b1 = triplets.u8();
          dx = signed(f, 1 + (b0 & 0x30) + (b1 >> 4));
          dy = signed(f >> 1, 1 + ((b0 & 0x0c) << 2) + (b1 & 0x0f));
        } else if (f < 120) {
          const b0 = f - 84;
          dx = signed(f, 1 + (Math.floor(b0 / 12) << 8) + triplets.u8());
          dy = signed(f >> 1, 1 + (((b0 % 12) >> 2) << 8) + triplets.u8());
        } else if (f < 124) {
          const [b1, b2, b3] = [triplets.u8(), triplets.u8(), triplets.u8()];
          dx = signed(f, (b1 << 4) + (b2 >> 4));
          dy = signed(f >> 1, ((b2 & 0x0f) << 8) + b3);
        } else {
          const [b1, b2, b3, b4] = [triplets.u8(), triplets.u8(), triplets.u8(), triplets.u8()];
          dx = signed(f, (b1 << 8) + b2);
          dy = signed(f >> 1, (b3 << 8) + b4);
        }
        x += dx;
        y += dy;
        points.push({ x, y, on: !(flag & 0x80) });
      }
      instructions.take(triplets.u255());
      glyphs.push({ kind: "simple", ends, points, box: explicitBox(glyph) ? readBox() : bounds(points) });
    } else {
      const components: Component[] = [];
      let more = true;
      let hinted = false;
      while (more) {
        const flag = composites.u16();
        const component = composites.u16();
        const xy = (flag & 0x0002) !== 0;
        const words = (flag & 0x0001) !== 0;
        const arg = () => (words ? (xy ? composites.i16() : composites.u16()) : xy ? composites.i8() : composites.u8());
        const a1 = arg();
        const a2 = arg();
        const transform = composites.take(flag & 0x0008 ? 2 : flag & 0x0040 ? 4 : flag & 0x0080 ? 8 : 0).slice();
        components.push({ flags: flag, glyph: component, a1, a2, transform });
        hinted ||= (flag & 0x0100) !== 0;
        more = (flag & 0x0020) !== 0;
      }
      if (hinted) instructions.take(triplets.u255());
      if (!explicitBox(glyph)) throw new Error("A WOFF2 composite glyph has no bounding box");
      glyphs.push({ kind: "composite", components, box: readBox() });
    }
  }
  return glyphs;
}

/** Normalised axis coordinates (fvar, then avar), rounded to F2DOT14 as OpenType requires. */
function location(fvar: Uint8Array, avar: Uint8Array | undefined, wanted: Record<string, number>) {
  const header = new Reader(fvar, 4);
  const axesAt = header.u16();
  header.u16();
  const count = header.u16();
  const size = header.u16();
  const maps: [number, number][][] = [];
  if (avar) {
    const r = new Reader(avar, 6);
    const axes = r.u16();
    for (let axis = 0; axis < axes; axis++)
      maps.push(Array.from({ length: r.u16() }, () => [r.f2dot14(), r.f2dot14()] as [number, number]));
  }
  return Array.from({ length: count }, (_, index) => {
    const r = new Reader(fvar, axesAt + index * size);
    const tag = String.fromCharCode(...r.take(4));
    const [min, standard, max] = [r.i32() / 65536, r.i32() / 65536, r.i32() / 65536];
    const value = Math.min(max, Math.max(min, wanted[tag] ?? standard));
    let v = value === standard ? 0 : value < standard ? (value - standard) / (standard - min) : (value - standard) / (max - standard);
    const map = maps[index];
    if (map?.length) {
      const [first, last] = [map[0]!, map[map.length - 1]!];
      const exact = map.find(([from]) => from === v);
      if (exact) v = exact[1];
      else if (v < first[0]) v += first[1] - first[0];
      else if (v > last[0]) v += last[1] - last[0];
      else {
        const above = map.findIndex(([from]) => from > v);
        const [[a, va], [b, vb]] = [map[above - 1]!, map[above]!];
        v = va + ((vb - va) * (v - a)) / (b - a);
      }
    }
    return Math.round(v * 16384) / 16384;
  });
}

/** How much a variation applies at `at` (OpenType's region scalar, as fontTools' supportScalar). */
function regionScalar(at: number[], peak: number[], start: number[] | null, end: number[] | null) {
  let scalar = 1;
  for (let axis = 0; axis < peak.length; axis++) {
    const top = peak[axis]!;
    if (top === 0) continue;
    const lower = start ? start[axis]! : Math.min(top, 0);
    const upper = end ? end[axis]! : Math.max(top, 0);
    if (lower > top || top > upper || (lower < 0 && upper > 0)) continue;
    const v = at[axis] ?? 0;
    if (v === top) continue;
    if (v <= lower || v >= upper) return 0;
    scalar *= v < top ? (v - lower) / (top - lower) : (v - upper) / (top - upper);
  }
  return scalar;
}

function packedPoints(r: Reader): number[] | null {
  let count = r.u8();
  if (count & 0x80) count = ((count & 0x7f) << 8) | r.u8();
  if (count === 0) return null;
  const points: number[] = [];
  let current = 0;
  while (points.length < count) {
    const run = r.u8();
    for (let i = 0; i <= (run & 0x7f); i++) points.push((current += run & 0x80 ? r.u16() : r.u8()));
  }
  return points;
}

function packedDeltas(r: Reader, count: number) {
  const deltas: number[] = [];
  while (deltas.length < count) {
    const run = r.u8();
    const size = run & 0xc0;
    for (let i = 0; i <= (run & 0x3f); i++) deltas.push(size === 0x80 ? 0 : size === 0xc0 ? r.i32() : size === 0x40 ? r.i16() : r.i8());
  }
  return deltas;
}

/** Fills a contour's untouched deltas from its touched neighbours on one axis (IUP). */
function interpolate(first: number, last: number, deltas: Float64Array, touched: Uint8Array, coords: number[]) {
  const marked: number[] = [];
  for (let i = first; i <= last; i++) if (touched[i]) marked.push(i);
  for (let k = 0; k < marked.length; k++) {
    const a = marked[k]!;
    const b = marked[(k + 1) % marked.length]!;
    for (let i = a === last ? first : a + 1; i !== b; i = i === last ? first : i + 1) {
      let [x1, x2, d1, d2] = [coords[a]!, coords[b]!, deltas[a]!, deltas[b]!];
      const x = coords[i]!;
      if (x1 === x2) deltas[i] = d1 === d2 ? d1 : 0;
      else {
        if (x1 > x2) [x1, x2, d1, d2] = [x2, x1, d2, d1];
        deltas[i] = x <= x1 ? d1 : x >= x2 ? d2 : d1 + ((x - x1) * (d2 - d1)) / (x2 - x1);
      }
    }
  }
}

/** One glyph's summed gvar deltas: its points (or component offsets), then its four phantom points. */
function glyphDeltas(gvar: Uint8Array, glyph: number, at: number[], xs: number[], ys: number[], ends: number[] | null) {
  const header = new Reader(gvar, 4);
  const axisCount = header.u16();
  const sharedCount = header.u16();
  const sharedAt = header.u32();
  header.u16();
  const longOffsets = header.u16() & 1;
  const arrayAt = header.u32();
  const offsets = new Reader(gvar, header.at + glyph * (longOffsets ? 4 : 2));
  const start = arrayAt + (longOffsets ? offsets.u32() : offsets.u16() * 2);
  const end = arrayAt + (longOffsets ? offsets.u32() : offsets.u16() * 2);
  const count = xs.length;
  const dx = new Float64Array(count);
  const dy = new Float64Array(count);
  if (end <= start) return { dx, dy };
  const tuples = new Reader(gvar, start);
  const flags = tuples.u16();
  const data = new Reader(gvar, start + tuples.u16());
  const shared = flags & 0x8000 ? packedPoints(data) : null;
  const tuple = (r: Reader) => Array.from({ length: axisCount }, () => r.f2dot14());
  for (let t = 0; t < (flags & 0x0fff); t++) {
    const size = tuples.u16();
    const index = tuples.u16();
    if (!(index & 0x8000) && (index & 0x0fff) >= sharedCount) throw new Error("Invalid gvar tuple");
    const peak = tuple(index & 0x8000 ? tuples : new Reader(gvar, sharedAt + (index & 0x0fff) * axisCount * 2));
    const intermediate = index & 0x4000 ? [tuple(tuples), tuple(tuples)] : null;
    const body = new Reader(gvar.subarray(0, data.at + size), data.at);
    data.at += size;
    const scalar = regionScalar(at, peak, intermediate?.[0] ?? null, intermediate?.[1] ?? null);
    if (scalar === 0) continue;
    const listed = index & 0x2000 ? packedPoints(body) : shared;
    const xDeltas = packedDeltas(body, listed?.length ?? count);
    const yDeltas = packedDeltas(body, listed?.length ?? count);
    const tx = new Float64Array(count);
    const ty = new Float64Array(count);
    if (!listed) {
      tx.set(xDeltas.slice(0, count));
      ty.set(yDeltas.slice(0, count));
    } else {
      const touched = new Uint8Array(count);
      listed.forEach((point, k) => {
        if (point >= count) return;
        tx[point] = xDeltas[k]!;
        ty[point] = yDeltas[k]!;
        touched[point] = 1;
      });
      let first = 0;
      for (const last of ends ?? []) {
        interpolate(first, last, tx, touched, xs);
        interpolate(first, last, ty, touched, ys);
        first = last + 1;
      }
    }
    for (let i = 0; i < count; i++) {
      dx[i] = dx[i]! + scalar * tx[i]!;
      dy[i] = dy[i]! + scalar * ty[i]!;
    }
  }
  return { dx, dy };
}

function sfnt(tables: Map<string, Uint8Array>) {
  const tags = [...tables.keys()].sort();
  const out = new Writer();
  const power = 2 ** Math.floor(Math.log2(tags.length));
  out.u32(0x00010000);
  out.u16(tags.length);
  out.u16(power * 16);
  out.u16(Math.log2(power));
  out.u16(tags.length * 16 - power * 16);
  let offset = 12 + tags.length * 16;
  for (const tag of tags) {
    const data = tables.get(tag)!;
    let sum = 0;
    for (let i = 0; i < data.length; i += 4)
      sum = (sum + ((data[i] ?? 0) * 16777216 + ((data[i + 1] ?? 0) << 16) + ((data[i + 2] ?? 0) << 8) + (data[i + 3] ?? 0))) % 4294967296;
    for (const char of tag) out.u8(char.charCodeAt(0));
    out.u32(sum);
    out.u32(offset);
    out.u32(data.length);
    offset += Math.ceil(data.length / 4) * 4;
  }
  for (const tag of tags) {
    out.raw(tables.get(tag)!);
    out.pad();
  }
  return Uint8Array.from(out.bytes);
}

/** The variable WOFF2 font `woff2` as a static TrueType font at `axes` (e.g. `{ wght: 500, opsz: 40 }`). */
function staticInstance(woff2: Uint8Array, axes: Record<string, number>) {
  const tables = woff2Tables(woff2);
  const need = (tag: string) => {
    const table = tables.get(tag);
    if (!table) throw new Error(`The font has no ${tag} table`);
    return table;
  };
  const glyphs = decodeGlyphs(need("glyf"));
  const hhea = need("hhea");
  const hmtx = new Reader(need("hmtx"));
  const metricsCount = new Reader(hhea, 34).u16();
  const advances: number[] = [];
  const bearings: number[] = [];
  for (let glyph = 0; glyph < glyphs.length; glyph++) {
    advances.push(glyph < metricsCount ? hmtx.u16() : advances[advances.length - 1]!);
    bearings.push(hmtx.i16());
  }
  const fvar = tables.get("fvar");
  const gvar = tables.get("gvar");
  const at = fvar && gvar ? location(fvar, tables.get("avar"), axes) : null;
  // Points, and composite offsets (one per component), move by the variation; the phantom points give the advance.
  glyphs.forEach((glyph, index) => {
    const origin = (glyph.kind === "empty" ? 0 : glyph.box[0]) - bearings[index]!;
    const own: { x: number; y: number }[] =
      glyph.kind === "simple" ? glyph.points : glyph.kind === "composite" ? glyph.components.map((c) => ({ x: c.a1, y: c.a2 })) : [];
    const xs = [...own.map((p) => p.x), origin, origin + advances[index]!, 0, 0];
    const ys = [...own.map((p) => p.y), 0, 0, 0, 0];
    const { dx, dy } = at && gvar
      ? glyphDeltas(gvar, index, at, xs, ys, glyph.kind === "simple" ? glyph.ends : null)
      : { dx: new Float64Array(xs.length), dy: new Float64Array(xs.length) };
    const left = round(origin + dx[own.length]!);
    advances[index] = Math.max(0, round(origin + advances[index]! + dx[own.length + 1]!) - left);
    if (glyph.kind === "simple") {
      glyph.points = glyph.points.map((p, i) => ({ x: round(p.x + dx[i]!) - left, y: round(p.y + dy[i]!), on: p.on }));
      glyph.box = bounds(glyph.points);
    } else if (glyph.kind === "composite") {
      glyph.components = glyph.components.map((c, i) => (c.flags & 0x0002 ? { ...c, a1: round(c.a1 + dx[i]!) - left, a2: round(c.a2 + dy[i]!) } : c));
    }
  });
  const boxOf = (index: number, depth = 0): Box | null => {
    const glyph = glyphs[index];
    if (!glyph || glyph.kind === "empty" || depth > 8) return null;
    if (glyph.kind === "simple") return glyph.box;
    const corners: Point[] = [];
    for (const c of glyph.components) {
      const inner = boxOf(c.glyph, depth + 1);
      if (!inner) continue;
      const t = new Reader(c.transform);
      const scale = c.transform.length === 2 ? [t.f2dot14()] : [];
      const [a, b, cc, d] = c.transform.length === 8 ? [t.f2dot14(), t.f2dot14(), t.f2dot14(), t.f2dot14()]
        : c.transform.length === 4 ? [t.f2dot14(), 0, 0, t.f2dot14()] : [scale[0] ?? 1, 0, 0, scale[0] ?? 1];
      const [ox, oy] = c.flags & 0x0002 ? [c.a1, c.a2] : [0, 0];
      for (const [x, y] of [[inner[0], inner[1]], [inner[0], inner[3]], [inner[2], inner[1]], [inner[2], inner[3]]] as const)
        corners.push({ x: round(x * a! + y * cc! + ox), y: round(x * b! + y * d! + oy), on: true });
    }
    return corners.length ? bounds(corners) : null;
  };
  glyphs.forEach((glyph, index) => {
    if (glyph.kind === "composite") glyph.box = boxOf(index) ?? [0, 0, 0, 0];
  });
  // glyf with long loca offsets and no hinting; hmtx with a metric for every glyph.
  const glyf = new Writer();
  const loca = new Writer();
  for (const glyph of glyphs) {
    loca.u32(glyf.bytes.length);
    if (glyph.kind === "empty") continue;
    if (glyph.kind === "simple") {
      glyf.u16(glyph.ends.length);
      for (const value of glyph.box) glyf.u16(value);
      for (const value of glyph.ends) glyf.u16(value);
      glyf.u16(0);
      for (const p of glyph.points) glyf.u8(p.on ? 1 : 0);
      let previous = 0;
      for (const p of glyph.points) {
        glyf.u16(p.x - previous);
        previous = p.x;
      }
      previous = 0;
      for (const p of glyph.points) {
        glyf.u16(p.y - previous);
        previous = p.y;
      }
    } else {
      glyf.u16(-1);
      for (const value of glyph.box) glyf.u16(value);
      glyph.components.forEach((c, i) => {
        glyf.u16((c.flags & ~0x0120) | 0x0001 | (i < glyph.components.length - 1 ? 0x0020 : 0));
        glyf.u16(c.glyph);
        glyf.u16(c.a1);
        glyf.u16(c.a2);
        glyf.raw(c.transform);
      });
    }
    glyf.pad();
  }
  loca.u32(glyf.bytes.length);
  const metrics = new Writer();
  glyphs.forEach((glyph, index) => {
    metrics.u16(advances[index]!);
    metrics.u16(glyph.kind === "empty" ? 0 : glyph.box[0]);
  });
  const patch = (table: Uint8Array, edits: [number, number][]) => {
    const copy = table.slice();
    for (const [offset, value] of edits) copy.set([(value >> 8) & 0xff, value & 0xff], offset);
    return copy;
  };
  const out = new Map<string, Uint8Array>();
  for (const tag of ["cmap", "name", "post", "maxp", "OS/2", "GDEF", "GPOS", "GSUB"]) {
    const table = tables.get(tag);
    if (table) out.set(tag, table);
  }
  if (axes.wght && out.has("OS/2")) out.set("OS/2", patch(out.get("OS/2")!, [[4, Math.round(axes.wght)]]));
  // head: no checksum adjustment, long loca offsets.
  out.set("head", patch(need("head"), [[8, 0], [10, 0], [50, 1]]));
  out.set("hhea", patch(hhea, [[10, Math.max(...advances)], [34, glyphs.length]]));
  out.set("glyf", Uint8Array.from(glyf.bytes));
  out.set("loca", Uint8Array.from(loca.bytes));
  out.set("hmtx", Uint8Array.from(metrics.bytes));
  return sfnt(out);
}
