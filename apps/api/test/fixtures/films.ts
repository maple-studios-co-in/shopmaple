/**
 * Small, structurally complete films for tests, built byte by byte (CI has no encoder): an MP4 is an `ftyp` box, a
 * `moov` index with a movie header and one track header, and an `mdat` of filler; a WebM is an EBML header and a segment
 * with its information, one video track and a cluster. `seed` varies the filler so each film has its own hash.
 */
const u32 = (value: number) => { const bytes = Buffer.alloc(4); bytes.writeUInt32BE(value); return bytes; };
const box = (type: string, ...parts: Buffer[]) => { const body = Buffer.concat(parts); return Buffer.concat([u32(body.length + 8), Buffer.from(type, "latin1"), body]); };
const filler = (length: number, seed: number) => Buffer.from(Array.from({ length }, (_, i) => (i * 31 + seed * 7) & 0xff));

export function mp4Film({ seed = 1, durationMs = 2500, width = 1280, height = 720, faststart = true, brands = ["isom", "iso2", "avc1", "mp41"], payload = 2048 } = {}) {
  const ftyp = box("ftyp", Buffer.from(brands[0]!, "latin1"), u32(512), ...brands.map(brand => Buffer.from(brand, "latin1")));
  const mvhd = Buffer.alloc(100); mvhd.writeUInt32BE(1000, 12); mvhd.writeUInt32BE(durationMs, 16);
  const tkhd = Buffer.alloc(84); tkhd.writeUInt32BE(width * 65536, 76); tkhd.writeUInt32BE(height * 65536, 80);
  const moov = box("moov", box("mvhd", mvhd), box("trak", box("tkhd", tkhd)));
  const mdat = box("mdat", filler(payload, seed));
  return Buffer.concat(faststart ? [ftyp, moov, mdat] : [ftyp, mdat, moov]);
}

/** An EBML element with an eight-byte size, as muxers write segments and clusters. */
const element = (id: number[], ...parts: Buffer[]) => {
  const body = Buffer.concat(parts), size = Buffer.alloc(8);
  size[0] = 0x01; size.writeUIntBE(body.length, 2, 6);
  return Buffer.concat([Buffer.from(id), size, body]);
};
const uint = (value: number) => { const bytes = Buffer.alloc(4); bytes.writeUInt32BE(value); return bytes; };
export function webmFilm({ seed = 1, durationMs = 4000, width = 640, height = 360, docType = "webm", payload = 2048 } = {}) {
  const duration = Buffer.alloc(8); duration.writeDoubleBE(durationMs);
  const header = element([0x1a, 0x45, 0xdf, 0xa3], element([0x42, 0x86], Buffer.from([1])), element([0x42, 0x82], Buffer.from(docType, "latin1")));
  const segment = element([0x18, 0x53, 0x80, 0x67],
    element([0x15, 0x49, 0xa9, 0x66], element([0x2a, 0xd7, 0xb1], uint(1_000_000)), element([0x44, 0x89], duration)),
    element([0x16, 0x54, 0xae, 0x6b], element([0xae], element([0xd7], Buffer.from([1])), element([0xe0], element([0xb0], uint(width)), element([0xba], uint(height))))),
    element([0x1f, 0x43, 0xb6, 0x75], element([0xe7], Buffer.from([0])), element([0xa3], filler(payload, seed))));
  return Buffer.concat([header, segment]);
}
