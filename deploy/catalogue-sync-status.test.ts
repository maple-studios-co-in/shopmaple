import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { reasonCode, recordSyncOutcome } from "./catalogue-sync-status.js";

function fixture(t: test.TestContext) {
  const dir = mkdtempSync(join(tmpdir(), "sync-status-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return join(dir, "catalogue-sync-status.json");
}
const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));

test("a success records when it happened and the catalogue size, privately", (t) => {
  const path = fixture(t);
  recordSyncOutcome(path, { ok: true, totalProducts: 385, totalVariants: 798 }, new Date("2026-11-12T03:00:00.000Z"));
  assert.deepEqual(read(path), {
    version: 1, ok: true, at: "2026-11-12T03:00:00.000Z", lastSuccessAt: "2026-11-12T03:00:00.000Z",
    consecutiveFailures: 0, totalProducts: 385, totalVariants: 798,
  });
  assert.equal(statSync(path).mode & 0o777, 0o600);
});

test("a failure keeps the last success time and counts consecutive failures with a reason code", (t) => {
  const path = fixture(t);
  recordSyncOutcome(path, { ok: true, totalProducts: 1, totalVariants: 2 }, new Date("2026-11-12T03:00:00.000Z"));
  recordSyncOutcome(path, { ok: false, reason: "KEERI_UNAVAILABLE" }, new Date("2026-11-12T03:05:00.000Z"));
  recordSyncOutcome(path, { ok: false, reason: "STALE_OR_FUTURE_SNAPSHOT" }, new Date("2026-11-12T03:10:00.000Z"));
  assert.deepEqual(read(path), {
    version: 1, ok: false, at: "2026-11-12T03:10:00.000Z", lastSuccessAt: "2026-11-12T03:00:00.000Z",
    consecutiveFailures: 2, reason: "STALE_OR_FUTURE_SNAPSHOT",
  });
});

test("a corrupt earlier file does not stop a new outcome being recorded", (t) => {
  const path = fixture(t);
  writeFileSync(path, "{not json");
  recordSyncOutcome(path, { ok: false, reason: "MISSING_CONFIGURATION" }, new Date("2026-11-12T03:00:00.000Z"));
  assert.equal(read(path).lastSuccessAt, null);
  assert.equal(read(path).consecutiveFailures, 1);
});

test("no path configured records nothing and does not throw", () => {
  assert.doesNotThrow(() => recordSyncOutcome(undefined, { ok: true }, new Date()));
});

test("reason codes are fixed upper-case identifiers; anything else, such as a message with details, becomes UNEXPECTED", () => {
  assert.equal(reasonCode(new Error("STALE_OR_FUTURE_SNAPSHOT")), "STALE_OR_FUTURE_SNAPSHOT");
  assert.equal(reasonCode(Object.assign(new Error("fetch failed for https://keeri/x?token=abc"), { code: "KEERI_TIMEOUT" })), "KEERI_TIMEOUT");
  assert.equal(reasonCode(new Error("connect ECONNREFUSED postgresql://user:secret@127.0.0.1")), "UNEXPECTED");
  assert.equal(reasonCode("text"), "UNEXPECTED");
});

test("the sync command still prints the quiet failure line and records the reason when configuration is missing", (t) => {
  const path = fixture(t);
  const result = spawnSync(process.execPath, ["--import", "tsx", new URL("./sync-store-catalogue.ts", import.meta.url).pathname], {
    encoding: "utf8",
    env: { PATH: process.env.PATH, CATALOGUE_SYNC_STATUS_FILE: path },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Store catalogue sync failed; existing catalogue retained\./);
  assert.match(result.stderr, /Reason code: MISSING_CONFIGURATION/);
  assert.equal(read(path).reason, "MISSING_CONFIGURATION");
});
