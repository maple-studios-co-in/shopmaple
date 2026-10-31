import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

// The one Tailwind stylesheet (admin and storefront) compiled by the real pipeline. Inline styles
// must be able to win over utilities (dnd-kit moves rows with an inline transform and transition,
// the skeleton staggers with an inline animation delay), the global and scoped bases and the
// admin's base must stay below a class, and no utility may land on the class names the frozen
// checkout still uses. jsdom ignores importance and specificity, so the cascade is checked on the
// compiled rules rather than through getComputedStyle.
const web = new URL("..", import.meta.url).pathname;
const compile = async (path: string) => {
  const file = web + path;
  const result = await postcss([tailwind({ base: web })]).process(readFileSync(file, "utf8"), { from: file });
  return postcss.parse(result.css);
};
const shared = await compile("styles/tailwind.css");
const admin = await compile("styles/admin.css");
const rules = (root: postcss.Root) => { const found: postcss.Rule[] = []; root.walkRules((rule) => { found.push(rule); }); return found; };
// The base (global rules, checkout's frozen rules, then the [data-store] base) ends with the last
// scoped rule; everything after it is a utility.
const sharedRules = rules(shared);
const baseEnd = sharedRules.findLastIndex((rule) => rule.selector.startsWith(":where([data-store])"));
/** Removes every `:where(...)` group (they weigh nothing), leaving whatever adds specificity. */
const weight = (selector: string) => {
  let out = selector;
  for (let at = out.indexOf(":where("); at !== -1; at = out.indexOf(":where(")) {
    let depth = 0, end = at + 6;
    for (; end < out.length; end++) { if (out[end] === "(") depth++; else if (out[end] === ")" && --depth === 0) break; }
    out = out.slice(0, at) + out.slice(end + 1);
  }
  return out.trim();
};
const declaration = (selector: string, prop: string) => {
  let value: string | undefined;
  shared.walkRules((rule) => { if (rule.selector === selector) rule.walkDecls(prop, (decl) => { value = decl.value; }); });
  return value;
};

test("no shared rule outranks an inline style unless its class asks for it with !", () => {
  const important: string[] = [];
  shared.walkDecls((decl) => {
    const rule = decl.parent as postcss.Rule;
    // Allowed: the hidden attribute, a utility written with the explicit `!` modifier (shadcn's
    // sidebar uses a few, such as `group-data-[collapsible=icon]:size-8!`), and three base rules
    // that must beat everything: the reduced-motion stop, the hidden scrollbars of public routes
    // and checkout's legacy `.button` underline guard.
    const explicit = /\\!(?=[:\s.[)]|$)/.test(rule.selector ?? "");
    const reducedMotion = rule.parent?.type === "atrule" && /prefers-reduced-motion/.test((rule.parent as postcss.AtRule).params) && rule.selector === "*, *::before, *::after";
    const base = reducedMotion || rule.selector?.startsWith("html:has([data-site-header])") || rule.selector === ".button";
    if (decl.important && !rule.selector?.includes("[hidden]") && !explicit && !base) important.push(`${rule.selector} { ${decl.prop} }`);
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

test("the global base weighs nothing and the storefront base reaches redesigned markup only", () => {
  assert.ok(baseEnd > 0, "The scoped base is present");
  const base = sharedRules.slice(0, baseEnd + 1).filter((rule) => rule.parent?.type === "root" || (rule.parent?.type === "atrule" && (rule.parent as postcss.AtRule).name === "media"));
  const scoped = base.filter((rule) => rule.selector.includes("[data-store]"));
  assert.ok(scoped.length > 0);
  for (const rule of scoped) assert.match(rule.selector, /^:where\(\[data-store\]\) /, `${rule.selector} is scoped to [data-store]`);
  // Checkout's frozen markup keeps its legacy class rules at their old weights; its element rules
  // reach only the checkout roots.
  const checkout = new Set([".button", ".button:hover", ".button.secondary", ".button.secondary:hover", ".button-row", ".empty-state", ".empty-state h2", ".empty-state p", ".empty-state .button", ".muted", ".error-text", ".checkout-state", ".checkout-state h1"]);
  for (const rule of base) {
    if (scoped.includes(rule) || checkout.has(rule.selector) || /^:root|^::selection$/.test(rule.selector)) continue;
    if (rule.selector.startsWith("html:has([data-site-header])") || rule.selector === "*, *::before, *::after") continue;
    for (const selector of rule.selectors) {
      if (selector.startsWith(":where(.checkout-page, .checkout-state) ")) continue;
      assert.equal(weight(selector), "", `${selector} weighs nothing, so any class beats it`);
    }
  }
  const selectors = sharedRules.map((rule) => rule.selector);
  assert.ok(selectors.indexOf(".font-body") > baseEnd, "Utilities follow the base");
});

test("the storefront ships one stylesheet, plus the frozen checkout and the font faces", () => {
  const layout = readFileSync(web + "app/layout.tsx", "utf8");
  const sheets = [...layout.matchAll(/^import\s+"([^"]+\.css)";/gm)].map((match) => match[1]!).filter((sheet) => !sheet.startsWith("@fontsource/"));
  assert.deepEqual(sheets, ["@/styles/shopify-fonts.css", "@/styles/checkout.css", "@/styles/tailwind.css"]);
  assert.deepEqual(readdirSync(web + "styles").sort(), ["admin.css", "checkout.css", "shopify-fonts.css", "tailwind.css"]);
  assert.equal(existsSync(web + "app/globals.css"), false);
  assert.deepEqual(readdirSync(web + "components").filter((name) => name.endsWith(".css")), []);
  // Rebuilt markup lives in components/store; the top-level paths only re-export it.
  const styled = readdirSync(web + "components").filter((name) => name.endsWith(".tsx") && /className=/.test(readFileSync(web + "components/" + name, "utf8")));
  assert.deepEqual(styled, []);
});

test("dark: utilities stay off: admin and storefront are light only, whatever the OS setting", () => {
  const dark: string[] = [];
  shared.walkAtRules("media", (at) => { if (/prefers-color-scheme:\s*dark/.test(at.params)) dark.push(at.params); });
  assert.deepEqual(dark.slice(0, 3), [], "shadcn's dark: classes must not follow the OS colour scheme");
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

test("no utility lands on a class name the frozen checkout still uses", () => {
  // Class tokens in the top-level components (none should remain) and the checkout markup, and
  // class selectors in the stylesheets that stay beside tailwind.css (checkout and fonts).
  const legacy = new Set<string>();
  const tsx = [
    ...readdirSync(web + "components").filter((name) => name.endsWith(".tsx")).map((name) => readFileSync(web + "components/" + name, "utf8")),
    ...readdirSync(web + "app/checkout").filter((name) => name.endsWith(".tsx")).map((name) => readFileSync(web + "app/checkout/" + name, "utf8")),
  ];
  for (const source of tsx) {
    for (const [, classes] of source.matchAll(/className=["{`]+([^"`}]+)/g)) for (const token of classes!.split(/\s+/)) if (/^[a-z][a-z0-9-]*$/.test(token)) legacy.add(token);
  }
  for (const name of readdirSync(web + "styles").filter((file) => file.endsWith(".css") && !["admin.css", "tailwind.css"].includes(file))) {
    for (const [, token] of readFileSync(web + "styles/" + name, "utf8").matchAll(/\.([a-z][a-z0-9-]*)/g)) legacy.add(token!);
  }
  assert.ok(legacy.has("button") && legacy.has("checkout-page"), "The checkout's class names are collected");
  const clashes = sharedRules.slice(baseEnd + 1)
    .map((rule) => /^\.([a-z][a-z0-9-]*)$/.exec(rule.selector)?.[1])
    .filter((name): name is string => Boolean(name) && legacy.has(name!) && name !== "sr-only");
  assert.deepEqual([...new Set(clashes)], [], "Utilities generated under legacy class names");
});
