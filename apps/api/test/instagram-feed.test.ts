import assert from "node:assert/strict";
import { after, afterEach, beforeEach, test } from "node:test";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import sharp from "sharp";
import { instagramFeedResponseSchema, instagramFeedStatusSchema } from "@shopmaple/contracts";
import { createApp } from "../src/app.js";
import { loadInstagramFeedConfig, refreshInstagramFeed, type InstagramFeedConfig } from "../src/instagram-feed.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).hostname !== "127.0.0.1" || new URL(url).port !== "55439" || new URL(url).pathname !== "/shopmaple_test") throw Error("Dedicated loopback test database required");
const db = new PrismaClient({ datasources: { db: { url } } });
const origin = "http://localhost:3000";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const admins: string[] = [];
const envToken = "test-token-env-not-real-1";
const appSecret = "test-app-secret-not-real";

/*
 * Meta's Graph API and Instagram's CDN, doubled at the HTTP boundary. Payload shapes follow Meta's
 * IG Media and debug_token references; every request is recorded so tests can check what we sent.
 */
type Media = { id: string; media_type: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM"; permalink: string; timestamp: string; caption?: string; media_url?: string; thumbnail_url?: string; children?: { data: { media_type: string; media_url?: string; thumbnail_url?: string }[] } };
const cdn = "https://scontent-bom1-1.cdninstagram.com/v/t51/";
let jpeg: Buffer, otherJpeg: Buffer;
function meta(options: { media?: Media[]; mediaStatus?: number; mediaError?: object; debug?: object; exchange?: object | number; images?: Record<string, Response | (() => Response | Promise<Response>)> } = {}) {
  const calls: URL[] = [];
  const transport = (async (input: string | URL | Request) => {
    const target = new URL(String(input instanceof Request ? input.url : input));
    calls.push(target);
    if (target.origin === "https://graph.facebook.com") {
      if (target.pathname === "/v26.0/debug_token") return Response.json(options.debug ?? { data: { is_valid: true, expires_at: 0, scopes: ["instagram_basic", "pages_show_list"] } });
      if (target.pathname === "/v26.0/oauth/access_token") {
        if (typeof options.exchange === "number") return Response.json({ error: { code: 190, type: "OAuthException", message: "synthetic" } }, { status: options.exchange });
        return Response.json(options.exchange ?? { access_token: "test-token-renewed-not-real-2", token_type: "bearer", expires_in: 5184000 });
      }
      if (target.pathname === "/v26.0/17841400000000001/media") {
        if (options.mediaError) return Response.json(options.mediaError, { status: options.mediaStatus ?? 400 });
        if (options.mediaStatus && options.mediaStatus !== 200) return new Response("upstream", { status: options.mediaStatus });
        return Response.json({ data: options.media ?? posts(), paging: { cursors: { before: "a", after: "b" } } });
      }
    }
    const image = options.images?.[target.href];
    if (image) return typeof image === "function" ? image() : image;
    if (target.href.startsWith(cdn)) return new Response(new Uint8Array(target.pathname.endsWith("other.jpg") ? otherJpeg : jpeg), { headers: { "Content-Type": "image/jpeg" } });
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  return { transport, calls };
}
function posts(): Media[] {
  return [
    { id: "18000000000000003", media_type: "IMAGE", permalink: "https://www.instagram.com/p/ImageOne/", timestamp: "2026-10-30T10:00:00+0000", caption: "A walnut dining table for eight", media_url: `${cdn}image.jpg?oe=1` },
    { id: "18000000000000002", media_type: "VIDEO", permalink: "https://www.instagram.com/reel/ReelTwo/", timestamp: "2026-10-29T10:00:00+0000", caption: "Workshop reel", media_url: `${cdn}video.mp4`, thumbnail_url: `${cdn}thumb.jpg?oe=2` },
    { id: "18000000000000001", media_type: "CAROUSEL_ALBUM", permalink: "https://www.instagram.com/p/AlbumThree/", timestamp: "2026-10-28T10:00:00+0000", children: { data: [{ media_type: "IMAGE", media_url: `${cdn}other.jpg?oe=3` }] } },
  ];
}
function config(transport: typeof fetch, overrides: Partial<InstagramFeedConfig> = {}): InstagramFeedConfig {
  return { accessToken: envToken, igUserId: "17841400000000001", appId: "1234567890", appSecret, graphVersion: "v26.0", fetch: transport, ...overrides };
}
const client = (feed: InstagramFeedConfig | null) => request(createApp(db, { webOrigin: origin, secureCookies: false, catalogMode: "preview", instagramFeed: feed }));
async function staff(role: "editor" | "publisher" = "publisher") {
  const token = randomBytes(32).toString("hex");
  const row = await db.shopAdmin.create({ data: { email: `instagram-${randomUUID()}@example.invalid`, passwordHash: "synthetic-unused", role } }); admins.push(row.id);
  await db.shopAdminSession.create({ data: { adminId: row.id, tokenHash: hash(token), expiresAt: new Date(Date.now() + 600000) } });
  return { cookie: `shop_admin=${token}`, csrf: hash(`csrf:${token}`) };
}
const clean = async () => { await db.instagramFeedPost.deleteMany(); await db.instagramFeedState.deleteMany(); };
beforeEach(async () => {
  jpeg ??= await sharp({ create: { width: 1080, height: 1350, channels: 3, background: "#741a14" } }).jpeg().toBuffer();
  otherJpeg ??= await sharp({ create: { width: 1080, height: 1080, channels: 3, background: "#428445" } }).jpeg().toBuffer();
  await clean();
});
afterEach(async () => {
  await clean();
  await db.shopAdminSession.deleteMany({ where: { adminId: { in: admins } } });
  await db.shopAdmin.deleteMany({ where: { id: { in: admins } } });
  admins.length = 0;
});
after(async () => db.$disconnect());

test("without every private setting the feed is off and the homepage keeps the staff list", async () => {
  const full = { INSTAGRAM_ACCESS_TOKEN: envToken, INSTAGRAM_USER_ID: "17841400000000001", META_APP_ID: "1234567890", META_APP_SECRET: appSecret };
  assert.equal(loadInstagramFeedConfig({})?.accessToken, undefined);
  for (const missing of Object.keys(full)) assert.equal(loadInstagramFeedConfig({ ...full, [missing]: "" }), null, `${missing} is required`);
  assert.equal(loadInstagramFeedConfig({ ...full, INSTAGRAM_USER_ID: "maplefurnishers" }), null, "The Instagram account is its numeric id");
  const loaded = loadInstagramFeedConfig(full);
  assert.ok(loaded, "All four settings turn the feed on");
  assert.equal(loaded.accessToken, envToken);
  assert.equal(loaded.graphVersion, "v26.0");
  // A cached set from an earlier configuration stays private while the feed is off.
  const { transport } = meta();
  assert.equal((await refreshInstagramFeed(db, config(transport))).status, "ok");
  const response = await client(null).get("/api/instagram/feed");
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { posts: [] });
});

test("a refresh stores recent posts with our own image copies and serves them to the homepage", async () => {
  const { transport, calls } = meta();
  const result = await refreshInstagramFeed(db, config(transport));
  assert.equal(result.status, "ok");
  const mediaCall = calls.find((call) => call.pathname.endsWith("/media"))!;
  for (const field of ["media_type", "media_url", "thumbnail_url", "permalink", "timestamp", "caption", "children{media_type,media_url,thumbnail_url}"])
    assert.ok(mediaCall.searchParams.get("fields")!.split(/,(?![^{]*\})/).includes(field), `asks for ${field}`);
  for (const call of calls.filter((call) => call.origin === "https://graph.facebook.com" && !call.pathname.endsWith("/debug_token")))
    assert.equal(call.searchParams.get("appsecret_proof"), createHmac("sha256", appSecret).update(envToken).digest("hex"), "Graph calls are signed with appsecret_proof");
  const response = await client(config(transport)).get("/api/instagram/feed");
  assert.equal(response.status, 200);
  const feed = instagramFeedResponseSchema.parse(response.body);
  assert.deepEqual(feed.posts.map((post) => post.href), ["https://www.instagram.com/p/ImageOne/", "https://www.instagram.com/reel/ReelTwo/", "https://www.instagram.com/p/AlbumThree/"], "newest first");
  assert.equal(feed.posts[0]!.alt, "Instagram post with the caption: A walnut dining table for eight");
  assert.equal(feed.posts[2]!.alt, "Maple on Instagram", "A post without a caption gets the generic description");
  assert.equal(JSON.stringify(response.body).includes("cdninstagram"), false, "No Instagram CDN address reaches the page");
  // The video's thumbnail and the album's first picture are fetched; the video file is not.
  const fetched = calls.filter((call) => call.href.startsWith(cdn)).map((call) => call.pathname.split("/").pop());
  assert.deepEqual(fetched.sort(), ["image.jpg", "other.jpg", "thumb.jpg"]);
  assert.equal(feed.posts[0]!.src, feed.posts[1]!.src, "Identical pictures get the same content-addressed image address");
  const image = await client(null).get(feed.posts[2]!.src);
  assert.equal(image.status, 200);
  assert.equal(image.headers["content-type"], "image/webp");
  assert.match(String(image.headers["cache-control"]), /immutable/);
  const stored = await sharp(image.body as Buffer).metadata();
  assert.equal(stored.format, "webp");
  assert.ok(stored.width! <= 960, "Images are resized for the homepage row");
  assert.equal((await client(null).get(`/media/instagram-feed/${"0".repeat(64)}.webp`)).status, 404);
});

test("a later refresh downloads only new images, adds new posts and drops removed ones", async () => {
  const first = meta();
  await refreshInstagramFeed(db, config(first.transport));
  const second = meta({ media: [
    { id: "18000000000000004", media_type: "IMAGE", permalink: "https://www.instagram.com/p/NewFour/", timestamp: "2026-10-31T10:00:00+0000", media_url: `${cdn}other.jpg?oe=4` },
    ...posts().slice(0, 2).map((post) => ({ ...post, media_url: post.media_url && `${cdn}expired.jpg`, thumbnail_url: post.thumbnail_url && `${cdn}expired.jpg` })),
  ] });
  assert.equal((await refreshInstagramFeed(db, config(second.transport), { force: true })).status, "ok");
  assert.deepEqual(second.calls.filter((call) => call.href.startsWith(cdn)).map((call) => call.pathname.split("/").pop()), ["other.jpg"], "Known posts keep their stored copy");
  const feed = (await client(config(second.transport)).get("/api/instagram/feed")).body;
  assert.deepEqual(feed.posts.map((post: { href: string }) => post.href), ["https://www.instagram.com/p/NewFour/", "https://www.instagram.com/p/ImageOne/", "https://www.instagram.com/reel/ReelTwo/"]);
});

test("when Meta fails the last good set stays on the homepage and the admin sees why", async () => {
  await refreshInstagramFeed(db, config(meta().transport));
  const failures: [Parameters<typeof meta>[0], string][] = [
    [{ mediaStatus: 400, mediaError: { error: { code: 190, type: "OAuthException", message: "Error validating access token" } } }, "token_invalid"],
    [{ mediaStatus: 403, mediaError: { error: { code: 10, type: "OAuthException", message: "Permission denied" } } }, "permission_denied"],
    [{ mediaStatus: 400, mediaError: { error: { code: 4, type: "OAuthException", message: "Application request limit reached" } } }, "rate_limited"],
    [{ mediaStatus: 400, mediaError: { error: { code: 80002, type: "OAuthException", message: "Instagram rate limit" } } }, "rate_limited"],
    [{ mediaStatus: 503 }, "meta_unavailable"],
    [{ media: [{ id: "x", media_type: "IMAGE" } as unknown as Media] }, "invalid_response"],
    [{ media: [] }, "empty_feed"],
    [{ debug: { data: { is_valid: false, expires_at: 1, scopes: [] } } }, "token_invalid"],
  ];
  const publisher = await staff();
  for (const [options, code] of failures) {
    const result = await refreshInstagramFeed(db, config(meta(options).transport), { force: true });
    assert.equal(result.status, "error");
    assert.equal(result.errorCode, code);
    const feed = (await client(config(meta().transport)).get("/api/instagram/feed")).body;
    assert.equal(feed.posts.length, 3, `${code}: the last good set is still served`);
    const status = instagramFeedStatusSchema.parse((await client(config(meta().transport)).get("/api/admin/instagram-feed").set("Cookie", publisher.cookie)).body);
    assert.equal(status.status, "error");
    assert.equal(status.errorCode, code);
    assert.ok(status.lastSuccessAt && status.lastAttemptAt && status.lastAttemptAt >= status.lastSuccessAt);
  }
});

test("a Meta request that never answers is abandoned within the timeout", async () => {
  await refreshInstagramFeed(db, config(meta().transport));
  const hanging = ((_input: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
  })) as typeof fetch;
  const started = Date.now();
  const result = await refreshInstagramFeed(db, config(hanging, { timeoutMs: 200 }), { force: true });
  assert.equal(result.errorCode, "meta_unavailable");
  assert.ok(Date.now() - started < 2000);
});

test("images from outside Instagram's CDN, oversized or not images at all are skipped", async () => {
  const { transport, calls } = meta({
    media: [
      { id: "18000000000000011", media_type: "IMAGE", permalink: "https://www.instagram.com/p/Elsewhere/", timestamp: "2026-10-30T10:00:00+0000", media_url: "https://evil.example/steal.jpg" },
      { id: "18000000000000012", media_type: "IMAGE", permalink: "https://www.instagram.com/p/Plain/", timestamp: "2026-10-30T09:00:00+0000", media_url: "http://scontent.cdninstagram.com/plain.jpg" },
      { id: "18000000000000013", media_type: "IMAGE", permalink: "https://www.instagram.com/p/Huge/", timestamp: "2026-10-30T08:00:00+0000", media_url: `${cdn}huge.jpg` },
      { id: "18000000000000014", media_type: "IMAGE", permalink: "https://www.instagram.com/p/Html/", timestamp: "2026-10-30T07:00:00+0000", media_url: `${cdn}page.jpg` },
      { id: "18000000000000015", media_type: "IMAGE", permalink: "https://www.instagram.com/p/Good/", timestamp: "2026-10-30T06:00:00+0000", media_url: `${cdn}good.jpg` },
    ],
    images: {
      [`${cdn}huge.jpg`]: () => new Response(new Uint8Array(9 * 1024 * 1024), { headers: { "Content-Type": "image/jpeg" } }),
      [`${cdn}page.jpg`]: () => new Response("<html>login</html>", { headers: { "Content-Type": "image/jpeg" } }),
    },
  });
  assert.equal((await refreshInstagramFeed(db, config(transport))).status, "ok");
  assert.equal(calls.some((call) => call.hostname === "evil.example" || call.protocol === "http:"), false, "Foreign or plain-http addresses are never requested");
  const feed = (await client(config(transport)).get("/api/instagram/feed")).body;
  assert.deepEqual(feed.posts.map((post: { href: string }) => post.href), ["https://www.instagram.com/p/Good/"]);
});

test("a token that expires soon is renewed before it lapses and kept encrypted", async () => {
  const soon = Math.floor(Date.now() / 1000) + 5 * 86400;
  const first = meta({ debug: { data: { is_valid: true, expires_at: soon, scopes: ["instagram_basic"] } } });
  assert.equal((await refreshInstagramFeed(db, config(first.transport))).status, "ok");
  const exchange = first.calls.find((call) => call.pathname === "/v26.0/oauth/access_token")!;
  assert.equal(exchange.searchParams.get("grant_type"), "fb_exchange_token");
  assert.equal(exchange.searchParams.get("client_id"), "1234567890");
  assert.equal(exchange.searchParams.get("client_secret"), appSecret);
  assert.equal(exchange.searchParams.get("fb_exchange_token"), envToken);
  assert.equal(first.calls.find((call) => call.pathname.endsWith("/media"))!.searchParams.get("access_token"), "test-token-renewed-not-real-2", "The renewed token is used at once");
  const state = await db.instagramFeedState.findUniqueOrThrow({ where: { id: 1 } });
  assert.equal(JSON.stringify(state).includes("test-token-renewed-not-real-2"), false, "The stored token is encrypted");
  assert.ok(state.tokenExpiresAt! > new Date(Date.now() + 59 * 86400_000), "The new expiry is recorded");
  // The next cycle carries on with the renewed token, not the stale one in the environment.
  const second = meta({ debug: { data: { is_valid: true, expires_at: Math.floor(Date.now() / 1000) + 59 * 86400, scopes: [] } } });
  await refreshInstagramFeed(db, config(second.transport), { force: true });
  assert.equal(second.calls.find((call) => call.pathname.endsWith("/media"))!.searchParams.get("access_token"), "test-token-renewed-not-real-2");
  assert.equal(second.calls.some((call) => call.pathname.endsWith("/oauth/access_token")), false, "A fresh token is not renewed again");
  // A new token in the environment replaces the renewed one.
  const third = meta();
  await refreshInstagramFeed(db, config(third.transport, { accessToken: "test-token-replaced-not-real-3" }), { force: true });
  assert.equal(third.calls.find((call) => call.pathname.endsWith("/media"))!.searchParams.get("access_token"), "test-token-replaced-not-real-3");
  // A failed renewal still refreshes posts with the current token, and says so.
  const failing = meta({ debug: { data: { is_valid: true, expires_at: soon, scopes: [] } }, exchange: 400 });
  const result = await refreshInstagramFeed(db, config(failing.transport, { accessToken: "test-token-another-not-real-4" }), { force: true });
  assert.equal(result.errorCode, "token_refresh_failed");
  assert.equal((await db.instagramFeedState.findUniqueOrThrow({ where: { id: 1 } })).lastSuccessAt! > state.lastSuccessAt!, true);
});

test("the schedule refreshes only when due, and two workers never refresh at once", async () => {
  const { transport, calls } = meta();
  const settings = config(transport, { refreshEveryMs: 3 * 3600_000 });
  assert.equal((await refreshInstagramFeed(db, settings)).status, "ok");
  assert.equal((await refreshInstagramFeed(db, settings)).status, "skipped", "Not due again for three hours");
  await db.instagramFeedState.update({ where: { id: 1 }, data: { lastAttemptAt: new Date(Date.now() - 4 * 3600_000) } });
  const runs = await Promise.all([refreshInstagramFeed(db, settings), refreshInstagramFeed(db, settings)]);
  assert.deepEqual(runs.map((run) => run.status).sort(), ["ok", "skipped"]);
  assert.equal(calls.filter((call) => call.pathname.endsWith("/media")).length, 2);
});

test("staff see the feed status; only a publisher can hide a post or refresh, and hidden posts stay hidden", async () => {
  const { transport } = meta();
  const settings = config(transport);
  const editor = await staff("editor"), publisher = await staff();
  const offResponse = await client(null).get("/api/admin/instagram-feed").set("Cookie", editor.cookie);
  assert.equal(offResponse.status, 200, "Any signed-in staff member can read the feed status");
  const off = instagramFeedStatusSchema.parse(offResponse.body);
  assert.equal(off.configured, false);
  assert.equal(off.status, "not_configured");
  assert.equal((await client(settings).get("/api/admin/instagram-feed")).status, 401);
  const waiting = instagramFeedStatusSchema.parse((await client(settings).get("/api/admin/instagram-feed").set("Cookie", editor.cookie)).body);
  assert.equal(waiting.status, "waiting");
  await refreshInstagramFeed(db, settings);
  const response = await client(settings).get("/api/admin/instagram-feed").set("Cookie", editor.cookie);
  assert.match(String(response.headers["cache-control"]), /no-store/);
  const status = instagramFeedStatusSchema.parse(response.body);
  assert.equal(status.status, "ok");
  assert.equal(status.posts.length, 3);
  assert.equal(JSON.stringify(response.body).includes(envToken), false);
  const target = status.posts.find((post) => post.href.endsWith("/ReelTwo/"))!;
  const hide = (actor: { cookie: string; csrf: string }, id: string, hidden: boolean, source = origin) =>
    client(settings).post(`/api/admin/instagram-feed/posts/${id}/visibility`).set("Cookie", actor.cookie).set("Origin", source).set("X-CSRF-Token", actor.csrf).send({ hidden });
  assert.equal((await hide(editor, target.id, true)).status, 403, "Editors cannot change the live homepage");
  assert.equal((await hide({ ...publisher, csrf: "0".repeat(64) }, target.id, true)).status, 403);
  assert.equal((await hide(publisher, target.id, true, "https://other.invalid")).status, 403);
  assert.equal((await hide(publisher, "99999999", true)).status, 404);
  const hidden = await hide(publisher, target.id, true);
  assert.equal(hidden.status, 200);
  assert.equal(instagramFeedStatusSchema.parse(hidden.body).posts.find((post) => post.id === target.id)!.hidden, true);
  const visible = async () => (await client(settings).get("/api/instagram/feed")).body.posts.map((post: { href: string }) => post.href);
  assert.equal((await visible()).includes(target.href), false);
  await refreshInstagramFeed(db, settings, { force: true });
  assert.equal((await visible()).includes(target.href), false, "A refresh keeps the post hidden");
  assert.equal((await hide(publisher, target.id, false)).status, 200);
  assert.equal((await visible()).includes(target.href), true);
  const refresh = (actor: { cookie: string; csrf: string }, feed: InstagramFeedConfig | null = settings) =>
    client(feed).post("/api/admin/instagram-feed/refresh").set("Cookie", actor.cookie).set("Origin", origin).set("X-CSRF-Token", actor.csrf).send({});
  assert.equal((await refresh(editor)).status, 403);
  assert.equal((await refresh(publisher, null)).status, 409, "Nothing to refresh until the feed is set up");
  const before = (await db.instagramFeedState.findUniqueOrThrow({ where: { id: 1 } })).lastSuccessAt!;
  const refreshed = await refresh(publisher);
  assert.equal(refreshed.status, 202, "Refresh now starts a cycle and answers at once");
  assert.equal(instagramFeedStatusSchema.parse(refreshed.body).status, "refreshing");
  assert.equal((await refresh(publisher)).status, 409, "A second press while it runs is refused");
  for (let i = 0; i < 100 && (await db.instagramFeedState.findUniqueOrThrow({ where: { id: 1 } })).leaseToken; i++) await new Promise((resolve) => setTimeout(resolve, 50));
  const done = instagramFeedStatusSchema.parse((await client(settings).get("/api/admin/instagram-feed").set("Cookie", editor.cookie)).body);
  assert.equal(done.status, "ok");
  assert.ok(new Date(done.lastSuccessAt!) > before, "The background cycle finished");
});

test("a worker whose lease expired mid-cycle neither repeats nor overwrites the newer set", async () => {
  await refreshInstagramFeed(db, config(meta().transport));
  let release!: () => void, reached!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; }), atImage = new Promise<void>((resolve) => { reached = resolve; });
  const slow = meta({
    media: [{ id: "18000000000000021", media_type: "IMAGE", permalink: "https://www.instagram.com/p/Slow/", timestamp: "2026-10-31T10:00:00+0000", media_url: `${cdn}slow.jpg` }],
    images: { [`${cdn}slow.jpg`]: async () => { reached(); await gate; return new Response(new Uint8Array(jpeg), { headers: { "Content-Type": "image/jpeg" } }); } },
  });
  const first = refreshInstagramFeed(db, config(slow.transport), { force: true });
  await atImage;
  await db.instagramFeedState.update({ where: { id: 1 }, data: { leaseExpiresAt: new Date(Date.now() - 1000) } });
  const scheduled = meta();
  assert.equal((await refreshInstagramFeed(db, config(scheduled.transport, { refreshEveryMs: 3 * 3600_000 }))).status, "skipped", "A running cycle counts as the latest attempt");
  assert.equal(scheduled.calls.length, 0);
  assert.equal((await refreshInstagramFeed(db, config(meta().transport), { force: true })).status, "ok");
  release();
  assert.equal((await first).status, "skipped", "The stale worker reports that it lost its lease");
  const feed = (await client(config(meta().transport)).get("/api/instagram/feed")).body;
  assert.deepEqual(feed.posts.map((post: { href: string }) => post.href), posts().map((post) => post.permalink), "The newer set stands");
});

test("a hidden post stays hidden after it drops out of a refresh and comes back", async () => {
  await refreshInstagramFeed(db, config(meta().transport));
  await db.instagramFeedPost.update({ where: { id: "18000000000000002" }, data: { hidden: true, hiddenAt: new Date() } });
  await refreshInstagramFeed(db, config(meta({ media: posts().filter((post) => post.id !== "18000000000000002") }).transport), { force: true });
  const publisher = await staff();
  const status = instagramFeedStatusSchema.parse((await client(config(meta().transport)).get("/api/admin/instagram-feed").set("Cookie", publisher.cookie)).body);
  assert.deepEqual(status.posts.map((post) => post.id), ["18000000000000003", "18000000000000001"], "The admin lists only posts in the latest set");
  const back = meta();
  await refreshInstagramFeed(db, config(back.transport), { force: true });
  const feed = (await client(config(back.transport)).get("/api/instagram/feed")).body;
  assert.equal(feed.posts.some((post: { href: string }) => post.href.endsWith("/ReelTwo/")), false, "Still hidden when it returns");
  assert.equal(back.calls.some((call) => call.pathname.endsWith("thumb.jpg")), false, "and its stored picture is reused");
});

test("an album that starts with a video uses that video's thumbnail", async () => {
  const { transport, calls } = meta({
    media: [{ id: "18000000000000031", media_type: "CAROUSEL_ALBUM", permalink: "https://www.instagram.com/p/VideoAlbum/", timestamp: "2026-10-30T10:00:00+0000", media_url: `${cdn}first.mp4`,
      children: { data: [{ media_type: "VIDEO", media_url: `${cdn}first.mp4`, thumbnail_url: `${cdn}cover.jpg` }, { media_type: "IMAGE", media_url: `${cdn}second.jpg` }] } }],
    images: { [`${cdn}first.mp4`]: () => new Response("video", { headers: { "Content-Type": "video/mp4" } }) },
  });
  assert.equal((await refreshInstagramFeed(db, config(transport))).status, "ok");
  assert.deepEqual(calls.filter((call) => call.href.startsWith(cdn)).map((call) => call.pathname.split("/").pop()), ["cover.jpg"]);
});

test("a renewal that does not extend the token counts as failed and the old expiry stays visible", async () => {
  const soon = Math.floor(Date.now() / 1000) + 5 * 86400;
  for (const exchange of [{ access_token: "test-token-short-not-real-5", token_type: "bearer", expires_in: 3 * 86400 }, { access_token: "test-token-no-expiry-not-real-6", token_type: "bearer" }]) {
    await clean();
    const run = meta({ debug: { data: { is_valid: true, expires_at: soon, scopes: [] } }, exchange });
    const result = await refreshInstagramFeed(db, config(run.transport));
    assert.equal(result.errorCode, "token_refresh_failed");
    assert.equal(run.calls.find((call) => call.pathname.endsWith("/media"))!.searchParams.get("access_token"), envToken, "The current token keeps working");
    const state = await db.instagramFeedState.findUniqueOrThrow({ where: { id: 1 } });
    assert.equal(state.tokenExpiresAt?.getTime(), soon * 1000);
    assert.equal(state.tokenCiphertext, null);
  }
});

test("the admin sees when Meta's 90-day data access lapses", async () => {
  const lapse = Math.floor(Date.now() / 1000) + 20 * 86400;
  await refreshInstagramFeed(db, config(meta({ debug: { data: { is_valid: true, expires_at: 0, data_access_expires_at: lapse, scopes: [] } } }).transport));
  const publisher = await staff();
  const status = instagramFeedStatusSchema.parse((await client(config(meta().transport)).get("/api/admin/instagram-feed").set("Cookie", publisher.cookie)).body);
  assert.equal(status.tokenExpiresAt, null, "A Page token never expires");
  assert.equal(status.dataAccessExpiresAt, new Date(lapse * 1000).toISOString());
});
