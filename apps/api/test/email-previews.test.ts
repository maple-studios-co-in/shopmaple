import assert from "node:assert/strict";
import { test } from "node:test";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { createApp } from "../src/app.js";

// The preview needs no database; this client is never connected.
const unused = new PrismaClient({ datasources: { db: { url: "postgresql://unused:unused@127.0.0.1:1/unused" } } });
const path = "/api/previews/emails/order-confirmation";
/** The app as server.ts builds it under a given NODE_ENV, which is restored afterwards. */
function appUnder(nodeEnv: string | undefined) {
  const saved = process.env.NODE_ENV;
  if (nodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = nodeEnv;
  try {
    return createApp(unused, { webOrigin: "http://localhost:3000", catalogMode: "preview", secureCookies: false });
  } finally {
    if (saved === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = saved;
  }
}

test("development and test serve the real order email with the frame's sample order", async () => {
  for (const nodeEnv of ["development", "test"]) {
    const page = await request(appUnder(nodeEnv)).get(path);
    assert.equal(page.status, 200, nodeEnv);
    assert.match(page.headers["content-type"]!, /^text\/html; charset=utf-8/);
    assert.equal(page.headers["cache-control"], "no-store");
    assert.match(page.headers["content-security-policy"]!, /^default-src 'none'; img-src 'self' http:\/\/localhost:3000 https: data:;/);
    for (const words of ["<title>Your Maple Furnishers order MF-10482 is confirmed</title>", "Good things are<br>coming home.", "Hi Aditi,",
      ">ORDER #MF-10482<", ">10 NOVEMBER 2026<", ">Nola Accent Chair<", "Natural cane · Oak finish<br>Quantity 1", ">₹24,900<", ">₹1,500<",
      ">₹26,400<", "Paid online · Inclusive of applicable taxes", ">24–28 Nov 2026<", "14 Palm Avenue, Apartment 402<br>Bengaluru, Karnataka 560001",
      'src="http://localhost:3000/media/email/maple-logo.png"', "background-image:url(http://localhost:3000/media/previews/nola-accent-chair.webp)",
      'href="http://localhost:3000/account/orders/MF-10482"'])
      assert.ok(page.text.includes(words), `${nodeEnv}: ${words}`);
  }
  const app = appUnder("test");
  const text = await request(app).get(path).query({ format: "text" });
  assert.equal(text.status, 200);
  assert.match(text.headers["content-type"]!, /^text\/plain; charset=utf-8/);
  assert.match(text.text, /^Good things are coming home\.\n\nHi Aditi, your Maple order is confirmed\./);
  assert.ok(text.text.includes("Estimated delivery: 24–28 Nov 2026"));
  const received = await request(app).get(path).query({ kind: "received" });
  assert.equal(received.status, 200);
  assert.ok(received.text.includes("✓&nbsp; PAYMENT RECEIVED"));
  assert.ok(received.text.includes("<title>We&#39;ve received your payment for order MF-10482</title>"));
  const receivedText = await request(app).get(path).query({ kind: "received", format: "text" });
  assert.match(receivedText.text, /^We’ve received your payment\.\n/);
  assert.equal((await request(app).get(path).query({ kind: "shipped" })).status, 400);
});

test("production, an unset NODE_ENV or anything else has no preview route at all", async () => {
  for (const nodeEnv of ["production", undefined, "staging", ""]) {
    for (const query of [{}, { format: "text" }, { kind: "received" }]) {
      const response = await request(appUnder(nodeEnv)).get(path).query(query);
      assert.equal(response.status, 404, `${String(nodeEnv)} ${JSON.stringify(query)}`);
      assert.deepEqual(response.body, { code: "NOT_FOUND", message: "This endpoint does not exist." });
    }
  }
});
