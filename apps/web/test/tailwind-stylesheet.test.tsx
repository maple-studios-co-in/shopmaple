import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

// The shared Tailwind stylesheet (admin and redesigned storefront) compiled by the real
// pipeline. Inline styles must be able to win over utilities (dnd-kit moves rows with an inline
// transform and transition, the skeleton staggers with an inline animation delay), the admin's
// scoped base must stay below a class, and no utility may land on the class names the legacy
// storefront markup and stylesheets still use. jsdom ignores importance and specificity, so the
// cascade is checked on the compiled rules rather than through getComputedStyle.
const web = new URL("..", import.meta.url).pathname;
const compile = async (path: string) => {
  const file = web + path;
  const result = await postcss([tailwind({ base: web })]).process(readFileSync(file, "utf8"), { from: file });
  return postcss.parse(result.css);
};
const shared = await compile("styles/tailwind.css");
const admin = await compile("styles/admin.css");
const rules = (root: postcss.Root) => { const found: postcss.Rule[] = []; root.walkRules((rule) => { found.push(rule); }); return found; };
const declaration = (selector: string, prop: string) => {
  let value: string | undefined;
  shared.walkRules((rule) => { if (rule.selector === selector) rule.walkDecls(prop, (decl) => { value = decl.value; }); });
  return value;
};

test("no shared rule outranks an inline style unless its class asks for it with !", () => {
  const important: string[] = [];
  shared.walkDecls((decl) => {
    const rule = decl.parent as postcss.Rule;
    // Allowed: the hidden attribute, and a utility written with the explicit `!` modifier
    // (shadcn's sidebar uses a few, such as `group-data-[collapsible=icon]:size-8!`).
    const explicit = /\\!(?=[:\s.[)]|$)/.test(rule.selector ?? "");
    if (decl.important && !rule.selector?.includes("[hidden]") && !explicit) important.push(`${rule.selector} { ${decl.prop} }`);
  });
  assert.deepEqual(important.slice(0, 5), [], `${important.length} declarations are !important`);
});

test("one utility sheet: the admin token file emits no utilities and its base stays below a class", () => {
  const utility = rules(admin).filter((rule) => /^\.[a-z-]+(\\:|\\\[|-)/.test(rule.selector) && !rule.selector.includes("shop-admin"));
  assert.deepEqual(utility.map((rule) => rule.selector).slice(0, 5), [], "admin.css generates no utilities");
  assert.ok(declaration(".transition-\\[box-shadow\\,border-color\\]", "transition-property"), "The sortable row's utility comes from the shared sheet");
  // Every base rule is scoped through :where(.shop-admin), so it weighs no more than an element
  // (or an element plus a pseudo-class, to tie the storefront's `button:focus-visible`), and any
  // utility class beats it wherever the sheets load.
  for (const rule of rules(admin)) {
    if (rule.parent?.type === "atrule" || rule.selector.startsWith(":root") || rule.selector === ".shop-admin, [data-admin-tokens]") continue;
    assert.match(rule.selector, /^:where\(\.shop-admin\)/, `${rule.selector} is scoped without adding weight`);
  }
});

test("the storefront base reaches redesigned markup only, without adding weight", () => {
  const base = rules(shared).filter((rule) => rule.parent?.type !== "atrule" && !rule.selector.includes(".") && !/^:root|^:host|^\*|^::/.test(rule.selector));
  assert.ok(base.length > 0, "The scoped base is present");
  for (const rule of base) assert.match(rule.selector, /^:where\(\[data-store\]\) /, `${rule.selector} is scoped to [data-store]`);
  const selectors = rules(shared).map((rule) => rule.selector);
  assert.ok(selectors.indexOf(".font-body") > selectors.findLastIndex((selector) => selector.startsWith(":where([data-store])")), "Utilities follow the base");
});

test("storefront tokens resolve to the design's values", () => {
  const value = (name: string) => {
    let found: string | undefined;
    shared.walkDecls(name, (decl) => { found ??= decl.value; });
    return found;
  };
  assert.equal(value("--color-cream"), "#f0eae3");
  assert.equal(value("--color-linen"), "#faf8f4");
  assert.equal(value("--color-espresso"), "#29251f");
  assert.equal(value("--color-taupe"), "#746c62");
  assert.equal(value("--color-sand"), "#e1d9d0");
  assert.equal(value("--color-brand"), "#741a14");
  assert.match(value("--font-body") ?? "", /^"?Barlow/);
  assert.match(value("--font-serif") ?? "", /^"?Newsreader/);
});

test("no utility lands on a class name the legacy storefront still uses", () => {
  // Class tokens in the top-level storefront components (rebuilt ones live in components/store
  // and are only re-exported there), and class selectors in the storefront stylesheets.
  const legacy = new Set<string>();
  const tsx = readdirSync(web + "components").filter((name) => name.endsWith(".tsx")).map((name) => readFileSync(web + "components/" + name, "utf8"));
  for (const source of tsx) {
    for (const [, classes] of source.matchAll(/className=["{`]+([^"`}]+)/g)) for (const token of classes!.split(/\s+/)) if (/^[a-z][a-z0-9-]*$/.test(token)) legacy.add(token);
  }
  for (const name of readdirSync(web + "styles").filter((file) => file.endsWith(".css") && !["admin.css", "tailwind.css"].includes(file))) {
    for (const [, token] of readFileSync(web + "styles/" + name, "utf8").matchAll(/\.([a-z][a-z0-9-]*)/g)) legacy.add(token!);
  }
  const clashes = rules(shared)
    .map((rule) => /^\.([a-z][a-z0-9-]*)$/.exec(rule.selector)?.[1])
    .filter((name): name is string => Boolean(name) && legacy.has(name!) && name !== "sr-only");
  assert.deepEqual([...new Set(clashes)], [], "Utilities generated under legacy storefront class names");
});
