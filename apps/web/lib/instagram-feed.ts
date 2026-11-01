import "server-only";
import { instagramFeedResponseSchema, type InstagramFeedPost } from "@shopmaple/contracts";
import type { StorefrontContent } from "@shopmaple/contracts";

/** The API's cached Instagram posts; empty when the feed is off, not fetched yet, or the API fails (docs/instagram-feed.md). */
export async function readInstagramFeed(transport: typeof fetch = fetch): Promise<InstagramFeedPost[]> {
  // A ref'd timer (AbortSignal.timeout's is not) bounds headers and body alike.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2000);
  try {
    const response = await transport((process.env.API_URL ?? "http://127.0.0.1:4100") + "/api/instagram/feed", { cache: "no-store", signal: controller.signal });
    if (!response.ok) return [];
    const result = instagramFeedResponseSchema.safeParse(await response.json());
    return result.success ? result.data.posts : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The posts for the homepage Instagram row, in the same shape as the staff-edited `instagramPosts`:
 * the fetched feed when it has posts, otherwise the staff list unchanged.
 */
export async function homeInstagramPosts(staffPosts: StorefrontContent["instagramPosts"], transport: typeof fetch = fetch): Promise<StorefrontContent["instagramPosts"]> {
  const posts = await readInstagramFeed(transport);
  return posts.length ? posts : staffPosts;
}
