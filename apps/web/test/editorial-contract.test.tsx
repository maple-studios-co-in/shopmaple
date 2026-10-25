import assert from "node:assert/strict";
import test from "node:test";
import { storefrontContentSchema } from "../../../packages/contracts/src/content";
import { defaultStorefrontContent } from "../lib/content-defaults";

const articleHandle = "how-to-measure-furniture-before-ordering-online";
const fixture = () => ({
  policies: [{ slug: "privacy-policy", title: "Your privacy", content: [{ tag: "p", children: ["Original  spacing\nretained."] }] }],
  blogs: [{ handle: "recent-stories", title: "From our studio" }],
  articles: [{ blog: "recent-stories", handle: articleHandle, title: "Measuring your room", excerpt: "A short introduction", content: [{ tag: "h2", children: ["Start here"] }] }],
});
const parse = (editorialContent: unknown) => storefrontContentSchema.safeParse({ ...defaultStorefrontContent, editorialContent });

test("legacy storefront content remains valid without editorial overrides", () => {
  const result = storefrontContentSchema.safeParse(defaultStorefrontContent);
  assert.equal(result.success, true);
  if (result.success) assert.equal(Object.hasOwn(result.data, "editorialContent"), false);
});
test("storefront accepts sparse policy, blog and article edits without altering their text", () => {
  const result = parse(fixture());
  assert.equal(result.success, true, "typed editorial overrides must be accepted");
  if (result.success) assert.deepEqual(result.data.editorialContent, fixture());
});

test("editorial documents reject executable nodes, hidden fields and unsafe link or media destinations", () => {
  const nodeCases = [
    { tag: "script", children: [] },
    { tag: "p", children: [{ tag: "span", children: ["Hi"], onclick: "alert(1)" }] },
    { tag: "p", children: [], href: "/" },
    { tag: "a", children: [], src: "https://cdn.shopify.com/s/files/a.png" },
    { tag: "br", children: ["hidden"] }, { tag: "hr", children: ["hidden"] },
    { tag: "img", children: ["hidden"], src: "https://cdn.shopify.com/s/files/a.png" },
    ...["javascript:alert(1)", "data:text/html,<script>", "//evil.invalid/a", "https://user:pass@example.com/a", "https://example.com/a b", "https://example.com/a\\b", "https://example.com/\u0000", "http://example.com", "/admin", "/pages/%2e%2e/admin", "https://checkout.shopify.com/", "https://other.myshopify.com/", "https://shop.maplefurnishers.com/admin", "https://evil.invalid/"] .map(href => ({ tag: "a", href, children: ["Link"] })),
    ...["/media/uploads/a.webp", "data:image/png,x", "https://evil.invalid/a.png", "https://user@cdn.shopify.com/s/files/a.png", "https://cdn.shopify.com.evil.invalid/s/files/a.png"].map(src => ({ tag: "img", src, children: [], alt: "Image" })),
  ];
  for (const node of nodeCases) assert.equal(parse({ ...fixture(), policies: [{ ...fixture().policies[0], content: [node] }] }).success, false, JSON.stringify(node));
});

test("editorial identity and text limits cannot introduce routes, dates, images or duplicate documents", () => {
  const original = fixture();
  for (const value of [
    { ...original, html: "<p>extra</p>" },
    { ...original, policies: [{ ...original.policies[0], slug: "checkout" }] },
    { ...original, policies: [...original.policies, ...original.policies] },
    { ...original, blogs: [...original.blogs, ...original.blogs] },
    { ...original, articles: [...original.articles, ...original.articles] },
    { ...original, blogs: [{ handle: "other", title: "Other" }] },
    { ...original, articles: [{ ...original.articles[0], handle: "new-story" }] },
    { ...original, articles: [{ ...original.articles[0], blog: "news" }] },
    { ...original, articles: [{ ...original.articles[0], publishedAt: "2030-01-01" }] },
    { ...original, articles: [{ ...original.articles[0], image: "/media/x.webp" }] },
    { ...original, policies: [{ ...original.policies[0], title: "  " }] },
    { ...original, policies: [{ ...original.policies[0], title: "x".repeat(161) }] },
    { ...original, articles: [{ ...original.articles[0], title: "x".repeat(301) }] },
    { ...original, articles: [{ ...original.articles[0], excerpt: "x".repeat(2001) }] },
    { ...original, policies: [{ ...original.policies[0], content: ["a\u0000b"] }] },
    { ...original, policies: [{ ...original.policies[0], content: ["x".repeat(16001)] }] },
  ]) assert.equal(parse(value).success, false, "Invalid editorial document must be rejected");
});

test("editorial traversal bounds depth, node count and UTF-8 bytes before recursive parsing", () => {
  const policy = (content: unknown[]) => ({ policies: [{ slug: "privacy-policy", title: "Privacy", content }], blogs: [], articles: [] });
  let node: unknown = "leaf";
  for (let i = 0; i < 19; i++) node = { tag: "div", children: [node] };
  assert.equal(parse(policy([node])).success, true, "20 levels including leaf must fit");
  assert.equal(parse(policy([{ tag: "div", children: [node] }])).success, false);
  assert.equal(parse(policy(Array(2000).fill("x"))).success, true);
  assert.equal(parse(policy(Array(2001).fill("x"))).success, false);
  assert.equal(parse(policy(["x".repeat(16000), "x".repeat(16000), "x".repeat(16000)])).success, true);
  assert.equal(parse(policy(["界".repeat(16000), "界".repeat(1000)])).success, false, "48 KiB uses UTF-8 bytes");
  let deep: unknown = "leaf";
  for (let i = 0; i < 10000; i++) deep = { tag: "div", children: [deep] };
  assert.equal(parse(policy([deep])).success, false, "Deep input must fail without overflowing");
});

test("editorial defaults preserve original documents and real listing excerpts without shared mutation", async () => {
  const { resolveEditorialContent } = await import("../lib/editorial-content-defaults");
  const source = (await import("../data/store-content.json")).default;
  const listing = (await import("../data/blog-index.json")).default;
  const value = resolveEditorialContent();
  assert.deepEqual(value.policies, source.policies);
  assert.equal(value.blogs.length, 4);
  const article = value.blogs.find(blog => blog.handle === "recent-stories")!.articles.find(article => article.handle === articleHandle)!;
  assert.equal(article.excerpt, listing["recent-stories"][articleHandle].excerpt);
  assert.notEqual(article.excerpt, article.summary);
  const original = source.blogs.find(blog => blog.handle === "recent-stories")!.articles.find(article => article.handle === articleHandle)!;
  assert.deepEqual(article.content, original.content);
  assert.equal(article.publishedAt, original.publishedAt);
  value.policies["privacy-policy"]!.content.splice(0);
  article.content.splice(0);
  assert.deepEqual(resolveEditorialContent().policies, source.policies);
  assert.deepEqual(resolveEditorialContent().blogs.find(blog => blog.handle === "recent-stories")!.articles.find(article => article.handle === articleHandle)!.content, original.content);
});

test("sparse overrides merge by identity while retaining sibling copy, dates, images and empty excerpts", async () => {
  const { resolveEditorialContent } = await import("../lib/editorial-content-defaults");
  const source = (await import("../data/store-content.json")).default;
  const parsed = parse({ ...fixture(), articles: [{ ...fixture().articles[0], excerpt: "" }] });
  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  const resolved = resolveEditorialContent(parsed.data.editorialContent);
  assert.deepEqual(resolved.policies["privacy-policy"], { title: "Your privacy", content: [{ tag: "p", children: ["Original  spacing\nretained."] }] });
  assert.deepEqual(resolved.policies["refund-policy"], source.policies["refund-policy"]);
  const blog = resolved.blogs.find(blog => blog.handle === "recent-stories")!;
  assert.equal(blog.title, "From our studio");
  assert.equal(blog.articles.length, 10);
  const article = blog.articles.find(article => article.handle === articleHandle)!;
  assert.equal(article.title, "Measuring your room");
  assert.equal(article.excerpt, "");
  assert.deepEqual(article.content, [{ tag: "h2", children: ["Start here"] }]);
  assert.equal(article.publishedAt, source.blogs.find(blog => blog.handle === "recent-stories")!.articles.find(article => article.handle === articleHandle)!.publishedAt);
  const sibling = "standard-dining-table-size-guide-for-indian-homes";
  assert.deepEqual(blog.articles.find(article => article.handle === sibling)!.content, source.blogs.find(blog => blog.handle === "recent-stories")!.articles.find(article => article.handle === sibling)!.content);
  article.content.splice(0);
  assert.equal(parsed.data.editorialContent!.articles[0]!.content.length, 1);
});

test("every original source document fits the editable contract including image leaf nodes", async () => {
  const source = (await import("../data/store-content.json")).default;
  const listing = (await import("../data/blog-index.json")).default as Record<string, Record<string, { excerpt: string }>>;
  const all = {
    policies: Object.entries(source.policies).map(([slug, policy]) => ({ slug, ...policy })),
    blogs: source.blogs.map(({ handle, title }) => ({ handle, title })),
    articles: source.blogs.flatMap(blog => blog.articles.map(({ handle, title, content }) => ({ blog: blog.handle, handle, title, content, excerpt: listing[blog.handle]?.[handle]?.excerpt ?? "" }))),
  };
  const result = parse(all);
  assert.equal(result.success, true, result.success ? "" : result.error.message);
});

test("approved editorial links, media and literal markup survive validation as text", () => {
  const content = [
    ...["/", "/pages/contact", "/policies/refund-policy", "/blogs/recent-stories/how-to-measure-furniture-before-ordering-online", "https://maplefurnishers.com/pages/contact", "https://store.maplefurnishers.com/collections/chairs", "mailto:hello@maplefurnishers.com", "tel:+911234567890"].map(href => ({ tag: "a", href, children: ["Link"] })),
    { tag: "img", src: "https://cdn.shopify.com/s/files/1/0691/8651/9229/files/image2.png?v=1783927419", alt: "Original image", children: [] },
    "<script>Literal text only</script>\n  preserved",
  ];
  const result = parse({ policies: [{ slug: "shipping-policy", title: "Shipping", content }], blogs: [], articles: [] });
  assert.equal(result.success, true);
  if (result.success) assert.deepEqual(result.data.editorialContent!.policies[0]!.content, content);
});

test("the document byte limit includes article titles and excerpts", () => {
  assert.equal(parse({ policies: [], blogs: [], articles: [{ ...fixture().articles[0], title: "x".repeat(300), excerpt: "x".repeat(2000), content: Array(3).fill("x".repeat(16000)) }] }).success, false, "Whole article must fit48KiB including title and excerpt");
});

test("absolute links must retain canonical paths without parent traversal", () => {
  assert.equal(parse({ ...fixture(), policies: [{ ...fixture().policies[0], content: [{ tag: "a", href: "https://maplefurnishers.com/pages/../products/chair", children: ["Link"] }] }] }).success, false);
});

test("cyclic documents fail safely and independently valid documents still obey the whole-store limit", () => {
  const cyclic: { tag: string; children: unknown[] } = { tag: "div", children: [] };
  cyclic.children.push(cyclic);
  assert.equal(parse({ policies: [{ slug: "privacy-policy", title: "Privacy", content: [cyclic] }], blogs: [], articles: [] }).success, false);
  const policy = (slug: string) => ({ slug, title: "Policy", content: Array(3).fill("x".repeat(16000)) });
  assert.equal(parse({ policies: [policy("privacy-policy")], blogs: [], articles: [] }).success, true);
  assert.equal(parse({ policies: [policy("privacy-policy"), policy("refund-policy")], blogs: [], articles: [] }).success, false, "Existing default payload plus two valid documents exceeds128KiB");
});

test("the 48KiB document limit accepts the exact boundary and rejects one additional byte", () => {
  const policy = { slug: "privacy-policy", title: "Privacy", content: ["x".repeat(16000), "x".repeat(16000), "x".repeat(16000), ""] };
  const spare = 48 * 1024 - Buffer.byteLength(JSON.stringify(policy), "utf8");
  policy.content[3] = "x".repeat(spare);
  assert.equal(Buffer.byteLength(JSON.stringify(policy), "utf8"), 49152);
  assert.equal(parse({ policies: [policy], blogs: [], articles: [] }).success, true);
  policy.content[3] += "x";
  assert.equal(parse({ policies: [policy], blogs: [], articles: [] }).success, false);
});
