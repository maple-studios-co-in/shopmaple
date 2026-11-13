import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
// Next's own copy of path-to-regexp, which it matches redirect sources with (it ships no types).
type Match = (source: string, options: { decode: (part: string) => string }) => (path: string) => false | { params: Record<string, string> };
const { match } = createRequire(import.meta.url)("next/dist/compiled/path-to-regexp") as { match: Match };
import config from "../next.config";

const ref = "MF-10482-0123456789abcdef0123456789abcdef";

/** Where the redirects send a path, the way Next matches them: the first source that matches, in order. */
async function destination(path: string) {
  for (const redirect of await config.redirects!()) {
    const found = match(redirect.source, { decode: decodeURIComponent })(path);
    if (found) return redirect.destination.replace(/:([a-z]+)/g, (_, name: string) => found.params[name]!);
  }
  return null;
}

test("Keeri's WhatsApp View order button opens the order, or its tracking, behind the private link", async () => {
  assert.equal(await destination(`/account/orders/${ref}`), `/orders/${ref}`);
  assert.equal(await destination(`/account/orders/${ref}-tracking`), `/orders/${ref}/tracking`);
});

test("an order number alone still opens the account page, and anything else is left alone", async () => {
  // (Matching ignores case, as Next's does; an upper-case reference then fails the order page's own check, a 404.)
  for (const path of ["/account/orders/MF-10482", "/account/orders/10482", `/account/orders/${ref.slice(0, -1)}`, `/account/orders/${ref}x`])
    assert.equal(await destination(path), null, path);
});

test("the private pages are never stored and never leak their address in a Referer", async () => {
  const rules = (await config.headers!()).filter((rule) => rule.source === "/orders/:path*");
  assert.deepEqual(rules.flatMap((rule) => rule.headers), [
    { key: "Cache-Control", value: "private, no-store" }, { key: "Referrer-Policy", value: "no-referrer" },
  ]);
});
