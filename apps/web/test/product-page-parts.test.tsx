import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { SectionHeading } from "../components/store/section-heading";
import { PromiseSection } from "../components/store/promise-strip";

// Parts of the product page design (Figma "Maple / PDF Review"): the section heading and the promise section.
const doc = (element: React.ReactElement) => new JSDOM(renderToStaticMarkup(element)).window.document;
const text = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, " ").trim();

test("a section heading pairs an eyebrow with a serif title at the requested level", () => {
  const heading = doc(<SectionHeading eyebrow="Our promise" title="Every piece. Every time." id="promise" level={3} />);
  const eyebrow = heading.querySelector("[data-section-eyebrow]");
  assert.equal(text(eyebrow), "Our promise");
  assert.equal(heading.querySelector("h3")?.id, "promise");
  assert.equal(text(heading.querySelector("h3")), "Every piece. Every time.");
});

test("the promise section labels its four promises with the design's heading", () => {
  const section = doc(<PromiseSection />).querySelector("section[data-promise-section]")!;
  assert.equal(section.getAttribute("aria-labelledby"), section.querySelector("h2")?.id);
  assert.equal(text(section.querySelector("[data-section-eyebrow]")), "Our promise");
  assert.equal(text(section.querySelector("h2")), "Every piece. Every time.");
  assert.deepEqual([...section.querySelectorAll("[data-promise-strip] strong")].map(text), [
    "Fully customisable", "Crafted in Delhi", "36-month warranty", "Delivery across India",
  ]);
});
