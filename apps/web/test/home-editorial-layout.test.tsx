import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { HomeNewsletter, HomeTestimonial } from "../components/home-sections";

const videoSource = "https://shop.maplefurnishers.com/cdn/shop/videos/c/vp/aee33cd277cb42e7804bfce64be22297/aee33cd277cb42e7804bfce64be22297.HD-720p-2.1Mbps-84199271.mp4?v=0";

test("editing the original newsletter logo alt text preserves its readable white presentation", () => {
  const dom = new JSDOM(renderToStaticMarkup(<HomeNewsletter media={[
    { key: "home-newsletter", image: "https://shop.maplefurnishers.com/cdn/shop/files/Cover_Image_Maple_1.png", alt: "Maple Furniture logo with a leaf illustration" },
  ]} />));
  try {
    const image = dom.window.document.querySelector("[data-home-newsletter] img")!;
    assert.equal(image.getAttribute("alt"), "Maple Furniture logo with a leaf illustration");
    assert.equal(dom.window.getComputedStyle(image).filter, "brightness(0) invert(1)", "An alt-only edit must not make the original dark logo disappear on burgundy");
  } finally { dom.window.close(); }
});

test("bundled newsletter logo displays white on burgundy while published artwork retains its original colours", () => {
  const defaults = new JSDOM(renderToStaticMarkup(<HomeNewsletter />));
  const unrelatedOverride = new JSDOM(renderToStaticMarkup(<HomeNewsletter media={[
    { key: "home-testimonial-poster", image: "https://cdn.shopify.com/custom-poster.jpg", alt: "Custom poster" },
  ]} />));
  const published = new JSDOM(renderToStaticMarkup(<HomeNewsletter media={[
    { key: "home-newsletter", image: "https://cdn.shopify.com/colourful-newsletter.png", alt: "Published colourful artwork" },
  ]} />));
  try {
    for (const dom of [defaults, unrelatedOverride]) {
      const image = dom.window.document.querySelector("[data-home-newsletter] img")!;
      assert.equal(dom.window.getComputedStyle(image).filter, "brightness(0) invert(1)", "Bundled dark logo needs a white presentation on the burgundy panel");
      assert.ok(image.getAttribute("src")?.includes("Cover_Image_Maple_1.png"), "Keep the original source asset");
    }
    const customImage = published.window.document.querySelector("[data-home-newsletter] img")!;
    assert.equal(published.window.getComputedStyle(customImage).filter, "", "Published artwork must never inherit the bundled logo colour transform");
    assert.ok(customImage.getAttribute("src")?.includes("colourful-newsletter.png"));
    assert.equal(customImage.getAttribute("alt"), "Published colourful artwork");
  } finally { defaults.window.close(); unrelatedOverride.window.close(); published.window.close(); }
});

test("editorial restyling preserves the complete original testimonial and customer-controlled video", () => {
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
    assert.equal(doc.querySelector("[data-review-stars]")?.getAttribute("aria-label"), "5 out of 5 stars");
    const video = doc.querySelector("video")!;
    assert.ok(video.controls);
    assert.ok(video.playsInline);
    assert.equal(video.preload, "none");
    assert.equal(video.autoplay, false);
    assert.equal(video.querySelector("source")?.src, videoSource);
    assert.equal(doc.querySelectorAll("video").length, 1);
  } finally { dom.window.close(); }
});

test("published editorial copy names both regions and retains editable media without duplicating or interpreting text", () => {
  const markup = '<img src=x onerror="alert(1)">';
  const dom = new JSDOM(renderToStaticMarkup(<>
    <HomeTestimonial heading="Customers at home" subheading="Their spaces and stories" content={{
      title: "Our custom room", paragraphs: ["The complete first paragraph.", markup, "The complete final paragraph."],
      name: "A customer", attribution: " — Homeowner",
    }} media={[{ key: "home-testimonial-poster", image: "https://cdn.shopify.com/editorial-poster.jpg", alt: "Customer's room film" }]} />
    <HomeNewsletter content={{ heading: "Workshop updates", body: "News in your inbox.", signupHeading: "Join our list" }}
      media={[{ key: "home-newsletter", image: "https://cdn.shopify.com/editorial-logo.png", alt: "Published Maple artwork" }]} />
  </>));
  try {
    const doc = dom.window.document;
    for (const [selector, heading] of [["[data-home-testimonial]", "Customers at home"], ["[data-home-newsletter]", "Workshop updates"]]) {
      const region = doc.querySelector(selector!)!;
      const labelledBy = region.getAttribute("aria-labelledby");
      assert.ok(labelledBy, `${heading} must be discoverable as a named region`);
      assert.equal(doc.getElementById(labelledBy)?.textContent, heading);
      assert.equal(region.querySelectorAll("h2").length, 1);
      assert.equal(region.textContent?.split(heading!).length, 2, "Editorial headings must not be repeated for visual positioning");
    }
    assert.deepEqual([...doc.querySelectorAll("blockquote p")].map(p => p.textContent), ["The complete first paragraph.", markup, "The complete final paragraph."]);
    assert.equal(doc.querySelectorAll("[onerror], img[src=x]").length, 0);
    assert.equal(doc.querySelector("video")?.poster, "https://cdn.shopify.com/editorial-poster.jpg");
    assert.equal(doc.querySelector("video")?.getAttribute("aria-label"), "Customer's room film");
    assert.ok(doc.querySelector('[data-home-newsletter] img[alt="Published Maple artwork"]')?.getAttribute("src")?.includes("editorial-logo.png"));
    assert.equal(doc.querySelector("[data-home-newsletter] h3")?.textContent, "Join our list");
    const email = doc.querySelector<HTMLInputElement>('[data-home-newsletter] input[type="email"]')!;
    assert.equal(email.labels?.[0]?.textContent, "Email");
    assert.ok(email.required);
  } finally { dom.window.close(); }
});

test("newsletter composition preserves unavailable notice and submission never sends or claims signup", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost:3000/" });
  const previous = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement, fetch: globalThis.fetch };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  const requests: unknown[] = [];
  globalThis.fetch = async (...args) => { requests.push(args); throw new Error("Newsletter transport must remain inactive"); };
  const container = document.getElementById("root")!;
  const root = createRoot(container);
  try {
    await act(async () => root.render(<HomeNewsletter />));
    assert.equal(container.querySelector("h2")?.textContent, "Soft presence. Strong craftsmanship.");
    assert.ok(container.textContent?.includes("Furniture made for rooms that feel as good as they look."));
    assert.equal(container.querySelector("h3")?.textContent, "New Collections. Early Access. No Noise.");
    assert.equal(container.querySelector("[data-preview-detail]")?.textContent, "Newsletter signup is not available yet.");
    const email = container.querySelector<HTMLInputElement>('input[type="email"]')!;
    email.value = "synthetic@example.invalid";
    await act(async () => container.querySelector<HTMLFormElement>("form")!.requestSubmit());
    const status = container.querySelector('[role="status"]')!;
    assert.equal(status.textContent?.replace(/\s+/g, " ").trim(), "Contact Your email has not been submitted.");
    assert.equal(status.querySelector("a")?.getAttribute("href"), "/pages/contact");
    assert.deepEqual(requests, []);
    assert.equal(email.value, "synthetic@example.invalid");
  } finally {
    await act(async () => root.unmount());
    Object.assign(globalThis, previous);
    dom.window.close();
  }
});
