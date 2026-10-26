import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { renderToStaticMarkup } from "react-dom/server";
import { AuthoredArticleBody } from "../components/authored-article-body";
const managed = `/media/uploads/${"a".repeat(64)}.webp`;
const documentFor = (element: Parameters<typeof renderToStaticMarkup>[0]) => new JSDOM(renderToStaticMarkup(element)).window.document;

test("unsaved preview uses authenticated image preview while public body uses published media", () => {
  const blocks = [{ id: "image", type: "image" as const, src: managed, alt: "Oak chair" }];
  const preview = documentFor(<AuthoredArticleBody blocks={blocks} preview />);
  assert.equal(preview.querySelector("img")?.getAttribute("src"), `/api/admin/media/${"a".repeat(64)}/preview`);
  assert.equal(preview.querySelector("img")?.getAttribute("alt"), "Oak chair");
  const publicBody = documentFor(<AuthoredArticleBody blocks={blocks} />);
  assert.equal(publicBody.querySelector("img")?.getAttribute("src"), managed);
});

test("unsaved invalid image sources never cause preview requests", () => {
  for (const src of ["javascript:alert(1)", "https://attacker.example/track", "//attacker.example/track", "/api/admin/media/private", "/media/uploads/not-a-hash.webp", "/media/uploads/../private.webp", "data:image/svg+xml,<svg onload='alert(1)'/>"]) {
    const doc = documentFor(<AuthoredArticleBody preview blocks={[{ id: "image", type: "image", src, alt: "Unsafe image" }]} />);
    assert.equal(doc.querySelector("img"), null, `unsafe image source must not load: ${src}`);
  }
});

test("unsaved invalid links remain literal text without active destinations", () => {
  for (const href of ["javascript:alert(1)", "https://attacker.example", "//attacker.example", "/admin", "/collections/../admin"]) {
    const doc = documentFor(<AuthoredArticleBody preview blocks={[{ id: "link", type: "link", href, text: 'Read <script>bad()</script>' }]} />);
    assert.equal(doc.querySelector("a"), null, `unsafe link must not navigate: ${href}`);
    assert.equal(doc.body.textContent, 'Read <script>bad()</script>');
    assert.equal(doc.querySelector("script"), null);
  }
});

test("approved bundled media remains unchanged in a preview", () => {
  const doc = documentFor(<AuthoredArticleBody preview blocks={[{ id: "image", type: "image", src: "/media/home/maple-logo.png", alt: "Maple" }]} />);
  assert.equal(doc.querySelector("img")?.getAttribute("src"), "/media/home/maple-logo.png");
});
