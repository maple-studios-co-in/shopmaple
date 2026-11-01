import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, randomUUID } from "node:crypto";
import type { Express } from "express";
import { rateLimit } from "express-rate-limit";
import type { Prisma, PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { z } from "zod";
import { instagramFeedVisibilityInputSchema, instagramFeedErrorCodes, type InstagramFeedStatus } from "@shopmaple/contracts";
import { HttpError } from "./cart.js";
import { requireStaff } from "./admin/auth.js";

/*
 * The homepage Instagram row, fetched from @maplefurnishers through Meta's Instagram Graph API
 * (Instagram API with Facebook Login). A scheduled cycle reads recent media, copies each picture
 * into our database as a small WebP (Instagram's CDN addresses expire), and keeps that last good
 * set whenever Meta fails. The token and app secret come only from private env settings; a token
 * that expires (a user token) is renewed before it lapses and stored encrypted. Setup steps are in
 * docs/instagram-feed.md.
 */

export type InstagramFeedConfig = {
  accessToken: string;
  /** The Instagram professional account's numeric id (IG User ID). */
  igUserId: string;
  appId: string;
  appSecret: string;
  graphVersion: string;
  /** Meta and CDN transport; tests inject a double. */
  fetch?: typeof fetch;
  /** Bound for each Meta or CDN request; 15 seconds by default. */
  timeoutMs?: number;
  /** How often the schedule refreshes the feed; three hours by default. */
  refreshEveryMs?: number;
};
type ErrorCode = (typeof instagramFeedErrorCodes)[number];
export type InstagramRefreshResult = { status: "ok" | "error" | "skipped"; errorCode?: ErrorCode };

const graph = "https://graph.facebook.com";
const defaultRefreshMs = 3 * 3600_000, renewWithinMs = 10 * 86400_000, keepHiddenMs = 180 * 86400_000;
const maxPosts = 24, servedPosts = 12, maxImageBytes = 8 * 1024 * 1024, imageWidth = 960;
/** Long enough for the slowest cycle: three Graph calls and every picture download at their full timeout. */
const leaseMs = (config: InstagramFeedConfig) => (config.timeoutMs ?? 15_000) * (3 + maxPosts) + 60_000;
const imagePath = (sha: string) => `/media/instagram-feed/${sha}.webp`;

/** All four private settings, or null: the feed stays off and the homepage keeps the staff-edited posts. */
export function loadInstagramFeedConfig(env: Record<string, string | undefined>): InstagramFeedConfig | null {
  const accessToken = env.INSTAGRAM_ACCESS_TOKEN?.trim(), igUserId = env.INSTAGRAM_USER_ID?.trim();
  const appId = env.META_APP_ID?.trim(), appSecret = env.META_APP_SECRET?.trim();
  const graphVersion = env.META_GRAPH_VERSION?.trim() || "v26.0";
  if (!accessToken || !appSecret || !igUserId || !appId || !/^\d{5,40}$/.test(igUserId) || !/^\d{5,40}$/.test(appId) || !/^v\d{1,3}\.\d$/.test(graphVersion)) return null;
  return { accessToken, igUserId, appId, appSecret, graphVersion };
}

class FeedError extends Error {
  constructor(readonly code: ErrorCode) { super(code); }
}
/** Another worker took over after this cycle's lease expired; it owns the result. */
class LostLease extends Error {}

/** Graph error codes (Meta's "Handle errors" guide), grouped into what staff can act on. */
function graphError(status: number, body: unknown): FeedError {
  const parsed = z.object({ error: z.object({ code: z.number() }) }).safeParse(body);
  if (parsed.success) {
    const code = parsed.data.error.code;
    if (code === 190 || code === 102) return new FeedError("token_invalid");
    if ([4, 17, 32, 613, 80002].includes(code)) return new FeedError("rate_limited");
    if (code === 10 || (code >= 200 && code <= 299)) return new FeedError("permission_denied");
  }
  return new FeedError(status >= 500 ? "meta_unavailable" : "invalid_response");
}

/** One bounded request: the deadline covers the body too, so a stalled stream cannot hold the cycle. */
async function bounded<T>(config: InstagramFeedConfig, url: URL, read: (response: Response) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new FeedError("meta_unavailable")), config.timeoutMs ?? 15_000);
  try {
    const response = await (config.fetch ?? fetch)(url, { redirect: "error", signal: controller.signal });
    return await read(response);
  } catch (error) {
    throw error instanceof FeedError ? error : new FeedError("meta_unavailable");
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

async function graphGet(config: InstagramFeedConfig, path: string, params: Record<string, string>, token?: string) {
  const url = new URL(`${graph}/${config.graphVersion}/${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  if (token) {
    url.searchParams.set("access_token", token);
    url.searchParams.set("appsecret_proof", createHmac("sha256", config.appSecret).update(token).digest("hex"));
  }
  return bounded(config, url, async (response) => {
    let body: unknown;
    try { body = await response.json(); } catch { throw new FeedError(response.status >= 500 ? "meta_unavailable" : "invalid_response"); }
    if (!response.ok) throw graphError(response.status, body);
    return body;
  });
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const tokenKey = (appSecret: string) => Buffer.from(hkdfSync("sha256", appSecret, "shopmaple-instagram-feed", "token-v1", 32));
// A fixed tag length: without it GCM also accepts a truncated tag, which is far easier to forge.
const authTagLength = 16;
function encryptToken(token: string, appSecret: string) {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", tokenKey(appSecret), iv, { authTagLength });
  const data = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return ["v1", ...[iv, cipher.getAuthTag(), data].map((part) => part.toString("base64url"))].join(".");
}
function decryptToken(value: string, appSecret: string) {
  const [version, iv, tag, data] = value.split(".");
  const authTag = Buffer.from(tag ?? "", "base64url");
  if (version !== "v1" || !iv || authTag.length !== authTagLength || !data) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", tokenKey(appSecret), Buffer.from(iv, "base64url"), { authTagLength });
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  } catch { return null; }
}

/**
 * The token to use, checked with debug_token and renewed when it expires within ten days. A Page
 * token never expires (expires_at 0); a long-lived user token lasts about 60 days and is exchanged
 * for a new one. A renewed token belongs to the env token it came from: a new env token replaces it.
 */
async function currentToken(db: PrismaClient, config: InstagramFeedConfig, now: Date, lease: string) {
  const state = await db.instagramFeedState.findUniqueOrThrow({ where: { id: 1 } });
  const source = sha256(config.accessToken);
  const stored = state.tokenSource === source && state.tokenCiphertext ? decryptToken(state.tokenCiphertext, config.appSecret) : null;
  const token = stored ?? config.accessToken;
  const debug = z.object({ data: z.object({ is_valid: z.boolean(), expires_at: z.number().int().nonnegative().optional(), data_access_expires_at: z.number().int().nonnegative().optional() }) })
    .safeParse(await graphGet(config, "debug_token", { input_token: token, access_token: `${config.appId}|${config.appSecret}` }));
  if (!debug.success) throw new FeedError("invalid_response");
  if (!debug.data.data.is_valid) throw new FeedError("token_invalid");
  const seconds = (value?: number) => value ? new Date(value * 1000) : null;
  const expires = seconds(debug.data.data.expires_at), dataAccessExpiresAt = seconds(debug.data.data.data_access_expires_at);
  // Only the worker holding the lease records token state.
  const record = (data: Prisma.InstagramFeedStateUpdateManyMutationInput) => db.instagramFeedState.updateMany({ where: { id: 1, leaseToken: lease }, data: { dataAccessExpiresAt, ...data } });
  if (!expires || expires.getTime() - now.getTime() > renewWithinMs) {
    await record({ tokenExpiresAt: expires });
    return { token, renewalFailed: false };
  }
  try {
    const renewed = z.object({ access_token: z.string().min(20).max(1000), expires_in: z.number().int().positive().optional() })
      .parse(await graphGet(config, "oauth/access_token", { grant_type: "fb_exchange_token", client_id: config.appId, client_secret: config.appSecret, fb_exchange_token: token }));
    // A reply that does not push the expiry beyond the renewal window has not renewed anything.
    const renewedUntil = renewed.expires_in ? new Date(now.getTime() + renewed.expires_in * 1000) : null;
    if (!renewedUntil || renewedUntil <= expires || renewedUntil.getTime() - now.getTime() <= renewWithinMs) throw new FeedError("token_refresh_failed");
    await record({ tokenSource: source, tokenCiphertext: encryptToken(renewed.access_token, config.appSecret), tokenExpiresAt: renewedUntil });
    return { token: renewed.access_token, renewalFailed: false };
  } catch {
    // The current token still works until it lapses; the admin panel shows the failed renewal and the expiry.
    await record({ tokenExpiresAt: expires });
    return { token, renewalFailed: true };
  }
}

const mediaSchema = z.object({
  id: z.string().regex(/^\d{1,40}$/),
  media_type: z.enum(["IMAGE", "VIDEO", "CAROUSEL_ALBUM"]),
  permalink: z.string().max(300).regex(/^https:\/\/(?:www\.)?instagram\.com\/(?:p|reel|tv)\/[A-Za-z0-9_-]+\/?$/),
  timestamp: z.string().max(40).refine((value) => !Number.isNaN(Date.parse(value))),
  caption: z.string().max(5000).optional(),
  media_url: z.string().max(2000).optional(),
  thumbnail_url: z.string().max(2000).optional(),
  children: z.object({ data: z.array(z.object({ media_type: z.string(), media_url: z.string().max(2000).optional(), thumbnail_url: z.string().max(2000).optional() })) }).optional(),
});
type Media = z.infer<typeof mediaSchema>;

/** The row's picture: the image itself, a video's thumbnail, or an album's cover (its first item's picture). */
function pictureOf(media: Media) {
  if (media.media_type === "VIDEO") return media.thumbnail_url;
  if (media.media_type === "IMAGE") return media.media_url;
  const first = media.children?.data[0];
  // An album's own media_url mirrors its first item, which is a video file when the album opens with one.
  return (first?.media_type === "VIDEO" ? first.thumbnail_url : first?.media_url) ?? media.media_url;
}

/** Only Instagram's own CDN over https; any other address in a Graph response is ignored. */
function cdnAddress(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    return /(?:^|\.)(?:cdninstagram\.com|fbcdn\.net)$/.test(url.hostname) ? url : null;
  } catch { return null; }
}

async function copyPicture(config: InstagramFeedConfig, url: URL) {
  const bytes = await bounded(config, url, async (response) => {
    if (response.status !== 200 || !response.body || !/^image\//.test(response.headers.get("content-type") ?? "")) throw new FeedError("invalid_response");
    const length = response.headers.get("content-length");
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > maxImageBytes)) throw new FeedError("invalid_response");
    const reader = response.body.getReader(), parts: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maxImageBytes) { void reader.cancel().catch(() => {}); throw new FeedError("invalid_response"); }
      parts.push(part.value);
    }
    return Buffer.concat(parts);
  });
  try {
    const { data, info } = await sharp(bytes, { limitInputPixels: 40_000_000, failOn: "warning" })
      .rotate().resize({ width: imageWidth, height: imageWidth * 2, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 }).toBuffer({ resolveWithObject: true });
    return { image: data, width: info.width, height: info.height, imageSha256: createHash("sha256").update(data).digest("hex") };
  } catch { throw new FeedError("invalid_response"); }
}

/** The same description the staff-edited posts use, within the contract's 200 characters. */
function altText(caption: string) {
  const text = caption.replace(/\s+/g, " ").trim();
  if (!text) return "Maple on Instagram";
  const prefix = "Instagram post with the caption: ", room = 200 - prefix.length;
  return prefix + (text.length > room ? `${text.slice(0, room - 1).trimEnd()}…` : text);
}

/**
 * Claims the single refresh lease; none when another worker holds it or, unforced, the feed is not due.
 * The claim records the attempt, so a running cycle is never due again on another worker's timer.
 */
async function claim(db: PrismaClient, config: InstagramFeedConfig, now: Date, force: boolean) {
  await db.instagramFeedState.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
  const lease = randomUUID(), due = new Date(now.getTime() - (config.refreshEveryMs ?? defaultRefreshMs));
  const claimed = await db.instagramFeedState.updateMany({
    where: {
      id: 1,
      OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }],
      ...(force ? {} : { AND: [{ OR: [{ lastAttemptAt: null }, { lastAttemptAt: { lt: due } }] }] }),
    },
    data: { leaseToken: lease, leaseExpiresAt: new Date(now.getTime() + leaseMs(config)), lastAttemptAt: now },
  });
  return claimed.count === 1 ? lease : null;
}

/** One refresh cycle; safe to call from every worker on a timer. Never logs or returns the token. */
export async function refreshInstagramFeed(db: PrismaClient, config: InstagramFeedConfig, options: { force?: boolean; now?: Date } = {}): Promise<InstagramRefreshResult> {
  const started = await startInstagramRefresh(db, config, options);
  return started ? await started.cycle : { status: "skipped" };
}

/** Claims the lease now and returns the running cycle, or null when another cycle holds it or none is due. */
export async function startInstagramRefresh(db: PrismaClient, config: InstagramFeedConfig, options: { force?: boolean; now?: Date } = {}) {
  const now = options.now ?? new Date();
  const lease = await claim(db, config, now, options.force ?? false);
  return lease ? { cycle: runCycle(db, config, now, lease) } : null;
}

async function runCycle(db: PrismaClient, config: InstagramFeedConfig, now: Date, lease: string): Promise<InstagramRefreshResult> {
  const finish = (errorCode: ErrorCode | null, success: boolean) => db.instagramFeedState.updateMany({
    where: { id: 1, leaseToken: lease },
    data: { lastAttemptAt: now, errorCode, ...(success ? { lastSuccessAt: now } : {}), leaseToken: null, leaseExpiresAt: null },
  });
  try {
    const { token, renewalFailed } = await currentToken(db, config, now, lease);
    const listing = z.object({ data: z.array(z.unknown()).max(100) }).safeParse(await graphGet(config, `${config.igUserId}/media`, {
      fields: "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,children{media_type,media_url,thumbnail_url}",
      limit: String(maxPosts),
    }, token));
    if (!listing.success) throw new FeedError("invalid_response");
    if (!listing.data.data.length) throw new FeedError("empty_feed");
    const media = listing.data.data.flatMap((item) => { const parsed = mediaSchema.safeParse(item); return parsed.success ? [parsed.data] : []; }).slice(0, maxPosts);
    if (!media.length) throw new FeedError("invalid_response");
    // A known post keeps its stored picture: its CDN address may have expired, the picture has not changed.
    const known = new Set((await db.instagramFeedPost.findMany({ where: { id: { in: media.map((item) => item.id) } }, select: { id: true } })).map((row) => row.id));
    const posts: { id: string; permalink: string; mediaType: string; caption: string; postedAt: Date; picture?: Awaited<ReturnType<typeof copyPicture>> }[] = [];
    for (const item of media) {
      const post = { id: item.id, permalink: item.permalink, mediaType: item.media_type, caption: (item.caption ?? "").slice(0, 2000), postedAt: new Date(item.timestamp) };
      if (known.has(item.id)) { posts.push(post); continue; }
      const url = cdnAddress(pictureOf(item));
      if (!url) continue;
      try { posts.push({ ...post, picture: await copyPicture(config, url) }); } catch { /* One unreadable picture leaves the rest of the row. */ }
    }
    if (!posts.length) throw new FeedError("empty_feed");
    await db.$transaction(async (tx) => {
      // Locks the state row until commit: a worker whose lease expired must not overwrite a newer set,
      // and no other worker can claim between this check and the writes.
      const owned = await tx.instagramFeedState.updateMany({ where: { id: 1, leaseToken: lease }, data: { leaseExpiresAt: new Date(Date.now() + 60_000) } });
      if (!owned.count) throw new LostLease();
      // A hidden post that drops out of this set keeps its row, so it is still hidden if it comes back.
      await tx.instagramFeedPost.deleteMany({ where: { id: { notIn: posts.map((post) => post.id) }, OR: [{ hidden: false }, { fetchedAt: { lt: new Date(now.getTime() - keepHiddenMs) } }] } });
      for (const { picture, ...post } of posts) {
        if (!picture) await tx.instagramFeedPost.update({ where: { id: post.id }, data: { ...post, fetchedAt: now } });
        else await tx.instagramFeedPost.upsert({ where: { id: post.id }, create: { ...post, ...picture, fetchedAt: now }, update: { ...post, ...picture, fetchedAt: now } });
      }
    }, { timeout: 20_000 });
    await finish(renewalFailed ? "token_refresh_failed" : null, true);
    return renewalFailed ? { status: "ok", errorCode: "token_refresh_failed" } : { status: "ok" };
  } catch (error) {
    if (error instanceof LostLease) return { status: "skipped" };
    const errorCode = error instanceof FeedError ? error.code : "invalid_response";
    await finish(errorCode, false);
    return { status: "error", errorCode };
  }
}

async function feedStatus(db: PrismaClient, config: InstagramFeedConfig | null): Promise<InstagramFeedStatus> {
  const [state, posts] = await Promise.all([
    db.instagramFeedState.findUnique({ where: { id: 1 } }),
    db.instagramFeedPost.findMany({ orderBy: [{ postedAt: "desc" }, { id: "desc" }], select: { id: true, permalink: true, caption: true, postedAt: true, hidden: true, imageSha256: true, fetchedAt: true } }),
  ]);
  // Only the latest set; hidden posts that dropped out of it are kept for their flag but not listed.
  const latest = posts.filter((post) => !state?.lastSuccessAt || post.fetchedAt >= state.lastSuccessAt).slice(0, maxPosts);
  const errorCode = state?.errorCode && (instagramFeedErrorCodes as readonly string[]).includes(state.errorCode) ? state.errorCode as ErrorCode : null;
  return {
    configured: Boolean(config),
    status: !config ? "not_configured" : state?.leaseExpiresAt && state.leaseExpiresAt > new Date() ? "refreshing" : errorCode ? "error" : state?.lastSuccessAt ? "ok" : "waiting",
    lastAttemptAt: state?.lastAttemptAt?.toISOString() ?? null,
    lastSuccessAt: state?.lastSuccessAt?.toISOString() ?? null,
    errorCode,
    tokenExpiresAt: state?.tokenExpiresAt?.toISOString() ?? null,
    dataAccessExpiresAt: state?.dataAccessExpiresAt?.toISOString() ?? null,
    posts: latest.map((post) => ({ id: post.id, href: post.permalink, src: imagePath(post.imageSha256), caption: post.caption.replace(/\s+/g, " ").trim().slice(0, 200), postedAt: post.postedAt.toISOString(), hidden: post.hidden })),
  };
}

const missingPost = () => new HttpError(404, "INSTAGRAM_POST_NOT_FOUND", "This Instagram post is no longer in the feed.");

export function registerInstagramFeedRoutes(app: Express, db: PrismaClient, config: InstagramFeedConfig | null, secure: boolean) {
  // The homepage row: an empty list (feed off, or nothing fetched yet) means "show the staff-edited posts".
  app.get("/api/instagram/feed", async (_req, res) => {
    const posts = config ? await db.instagramFeedPost.findMany({
      where: { hidden: false }, orderBy: [{ postedAt: "desc" }, { id: "desc" }], take: servedPosts,
      select: { permalink: true, caption: true, imageSha256: true },
    }) : [];
    res.set("Cache-Control", "public, max-age=60").json({ posts: posts.map((post) => ({ href: post.permalink, src: imagePath(post.imageSha256), alt: altText(post.caption) })) });
  });
  app.get("/media/instagram-feed/:filename", async (req, res) => {
    res.set("Cache-Control", "no-store");
    const match = /^([a-f0-9]{64})\.webp$/.exec(String(req.params.filename));
    const post = match && await db.instagramFeedPost.findFirst({ where: { imageSha256: match[1] }, select: { image: true } });
    if (!post) throw new HttpError(404, "MEDIA_NOT_FOUND", "This image is unavailable.");
    res.set({ "Content-Type": "image/webp", "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" }).send(Buffer.from(post.image));
  });
  app.get("/api/admin/instagram-feed", async (req, res) => {
    await requireStaff(db, req, secure);
    res.json(await feedStatus(db, config));
  });
  // Hiding changes the live homepage at once, so it is a publisher's decision.
  app.post("/api/admin/instagram-feed/posts/:id/visibility", async (req, res) => {
    await requireStaff(db, req, secure, true, true);
    const id = z.string().regex(/^\d{1,40}$/).safeParse(req.params.id);
    if (!id.success) throw missingPost();
    const { hidden } = instagramFeedVisibilityInputSchema.parse(req.body);
    const updated = await db.instagramFeedPost.updateMany({ where: { id: id.data }, data: { hidden, hiddenAt: hidden ? new Date() : null } });
    if (!updated.count) throw missingPost();
    res.json(await feedStatus(db, config));
  });
  app.post("/api/admin/instagram-feed/refresh", async (req, _res, next) => {
    await requireStaff(db, req, secure, true, true);
    next();
  }, rateLimit({ windowMs: 60_000, limit: 5, standardHeaders: "draft-8", legacyHeaders: false, message: { code: "INSTAGRAM_REFRESH_LIMIT", message: "Please wait a minute before refreshing again." } }), async (_req, res) => {
    if (!config) throw new HttpError(409, "INSTAGRAM_FEED_NOT_CONFIGURED", "The Instagram feed is not set up yet.");
    // A cycle can take minutes; it runs on after the reply, and the panel reloads the status.
    const started = await startInstagramRefresh(db, config, { force: true });
    if (!started) throw new HttpError(409, "INSTAGRAM_REFRESH_BUSY", "A refresh is already running. Reload the status in a minute.");
    void started.cycle.catch(() => console.error("Instagram feed refresh failed; the last good posts remain on the homepage."));
    res.status(202).json(await feedStatus(db, config));
  });
}
