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

async function withRenderedContent(nodes: React.ComponentProps<typeof StoreContent>["nodes"], run: (document: Document) => void) {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" });
  const previous = { window: globalThis.window, document: globalThis.document };
  const previousError = console.error;
  const errors: string[] = [];
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  const { createRoot } = await import("react-dom/client");
  const { act } = await import("react");
  const root = createRoot(dom.window.document.getElementById("root")!);
  console.error = (...args) => { errors.push(args.map(String).join(" ")); };
  try {
    await act(async () => root.render(<StoreContent nodes={nodes} />));
    run(dom.window.document);
    assert.deepEqual(errors, [], "table rendering must not warn about invalid HTML or hydration");
  } finally {
    await act(async () => root.unmount());
    console.error = previousError;
    Object.assign(globalThis, previous);
    dom.window.close();
  }
}

function assertValidTableChildren(document: Document) {
  for (const parent of document.querySelectorAll("table, thead, tbody, tr")) {
    const allowed = parent.tagName === "TABLE" ? ["THEAD", "TBODY"] : parent.tagName === "TR" ? ["TD", "TH"] : ["TR"];
    for (const child of parent.childNodes) {
      assert.equal(child.nodeType, 1, `${parent.tagName} contains a text node that would break hydration`);
      assert.ok(allowed.includes((child as Element).tagName), `${parent.tagName} contains invalid ${(child as Element).tagName}`);
    }
  }
}

// Catches source whitespace/decorative spans producing invalid table DOM in the editor preview.
test("original dining article tables render valid structure without losing cell text or grid cells", async () => {
  const article = content.blogs.flatMap(blog => blog.articles).find(item => item.handle === "standard-dining-table-size-guide-for-indian-homes")!;
  const original = JSON.stringify(article.content);
  await withRenderedContent(article.content, document => {
    assert.equal(document.querySelectorAll("table").length, 2);
    assert.equal(document.querySelectorAll("table tr").length, 11);
    assert.deepEqual([...document.querySelectorAll("table tr")].map(row => [...row.querySelectorAll("td, th")].map(cell => cell.textContent?.replace(/\s+/g, " ").trim())), [
      ["Seating", "Recommended Size", "Approx. Size in Feet", ""],
      ["2 people", "75–90 × 75–80 cm", "2.5–3 × 2.5 ft", "Breakfast corners,"],
      ["4 people", "120–135 × 75–90 cm", "4–4.5 × 2.5–3 ft", "Small to medium"],
      ["6 people", "150–180 × 85–95 cm", "5–6 × 2.8–3.1 ft", "Most"],
      ["8 people", "210–240 × 90–110 cm", "7–8 × 3–3.6 ft", "Larger homes"],
      ["10 people", "240–300 × 100–120 cm", "8–10 × 3.3–4 ft", "Formal dining spaces"],
      ["Situation", "Suggested Clearance"],
      ["Tight edge", "About 75 cm"],
      ["Normal chair pull-out", "About 90 cm"],
      ["Passage behind chairs", "105–120 cm"],
      ["Busy walking route", "Plan according to actual movement"],
    ]);
    assertValidTableChildren(document);
  });
  assert.equal(JSON.stringify(article.content), original, "rendering does not rewrite the imported document");
});

// Catches a cleanup that silently drops meaningful text, links, media, or empty cells.
test("unexpected substantive table children receive valid ancestors and keep their content", async () => {
  await withRenderedContent([{ tag: "table", children: [
    " \n", { tag: "span", children: [{ tag: "div", children: [" "] }] },
    { tag: "p", children: ["Table introduction"] },
    { tag: "tr", children: [{ tag: "th", children: ["Direct row heading"] }, { tag: "td", children: [] }] },
    { tag: "thead", children: ["\n", { tag: "th", children: ["Section heading"] }] },
    { tag: "tbody", children: [
      " ", { tag: "p", children: ["Section introduction"] },
      { tag: "tr", children: [
        "Row note", { tag: "span", children: ["Inline note"] },
        { tag: "a", href: "/pages/contact", children: [] },
        { tag: "br", children: [] }, { tag: "hr", children: [] },
        { tag: "img", src: "https://cdn.shopify.com/example.png", alt: "Preserved artwork", children: [] },
        { tag: "td", children: ["Cell text"] }, { tag: "th", children: [] },
      ] },
    ] },
  ] }], document => {
    assertValidTableChildren(document);
    assert.deepEqual([...document.querySelectorAll("table td, table th")].map(cell => cell.textContent), [
      "Table introduction", "Direct row heading", "", "Section heading", "Section introduction",
      "Row note", "Inline note", "", "", "", "", "Cell text", "",
    ]);
    assert.ok(document.querySelector('td > a[href="/pages/contact"]'));
    assert.ok(document.querySelector("td > br"));
    assert.ok(document.querySelector("td > hr"));
    assert.equal(document.querySelector("td > img")?.getAttribute("alt"), "Preserved artwork");
    assert.equal(document.querySelectorAll("table > span, tr > span").length, 0);
  });
});

// Catches horizontally overflowing content tables being unreachable to keyboard users.
test("content tables have an accessible name and keyboard focus without adding stops to ordinary content", async () => {
  await withRenderedContent([
    { tag: "p", children: ["Dining dimensions"] },
    { tag: "table", children: [{ tag: "tbody", children: [{ tag: "tr", children: [{ tag: "th", children: ["Seating"] }, { tag: "td", children: ["Four people"] }] }] }] },
    { tag: "a", href: "/pages/contact", children: ["Ask about sizes"] },
  ], document => {
    const table = document.querySelector("table")!;
    assert.equal(table.getAttribute("tabindex"), "0", "overflowing table must be in the keyboard tab order");
    assert.equal(table.getAttribute("aria-label"), "Content table");
    assert.equal(table.getAttribute("role"), null, "native table semantics remain intact");
    table.focus();
    assert.equal(document.activeElement, table);
    assert.equal(document.querySelector("p")?.hasAttribute("tabindex"), false);
    assert.equal(document.querySelector("a")?.hasAttribute("tabindex"), false);
    assert.equal(document.querySelector("p")?.hasAttribute("aria-label"), false);
    assert.equal(document.querySelector("a")?.textContent, "Ask about sizes");
  });
});
