import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const { apps } = createRequire(import.meta.url)("./ecosystem.config.cjs");
const megabytes = (value) => Number(/^(\d+)M$/.exec(value)?.[1]);

// Node only collects garbage when it nears its own heap ceiling, which defaults to gigabytes on the
// VPS. Without a cap the store grew about 0.9 MB per homepage view until PM2 killed it at its limit.
test("the store web process caps its heap well below PM2's memory restart", () => {
  const web = apps.find((app) => app.name === "shopmaple-web");
  const cap = Number(/--max-old-space-size=(\d+)/.exec(web.node_args)?.[1]);
  assert.ok(cap > 0, "shopmaple-web needs --max-old-space-size in node_args");
  // Code, buffers and native memory sit outside the heap; keep room for them.
  assert.ok(cap + 256 <= megabytes(web.max_memory_restart), `heap cap ${cap} MB leaves too little room under ${web.max_memory_restart}`);
  assert.match(web.node_args, /--env-file=\/home\/deploy\/shopmaple\/shared\/store\.env/);
});
