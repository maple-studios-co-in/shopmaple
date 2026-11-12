import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { contentLinkSchema, contentPageSchema, siteChromeSchema, storeRouteNames } from "@shopmaple/contracts";
import config from "../next.config";
import { chromeHref, defaultSiteChrome } from "../lib/site-chrome-defaults";

// Pages moved from Shopify's /pages/<slug> to /<slug> (10 Nov 2026).
const root = fileURLToPath(new URL("..", import.meta.url));

test("old /pages/ addresses redirect permanently to the short address, keeping the query", async () => {
  const redirects = await config.redirects!();
  assert.deepEqual(redirects.filter((r) => r.source.startsWith("/pages/")), [{ source: "/pages/:slug", destination: "/:slug", permanent: true }]);
});

// The products that existed only in the old Shopify catalogue left the store (owner, 11 Nov 2026). Each old address goes
// to its kind's collection, or to all furniture when its kind is unknown, temporarily (307), never to a not-found page.
test("a retired product's old address redirects temporarily to its collection, else to all furniture", async () => {
  const redirects = (await config.redirects!()).filter((r) => r.source.startsWith("/products/"));
  assert.equal(redirects.length, 154, "every Shopify-only product of the 11 Nov 2026 inventory");
  assert.ok(redirects.every((r) => r.permanent === false), "temporary, while the owner decides what returns");
  const to = (handle: string) => redirects.find((r) => r.source === `/products/${handle}`)?.destination;
  assert.equal(to("sora-5-seater-sofa"), "/collections/sofas");
  assert.equal(to("nova-dining-table"), "/collections/tables");
  assert.equal(to("orvane-accent-chair"), "/collections/chairs");
  assert.equal(to("aileron-signature-bed"), "/collections/beds");
  assert.equal(to("arden-console-cabinet"), "/collections/storage");
  // The outdoor sets return through Keeri under new addresses (owner, 12 Nov 2026); the cot is Keeri's Elara crib.
  assert.equal(to("tavira-bistro-outdoor-set"), "/collections/outdoors");
  assert.equal(to("cozy-cot-baby-bed"), "/collections/kids-beds");
  assert.equal(to("veya"), "/collections/all", "no known kind");
  for (const kept of ["caro", "aero-dining-chair", "sora", "avelon-chair"]) assert.equal(to(kept), undefined, `${kept} is listed and keeps its page`);
  const collections = new Set(["sofas", "chairs", "tables", "beds", "storage", "outdoors", "kids-beds", "all"]);
  assert.ok(redirects.every((r) => /^\/products\/[a-z0-9-]+$/.test(r.source) && collections.has(r.destination.replace("/collections/", ""))));
});

test("every original page is served at its short address and none is left under /pages", () => {
  for (const slug of ["sofas", "chairs", "tables", "our-story", "nimbus-collection", "returns", "[slug]"])
    assert.ok(existsSync(join(root, "app", slug, "page.tsx")), `app/${slug}/page.tsx`);
  assert.equal(existsSync(join(root, "app", "pages")), false);
});

test("store code links to pages by their short address", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(tsx?|json)$/.test(name)) files.push(path);
    }
  };
  for (const dir of ["app", "components", "lib", "data"]) walk(join(root, dir));
  // A quoted "/pages/..." is a link; the redirect and the old-link mapping name the old form on purpose.
  const allowed = new Set(["lib/site-chrome-defaults.ts"]);
  const offenders = files
    // Forward slashes on every system, so the allowance also holds on Windows.
    .filter((file) => !allowed.has(relative(root, file).replaceAll("\\", "/")))
    .filter((file) => /["'`(]\/pages\//.test(readFileSync(file, "utf8")))
    .map((file) => relative(root, file).replaceAll("\\", "/"));
  assert.deepEqual(offenders, []);
});

test("short page links are store links, while the store's own routes and the old form stay as they were", () => {
  for (const href of ["/contact", "/our-story", "/bulk-enquiry#form", "/pages/contact", "/collections/all"])
    assert.equal(contentLinkSchema.safeParse(href).success, true, href);
  for (const name of storeRouteNames)
    assert.equal(contentLinkSchema.safeParse(`/${name}`).success, false, `/${name}`);
  for (const href of ["/admin", "/api", "/cart", "/%63ontact", "/contact/extra", "/Contact"])
    assert.equal(contentLinkSchema.safeParse(href).success, false, href);
});

test("a staff page cannot take a store route name as its slug", () => {
  const page = { slug: "care-guide", title: "Care guide", description: "", body: "", banner: null };
  assert.equal(contentPageSchema.safeParse(page).success, true);
  for (const slug of [...storeRouteNames, "contact", "sofas"])
    assert.equal(contentPageSchema.safeParse({ ...page, slug }).success, false, slug);
});

test("an enquiry link saved with the old contact address still opens the contact form with its subject", () => {
  const custom = defaultSiteChrome.navigation.find((item) => item.id === "nav-custom")!;
  assert.equal(chromeHref(custom), "/contact?product=Custom+furniture");
  assert.equal(chromeHref({ ...custom, href: "/pages/contact" }), "/contact?product=Custom+furniture");
  const legacy = structuredClone(defaultSiteChrome);
  legacy.navigation = legacy.navigation.map((item) => (item.id === "nav-custom" ? { ...item, href: "/pages/contact" } : item));
  assert.equal(siteChromeSchema.safeParse(legacy).success, true);
});
