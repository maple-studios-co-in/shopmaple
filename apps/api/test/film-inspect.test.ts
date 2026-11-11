import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, open, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FilmInvalid, inspectFilm, sniffFilm, type FilmContainer } from "../src/admin/film-inspect.js";
import { byteRange } from "../src/admin/media.js";
import { mp4Film, webmFilm } from "./fixtures/films.js";

async function inspect(bytes: Buffer, container: FilmContainer) {
  const dir = await mkdtemp(join(tmpdir(), "film-inspect-")), path = join(dir, "film");
  await writeFile(path, bytes);
  const file = await open(path, "r");
  try { return await inspectFilm(file, bytes.length, container); } finally { await file.close(); await rm(dir, { recursive: true, force: true }); }
}

test("recognises MP4 by its ftyp brands and WebM by its EBML doctype, and nothing else", () => {
  assert.equal(sniffFilm(mp4Film()), "mp4");
  assert.equal(sniffFilm(mp4Film({ brands: ["mp42", "mp42"] })), "mp4");
  assert.equal(sniffFilm(webmFilm()), "webm");
  // QuickTime and 3GP files carry an ftyp box too, but browsers do not all play them.
  assert.equal(sniffFilm(mp4Film({ brands: ["qt  "] })), null);
  assert.equal(sniffFilm(mp4Film({ brands: ["3gp4"] })), null);
  assert.equal(sniffFilm(webmFilm({ docType: "matroska" })), null);
  assert.equal(sniffFilm(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>")), null);
  assert.equal(sniffFilm(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])), null);
  assert.equal(sniffFilm(Buffer.alloc(0)), null);
});

test("reads an MP4's running time, frame size and whether its index comes first", async () => {
  assert.deepEqual(await inspect(mp4Film({ durationMs: 8400, width: 1920, height: 1080 }), "mp4"), { container: "mp4", durationMs: 8400, width: 1920, height: 1080, faststart: true });
  assert.equal((await inspect(mp4Film({ faststart: false }), "mp4")).faststart, false);
});

test("reads a WebM's running time and frame size", async () => {
  assert.deepEqual(await inspect(webmFilm({ durationMs: 12_345, width: 720, height: 1280 }), "webm"), { container: "webm", durationMs: 12_345, width: 720, height: 1280, faststart: null });
});

test("a cut-off or padded film is not a film", async () => {
  const film = mp4Film();
  await assert.rejects(inspect(film.subarray(0, film.length - 10), "mp4"), FilmInvalid);
  await assert.rejects(inspect(Buffer.concat([film, Buffer.from("junk")]), "mp4"), FilmInvalid);
  const webm = webmFilm();
  await assert.rejects(inspect(webm.subarray(0, webm.length - 10), "webm"), FilmInvalid);
  // An MP4 without its index (moov) cannot play.
  const ftypOnly = film.subarray(0, film.readUInt32BE(0));
  await assert.rejects(inspect(ftypOnly, "mp4"), FilmInvalid);
});

test("a version 1 movie header too short to hold its times is skipped, not a server error", async () => {
  const box = (type: string, body: Buffer) => { const head = Buffer.alloc(8); head.writeUInt32BE(body.length + 8); head.write(type, 4, "latin1"); return Buffer.concat([head, body]); };
  const tkhd = Buffer.alloc(84); tkhd.writeUInt32BE(640 * 65536, 76); tkhd.writeUInt32BE(360 * 65536, 80);
  const mvhd = Buffer.alloc(20); mvhd[0] = 1; // version 1, cut off before its timescale and duration end
  const film = Buffer.concat([box("ftyp", Buffer.from("isomisom", "latin1")), box("moov", Buffer.concat([box("trak", box("tkhd", tkhd)), box("mvhd", mvhd)])), box("mdat", Buffer.alloc(64))]);
  const facts = await inspect(film, "mp4");
  assert.equal(facts.durationMs, null); assert.equal(facts.width, 640);
});

test("byte ranges follow RFC 9110 for one range and fall back to the whole file otherwise", () => {
  assert.deepEqual(byteRange("bytes=0-99", 1000), { start: 0, end: 99 });
  assert.deepEqual(byteRange("bytes=0-", 1000), { start: 0, end: 999 });
  assert.deepEqual(byteRange("bytes=900-5000", 1000), { start: 900, end: 999 });
  assert.deepEqual(byteRange("bytes=-100", 1000), { start: 900, end: 999 });
  assert.deepEqual(byteRange("bytes=-5000", 1000), { start: 0, end: 999 });
  assert.equal(byteRange("bytes=1000-", 1000), "unsatisfiable");
  assert.equal(byteRange("bytes=-0", 1000), "unsatisfiable");
  for (const header of [undefined, "", "bytes=0-1,5-9", "items=0-9", "bytes=9-1", "bytes=-"]) assert.equal(byteRange(header, 1000), null, String(header));
});
