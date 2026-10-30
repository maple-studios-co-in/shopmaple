import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

// The admin stylesheet compiled by the real Tailwind pipeline. Inline styles must be able to
// win over admin utilities (dnd-kit moves rows with an inline transform and transition, the
// skeleton staggers with an inline animation delay), and utilities must come after the scoped
// base so a class always beats the base on equal specificity. jsdom ignores importance, so the
// cascade is checked on the compiled rules rather than through getComputedStyle.
const file = new URL("../styles/admin.css", import.meta.url).pathname;
const base = new URL("..", import.meta.url).pathname;
const result = await postcss([tailwind({ base })]).process(readFileSync(file, "utf8"), { from: file });
const root = postcss.parse(result.css);

test("no admin rule outranks an inline style unless its class asks for it with !", () => {
  const important: string[] = [];
  root.walkDecls((declaration) => {
    const rule = declaration.parent as postcss.Rule;
    // Allowed: the hidden attribute, and a utility written with the explicit `!` modifier
    // (shadcn's sidebar uses a few, such as `group-data-[collapsible=icon]:size-8!`).
    const explicit = /\\!(?=[:\s.[)]|$)/.test(rule.selector ?? "");
    if (declaration.important && !rule.selector?.includes("[hidden]") && !explicit) important.push(`${rule.selector} { ${declaration.prop} }`);
  });
  assert.deepEqual(important.slice(0, 5), [], `${important.length} declarations are !important`);
});

test("the sortable row's transition utility is overridable and comes after the scoped base", () => {
  const selectors: string[] = [];
  root.walkRules((rule) => { selectors.push(rule.selector); });
  const rowTransition = selectors.indexOf(".transition-\\[box-shadow\\,border-color\\]");
  const lastBase = selectors.findLastIndex((selector) => selector.includes(":where(.shop-admin)"));
  assert.ok(rowTransition >= 0, "The row card's transition utility is generated");
  assert.ok(lastBase >= 0, "The scoped base is present");
  assert.ok(rowTransition > lastBase, "Utilities follow the base, so a class wins on equal specificity");
});
