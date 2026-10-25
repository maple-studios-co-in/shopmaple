import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { StoreContent } from "../components/store-content";
import content from "../data/store-content.json";
test("source content preserves words while removing executable HTML and unsafe destinations", () => {
  const nodes = [
    {
      tag: "p",
      children: [
        "Original <care> & comfort.",
        {
          tag: "a",
          href: "https://shop.maplefurnishers.com/collections/chairs",
          children: ["Explore chairs"],
        },
        {
          tag: "a",
          href: "javascript:alert(1)",
          children: ["Unsafe destination"],
        },
      ],
    },
    { tag: "script", children: ["alert(1)"] },
  ];
  const doc = new JSDOM(renderToStaticMarkup(<StoreContent nodes={nodes} />))
    .window.document;
  assert.match(doc.body.textContent!, /Original <care> & comfort/);
  assert.equal(
    doc.querySelector("a")?.getAttribute("href"),
    "/collections/chairs",
  );
  assert.equal(doc.querySelector("script"), null);
  assert.equal(doc.querySelector('[href^="javascript"]'), null);
});
test("migrated policy renders complete source copy with the authorized customer contact", () => {
  const doc = new JSDOM(
    renderToStaticMarkup(
      <StoreContent nodes={content.policies["privacy-policy"].content} />,
    ),
  ).window.document;
  assert.match(doc.body.textContent!, /How We Use Your Information/);
  assert.match(doc.body.textContent!, /Data Retention/);
  assert.match(doc.body.textContent!, /8796130252/);
  assert.doesNotMatch(doc.body.textContent!, /9211819727/);
});
test("unusable media and disguised script links cannot break or execute in source content", () => {
  const nodes = [
    { tag: "img", src: "https://[invalid", children: [] },
    { tag: "a", href: " \nJaVaScRiPt:alert(1)", children: ["Text remains"] },
    { tag: "img", src: "https://unverified.example/image.jpg", children: [] },
  ];
  const doc = new JSDOM(renderToStaticMarkup(<StoreContent nodes={nodes} />))
    .window.document;
  assert.equal(doc.querySelectorAll("img").length, 0);
  assert.match(doc.body.textContent!, /Text remains/);
  assert.equal(doc.querySelector("a")?.hasAttribute("href"), false);
});
