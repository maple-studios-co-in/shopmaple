import assert from "node:assert/strict";
import { test } from "node:test";
import { loadOrderLinkConfig, orderLinkPaths, orderLinkRef, parseOrderLinkRef } from "../src/orders/order-access.js";

const secret = "s".repeat(40);

test("an order's private reference is its number and a 128-bit keyed signature, the same every time", () => {
  const ref = orderLinkRef(secret, 10482);
  assert.match(ref, /^MF-10482-[a-f0-9]{32}$/);
  assert.equal(orderLinkRef(secret, 10482), ref);
  assert.notEqual(orderLinkRef(secret, 10483).slice(9), ref.slice(9));
  assert.notEqual(orderLinkRef("t".repeat(40), 10482), ref);
  assert.equal(parseOrderLinkRef(secret, ref), 10482);
});

test("a reference with a changed number, signature, key or shape opens nothing", () => {
  const ref = orderLinkRef(secret, 10482);
  const forged = [
    ref.replace("MF-10482", "MF-10483"), ref.slice(0, -1) + (ref.endsWith("0") ? "1" : "0"), ref.toUpperCase(), ref + "0", ref.slice(0, -2),
    "MF-10482", "10482-" + ref.slice(9), `${ref}-tracking`, "", "MF-0-" + "0".repeat(32), "../MF-10482", `MF-10482-${"g".repeat(32)}`,
  ];
  for (const bad of forged) assert.equal(parseOrderLinkRef(secret, bad), null, bad);
  assert.equal(parseOrderLinkRef("t".repeat(40), ref), null);
});

test("the store's order and tracking pages, and the ends Keeri's View order button carries", () => {
  const ref = orderLinkRef(secret, 7);
  assert.deepEqual(orderLinkPaths(secret, 7), {
    ref, view: `/orders/${ref}`, tracking: `/orders/${ref}/tracking`, whatsapp: { view: ref, tracking: `${ref}-tracking` },
  });
});

test("ORDER_LINK_SECRET switches private links on; unset leaves them off; a bad value switches off and logs, never stops startup", () => {
  const lines: string[] = [];
  const load = (env: Record<string, string>) => loadOrderLinkConfig(env, (line) => lines.push(line));
  assert.equal(load({}), null);
  assert.equal(load({ ORDER_LINK_SECRET: "  " }), null);
  assert.deepEqual(load({ ORDER_LINK_SECRET: secret }), { secret, whatsappLinks: false });
  assert.deepEqual(load({ ORDER_LINK_SECRET: secret, WHATSAPP_ORDER_LINKS: "true" }), { secret, whatsappLinks: true });
  assert.equal(lines.length, 0);

  // A short or overlong secret: links off, one line naming the setting and not its value.
  assert.equal(load({ ORDER_LINK_SECRET: "short-but-secret", WHATSAPP_ORDER_LINKS: "true" }), null);
  assert.equal(load({ ORDER_LINK_SECRET: "x".repeat(513) }), null);
  assert.equal(lines.length, 2);
  assert.match(lines[0]!, /^ORDER_LINK_SECRET must be 32 to 512 characters; private order links are off/);
  assert.ok(lines.every((line) => !line.includes("short-but-secret") && !line.includes("xxxx")));

  // The flag: anything but true/false leaves WhatsApp as before while the private links stay on; true without a
  // secret does nothing.
  lines.length = 0;
  assert.deepEqual(load({ ORDER_LINK_SECRET: secret, WHATSAPP_ORDER_LINKS: "yes" }), { secret, whatsappLinks: false });
  assert.equal(load({ WHATSAPP_ORDER_LINKS: "true" }), null);
  assert.equal(lines.length, 2);
  assert.match(lines[0]!, /^WHATSAPP_ORDER_LINKS must be true or false/);
  assert.match(lines[1]!, /^WHATSAPP_ORDER_LINKS=true needs ORDER_LINK_SECRET/);
});
