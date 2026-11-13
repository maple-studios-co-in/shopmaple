import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { createHash, randomBytes, scryptSync } from "node:crypto";
import { createApp, type AppConfig } from "../src/app.js";
import { loadAccountEmail } from "../src/account/config.js";
import { emergencyAccountProblem } from "../src/admin/emergency-reset.js";
import type { AdminSignIn } from "../src/admin/keeri-sign-in.js";

// "Forgot the emergency password": an emailed, one-time link for the emergency account only.
const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== "/shopmaple_test") throw Error("Dedicated test database required");
const db = new PrismaClient({ datasources: { db: { url } } });
const origin = "http://localhost:3000";
const base: AppConfig = { webOrigin: origin, catalogMode: "preview", secureCookies: false };
const owner = "owner@example.invalid";
const oldPassword = randomBytes(24).toString("base64url");
const newPassword = randomBytes(24).toString("base64url");
const hashOf = (password: string) => {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$131072$8$1$${salt}$${scryptSync(password, salt, 64, { N: 131072, r: 8, p: 1, maxmem: 192 * 1024 * 1024 }).toString("hex")}`;
};
const mailConfig = loadAccountEmail({ ENQUIRY_RESEND_API_KEY: "re_test_admin_reset", ENQUIRY_MAIL_FROM: "orders@maple.example.com", ENQUIRY_MAIL_TO: "staff@maple.example.com", WEB_ORIGIN: "https://store.maple.example.com" })!;

/** The mail service as the store sees it: every message it is asked to send. */
function outbox() {
  const sent: { to: string[]; subject: string; text: string }[] = [];
  const state = { accepts: true };
  const send: typeof fetch = async (_input, init) => {
    sent.push(JSON.parse(String(init?.body)));
    return state.accepts ? new Response(JSON.stringify({ id: "email_1" }), { status: 200, headers: { "Content-Type": "application/json" } }) : new Response("{}", { status: 500 });
  };
  return { sent, state, send };
}
type Outbox = ReturnType<typeof outbox>;
const mode = (mail: Outbox | null, emergencyEmail: string | null = owner): AdminSignIn => ({ mode: "keeri", ready: null, emergencyEmail, resetMail: mail ? { config: mailConfig, fetch: mail.send } : null });
const appWith = (mail: Outbox | null, emergencyEmail: string | null = owner) => createApp(db, { ...base, adminSignIn: mode(mail, emergencyEmail) });
const ask = (app: ReturnType<typeof createApp>, body: object = {}) => request(app).post("/api/admin/emergency/reset-request").set("Origin", origin).send(body);
const choose = (app: ReturnType<typeof createApp>, token: string, password = newPassword) => request(app).post("/api/admin/emergency/reset").set("Origin", origin).send({ token, password });
const signIn = (app: ReturnType<typeof createApp>, password: string, email = owner) => request(app).post("/api/admin/login").set("Origin", origin).send({ email, password });
const tokenIn = (text: string) => /#reset=([a-f0-9]{64})\b/.exec(text)?.[1] ?? "";
const quiet = async <T>(run: () => Promise<T>) => {
  const lines: string[] = [];
  const original = { warn: console.warn, error: console.error, log: console.log, info: console.info };
  for (const level of ["warn", "error", "log", "info"] as const) console[level] = (...values: unknown[]) => { lines.push(values.map(String).join(" ")); };
  try { return { result: await run(), lines }; } finally { Object.assign(console, original); }
};

async function wipe() {
  // Earlier test files leave drafts and revisions that point at their staff rows.
  await db.shopContentRevision.deleteMany();
  await db.shopContent.deleteMany();
  await db.shopAdminSession.deleteMany();
  await db.shopAdminSignIn.deleteMany();
  await db.shopAdminPasswordReset.deleteMany();
  await db.shopAdmin.deleteMany();
}
beforeEach(async () => {
  await wipe();
  await db.shopAdmin.create({ data: { email: owner, role: "publisher", passwordHash: hashOf(oldPassword) } });
  await db.shopAdmin.create({ data: { email: "other@example.invalid", role: "publisher", passwordHash: hashOf(oldPassword) } });
});
after(async () => { await wipe(); await db.$disconnect(); });

test("asking emails one link to the emergency account's own address, whatever the request says", async () => {
  const mail = outbox();
  const { result: response, lines } = await quiet(() => ask(appWith(mail), { email: "attacker@example.invalid", to: "attacker@example.invalid" }));
  assert.equal(response.status, 202);
  assert.match(response.body.message, /If the emergency account is set up/);
  assert.equal(mail.sent.length, 1);
  assert.deepEqual(mail.sent[0]!.to, [owner]);
  assert.match(mail.sent[0]!.subject, /emergency password/);
  const token = tokenIn(mail.sent[0]!.text);
  assert.ok(token, "the email carries the link");
  // After the #, so the secret part never reaches a server or an access log.
  assert.match(mail.sent[0]!.text, new RegExp(`${origin}/admin#reset=${token}`));
  assert.ok(!mail.sent[0]!.subject.includes(token));
  // Only the link's hash is stored; nothing shown or logged carries the link or the address.
  const rows = await db.shopAdminPasswordReset.findMany();
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.tokenHash, createHash("sha256").update(token).digest("hex"));
  assert.ok(!JSON.stringify(rows).includes(token));
  const seen = JSON.stringify([response.body, response.headers, lines]);
  assert.ok(!seen.includes(token) && !seen.includes(owner));
  assert.ok(rows[0]!.expiresAt.getTime() - rows[0]!.createdAt.getTime() <= 15 * 60_000 + 1000);
});

test("the link sets a new password once, ends the old sessions, and does not itself sign anybody in", async () => {
  const mail = outbox();
  const app = appWith(mail);
  const before = await quiet(() => signIn(app, oldPassword));
  const cookie = ([] as string[]).concat(before.result.headers["set-cookie"] ?? []).find((value) => value.startsWith("shop_admin="))!.split(";")[0]!;
  await quiet(() => ask(app));
  const token = tokenIn(mail.sent[0]!.text);
  const { result: done, lines } = await quiet(() => choose(app, token));
  assert.equal(done.status, 204);
  assert.equal(([] as string[]).concat(done.headers["set-cookie"] ?? []).length, 0);
  assert.ok(!JSON.stringify(lines).includes(token) && !JSON.stringify(lines).includes(newPassword));
  assert.equal((await request(app).get("/api/admin/session").set("Cookie", cookie)).status, 401);
  assert.equal((await signIn(app, oldPassword)).status, 401);
  const fresh = await quiet(() => signIn(app, newPassword));
  assert.equal(fresh.result.status, 200);
  assert.equal(fresh.result.body.user.emergency, true);
  // The same link again, even with a different password, does nothing.
  const again = await choose(app, token, randomBytes(24).toString("base64url"));
  assert.equal(again.status, 400);
  assert.equal(again.body.code, "RESET_LINK_INVALID");
  assert.equal((await quiet(() => signIn(app, newPassword))).result.status, 200);
  const row = await db.shopAdminPasswordReset.findFirstOrThrow();
  assert.ok(row.usedAt, "the record shows the link was used");
  // Nobody else's account was touched.
  assert.equal((await db.shopAdmin.findUniqueOrThrow({ where: { email: "other@example.invalid" } })).failedAttempts, 0);
});

test("two people opening the same link at once cannot both set a password", async () => {
  const mail = outbox();
  const app = appWith(mail);
  await quiet(() => ask(app));
  const token = tokenIn(mail.sent[0]!.text);
  const { result } = await quiet(() => Promise.all([choose(app, token, "first-choice-password-aaaa"), choose(app, token, "second-choice-password-bbbb")]));
  assert.deepEqual(result.map((response) => response.status).sort(), [204, 400]);
});

test("a lapsed link, a made-up link and a short password are each refused; asking again does not cancel a link", async () => {
  const mail = outbox();
  const app = appWith(mail);
  await quiet(() => ask(app));
  const first = tokenIn(mail.sent[0]!.text);
  // Too short: refused, and the link is still good afterwards.
  assert.equal((await choose(app, first, "short")).status, 400);
  assert.equal((await db.shopAdminPasswordReset.findFirstOrThrow()).usedAt, null);
  // Somebody else asking again does not cancel the link the owner already has...
  await quiet(() => ask(app));
  const second = tokenIn(mail.sent[1]!.text);
  assert.notEqual(second, first);
  assert.equal(await db.shopAdminPasswordReset.count({ where: { usedAt: null, expiresAt: { gt: new Date() } } }), 2);
  // ...but using one ends the other.
  assert.equal((await quiet(() => choose(app, first))).result.status, 204);
  assert.equal((await choose(app, second)).body.code, "RESET_LINK_INVALID");
  await db.shopAdmin.update({ where: { email: owner }, data: { passwordHash: hashOf(oldPassword) } });
  // A link lapses after fifteen minutes.
  await quiet(() => ask(app));
  const third = tokenIn(mail.sent[2]!.text);
  await db.shopAdminPasswordReset.updateMany({ where: { usedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
  assert.equal((await choose(app, third)).body.code, "RESET_LINK_INVALID");
  assert.equal((await choose(app, "f".repeat(64))).body.code, "RESET_LINK_INVALID");
  assert.equal((await choose(app, "not-a-token")).status, 400);
  assert.equal((await quiet(() => signIn(app, oldPassword))).result.status, 200);
});

test("a link is only good while its account is still the emergency account and switched on", async () => {
  const mail = outbox();
  await quiet(() => ask(appWith(mail)));
  const token = tokenIn(mail.sent[0]!.text);
  // The server's settings now name a different emergency account.
  assert.equal((await choose(appWith(mail, "other@example.invalid"), token)).body.code, "RESET_LINK_INVALID");
  await db.shopAdmin.update({ where: { email: owner }, data: { active: false } });
  assert.equal((await choose(appWith(mail), token)).body.code, "RESET_LINK_INVALID");
  // And a switched-off account is not emailed at all.
  await quiet(() => ask(appWith(mail)));
  assert.equal(mail.sent.length, 1);
});

test("at most three links an hour are emailed for the account, and five requests an hour from one address", async () => {
  const mail = outbox();
  for (let attempt = 0; attempt < 4; attempt += 1) assert.equal((await quiet(() => ask(appWith(mail)))).result.status, 202);
  assert.equal(mail.sent.length, 3);
  assert.equal(await db.shopAdminPasswordReset.count(), 3);
  const app = appWith(mail);
  for (let attempt = 0; attempt < 5; attempt += 1) assert.equal((await ask(app)).status, 202);
  assert.equal((await ask(app)).status, 429);
  assert.equal(mail.sent.length, 3);
  const choosing = appWith(mail);
  for (let attempt = 0; attempt < 10; attempt += 1) assert.equal((await choose(choosing, "a".repeat(64))).status, 400);
  assert.equal((await choose(choosing, "a".repeat(64))).status, 429);
});

test("it is offered only where it can work, and says the same thing when it cannot", async () => {
  const mail = outbox();
  const offer = async (app: ReturnType<typeof createApp>) => (await request(app).get("/api/admin/session")).body.signIn;
  assert.deepEqual(await offer(appWith(mail)), { method: "keeri", available: false, emergency: true, reset: true });
  // No mail sender: the emergency account still works, the link is not offered, and asking sends nothing.
  assert.deepEqual(await offer(appWith(null)), { method: "keeri", available: false, emergency: true, reset: false });
  const silent = await ask(appWith(null));
  assert.equal(silent.status, 202);
  assert.match(silent.body.message, /If the emergency account is set up/);
  assert.equal(await db.shopAdminPasswordReset.count(), 0);
  // No emergency account named: there is nothing to reset, and the routes do not exist.
  assert.deepEqual(await offer(appWith(mail, null)), { method: "keeri", available: false, emergency: false, reset: false });
  assert.equal((await ask(appWith(mail, null))).status, 401);
  assert.equal((await choose(appWith(mail, null), "a".repeat(64))).status, 401);
  // Where staff sign in with shop passwords (tests, development), they do not exist either.
  assert.equal((await ask(createApp(db, base))).status, 401);
  // The mail service refusing is not shown to the person asking.
  mail.state.accepts = false;
  const { result: refused, lines } = await quiet(() => ask(appWith(mail)));
  assert.equal(refused.status, 202);
  assert.deepEqual(refused.body, silent.body);
  assert.ok(lines.some((line) => /not accepted by the mail service/.test(line)));
  // A request from another site is turned away before anything happens.
  assert.equal((await request(appWith(mail)).post("/api/admin/emergency/reset-request").set("Origin", "https://evil.example.test").send({})).status, 403);
});

test("an emergency account that moved to Keeri and lost nothing can still be given a password", async () => {
  // The account exists with no shop password at all (it only ever signed in with Keeri).
  await db.shopAdmin.update({ where: { email: owner }, data: { passwordHash: null, keeriUserId: "keeri_owner" } });
  const mail = outbox();
  const app = appWith(mail);
  await quiet(() => ask(app));
  assert.equal((await quiet(() => choose(app, tokenIn(mail.sent[0]!.text)))).result.status, 204);
  assert.equal((await quiet(() => signIn(app, newPassword))).result.status, 200);
});

test("setting a new password also clears a lock, so a locked-out owner is never stuck", async () => {
  const mail = outbox();
  const app = appWith(mail);
  await db.shopAdmin.update({ where: { email: owner }, data: { failedAttempts: 5, lockedUntil: new Date(Date.now() + 15 * 60_000) } });
  assert.equal((await quiet(() => signIn(app, oldPassword))).result.status, 401);
  await quiet(() => ask(app));
  assert.equal((await quiet(() => choose(app, tokenIn(mail.sent[0]!.text)))).result.status, 204);
  assert.equal((await quiet(() => signIn(app, newPassword))).result.status, 200);
});

test("at start-up the store says, by setting name only, when the emergency account cannot work", async () => {
  const mail = outbox();
  assert.equal(await emergencyAccountProblem(db, { mode: "password" }), null);
  assert.equal(await emergencyAccountProblem(db, mode(mail)), null);
  assert.match((await emergencyAccountProblem(db, mode(mail, null)))!, /No emergency account is named/);
  const mistyped = await emergencyAccountProblem(db, mode(mail, "ownr@example.invalid"));
  assert.match(mistyped!, /does not match an active shop-admin account/);
  assert.ok(!mistyped!.includes("ownr@example.invalid"));
  await db.shopAdmin.update({ where: { email: owner }, data: { passwordHash: null } });
  assert.match((await emergencyAccountProblem(db, mode(mail)))!, /has no password yet/);
  await db.shopAdmin.update({ where: { email: owner }, data: { active: false } });
  assert.match((await emergencyAccountProblem(db, mode(mail)))!, /does not match an active/);
});
