import assert from "node:assert/strict";
import test from "node:test";
import { storefrontContentSchema } from "../../../packages/contracts/src/content";

export const contentFixture = () => ({
  schemaVersion: 1,
  homeSections: [{ key: "instagram", enabled: true }],
  homeCopy: {
    categoryHeading: "Shop By Category",
    bestsellersHeading: "Bestsellers",
    socialHeading: "Our Social Proof",
    ticker: "Elegance isn't found. At Maple, it is custom-built.",
    testimonialHeading: "Why They Love Us",
    testimonialSubheading: "Thoughtful designs. Exceptional service.",
  },
  campaigns: [],
  instagramPosts: [
    {
      href: "https://www.instagram.com/p/Abc123/",
      src: "/media/instagram/example.webp",
      alt: "Maple chair",
    },
  ],
  pages: [],
  motion: { autoplaySocial: true, autoplayCities: true, revealSections: false },
});

test("store content accepts bounded original text and rejects untyped or executable fields", () => {
  assert.equal(
    storefrontContentSchema.safeParse(contentFixture()).success,
    true,
  );
  assert.equal(
    storefrontContentSchema.safeParse({
      ...contentFixture(),
      script: "alert(1)",
    }).success,
    false,
  );
});
test("content rejects duplicate section identities and unknown section types", () => {
  const c = contentFixture();
  c.homeSections.push({ ...c.homeSections[0]! });
  assert.equal(storefrontContentSchema.safeParse(c).success, false);
  assert.equal(
    storefrontContentSchema.safeParse({
      ...contentFixture(),
      homeSections: [{ key: "checkout", enabled: true }],
    }).success,
    false,
  );
});
test("content accepts only approved media and original Instagram destinations", () => {
  for (const src of [
    "https://evil.invalid/a.jpg",
    "//evil.invalid/a.jpg",
    "/media/../admin",
    "/media/%2e%2e/admin",
    "https://cdn.shopify.com.evil.invalid/s/files/a.jpg",
    "https://user@cdn.shopify.com/s/files/a.jpg",
    "data:image/svg+xml,<svg/>",
  ]) {
    const c = contentFixture();
    c.instagramPosts[0]!.src = src;
    assert.equal(storefrontContentSchema.safeParse(c).success, false, src);
  }
  for (const href of [
    "javascript:alert(1)",
    "https://instagram.com.evil.invalid/p/abc/",
    "https://www.instagram.com/accounts/login/",
  ]) {
    const c = contentFixture();
    c.instagramPosts[0]!.href = href;
    assert.equal(storefrontContentSchema.safeParse(c).success, false, href);
  }
});
test("custom pages reserve functional routes and reject unsafe banner destinations", () => {
  const page = {
    slug: "design-guide",
    title: "Design guide",
    description: "Original copy",
    body: "<script>plain text only</script>",
    banner: null,
  };
  assert.equal(
    storefrontContentSchema.safeParse({ ...contentFixture(), pages: [page] })
      .success,
    true,
  );
  for (const slug of [
    "contact",
    "bulk-enquiry",
    "sofas",
    "our-story",
    "returns",
    "admin",
    "../cart",
    "Two-Words",
  ]) {
    assert.equal(
      storefrontContentSchema.safeParse({
        ...contentFixture(),
        pages: [{ ...page, slug }],
      }).success,
      false,
      slug,
    );
  }
  for (const href of [
    "//evil.invalid",
    "https://shop.maplefurnishers.com/",
    "/\\evil.invalid",
    "/pages/%2f%2fevil.invalid",
    "javascript:alert(1)",
  ]) {
    assert.equal(
      storefrontContentSchema.safeParse({
        ...contentFixture(),
        pages: [
          {
            ...page,
            banner: {
              desktopImage: "/media/example.webp",
              mobileImage: "/media/example.webp",
              alt: "Maple",
              href,
              label: "Explore",
            },
          },
        ],
      }).success,
      false,
      href,
    );
  }
  assert.equal(
    storefrontContentSchema.safeParse({
      ...contentFixture(),
      pages: [page, page],
    }).success,
    false,
  );
});
test("content bounds text and rejects duplicate social posts", () => {
  const c = contentFixture();
  c.instagramPosts.push({ ...c.instagramPosts[0]! });
  assert.equal(storefrontContentSchema.safeParse(c).success, false);
  assert.equal(
    storefrontContentSchema.safeParse({
      ...contentFixture(),
      homeCopy: { ...contentFixture().homeCopy, ticker: "x".repeat(601) },
    }).success,
    false,
  );
});
