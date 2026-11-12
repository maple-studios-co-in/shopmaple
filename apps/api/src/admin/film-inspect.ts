import type { FileHandle } from "node:fs/promises";

/**
 * Films are stored as uploaded (the server has no encoder), so this module only recognises them: an MP4 by its `ftyp`
 * box and a WebM by its EBML header, then reads the few facts the library shows (running time, frame size and whether
 * an MP4 can start playing before it has fully downloaded). It reads box and element headers at known offsets and never
 * decodes a frame.
 */
export type FilmContainer = "mp4" | "webm";
export type FilmFacts = { container: FilmContainer; durationMs: number | null; width: number | null; height: number | null; faststart: boolean | null };
export class FilmInvalid extends Error {}

/** The MP4 brands browsers play: ISO base media and MPEG-4 files with H.264 video (not QuickTime `qt  `, not 3GP). */
const mp4Brands = new Set(["isom", "iso2", "iso3", "iso4", "iso5", "iso6", "mp41", "mp42", "avc1", "M4V ", "M4VH", "M4VP", "dash", "msnv", "mmp4"]);
/** Bytes needed from the start of a file to recognise it: a whole `ftyp` box or EBML header fits. */
export const filmHeadBytes = 4096;

const fourcc = (bytes: Buffer, at: number) => bytes.toString("latin1", at, at + 4);

/** Which film container the first bytes declare, or null for anything else (including Matroska that is not WebM). */
export function sniffFilm(head: Buffer): FilmContainer | null {
  if (head.length >= 16 && fourcc(head, 4) === "ftyp") {
    const size = head.readUInt32BE(0);
    if (size < 16 || size > head.length || (size - 16) % 4 !== 0) return null;
    const brands = [fourcc(head, 8)];
    for (let at = 16; at < size; at += 4) brands.push(fourcc(head, at));
    return brands.some(brand => mp4Brands.has(brand)) ? "mp4" : null;
  }
  if (head.length >= 5 && head.readUInt32BE(0) === 0x1a45dfa3) {
    const header = element(head, 0);
    if (!header || header.size === null || header.end > head.length) return null;
    for (const child of children(head, header.start, header.end)) {
      if (child.id === 0x4282) return head.toString("latin1", child.start, child.end).replace(/\0+$/, "") === "webm" ? "webm" : null;
    }
  }
  return null;
}

/** Reads the facts of a stored film; throws FilmInvalid when its structure is not a complete film of that kind. */
export async function inspectFilm(file: FileHandle, size: number, container: FilmContainer): Promise<FilmFacts> {
  return container === "mp4" ? inspectMp4(file, size) : inspectWebm(file, size);
}

async function readAt(file: FileHandle, position: number, length: number) {
  const bytes = Buffer.alloc(length);
  let offset = 0;
  while (offset < length) {
    const { bytesRead } = await file.read(bytes, offset, length - offset, position + offset);
    if (!bytesRead) break;
    offset += bytesRead;
  }
  return offset === length ? bytes : bytes.subarray(0, offset);
}

type Box = { type: string; start: number; end: number };
/** The boxes laid end to end in `bytes` between `from` and `to`; a box that overruns its parent is invalid. */
function boxes(bytes: Buffer, from: number, to: number): Box[] {
  const found: Box[] = [];
  for (let at = from; at < to;) {
    if (to - at < 8) throw new FilmInvalid();
    let size = bytes.readUInt32BE(at), header = 8;
    if (size === 1) { if (to - at < 16) throw new FilmInvalid(); size = Number(bytes.readBigUInt64BE(at + 8)); header = 16; }
    else if (size === 0) size = to - at;
    if (size < header || at + size > to) throw new FilmInvalid();
    found.push({ type: fourcc(bytes, at + 4), start: at + header, end: at + size });
    at += size;
  }
  return found;
}

async function inspectMp4(file: FileHandle, size: number): Promise<FilmFacts> {
  // The top level must tile the whole file: a cut-off upload or trailing junk is not a film.
  const top: { type: string; offset: number; size: number; header: number }[] = [];
  for (let at = 0; at < size;) {
    if (top.length >= 10_000 || size - at < 8) throw new FilmInvalid();
    const head = await readAt(file, at, Math.min(16, size - at));
    let length = head.readUInt32BE(0), header = 8;
    if (length === 1) { if (head.length < 16) throw new FilmInvalid(); length = Number(head.readBigUInt64BE(8)); header = 16; }
    else if (length === 0) length = size - at;
    if (length < header || at + length > size) throw new FilmInvalid();
    top.push({ type: fourcc(head, 4), offset: at, size: length, header });
    at += length;
  }
  const moov = top.find(box => box.type === "moov"), mdat = top.find(box => box.type === "mdat");
  if (top[0]?.type !== "ftyp" || !moov || !mdat) throw new FilmInvalid();
  const facts: FilmFacts = { container: "mp4", durationMs: null, width: null, height: null, faststart: moov.offset < mdat.offset };
  // A film's index is usually well under a megabyte; an unusually large one is left unread rather than loaded.
  if (moov.size > 32 * 1024 * 1024) return facts;
  const index = await readAt(file, moov.offset, moov.size);
  if (index.length !== moov.size) throw new FilmInvalid();
  for (const box of boxes(index, moov.header, index.length)) {
    // A version 1 header holds 64-bit times, so it needs 32 bytes to reach the duration; version 0 needs 20.
    if (box.type === "mvhd" && box.end - box.start >= (index[box.start] === 1 ? 32 : 20)) {
      const version = index[box.start]!;
      const timescale = index.readUInt32BE(box.start + (version === 1 ? 20 : 12));
      const duration = version === 1 ? (box.end - box.start >= 32 ? Number(index.readBigUInt64BE(box.start + 24)) : 0) : index.readUInt32BE(box.start + 16);
      if (timescale > 0 && duration > 0 && duration !== 0xffffffff) facts.durationMs = Math.round(duration * 1000 / timescale);
    }
    if (box.type === "trak" && facts.width === null) {
      const header = boxes(index, box.start, box.end).find(child => child.type === "tkhd");
      if (!header) continue;
      const at = header.start + (index[header.start] === 1 ? 88 : 76);
      if (at + 8 > header.end) continue;
      const width = index.readUInt32BE(at) >>> 16, height = index.readUInt32BE(at + 4) >>> 16;
      if (width > 0 && height > 0) { facts.width = width; facts.height = height; }
    }
  }
  return facts;
}

type Element = { id: number; start: number; size: number | null; end: number };
/** An EBML element header at `at`: its ID (marker bits kept), where its data starts and its size (null when unknown). */
function element(bytes: Buffer, at: number): Element | null {
  if (at >= bytes.length) return null;
  const first = bytes[at]!;
  const idLength = Math.clz32(first) - 23;
  if (idLength < 1 || idLength > 4 || at + idLength > bytes.length) return null;
  let id = 0;
  for (let i = 0; i < idLength; i++) id = id * 256 + bytes[at + i]!;
  const sizeAt = at + idLength;
  if (sizeAt >= bytes.length) return null;
  const marker = bytes[sizeAt]!;
  const sizeLength = Math.clz32(marker) - 23;
  if (sizeLength < 1 || sizeLength > 8 || sizeAt + sizeLength > bytes.length) return null;
  let size = marker & (0xff >> sizeLength), unknown = size === (0xff >> sizeLength);
  for (let i = 1; i < sizeLength; i++) { const byte = bytes[sizeAt + i]!; size = size * 256 + byte; if (byte !== 0xff) unknown = false; }
  const start = sizeAt + sizeLength;
  return { id, start, size: unknown ? null : size, end: unknown ? Number.POSITIVE_INFINITY : start + size };
}
function* children(bytes: Buffer, from: number, to: number) {
  for (let at = from; at < Math.min(to, bytes.length);) {
    const child = element(bytes, at);
    if (!child) return;
    yield child;
    if (child.size === null) return;
    at = child.end;
  }
}
const unsigned = (bytes: Buffer, item: Element) => {
  let value = 0;
  for (let i = item.start; i < Math.min(item.end, bytes.length); i++) value = value * 256 + bytes[i]!;
  return value;
};

async function inspectWebm(file: FileHandle, size: number): Promise<FilmFacts> {
  // The header, segment information and track list sit before the first cluster, well inside the first 4 MiB.
  const bytes = await readAt(file, 0, Math.min(size, 4 * 1024 * 1024));
  const header = element(bytes, 0);
  if (!header || header.id !== 0x1a45dfa3 || header.size === null) throw new FilmInvalid();
  const segment = element(bytes, header.end);
  if (!segment || segment.id !== 0x18538067) throw new FilmInvalid();
  // A segment of known size must end where the file does: a cut-off upload is not a film.
  if (segment.size !== null && segment.end !== size) throw new FilmInvalid();
  const facts: FilmFacts = { container: "webm", durationMs: null, width: null, height: null, faststart: null };
  for (const item of children(bytes, segment.start, segment.end)) {
    if (item.id === 0x1f43b675) break;
    if (item.id === 0x1549a966) {
      let scale = 1_000_000, duration: number | null = null;
      for (const field of children(bytes, item.start, item.end)) {
        if (field.id === 0x2ad7b1) scale = unsigned(bytes, field);
        if (field.id === 0x4489 && field.end <= bytes.length) duration = field.size === 4 ? bytes.readFloatBE(field.start) : field.size === 8 ? bytes.readDoubleBE(field.start) : null;
      }
      if (duration !== null && Number.isFinite(duration) && duration > 0 && scale > 0) facts.durationMs = Math.round(duration * scale / 1_000_000);
    }
    if (item.id === 0x1654ae6b) {
      for (const track of children(bytes, item.start, item.end)) {
        if (track.id !== 0xae || facts.width !== null) continue;
        for (const video of children(bytes, track.start, track.end)) {
          if (video.id !== 0xe0) continue;
          let width = 0, height = 0;
          for (const field of children(bytes, video.start, video.end)) {
            if (field.id === 0xb0) width = unsigned(bytes, field);
            if (field.id === 0xba) height = unsigned(bytes, field);
          }
          if (width > 0 && height > 0) { facts.width = width; facts.height = height; }
        }
      }
    }
  }
  return facts;
}
