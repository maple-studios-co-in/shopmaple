import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { after, before, beforeEach, test } from "node:test";
import { Prisma, PrismaClient } from "@prisma/client";
import request from "supertest";
import type { QuoteSnapshot } from "@shopmaple/contracts";
import {
  accountErrorSchema,
  accountOverviewResponseSchema,
  accountProfileResponseSchema,
  addressListResponseSchema,
  addressMutationResponseSchema,
  orderDetailSchema,
  orderListResponseSchema,
  signInVerifyResponseSchema,
} from "@shopmaple/contracts/account";
import { createApp, type AppConfig } from "../src/app.js";
import type { SignInCodeMessage } from "../src/account/config.js";
import { createOrderService, type ReservationPort } from "../src/orders/service.js";
import { backfillOrderLinks } from "../src/orders/order-links.js";
import { createRazorpayGateway } from "../src/payments/razorpay.js";

// Customer accounts against the dedicated test database (owner's spec, 10 Nov 2026; security review, 11 Nov), including
// the adversarial cases: enumeration, brute force, expired and reused codes, codes tied to the browser that asked for
// them, failed-try budgets, IPv6 networks, the store-wide cap, lock waits, other customers' orders and addresses,
// forged, expired and rotated cookies, Origin rejection and the cookies' flags.
const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== "/shopmaple_test")
  throw new Error("Tests require the dedicated shopmaple_test database");
const db = new PrismaClient({ datasources: { db: { url } } });
const origin = "http://localhost:3000";
const codeSecret = "account-db-test-secret-at-least-32-characters";
let clock = new Date("2026-11-11T10:00:00.000Z");
let sent: SignInCodeMessage[] = [];
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function app(overrides: Partial<AppConfig> = {}, accounts: Partial<NonNullable<AppConfig["accounts"]>> = {}) {
  return createApp(db, {
    webOrigin: origin, catalogMode: "preview", secureCookies: false, trustProxyLoopback: true,
    accounts: { codeSecret, now: () => new Date(clock), sendCode: async (message) => { sent.push(message); }, ...accounts },
    ...overrides,
  });
}
type App = ReturnType<typeof createApp>;

/** A browser: its network (sent as X-Forwarded-For through the trusted local proxy) and the cookies the API set. */
type Browser = { network: string; jar: Map<string, string> };
const browser = (network = "203.0.113.10"): Browser => ({ network, jar: new Map() });
const setCookies = (response: request.Response) => ([] as string[]).concat(response.headers["set-cookie"] ?? []);
function keep(target: Browser, response: request.Response) {
  for (const line of setCookies(response)) {
    const pair = line.split(";")[0]!;
    const name = pair.slice(0, pair.indexOf("=")), value = pair.slice(pair.indexOf("=") + 1);
    if (!value || line.includes("Expires=Thu, 01 Jan 1970")) target.jar.delete(name);
    else target.jar.set(name, value);
  }
  return response;
}
function from(call: request.Test, client: Browser) {
  const withHeaders = call.set("Origin", origin).set("X-Forwarded-For", client.network);
  return client.jar.size ? withHeaders.set("Cookie", [...client.jar].map(([name, value]) => `${name}=${value}`).join("; ")) : withHeaders;
}
const start = async (target: App, email: string, client: Browser = browser()) =>
  keep(client, await from(request(target).post("/api/account/sign-in/start"), client).send({ email }));
const verify = async (target: App, email: string, code: string, client: Browser = browser()) =>
  keep(client, await from(request(target).post("/api/account/sign-in/verify"), client).send({ email, code }));
const lastCodeFor = (email: string) => [...sent].reverse().find((message) => message.to === email)?.code;
const wrongCodes = (code: string, count: number) =>
  Array.from({ length: count }, (_, i) => String((Number(code) + 1 + i) % 1_000_000).padStart(6, "0"));
const sessionOf = (response: request.Response) => {
  const header = setCookies(response).find((line) => /^(?:__Host-)?maple_account=[a-f0-9]{64};/.test(line));
  assert.ok(header, `no session cookie in ${setCookies(response).join(" | ")}`);
  const [, name, token] = /^((?:__Host-)?maple_account)=([a-f0-9]{64});/.exec(header)!;
  return { cookie: `${name}=${token}`, token: token!, header };
};
async function signIn(target: App, email: string, client: Browser = browser()) {
  assert.equal((await start(target, email, client)).status, 202);
  const code = lastCodeFor(email);
  assert.ok(code, "a code was issued");
  const response = await verify(target, email, code, client);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return { ...sessionOf(response), body: response.body, browser: client };
}

before(async () => { await db.$connect(); });
beforeEach(async () => {
  clock = new Date("2026-11-11T10:00:00.000Z");
  sent = [];
  await db.$executeRawUnsafe(`DELETE FROM "CustomerLoginChallenge"`);
  await db.$executeRawUnsafe(`DO $$ BEGIN IF to_regclass('"CustomerSignInFailure"') IS NOT NULL THEN DELETE FROM "CustomerSignInFailure"; END IF; END $$`);
  await db.customer.deleteMany();
  await db.orderNotification.deleteMany();
  await db.orderOutbox.deleteMany();
  await db.paymentWebhookInbox.deleteMany();
  await db.checkoutAttempt.deleteMany();
  await db.cartItem.deleteMany({ where: { cartId: "account-cart" } });
  await db.cart.deleteMany({ where: { id: "account-cart" } });
  await db.product.deleteMany({ where: { id: { startsWith: "keeri:maple:account-" } } });
});
after(async () => { await db.$disconnect(); });

test("start answers 202 with the same body and cookie whether the email is known, new or over a limit", async () => {
  const api = app();
  await db.customer.create({ data: { emailKey: "known@example.com", name: "Known Customer" } });
  const known = await start(api, "known@example.com");
  const unknown = await start(api, "nobody-yet@example.com");
  const signInCookie = /^maple_signin=[a-f0-9]{64}; Max-Age=600; Path=\/; Expires=[^;]+; HttpOnly; SameSite=Lax$/;
  for (const response of [known, unknown]) {
    assert.equal(response.status, 202);
    assert.deepEqual(response.body, { ok: true });
    assert.match(setCookies(response).join(), signInCookie, "a sign-in cookie ties the code to this browser");
    assert.match(String(response.headers["cache-control"]), /no-store/);
  }
  assert.deepEqual(sent.map((message) => message.to), ["known@example.com", "nobody-yet@example.com"], "both get a code: sign-in creates the account");
  // Two more for the known address from this network reach its 15-minute limit; the answer does not change.
  await start(api, "known@example.com");
  await start(api, "known@example.com");
  const limited = await start(api, "known@example.com");
  assert.equal(limited.status, 202);
  assert.deepEqual(limited.body, known.body);
  assert.match(setCookies(limited).join(), signInCookie);
  assert.deepEqual(Object.keys(limited.headers).filter((name) => name !== "date" && name !== "ratelimit").sort(),
    Object.keys(known.headers).filter((name) => name !== "date" && name !== "ratelimit").sort());
  assert.equal(sent.filter((message) => message.to === "known@example.com").length, 3, "the fourth code in 15 minutes is not sent");
  assert.equal((await start(api, "not an email")).status, 400, "only malformed input is refused");
});

test("code limits are counted in the database per email and network, per email a day and per network, IPv6 by /64", async () => {
  let api = app();
  for (let i = 0; i < 3; i++) await start(api, "asha@example.com", browser("198.51.100.1"));
  api = app(); // a restarted API process keeps counting
  await start(api, "asha@example.com", browser("198.51.100.1"));
  assert.equal(sent.length, 3, "a fourth code for this email from this network within 15 minutes is not sent");
  await start(api, "asha@example.com", browser("198.51.100.2"));
  assert.equal(sent.length, 4, "another network can still ask, so one network cannot block a customer");
  for (let n = 3; n < 20 && sent.length < 10; n++) await start(api, "asha@example.com", browser(`198.51.100.${n}`));
  assert.equal(sent.length, 10);
  await start(api, "asha@example.com", browser("198.51.100.99"));
  assert.equal(sent.length, 10, "at most ten codes a day for one email");
  sent = [];
  for (let i = 0; i < 12; i++) await start(api, `visitor${i}@example.com`, browser("192.0.2.50"));
  assert.equal(sent.length, 10, "ten an hour from one network");
  sent = [];
  for (let i = 0; i < 11; i++) await start(api, `phone${i}@example.com`, browser(`2001:db8:1:2::${(i + 1).toString(16)}`));
  assert.equal(sent.length, 10, "every address in an IPv6 /64 is one network");
  await start(api, "phone99@example.com", browser("2001:db8:1:3::1"));
  assert.equal(sent.length, 11, "the next /64 is another network");
  sent = [];
  for (let i = 0; i < 9; i++) await start(api, `mapped${i}@example.com`, browser("198.51.100.200"));
  await start(api, "mapped9@example.com", browser("::ffff:198.51.100.200"));
  await start(api, "mapped10@example.com", browser("198.51.100.200"));
  assert.equal(sent.length, 10, "an IPv4-mapped address is the same network as the IPv4 address");
  const stored = await db.customerLoginChallenge.findFirstOrThrow({ where: { emailKey: "mapped9@example.com" } });
  assert.equal(stored.ipHash.includes("198.51.100"), false, "the network is stored only as a keyed hash");
  assert.equal(stored.codeHash.includes(sent.find((message) => message.to === "mapped9@example.com")!.code), false, "the code is stored only as a keyed hash");
});

test("a code signs in once, within ten minutes, for its own email; asking again in the same browser voids the older one", async () => {
  const api = app();
  const asha = browser();
  await start(api, "asha@example.com", asha);
  const first = lastCodeFor("asha@example.com")!;
  await start(api, "asha@example.com", asha);
  const second = lastCodeFor("asha@example.com")!;
  const error = async (email: string, code: string, client: Browser) => {
    const response = await verify(api, email, code, client);
    assert.equal(response.status, 400);
    assert.equal(setCookies(response).some((line) => line.startsWith("maple_account=")), false, "no session on a failure");
    return accountErrorSchema.parse(response.body).code;
  };
  const stale = await db.customerLoginChallenge.findFirstOrThrow({ where: { emailKey: "asha@example.com" }, orderBy: { createdAt: "asc" } });
  assert.ok(stale.expiresAt <= clock, "the first code was voided when the same browser asked again");
  if (first !== second) assert.equal(await error("asha@example.com", first, asha), "CODE_INVALID", "the older code no longer works");
  assert.equal(await error("ravi@example.com", second, asha), "CODE_INVALID", "a code belongs to its own email");
  assert.equal(await error("never-started@example.com", wrongCodes(second, 1)[0]!, asha), "CODE_INVALID", "no code waiting answers like a wrong one");
  assert.equal(await error("asha@example.com", "12ab56", asha), "CODE_INVALID");
  const signedIn = await verify(api, "ASHA@Example.com ", second, asha);
  assert.equal(signedIn.status, 200);
  assert.deepEqual(signInVerifyResponseSchema.parse(signedIn.body), { customer: { name: null, email: "asha@example.com", phone: null } });
  assert.equal(await error("asha@example.com", second, asha), "CODE_INVALID", "a used code cannot sign in again");
  const ravi = browser("198.51.100.5");
  await start(api, "ravi@example.com", ravi);
  clock = new Date(clock.getTime() + 10 * 60_000);
  assert.equal(await error("ravi@example.com", lastCodeFor("ravi@example.com")!, ravi), "CODE_EXPIRED");
  assert.equal(await db.customer.count(), 1, "only a verified email becomes an account");
});

test("five wrong tries end a code even when sent at once, and no fresh tries come without a fresh code", async () => {
  const api = app();
  const asha = browser();
  await start(api, "asha@example.com", asha);
  const code = lastCodeFor("asha@example.com")!;
  const answers = (await Promise.all(wrongCodes(code, 7).map((guess) => verify(api, "asha@example.com", guess, asha)))).map((response) => response.body.code);
  assert.deepEqual(answers.filter((answer) => answer === "CODE_INVALID").length, 4);
  assert.deepEqual(answers.filter((answer) => answer === "TOO_MANY_ATTEMPTS").length, 3);
  assert.equal((await db.customerLoginChallenge.findFirstOrThrow({ where: { emailKey: "asha@example.com" } })).attempts, 5);
  assert.equal((await verify(api, "asha@example.com", code, asha)).body.code, "TOO_MANY_ATTEMPTS", "even the right code is refused now");
  await start(api, "asha@example.com", asha);
  await start(api, "asha@example.com", asha);
  await start(api, "asha@example.com", asha);
  assert.equal(sent.length, 3, "the fourth code in 15 minutes from this network is not sent");
  const latest = lastCodeFor("asha@example.com")!;
  for (const guess of wrongCodes(latest, 5)) await verify(api, "asha@example.com", guess, asha);
  assert.equal((await verify(api, "asha@example.com", latest, asha)).body.code, "TOO_MANY_ATTEMPTS");
  assert.equal(await db.customerSession.count(), 0);
});

test("a code works only in the browser that asked for it: an outsider can neither burn its tries nor void it", async () => {
  const api = app();
  const customer = browser("198.51.100.20");
  await start(api, "asha@example.com", customer);
  const code = lastCodeFor("asha@example.com")!;
  const outsider = browser("203.0.113.66");
  for (const guess of wrongCodes(code, 10))
    assert.equal((await verify(api, "asha@example.com", guess, outsider)).body.code, "CODE_INVALID");
  assert.equal((await db.customerLoginChallenge.findFirstOrThrow({ where: { emailKey: "asha@example.com" } })).attempts, 0,
    "the outsider's guesses never reached the customer's code");
  await start(api, "asha@example.com", outsider); // a code of the outsider's own, sent to the customer's inbox
  assert.equal(sent.length, 2);
  for (const guess of wrongCodes(lastCodeFor("asha@example.com")!, 5)) await verify(api, "asha@example.com", guess, outsider);
  const signedIn = await verify(api, "asha@example.com", code, customer);
  assert.equal(signedIn.status, 200, "the customer's code was neither voided nor burned");
  assert.ok(setCookies(signedIn).some((line) => /^maple_signin=; .*Expires=Thu, 01 Jan 1970/.test(line)), "the sign-in cookie is cleared");
  assert.equal(customer.jar.has("maple_signin"), false);
  assert.equal(customer.jar.has("maple_account"), true);
});

test("failed tries are capped at 20 an hour per network, a whole IPv6 /64 counting as one", async () => {
  const api = app({}, { requestGuard: { limit: 1000, windowMs: 60_000 } });
  for (let i = 0; i < 20; i++)
    assert.equal((await verify(api, `target${i}@example.com`, "123456", browser(`2001:db8:9:9::${(i + 1).toString(16)}`))).body.code, "CODE_INVALID");
  const neighbour = browser("2001:db8:9:9::abc");
  await start(api, "neighbour@example.com", neighbour);
  assert.equal((await verify(api, "neighbour@example.com", lastCodeFor("neighbour@example.com")!, neighbour)).body.code, "TOO_MANY_ATTEMPTS",
    "the /64 has used its failed tries for the hour");
  const elsewhere = browser("198.51.100.30");
  await start(api, "elsewhere@example.com", elsewhere);
  assert.equal((await verify(api, "elsewhere@example.com", lastCodeFor("elsewhere@example.com")!, elsewhere)).status, 200, "other networks are unaffected");
  clock = new Date(clock.getTime() + 60 * 60_000 + 1000);
  await start(api, "neighbour@example.com", neighbour);
  assert.equal((await verify(api, "neighbour@example.com", lastCodeFor("neighbour@example.com")!, neighbour)).status, 200, "an hour later it can try again");
});

test("once an email has 10 failed tries in a day each new code gets one try, and a customer who hasn't mistyped still gets in", async () => {
  const api = app();
  for (const network of ["203.0.113.71", "203.0.113.72"]) {
    const outsider = browser(network);
    await start(api, "bud@example.com", outsider);
    for (const guess of wrongCodes(lastCodeFor("bud@example.com")!, 5)) await verify(api, "bud@example.com", guess, outsider);
  }
  const outsider = browser("203.0.113.73");
  await start(api, "bud@example.com", outsider);
  const fresh = lastCodeFor("bud@example.com")!;
  assert.equal((await verify(api, "bud@example.com", wrongCodes(fresh, 1)[0]!, outsider)).body.code, "CODE_INVALID", "a new code still gets one try");
  assert.equal((await verify(api, "bud@example.com", fresh, outsider)).body.code, "TOO_MANY_ATTEMPTS", "and no second one, even with the right code");
  const customer = browser("198.51.100.40");
  await start(api, "bud@example.com", customer);
  assert.equal((await verify(api, "bud@example.com", lastCodeFor("bud@example.com")!, customer)).status, 200,
    "outsiders cannot lock out a customer who hasn't mistyped");
});

test("a store-wide cap of 300 sign-in emails an hour holds codes back and logs one line with no personal data", async () => {
  // Written so it seeds the same rows before and after the sign-in cookie column existed (the RED run used the old schema).
  const nonce = "nonceHash" in Prisma.CustomerLoginChallengeScalarFieldEnum;
  const seeded = Array.from({ length: 300 }, (_, i) => ({
    id: randomUUID(), emailKey: `seed${i}@example.com`, codeHash: sha256(`code${i}`), ipHash: sha256(`network${i}`),
    expiresAt: new Date(clock.getTime() + 5 * 60_000), createdAt: new Date(clock.getTime() - 5 * 60_000),
    ...(nonce ? { nonceHash: sha256(`nonce${i}`) } : {}),
  }));
  await db.customerLoginChallenge.createMany({ data: seeded as Prisma.CustomerLoginChallengeCreateManyInput[] });
  const lines: string[] = [];
  const api = app({}, { log: (line) => lines.push(line) });
  assert.equal((await start(api, "asha@example.com", browser("198.51.100.50"))).status, 202);
  assert.equal((await start(api, "ravi@example.com", browser("198.51.100.51"))).status, 202);
  assert.equal(sent.length, 0, "no code while the store-wide cap is reached");
  assert.equal(lines.length, 1, "one line, however many starts meet the cap");
  assert.match(lines[0]!, /sign-in email cap/i);
  assert.equal(/@|asha|ravi|198\.51/.test(lines[0]!), false, "no personal data in it");
  clock = new Date(clock.getTime() + 60 * 60_000);
  await start(api, "asha@example.com", browser("198.51.100.50"));
  assert.equal(sent.length, 1, "codes resume once the hour's count falls");
});

test("a start that waits on a held lock gives up after two seconds, still answers 202 and sends nothing", async () => {
  const api = app();
  let released = Number.POSITIVE_INFINITY;
  const holder = db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(7702::int, hashtext(${"email:locked@example.com"}))::text`;
    await sleep(6000);
    released = Date.now();
  }, { timeout: 20_000, maxWait: 5_000 });
  for (let i = 0; i < 50; i++) {
    const [held] = await db.$queryRaw<Array<{ n: number }>>`SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory' AND granted`;
    if (held!.n > 0) break;
    await sleep(100);
  }
  const response = await start(api, "locked@example.com", browser("198.51.100.60"));
  const answered = Date.now();
  await holder;
  assert.equal(response.status, 202);
  assert.deepEqual(response.body, { ok: true });
  assert.ok(answered < released, "it gave up instead of holding a database connection until the lock was released");
  assert.equal(sent.length, 0);
});

test("an in-memory guard per network turns floods away before any database work", async () => {
  const api = app({}, { requestGuard: { limit: 2, windowMs: 60_000 } });
  for (const email of ["one@example.com", "two@example.com", "three@example.com"]) {
    const response = await start(api, email, browser("198.51.100.70"));
    assert.equal(response.status, 202);
    assert.deepEqual(response.body, { ok: true });
    assert.ok(setCookies(response).some((line) => line.startsWith("maple_signin=")), "the same answer, cookie included");
  }
  assert.equal(await db.customerLoginChallenge.count({ where: { emailKey: "three@example.com" } }), 0, "the third start never reached the database");
  const answers: string[] = [];
  for (let i = 0; i < 3; i++) answers.push((await verify(api, "one@example.com", "123456", browser("198.51.100.71"))).body.code);
  assert.deepEqual(answers, ["CODE_INVALID", "CODE_INVALID", "TOO_MANY_ATTEMPTS"]);
});

test("the session cookie carries the right flags, rotates on a new sign-in, and only its SHA-256 is stored", async () => {
  const development = await signIn(app(), "asha@example.com");
  for (const flag of ["Max-Age=2592000", "Path=/", "HttpOnly", "SameSite=Lax"]) assert.ok(development.header.includes(flag), flag);
  assert.equal(development.header.includes("Secure"), false);
  assert.match(development.cookie, /^maple_account=/);
  const production = await signIn(app({ secureCookies: true }), "ravi@example.com");
  assert.match(production.cookie, /^__Host-maple_account=/);
  for (const flag of ["Secure", "HttpOnly", "SameSite=Lax", "Path=/"]) assert.ok(production.header.includes(flag), flag);
  assert.equal(/Domain=/i.test(production.header), false);
  assert.equal(production.browser.jar.has("__Host-maple_signin"), false, "the production sign-in cookie is cleared too");
  const stored = await db.customerSession.findMany();
  assert.deepEqual(stored.map((row) => row.tokenHash).sort(), [sha256(development.token), sha256(production.token)].sort());
  assert.equal(JSON.stringify(stored).includes(development.token), false, "the raw token is never stored");
  // Production never reads the unprefixed name, which a sibling domain could plant.
  assert.equal((await request(app({ secureCookies: true })).get("/api/account").set("Cookie", `maple_account=${production.token}`)).status, 401);

  const api = app();
  const rotated = await signIn(api, "asha@example.com", development.browser);
  assert.notEqual(rotated.token, development.token);
  assert.equal((await request(api).get("/api/account").set("Cookie", development.cookie)).status, 401, "the replaced session is gone");
  assert.equal((await request(api).get("/api/account").set("Cookie", rotated.cookie)).status, 200);
  const otherDevice = await signIn(api, "asha@example.com", browser("198.51.100.90"));
  assert.equal((await request(api).get("/api/account").set("Cookie", otherDevice.cookie)).status, 200, "another device keeps its own session");
  assert.equal(await db.customerSession.count({ where: { customer: { emailKey: "asha@example.com" } } }), 2);
});

test("sign-out deletes the session and clears the cookie; forged and expired cookies are refused", async () => {
  const api = app();
  const session = await signIn(api, "asha@example.com");
  const out = await request(api).post("/api/account/sign-out").set("Origin", origin).set("Cookie", session.cookie);
  assert.equal(out.status, 204);
  assert.match(String(out.headers["set-cookie"]), /^maple_account=; .*Expires=Thu, 01 Jan 1970 00:00:00 GMT/);
  assert.equal(await db.customerSession.count(), 0);
  const replayed = await request(api).get("/api/account").set("Cookie", session.cookie);
  assert.equal(replayed.status, 401);
  assert.equal(replayed.body.code, "ACCOUNT_AUTH_REQUIRED");
  assert.equal((await request(api).post("/api/account/sign-out").set("Origin", origin)).status, 204, "signing out twice is harmless");

  for (const forged of [`maple_account=${"f".repeat(64)}`, "maple_account=not-a-token", `maple_account=${session.token.toUpperCase()}`]) {
    const response = await request(api).get("/api/account/orders").set("Cookie", forged);
    assert.equal(response.status, 401, forged);
    assert.match(String(response.headers["set-cookie"]), /^maple_account=; /, "a bad cookie is cleared");
  }
  assert.equal((await request(api).get("/api/account")).status, 401, "no cookie at all");

  const fresh = await signIn(api, "asha@example.com", browser("198.51.100.91"));
  clock = new Date(clock.getTime() + 30 * 24 * 60 * 60_000);
  assert.equal((await request(api).get("/api/account").set("Cookie", fresh.cookie)).status, 401, "30 days later");
  assert.equal(await db.customerSession.count(), 0, "an expired session is deleted on sight");
});

test("every account write must come from the Maple website", async () => {
  const api = app();
  const session = await signIn(api, "asha@example.com");
  const writes: Array<[string, () => request.Test]> = [
    ["start", () => request(api).post("/api/account/sign-in/start").send({ email: "asha@example.com" })],
    ["verify", () => request(api).post("/api/account/sign-in/verify").send({ email: "asha@example.com", code: "123456" })],
    ["sign-out", () => request(api).post("/api/account/sign-out").set("Cookie", session.cookie)],
    ["profile", () => request(api).patch("/api/account").set("Cookie", session.cookie).send({ name: "Mallory" })],
    ["add address", () => request(api).post("/api/account/addresses").set("Cookie", session.cookie)
      .send({ name: "Mallory", line1: "1 Road", city: "Pune", state: "27", pin: "411001", phone: "9876543210" })],
  ];
  for (const [name, call] of writes) {
    for (const bad of [undefined, "https://evil.example", "http://localhost:3000.evil.example"]) {
      const pending = call();
      const response = await (bad ? pending.set("Origin", bad) : pending);
      assert.equal(response.status, 403, `${name} from ${bad}`);
      assert.equal(response.body.code, "ORIGIN_REJECTED");
    }
  }
  assert.equal(sent.length, 1, "no code was issued by a rejected request");
  assert.equal(await db.customerAddress.count(), 0);
  assert.equal((await db.customer.findFirstOrThrow()).name, null);
  assert.equal(await db.customerSession.count(), 1, "the rejected sign-out changed nothing");
});

// ---- Orders -----------------------------------------------------------------------------------------------------------

function snapshot(email: string, items: Array<{ id: string; title: string; variant: string; quantity: number; unit: number }>): QuoteSnapshot {
  const address = { line1: "12 Lake Road", line2: "", city: "Pune", stateCode: "27", pincode: "411001", country: "IN" as const };
  const lines = items.map((item) => ({
    variantId: `keeri:maple:${item.id}-v`, productId: `keeri:maple:${item.id}`, title: item.title, variantTitle: item.variant, sku: null,
    quantity: item.quantity, unitPricePaise: item.unit, lineTotalPaise: item.unit * item.quantity, hsn: "9401", taxRateBps: 1800,
    fulfilment: { kind: "stocked" as const, leadTimeDays: null },
  }));
  const subtotalPaise = lines.reduce((sum, line) => sum + line.lineTotalPaise, 0);
  return {
    version: 2, currency: "INR", policyId: "fixture-v1", quoteId: `quote_${randomUUID().slice(0, 8)}`, expiresAt: "2026-11-11T10:10:00.000Z",
    customer: { name: "Test Buyer", email, phone: "+919876543210" }, billingAddress: address, shippingAddress: address,
    deliveryMethodId: "standard", gstMode: "included", items: lines, subtotalPaise, shippingPaise: 50_000,
    taxPaise: Math.round(((subtotalPaise + 50_000) * 18) / 118), totalPaise: subtotalPaise + 50_000,
    delivery: { source: "carrier", carrierPriced: true, fallbackReason: null,
      carrier: { provider: "shiprocket", courierId: 51, courierName: "Delhivery Surface", estimatedDays: 5, chargeWeightGrams: 30_000 } },
  };
}
async function paidAttempt(input: {
  email: string; orderNumber: number | null; state: string; capturedAt?: Date; merchantScope?: string; confirmed?: boolean;
  item?: { id: string; title: string; variant: string; quantity: number; unit: number }; bindings?: Prisma.InputJsonValue;
}) {
  const id = randomUUID();
  const item = input.item ?? { id: "account-chair", title: "Test Chair", variant: "Oak", quantity: 2, unit: 150_000 };
  const quote = snapshot(input.email, [item]);
  const paid = ["captured", "paid_hold_lapsed"].includes(input.state);
  await db.checkoutAttempt.create({
    data: {
      id, cartId: `cart-${id}`, merchantScope: input.merchantScope ?? "maple-store", idempotencyKey: `key-${id}`, receipt: `sm_${id.replaceAll("-", "")}`,
      snapshot: quote as unknown as Prisma.InputJsonObject, amountPaise: quote.totalPaise, state: input.state,
      paymentId: paid ? `pay_${id.slice(0, 8)}` : null, capturedAt: paid ? (input.capturedAt ?? clock) : null,
      customerEmailKey: input.email, orderNumber: input.orderNumber,
      ...(input.bindings ? { catalogueBindings: input.bindings } : {}),
    },
  });
  if (input.confirmed)
    await db.orderOutbox.create({ data: { attemptId: id, kind: "keeri.order.captured.v2", payload: {}, state: "delivered", externalOrderId: "SO-77",
      deliveredAt: new Date((input.capturedAt ?? clock).getTime() + 60_000) } });
  return id;
}

test("a customer sees only their own paid orders, newest first, and any other order number is the same 404", async () => {
  await db.product.create({ data: {
    id: "keeri:maple:account-sofa", handle: "account-sofa", title: "Arlo Sofa", description: "", images: ["https://store.maple.example.com/media/keeri/arlo.webp"],
    published: true, source: "keeri:maple", sourceUpdatedAt: clock,
    variants: { create: { id: "account-sofa-local", title: "Oat", pricePaise: 4_200_000, images: [] } },
  } });
  const bindings = { version: 1, tenantId: "maple", items: [{ localVariantId: "account-sofa-local", localProductId: "keeri:maple:account-sofa",
    sourceVariantId: "keeri:maple:account-sofa-v", sourceProductId: "keeri:maple:account-sofa" }] };
  const hour = (n: number) => new Date(clock.getTime() + n * 3_600_000);
  await paidAttempt({ email: "asha@example.com", orderNumber: 10001, state: "captured", capturedAt: hour(-3), confirmed: true,
    item: { id: "account-sofa", title: "Arlo Sofa", variant: "Oat", quantity: 1, unit: 4_200_000 }, bindings });
  await paidAttempt({ email: "asha@example.com", orderNumber: 10002, state: "paid_hold_lapsed", capturedAt: hour(-2) });
  await paidAttempt({ email: "asha@example.com", orderNumber: 10003, state: "captured", capturedAt: hour(-1) });
  await paidAttempt({ email: "asha@example.com", orderNumber: null, state: "reconciliation_required" });
  await paidAttempt({ email: "asha@example.com", orderNumber: null, state: "awaiting_payment" });
  await paidAttempt({ email: "asha@example.com", orderNumber: 10005, state: "captured", merchantScope: "maple-staging" });
  await paidAttempt({ email: "ravi@example.com", orderNumber: 10004, state: "captured", confirmed: true });
  const api = app({}, { merchantScope: "maple-store" });
  const asha = await signIn(api, "asha@example.com");
  const ravi = await signIn(api, "ravi@example.com");

  const list = orderListResponseSchema.parse((await request(api).get("/api/account/orders").set("Cookie", asha.cookie)).body);
  assert.deepEqual(list.orders.map((order) => [order.number, order.status]), [["MF-10003", "confirming"], ["MF-10002", "confirming"], ["MF-10001", "confirmed"]]);
  assert.equal(list.orders[2]!.firstItem.imageUrl, "https://store.maple.example.com/media/keeri/arlo.webp", "the photo the product card shows");
  assert.equal(list.orders[0]!.firstItem.imageUrl, null, "no catalogue match, no photo");
  assert.equal(list.orders[1]!.itemCount, 2);

  for (const number of ["MF-10001", "10001", "mf-10001"]) {
    const detail = await request(api).get(`/api/account/orders/${number}`).set("Cookie", asha.cookie);
    assert.equal(detail.status, 200, number);
    const order = orderDetailSchema.parse(detail.body);
    assert.equal(order.number, "MF-10001");
    assert.deepEqual(order.journey.map((step) => step.state), ["done", "upcoming", "upcoming", "upcoming"]);
    assert.equal(order.journey[0]!.at, new Date(hour(-3).getTime() + 60_000).toISOString(), "when Keeri accepted it");
    assert.match(order.payment.reference, /^pay_/);
    assert.equal(order.delivery.phone, "+91 ••••• •3210", "the delivery phone is masked; the owner of a mistyped email sees only its end");
  }
  const missing = await request(api).get("/api/account/orders/MF-99999").set("Cookie", asha.cookie);
  assert.equal(missing.status, 404);
  for (const notYours of ["MF-10004", "MF-10005", "abc", "MF-0", "99999999999"]) {
    const response = await request(api).get(`/api/account/orders/${encodeURIComponent(notYours)}`).set("Cookie", asha.cookie);
    assert.equal(response.status, 404, notYours);
    assert.deepEqual(response.body, missing.body, `${notYours} answers exactly like an order that does not exist`);
  }
  assert.equal((await request(api).get("/api/account/orders/MF-10004").set("Cookie", ravi.cookie)).status, 200, "Ravi's own order opens");
  assert.equal((await request(api).get("/api/account/orders/MF-10001")).status, 401);

  const overview = accountOverviewResponseSchema.parse((await request(api).get("/api/account").set("Cookie", asha.cookie)).body);
  assert.deepEqual(overview.counts, { orders: 3, addresses: 0 });
  assert.equal(overview.latestOrder?.number, "MF-10003");
  assert.equal(overview.defaultAddress, null);
});

test("addresses: at most ten, exactly one default, and another customer's address is a 404", async () => {
  const api = app();
  const asha = await signIn(api, "asha@example.com");
  const ravi = await signIn(api, "ravi@example.com");
  const address = (n: number, extra: object = {}) => ({ name: `Asha ${n}`, line1: `${n} Lake Road`, city: "Pune", state: "27", pin: "411001", phone: "98765 43210", ...extra });
  const add = async (cookie: string, body: object) => request(api).post("/api/account/addresses").set("Origin", origin).set("Cookie", cookie).send(body);
  const defaults = (list: Array<{ isDefault: boolean; name: string }>) => list.filter((entry) => entry.isDefault).map((entry) => entry.name);

  const first = addressMutationResponseSchema.parse((await add(asha.cookie, address(1))).body);
  assert.equal(first.address.isDefault, true, "the first address is the default");
  assert.equal(first.address.phone, "+919876543210");
  assert.equal(first.address.line2, "");
  clock = new Date(clock.getTime() + 1000);
  const second = addressMutationResponseSchema.parse((await add(asha.cookie, address(2))).body);
  assert.equal(second.address.isDefault, false);
  clock = new Date(clock.getTime() + 1000);
  const third = addressMutationResponseSchema.parse((await add(asha.cookie, address(3, { isDefault: true }))).body);
  assert.deepEqual(defaults(third.addresses), ["Asha 3"]);

  const moved = await request(api).patch(`/api/account/addresses/${second.address.id}`).set("Origin", origin).set("Cookie", asha.cookie).send({ isDefault: true, line2: "Flat 2" });
  assert.equal(moved.status, 200);
  const afterMove = addressMutationResponseSchema.parse(moved.body);
  assert.deepEqual(defaults(afterMove.addresses), ["Asha 2"]);
  assert.equal(afterMove.address.line2, "Flat 2");
  assert.equal(afterMove.addresses[0]!.id, second.address.id, "the default is listed first");

  // A place's name (Figma 392:1527: "Home", "Studio"): none until given, kept trimmed, and cleared when emptied.
  assert.equal(first.address.label, "", "an address saved without a name has none");
  const named = addressMutationResponseSchema.parse((await add(asha.cookie, address(4, { label: "  Studio  " }))).body);
  assert.equal(named.address.label, "Studio");
  const renamed = await request(api).patch(`/api/account/addresses/${named.address.id}`).set("Origin", origin).set("Cookie", asha.cookie).send({ label: "Home" });
  assert.equal(addressMutationResponseSchema.parse(renamed.body).address.label, "Home");
  const unnamed = await request(api).patch(`/api/account/addresses/${named.address.id}`).set("Origin", origin).set("Cookie", asha.cookie).send({ label: "" });
  assert.equal(addressMutationResponseSchema.parse(unnamed.body).address.label, "");
  assert.equal((await db.customerAddress.findUniqueOrThrow({ where: { id: named.address.id } })).label, null, "an emptied name is stored as none");
  const tooLong = await request(api).patch(`/api/account/addresses/${named.address.id}`).set("Origin", origin).set("Cookie", asha.cookie).send({ label: "x".repeat(41) });
  assert.equal(tooLong.status, 400);
  await request(api).delete(`/api/account/addresses/${named.address.id}`).set("Origin", origin).set("Cookie", asha.cookie);

  // Ravi cannot see, change or delete Asha's address, and gets the same 404 as for an address that does not exist.
  const ghost = await request(api).patch(`/api/account/addresses/${randomUUID()}`).set("Origin", origin).set("Cookie", ravi.cookie).send({ name: "x" });
  assert.equal(ghost.status, 404);
  for (const call of [
    request(api).patch(`/api/account/addresses/${second.address.id}`).set("Origin", origin).set("Cookie", ravi.cookie).send({ name: "Mallory" }),
    request(api).delete(`/api/account/addresses/${second.address.id}`).set("Origin", origin).set("Cookie", ravi.cookie),
    request(api).patch("/api/account/addresses/not-a-uuid").set("Origin", origin).set("Cookie", asha.cookie).send({ name: "x" }),
  ]) {
    const response = await call;
    assert.equal(response.status, 404);
    assert.deepEqual(response.body, ghost.body);
  }
  assert.deepEqual(addressListResponseSchema.parse((await request(api).get("/api/account/addresses").set("Cookie", ravi.cookie)).body).addresses, []);
  assert.equal((await db.customerAddress.findUniqueOrThrow({ where: { id: second.address.id } })).name, "Asha 2");

  for (const bad of [{}, { isDefault: false }, { pin: "011001" }])
    assert.equal((await request(api).patch(`/api/account/addresses/${first.address.id}`).set("Origin", origin).set("Cookie", asha.cookie).send(bad)).status, 400, JSON.stringify(bad));

  const deleted = await request(api).delete(`/api/account/addresses/${second.address.id}`).set("Origin", origin).set("Cookie", asha.cookie);
  assert.equal(deleted.status, 200);
  const remaining = addressListResponseSchema.parse(deleted.body).addresses;
  assert.equal(remaining.length, 2);
  assert.equal(defaults(remaining).length, 1, "deleting the default hands it to another address");

  for (let n = 4; n <= 11; n++) await add(asha.cookie, address(n));
  const full = await add(asha.cookie, address(12));
  assert.equal(full.status, 409);
  assert.equal(full.body.code, "ADDRESS_LIMIT");
  assert.equal(await db.customerAddress.count({ where: { customer: { emailKey: "asha@example.com" } } }), 10);
  const overview = accountOverviewResponseSchema.parse((await request(api).get("/api/account").set("Cookie", asha.cookie)).body);
  assert.equal(overview.counts.addresses, 10);
  assert.equal(overview.defaultAddress?.isDefault, true);
  assert.equal(await db.customerAddress.count({ where: { isDefault: true, customer: { emailKey: "asha@example.com" } } }), 1);
});

test("profile: name and phone change and clear; the email cannot", async () => {
  const api = app();
  const asha = await signIn(api, "asha@example.com");
  const patch = (body: object) => request(api).patch("/api/account").set("Origin", origin).set("Cookie", asha.cookie).send(body);
  assert.deepEqual(accountProfileResponseSchema.parse((await patch({ name: " Asha Rao ", phone: "098765 43210" })).body),
    { customer: { name: "Asha Rao", email: "asha@example.com", phone: "+919876543210" } });
  assert.equal((await patch({ email: "mallory@example.com" })).status, 400);
  assert.deepEqual((await patch({ phone: null })).body, { customer: { name: "Asha Rao", email: "asha@example.com", phone: null } });
  assert.equal((await db.customer.findFirstOrThrow()).emailKey, "asha@example.com");
});

test("with accounts off every /api/account route is a 404, and health reports the flag", async () => {
  const off = app({ accounts: null });
  assert.equal((await request(off).get("/api/health")).body.accountsEnabled, false);
  assert.equal((await request(app()).get("/api/health")).body.accountsEnabled, true);
  for (const call of [
    request(off).get("/api/account"),
    request(off).get("/api/account/orders/MF-10001"),
    request(off).post("/api/account/sign-in/start").set("Origin", origin).send({ email: "asha@example.com" }),
  ]) {
    const response = await call;
    assert.equal(response.status, 404);
    assert.equal(response.body.code, "NOT_FOUND");
  }
  assert.equal(await db.customerLoginChallenge.count(), 0);
});

// ---- Order numbers ------------------------------------------------------------------------------------------------------

test("capture assigns MF numbers from 10001 up, never reused, and links the buyer's email from the frozen quote", async () => {
  const cartToken = "9".repeat(64);
  await db.product.create({ data: {
    id: "keeri:maple:account-chair", handle: "account-chair", title: "Test Chair", description: "", images: [], published: true,
    source: "keeri:maple", sourceUpdatedAt: clock, identities: { create: { source: "keeri:maple", externalId: "keeri:maple:account-chair" } },
    variants: { create: { id: "keeri:maple:account-chair-v", title: "Oak", pricePaise: 150_000, available: true, published: true, stockPolicy: "stocked",
      identities: { create: { source: "keeri:maple", externalId: "keeri:maple:account-chair-v" } } } },
  } });
  const address = { line1: "12 Lake Road", line2: "", city: "Pune", stateCode: "27", pincode: "411001", country: "IN" };
  const input = { customer: { name: "Test Buyer", email: "Buyer.Two@Example.com", phone: "9876543210" }, billingAddress: address, shippingAddress: address, deliveryMethodId: "standard" };
  const canonical = (x: unknown): string => Array.isArray(x) ? `[${x.map(canonical).join(",")}]`
    : x !== null && typeof x === "object" ? `{${Object.keys(x).sort().map((k) => `${JSON.stringify(k)}:${canonical((x as Record<string, unknown>)[k])}`).join(",")}}`
    : JSON.stringify(x);
  const reservations: ReservationPort = {
    reserve: async (r) => ({ ...r, reservationId: `hold-${r.attemptId}`, verified: true, expiresAt: new Date(clock.getTime() + 10 * 60_000) }),
    verify: async () => true,
  };
  let order = 0;
  const orders = createOrderService(db, {
    merchantScope: "maple-store", keeriTenantId: "maple", reservations, now: () => new Date(clock),
    quoteAuthority: async (request: unknown) => {
      const body = request as { items: Array<{ variantId: string; quantity: number }>; customer: { name: string; email: string; phone: string } };
      const quote = { ...snapshot(body.customer.email, [{ id: "account-chair", title: "Test Chair", variant: "Oak", quantity: body.items[0]!.quantity, unit: 150_000 }]),
        customer: body.customer, expiresAt: new Date(clock.getTime() + 10 * 60_000).toISOString(), gstMode: "excluded" as const };
      quote.taxPaise = 0;
      quote.totalPaise = quote.subtotalPaise + quote.shippingPaise;
      return { version: 2, quoteId: quote.quoteId, expiresAt: quote.expiresAt, snapshotSha256: sha256(canonical(quote)), snapshot: quote };
    },
    gateway: createRazorpayGateway({ keyId: "rzp_test_accounts", keySecret: "accounts-key", webhookSecret: "accounts-webhook" }, {
      fetch: async (path, options) => {
        if (options.method === "POST") {
          const body = JSON.parse(String(options.body)) as Record<string, unknown>;
          order++;
          return Response.json({ entity: "order", id: `order_accounts${order}`, ...body, status: "created", amount_paid: 0, amount_due: body.amount });
        }
        return Response.json({ entity: "payment", id: path.split("/").at(-1), order_id: `order_accounts${order}`, amount: 350_000, currency: "INR",
          status: "captured", captured: true, amount_refunded: 0, refund_status: null });
      },
    }),
  });
  async function pay(key: string) {
    await db.cartItem.deleteMany({ where: { cartId: "account-cart" } });
    await db.cart.deleteMany({ where: { id: "account-cart" } });
    await db.cart.create({ data: { id: "account-cart", tokenHash: sha256(cartToken), expiresAt: new Date("2027-01-01"),
      items: { create: { variantId: "keeri:maple:account-chair-v", quantity: 2 } } } });
    const frozen = await orders.freezeCart(cartToken, key, input);
    assert.equal(frozen.customerEmailKey, "buyer.two@example.com", "linked when the quote froze the attempt");
    assert.equal(frozen.orderNumber, null, "no number before the payment");
    const awaiting = await orders.createProviderOrder(cartToken, frozen.id);
    const inbox = await db.paymentWebhookInbox.create({ data: { merchantScope: "maple-store", eventId: `event-${key}`, bodySha256: sha256(key),
      eventType: "payment.captured", providerOrderId: awaiting.providerOrderId, paymentId: `pay_${key.replaceAll("-", "")}` } });
    await orders.processWebhook(inbox.id);
    return db.checkoutAttempt.findUniqueOrThrow({ where: { id: frozen.id } });
  }
  const one = await pay("accounts-order-1");
  clock = new Date(clock.getTime() + 60_000);
  const two = await pay("accounts-order-2");
  assert.equal(one.state, "captured");
  assert.ok(one.orderNumber! >= 10001, "the sequence starts at 10001");
  assert.ok(two.orderNumber! > one.orderNumber!, "each capture takes the next number");
  await orders.processWebhook((await db.paymentWebhookInbox.findFirstOrThrow({ where: { eventId: "event-accounts-order-1" } })).id);
  assert.equal((await db.checkoutAttempt.findUniqueOrThrow({ where: { id: one.id } })).orderNumber, one.orderNumber, "a replayed payment keeps its number");
  // The guest's cart-cookie path still finds the order; the buyer's account lists it under Maple's number.
  assert.equal((await orders.getAttempt(cartToken, two.id)).id, two.id);
  const api = app({}, { merchantScope: "maple-store" });
  const buyer = await signIn(api, "buyer.two@example.com");
  const list = orderListResponseSchema.parse((await request(api).get("/api/account/orders").set("Cookie", buyer.cookie)).body);
  assert.deepEqual(list.orders.map((entry) => entry.number), [`MF-${two.orderNumber}`, `MF-${one.orderNumber}`]);
});

test("start-up catch-up numbers and links what the previous release captured, once", async () => {
  const earlier = await paidAttempt({ email: "x@example.com", orderNumber: null, state: "captured", capturedAt: new Date(clock.getTime() - 120_000) });
  const later = await paidAttempt({ email: "x@example.com", orderNumber: null, state: "paid_hold_lapsed", capturedAt: new Date(clock.getTime() - 60_000) });
  const unpaid = await paidAttempt({ email: "x@example.com", orderNumber: null, state: "awaiting_payment" });
  // As the previous release left them: no email key either.
  await db.checkoutAttempt.updateMany({ where: { id: { in: [earlier, later, unpaid] } }, data: { customerEmailKey: null } });
  const first = await backfillOrderLinks(db);
  assert.deepEqual(first, { linked: 3, numbered: 2 });
  const rows = await db.checkoutAttempt.findMany({ where: { id: { in: [earlier, later, unpaid] } } });
  const byId = new Map(rows.map((row) => [row.id, row]));
  assert.ok(byId.get(earlier)!.orderNumber! < byId.get(later)!.orderNumber!, "numbered in capture order");
  assert.equal(byId.get(unpaid)!.orderNumber, null, "only paid attempts get a number");
  assert.ok(rows.every((row) => row.customerEmailKey === "x@example.com"));
  assert.deepEqual(await backfillOrderLinks(db), { linked: 0, numbered: 0 }, "running again changes nothing");
});

// ---- Passwords (Figma 392:1652 login, 392:1697 sign-up; 11 Nov 2026) -------------------------------------------------

const startFor = async (target: App, email: string, purpose: "sign-in" | "sign-up" | "reset", client: Browser = browser()) =>
  keep(client, await from(request(target).post("/api/account/sign-in/start"), client).send({ email, purpose }));
const verifyWith = async (target: App, body: Record<string, unknown>, client: Browser) =>
  keep(client, await from(request(target).post("/api/account/sign-in/verify"), client).send(body));
const withPassword = async (target: App, email: string, password: string, client: Browser = browser()) =>
  keep(client, await from(request(target).post("/api/account/sign-in/password"), client).send({ email, password }));
const roomy = { requestGuard: { limit: 10_000, windowMs: 60_000 } };
async function signUp(target: App, email: string, password: string, name = "Aditi Sharma", client: Browser = browser()) {
  assert.equal((await startFor(target, email, "sign-up", client)).status, 202);
  const response = await verifyWith(target, { email, code: lastCodeFor(email), password, name }, client);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return { ...sessionOf(response), browser: client };
}

test("sign-up proves the email with a code, keeps the password hashed and the name, and the password then signs in", async () => {
  const api = app({}, roomy);
  await signUp(api, "aditi.sharma@example.com", "maple2026");
  assert.deepEqual(sent.map(({ to, purpose, hasPassword }) => ({ to, purpose, hasPassword })),
    [{ to: "aditi.sharma@example.com", purpose: "sign-up", hasPassword: false }]);
  const saved = await db.customer.findUniqueOrThrow({ where: { emailKey: "aditi.sharma@example.com" } });
  assert.equal(saved.name, "Aditi Sharma");
  assert.match(saved.passwordHash ?? "", /^scrypt\$15\$8\$3\$/);
  assert.equal(saved.passwordHash!.includes("maple2026"), false);
  assert.deepEqual(saved.passwordSetAt, clock);

  const laptop = browser("198.51.100.20");
  const response = await withPassword(api, "  Aditi.Sharma@Example.com ", "maple2026", laptop);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.deepEqual(signInVerifyResponseSchema.parse(response.body).customer, { name: "Aditi Sharma", email: "aditi.sharma@example.com", phone: null });
  const session = sessionOf(response);
  assert.match(session.header, /HttpOnly; SameSite=Lax$/);
  assert.equal(await db.customerSession.count({ where: { tokenHash: sha256(session.token) } }), 1, "only the token's SHA-256 is stored");
  assert.equal((await from(request(api).get("/api/account"), laptop)).status, 200);
});

test("a wrong password, an unknown email and an account without a password get one answer", async () => {
  const api = app({}, roomy);
  await signUp(api, "aditi.sharma@example.com", "maple2026");
  await db.customer.create({ data: { emailKey: "codes-only@example.com" } });
  const answers: unknown[] = [];
  const tries: Array<[string, string]> = [["aditi.sharma@example.com", "maple2027"], ["nobody@example.com", "maple2026"], ["codes-only@example.com", "maple2026"]];
  for (const [email, password] of tries) {
    const response = await withPassword(api, email, password, browser(`198.51.100.${answers.length + 30}`));
    assert.equal(response.status, 400);
    assert.equal(setCookies(response).some((line) => line.includes("maple_account=")), false, "no session");
    answers.push(response.body);
  }
  assert.deepEqual(answers[1], answers[0]);
  assert.deepEqual(answers[2], answers[0]);
  assert.equal(accountErrorSchema.parse(answers[0]).code, "CREDENTIALS_INVALID");
  assert.equal((await withPassword(api, "not an email", "maple2026")).status, 400);
});

test("a password that breaks the rules is refused before the code is looked at, so it spends no try", async () => {
  const api = app({}, roomy);
  const client = browser();
  await startFor(api, "aditi.sharma@example.com", "sign-up", client);
  const code = lastCodeFor("aditi.sharma@example.com");
  for (const weak of ["short1", "no-digits-here", "x".repeat(129) + "1"]) {
    const refused = await verifyWith(api, { email: "aditi.sharma@example.com", code, password: weak }, client);
    assert.equal(refused.status, 400, weak);
    assert.equal(refused.body.code, "INVALID_INPUT", weak);
  }
  const challenge = await db.customerLoginChallenge.findFirstOrThrow({ where: { emailKey: "aditi.sharma@example.com" } });
  assert.equal(challenge.attempts, 0);
  assert.equal(await db.customer.count(), 0, "nothing was created");
  assert.equal((await verifyWith(api, { email: "aditi.sharma@example.com", code, password: "maple2026", name: "Aditi Sharma" }, client)).status, 200);
});

test("a name fills only an account without one, and a sign-up for an address with a password says so in the email alone", async () => {
  const api = app({}, roomy);
  await db.customer.create({ data: { emailKey: "known@example.com", name: "Known Customer" } });
  await signUp(api, "known@example.com", "maple2026", "Someone Else");
  assert.equal((await db.customer.findUniqueOrThrow({ where: { emailKey: "known@example.com" } })).name, "Known Customer");
  const first = await startFor(api, "known@example.com", "sign-up");
  const fresh = await startFor(api, "brand-new@example.com", "sign-up");
  assert.deepEqual(first.body, fresh.body);
  assert.equal(first.status, fresh.status);
  assert.deepEqual(sent.slice(-2).map(({ to, hasPassword }) => [to, hasPassword]), [["known@example.com", true], ["brand-new@example.com", false]]);
});

test("a reset replaces the password, signs every other device out, and the old password stops working", async () => {
  const api = app({}, roomy);
  await signUp(api, "aditi.sharma@example.com", "maple2026");
  const phone = browser("198.51.100.41");
  assert.equal((await withPassword(api, "aditi.sharma@example.com", "maple2026", phone)).status, 200);
  assert.equal((await from(request(api).get("/api/account"), phone)).status, 200);

  const laptop = browser("198.51.100.42");
  assert.equal((await startFor(api, "aditi.sharma@example.com", "reset", laptop)).status, 202);
  assert.equal(sent.at(-1)!.purpose, "reset");
  const reset = await verifyWith(api, { email: "aditi.sharma@example.com", code: lastCodeFor("aditi.sharma@example.com"), password: "newmaple77" }, laptop);
  assert.equal(reset.status, 200);
  assert.equal((await from(request(api).get("/api/account"), laptop)).status, 200, "the device that reset is signed in");
  assert.equal((await from(request(api).get("/api/account"), phone)).status, 401, "every other device is signed out");
  assert.equal((await withPassword(api, "aditi.sharma@example.com", "maple2026", browser("198.51.100.43"))).body.code, "CREDENTIALS_INVALID");
  assert.equal((await withPassword(api, "aditi.sharma@example.com", "newmaple77", browser("198.51.100.44"))).status, 200);
});

test("wrong passwords are budgeted: 10 a day for an email, 20 an hour for a network; an emailed code still gets in and clears the count", async () => {
  const api = app({}, roomy);
  await signUp(api, "aditi.sharma@example.com", "maple2026");
  for (let i = 0; i < 10; i++)
    assert.equal((await withPassword(api, "aditi.sharma@example.com", `guess${i}x`, browser(`203.0.113.${100 + i}`))).body.code, "CREDENTIALS_INVALID");
  const locked = await withPassword(api, "aditi.sharma@example.com", "maple2026", browser("198.51.100.50"));
  assert.equal(locked.status, 400);
  assert.equal(locked.body.code, "TOO_MANY_ATTEMPTS", "even the right password waits, so guessing cannot go on");
  // "Forgot password?": a fresh code always gets its first try, and proving the email clears its failures.
  const owner = browser("198.51.100.51");
  await startFor(api, "aditi.sharma@example.com", "reset", owner);
  assert.equal((await verifyWith(api, { email: "aditi.sharma@example.com", code: lastCodeFor("aditi.sharma@example.com"), password: "maple2026" }, owner)).status, 200);
  assert.equal((await withPassword(api, "aditi.sharma@example.com", "maple2026", browser("198.51.100.52"))).status, 200);
  // A day later the email's count has gone by itself too.
  for (let i = 0; i < 10; i++) await withPassword(api, "aditi.sharma@example.com", `again${i}x`, browser(`203.0.113.${150 + i}`));
  clock = new Date(clock.getTime() + 24 * 60 * 60_000 + 1000);
  assert.equal((await withPassword(api, "aditi.sharma@example.com", "maple2026", browser("198.51.100.53"))).status, 200);

  const guesser = browser("192.0.2.77");
  for (let i = 0; i < 20; i++) await withPassword(api, `person${i}@example.com`, "maple2026", guesser);
  const blocked = await withPassword(api, "aditi.sharma@example.com", "maple2026", guesser);
  assert.equal(blocked.body.code, "TOO_MANY_ATTEMPTS", "a network that failed 20 times in the hour waits");
  clock = new Date(clock.getTime() + 60 * 60_000 + 1000);
  assert.equal((await withPassword(api, "aditi.sharma@example.com", "maple2026", guesser)).status, 200, "and may try again after the hour");
});

test("a password sign-in replaces the browser's old session, and the guard turns floods away first", async () => {
  const api = app({}, roomy);
  const { browser: client, token: first } = await signUp(api, "aditi.sharma@example.com", "maple2026");
  const again = await withPassword(api, "aditi.sharma@example.com", "maple2026", client);
  assert.equal(again.status, 200);
  assert.notEqual(sessionOf(again).token, first);
  assert.equal(await db.customerSession.count({ where: { tokenHash: sha256(first) } }), 0, "the old session is gone");
  const guarded = app({}, { requestGuard: { limit: 2, windowMs: 60_000 } });
  const flood = browser("192.0.2.99");
  for (let i = 0; i < 2; i++) await withPassword(guarded, "aditi.sharma@example.com", "wrong-one-1", flood);
  const turned = await withPassword(guarded, "aditi.sharma@example.com", "maple2026", flood);
  assert.equal(turned.status, 400);
  assert.equal(turned.body.code, "TOO_MANY_ATTEMPTS");
  assert.equal(await db.customerSignInFailure.count({ where: { emailKey: "aditi.sharma@example.com" } }), 2, "the turned-away try never reached the database");
});

test("password sign-in, like every account write, must come from the Maple website", async () => {
  const api = app({}, roomy);
  await signUp(api, "aditi.sharma@example.com", "maple2026");
  const foreign = await request(api).post("/api/account/sign-in/password").set("Origin", "https://evil.example").set("X-Forwarded-For", "198.51.100.60")
    .send({ email: "aditi.sharma@example.com", password: "maple2026" });
  assert.equal(foreign.status, 403);
  assert.equal(setCookies(foreign).some((line) => line.includes("maple_account=")), false);
});
