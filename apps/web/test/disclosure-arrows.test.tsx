import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { HelpPage } from "../components/store/help-page";
import { PolicyContents } from "../components/store/policy-contents";

// The owner (10 Nov 2026): "the arrow direction is to be reversed everywhere across the website: it should be down when
// in collapsed state and up when opened." Every disclosure that carries an arrow or chevron points down while closed
// and turns, smoothly, to point up once open. Pluses (the hotspots, the size filters, the help centre's questions)
// are not arrows and keep their quarter turn.
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const doc = (markup: string) => new JSDOM(markup).window.document;

function storefrontSources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "admin" || name === "ui" ? [] : storefrontSources(path);
    return /\.tsx$/.test(name) ? [path] : [];
  });
}

test("no storefront disclosure opens from an up arrow or swaps its arrow for an up one", () => {
  for (const path of storefrontSources(fileURLToPath(new URL("../components/", import.meta.url)))) {
    const source = readFileSync(path, "utf8");
    assert.doesNotMatch(source, /\bArrowUp\b(?!Right|Left)/, `${path} draws an up arrow`);
    assert.doesNotMatch(source, /content-\['↑'\]/, `${path} swaps in an up arrow when open`);
  }
});

// The help pages' menus on a phone ("HELP / Privacy Policy ↓", "Jump to a section ↓") already pointed down while
// closed; they now turn rather than swap the arrow.
function assertMenuArrow(summary: Element | null, what: string) {
  const className = summary?.getAttribute("class") ?? "";
  assert.match(className, /after:content-\['↓'\]/, `${what}: a down arrow while closed`);
  assert.match(className, /after:inline-block/, `${what}: the arrow can turn`);
  assert.match(className, /group-open:after:rotate-180/, `${what}: it turns up once open`);
  assert.match(className, /after:transition-transform/, `${what}: smoothly`);
  assert.match(className, /after:ease-\[cubic-bezier\(\.22,1,\.36,1\)\]/, `${what}: easing out`);
  assert.match(className, /motion-reduce:after:transition-none/, `${what}: still for reduced motion`);
  assert.doesNotMatch(className, /content-\['↑'\]/, `${what}: no second arrow swapped in`);
}

test("the help pages' menus turn their arrow up when open", () => {
  const help = doc(renderToStaticMarkup(
    <HelpPage chrome={{ links: [{ label: "Privacy Policy", href: "/policies/privacy-policy" }], care: { email: "care@example.com", phone: "+911234567890", phoneLabel: "+91 12345 67890" } }}
      current="/policies/privacy-policy" title="Privacy policy" photo="/media/policies/privacy-policy.jpg">
      <p>Body</p>
    </HelpPage>,
  ));
  assertMenuArrow(help.querySelector("[data-help-menu] summary"), "Help menu");
  const contents = doc(renderToStaticMarkup(<PolicyContents sections={[{ id: "one", number: "01", title: "One" }]} />));
  assertMenuArrow(contents.querySelector('[data-policy-contents="menu"] summary'), "Jump to a section");
});

test("the chairs page's questions open from a down arrow that turns up, in place of the browser's sideways triangle", () => {
  const css = read("../components/legacy-chairs.css");
  assert.match(css, /\.legacy-chairs \.legacy-chairs-faq summary \{[^}]*list-style: none;/, "the browser's triangle is gone");
  assert.match(css, /\.legacy-chairs \.legacy-chairs-faq summary::-webkit-details-marker \{\s*display: none;/);
  const arrow = /\.legacy-chairs \.legacy-chairs-faq summary::before \{([^}]*)\}/.exec(css)?.[1] ?? "";
  assert.match(arrow, /content: "";/, "an arrow is drawn where the triangle was, before the question");
  assert.match(arrow, /rotate: 45deg;/, "pointing down while closed");
  assert.match(arrow, /transition: rotate 0\.5s cubic-bezier\(0\.22, 1, 0\.36, 1\)/, "turning smoothly");
  assert.match(css, /\.legacy-chairs \.legacy-chairs-faq details\[open\] > summary::before \{\s*rotate: 225deg;/, "and up once open");
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.legacy-chairs \.legacy-chairs-faq summary::before \{\s*transition: none;/);
});

test("the main menu's chevron already follows the rule: down while closed, up while its menu is open", () => {
  const css = read("../styles/header-menu.css");
  assert.match(read("../components/navigation.tsx"), /<ChevronDown aria-hidden="true"[^>]*data-menu-chevron/);
  assert.match(css, /\.maple-menu-trigger\[aria-expanded="true"\] svg\[data-menu-chevron\] \{\s*transform: rotate\(180deg\);/);
  assert.match(css, /\.maple-menu-trigger svg\[data-menu-chevron\] \{\s*transition: transform/);
});
