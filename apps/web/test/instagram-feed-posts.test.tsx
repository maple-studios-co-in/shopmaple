import assert from "node:assert/strict";
import test from "node:test";
import { homeInstagramPosts } from "../lib/instagram-feed";

// The homepage Instagram row reads its posts from homeInstagramPosts: the API's cached Meta feed when it
// has posts, and the staff-edited list otherwise (feed off, nothing fetched yet, the API failing or
// answering nonsense). The shape is the staff list's, so any homepage design can render either.
const staffPosts = [
  { href: "https://www.instagram.com/p/StaffOne/", src: "/media/instagram/De4Nz4VvwNZ.jpg", alt: "Staff post one" },
  { href: "https://www.instagram.com/reel/StaffTwo/", src: "/media/instagram/De1sBF7vIl5.jpg", alt: "Staff post two" },
];
const feedPosts = [
  { href: "https://www.instagram.com/p/FeedOne/", src: `/media/instagram-feed/${"a".repeat(64)}.webp`, alt: "Instagram post with the caption: A walnut table" },
  { href: "https://www.instagram.com/reel/FeedTwo/", src: `/media/instagram-feed/${"b".repeat(64)}.webp`, alt: "Maple on Instagram" },
];
const transport = (feed: (signal?: AbortSignal) => Promise<Response>, requested: string[] = []) =>
  (async (input: string | URL | Request, init?: RequestInit) => {
    requested.push(new URL(String(input)).pathname);
    assert.equal(init?.cache, "no-store", "Hidden posts leave the homepage at once");
    return feed(init?.signal ?? undefined);
  }) as typeof fetch;

test("the fetched Instagram posts replace the staff list, as our own image copies", async () => {
  const requested: string[] = [];
  assert.deepEqual(await homeInstagramPosts(staffPosts, transport(async () => Response.json({ posts: feedPosts }), requested)), feedPosts);
  assert.deepEqual(requested, ["/api/instagram/feed"]);
});

test("with no fetched posts the staff-edited list is used unchanged", async () => {
  const cases: [string, () => Promise<Response>][] = [
    ["feed off or not fetched yet", async () => Response.json({ posts: [] })],
    ["API error", async () => new Response("down", { status: 500 })],
    ["API unreachable", async () => { throw new TypeError("fetch failed"); }],
    ["not JSON", async () => new Response("<html>", { status: 200 })],
    ["an Instagram CDN address instead of our copy", async () => Response.json({ posts: [{ ...feedPosts[0], src: "https://scontent.cdninstagram.com/x.jpg" }] })],
  ];
  for (const [name, feed] of cases) assert.equal(await homeInstagramPosts(staffPosts, transport(feed)), staffPosts, name);
});

test("a feed request that hangs is abandoned after two seconds", async () => {
  const started = Date.now();
  const posts = await homeInstagramPosts(staffPosts, transport((signal) => new Promise((_resolve, reject) => signal?.addEventListener("abort", () => reject(signal.reason)))));
  assert.equal(posts, staffPosts);
  assert.ok(Date.now() - started < 3000);
});
