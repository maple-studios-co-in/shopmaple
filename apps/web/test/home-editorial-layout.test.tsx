import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { HomeNewsletter, HomeTestimonial } from "../components/home-sections";

const upload = (letter: string) => "/media/uploads/" + letter.repeat(64) + ".webp";

// The bundled newsletter mark (Cover_Image_Maple_1.png) was a Shopify file and left the store (11 Nov 2026).
test("without an upload the newsletter shows its words and form but no mark; an upload shows in its own colours", () => {
  const defaults = new JSDOM(renderToStaticMarkup(<HomeNewsletter />));
  const unrelatedOverride = new JSDOM(renderToStaticMarkup(<HomeNewsletter media={[
    { key: "home-testimonial-poster", image: upload("c"), alt: "Custom poster" },
  ]} />));
  const published = new JSDOM(renderToStaticMarkup(<HomeNewsletter media={[
    { key: "home-newsletter", image: upload("d"), alt: "Published colourful artwork" },
  ]} />));
  try {
    for (const dom of [defaults, unrelatedOverride]) {
      assert.equal(dom.window.document.querySelector(".home-newsletter img"), null);
      assert.equal(dom.window.document.querySelector("[data-newsletter-mark]"), null, "no empty frame is left behind");
      assert.ok(dom.window.document.querySelector('.home-newsletter input[type="email"]'));
    }
    const customImage = published.window.document.querySelector(".home-newsletter img")!;
    assert.equal(published.window.getComputedStyle(customImage).filter, "", "an upload is never recoloured");
    assert.ok(customImage.getAttribute("src")?.includes(upload("d")));
    assert.equal(customImage.getAttribute("alt"), "Published colourful artwork");
  } finally { defaults.window.close(); unrelatedOverride.window.close(); published.window.close(); }
});

test("editorial restyling preserves the complete original testimonial, without the customer's Shopify film", () => {
  const dom = new JSDOM(renderToStaticMarkup(<HomeTestimonial />));
  try {
    const doc = dom.window.document;
    assert.equal(doc.querySelector("h2")?.textContent, "Why They Love Us");
    assert.equal(doc.querySelector("header p")?.textContent, "Thoughtful designs. Exceptional service.");
    assert.equal(doc.querySelector("h3")?.textContent, "Getting our sofa made by Maple was a completely hassle-free experience.");
    assert.deepEqual([...doc.querySelectorAll("blockquote p")].map(p => p.textContent), [
      "From the first conversation to the final delivery, the process felt smooth and well-managed.",
      "What we appreciated most was the guidance. They didn’t just take the order, they helped us choose the right size, fabric, colour tone, and overall look according to our space.",
      "The final sofa feels premium, comfortable, and beautifully finished. The quality is visible in the stitching, cushioning, and overall build.",
      "Delivery was on time, and everything was handled professionally. Truly a no-stress experience from start to finish.",
    ]);
    assert.equal(doc.querySelector("figcaption")?.textContent, "Anjali Gupta — Verified Customer");
    assert.equal(doc.querySelector(".home-review-stars"), null, "the stars were typed in, not data; the Impact Layout frame has none");
    assert.equal(doc.querySelectorAll("video").length, 0, "the film was on Shopify, and no library film is chosen here");
    assert.equal(doc.querySelector(".home-testimonial img"), null, "no poster still without an upload");
  } finally { dom.window.close(); }
});

test("published editorial copy names both regions and retains editable media without duplicating or interpreting text", () => {
  const markup = '<img src=x onerror="alert(1)">';
  const dom = new JSDOM(renderToStaticMarkup(<>
    <HomeTestimonial heading="Customers at home" subheading="Their spaces and stories" content={{
      title: "Our custom room", paragraphs: ["The complete first paragraph.", markup, "The complete final paragraph."],
      name: "A customer", attribution: " — Homeowner",
    }} media={[{ key: "home-testimonial-poster", image: upload("a"), alt: "Customer's room film" }]} />
    <HomeNewsletter content={{ heading: "Workshop updates", body: "News in your inbox.", signupHeading: "Join our list" }}
      media={[{ key: "home-newsletter", image: upload("b"), alt: "Published Maple artwork" }]} />
  </>));
  try {
    const doc = dom.window.document;
    for (const [selector, heading] of [[".home-testimonial", "Customers at home"], [".home-newsletter", "Workshop updates"]]) {
      const region = doc.querySelector(selector!)!;
      const labelledBy = region.getAttribute("aria-labelledby");
      assert.ok(labelledBy, `${heading} must be discoverable as a named region`);
      assert.equal(doc.getElementById(labelledBy)?.textContent, heading);
      assert.equal(region.querySelectorAll("h2").length, 1);
      assert.equal(region.textContent?.split(heading!).length, 2, "Editorial headings must not be repeated for visual positioning");
    }
    assert.deepEqual([...doc.querySelectorAll("blockquote p")].map(p => p.textContent), ["The complete first paragraph.", markup, "The complete final paragraph."]);
    assert.equal(doc.querySelectorAll("[onerror], img[src=x]").length, 0);
    // An uploaded poster shows as a still beside the words.
    const still = doc.querySelector(".home-testimonial img.home-testimonial-still")!;
    assert.ok(decodeURIComponent(still.getAttribute("src") ?? "").includes(upload("a")));
    assert.equal(still.getAttribute("alt"), "Customer's room film");
    assert.ok(decodeURIComponent(doc.querySelector('.home-newsletter img[alt="Published Maple artwork"]')?.getAttribute("src") ?? "").includes(upload("b")));
    assert.equal(doc.querySelector(".home-newsletter h3")?.textContent, "Join our list");
    const email = doc.querySelector<HTMLInputElement>('.home-newsletter input[type="email"]')!;
    assert.equal(email.labels?.[0]?.textContent, "Email address");
    assert.ok(email.required);
  } finally { dom.window.close(); }
});
