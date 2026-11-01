import { z } from "zod";

/** A post's address on Instagram, as the Graph API returns it in `permalink`. */
const permalink = z.string().max(300).regex(/^https:\/\/(?:www\.)?instagram\.com\/(?:p|reel|tv)\/[A-Za-z0-9_-]+\/?$/);
/** Our own copy of the post's image, served by the API; never an Instagram CDN address. */
const feedImage = z.string().regex(/^\/media\/instagram-feed\/[a-f0-9]{64}\.webp$/);

/** One post in the homepage row, in the same shape as the staff-edited `instagramPosts`. */
export const instagramFeedPostSchema = z.object({ href: permalink, src: feedImage, alt: z.string().min(1).max(200) }).strict();
/** The public feed; an empty list means "use the staff-edited posts". */
export const instagramFeedResponseSchema = z.object({ posts: z.array(instagramFeedPostSchema).max(24) }).strict();
export type InstagramFeedPost = z.infer<typeof instagramFeedPostSchema>;

export const instagramFeedErrorCodes = ["token_invalid", "permission_denied", "rate_limited", "meta_unavailable", "invalid_response", "empty_feed", "token_refresh_failed"] as const;

/** The admin view of the feed: whether it is set up, how the last refresh went, and every cached post. */
export const instagramFeedStatusSchema = z.object({
  configured: z.boolean(),
  status: z.enum(["not_configured", "waiting", "refreshing", "ok", "error"]),
  lastAttemptAt: z.iso.datetime().nullable(),
  lastSuccessAt: z.iso.datetime().nullable(),
  errorCode: z.enum(instagramFeedErrorCodes).nullable(),
  /** Null when the token never expires (a Page token) or its expiry is unknown. */
  tokenExpiresAt: z.iso.datetime().nullable(),
  /** When Meta's data access for the token lapses (about 90 days after a person last approved it); null when not reported. */
  dataAccessExpiresAt: z.iso.datetime().nullable(),
  posts: z.array(z.object({
    id: z.string().regex(/^[0-9]{1,40}$/),
    href: permalink,
    src: feedImage,
    caption: z.string().max(200),
    postedAt: z.iso.datetime(),
    hidden: z.boolean(),
  }).strict()).max(24),
}).strict();
export type InstagramFeedStatus = z.infer<typeof instagramFeedStatusSchema>;

export const instagramFeedVisibilityInputSchema = z.object({ hidden: z.boolean() }).strict();
