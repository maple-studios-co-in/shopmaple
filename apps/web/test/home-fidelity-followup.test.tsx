import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { Footer } from "../components/footer";
import { HomeCities } from "../components/home-sections";

const render = (element: React.ReactNode) => new JSDOM(renderToStaticMarkup(element)).window.document;

test("footer keeps every policy destination, now in the design's legal line", () => {
  const doc = render(<Footer />);
  const policies = doc.querySelector('[data-footer-bottom] nav[aria-label="Store policies"]');
  assert.ok(policies, "Footer policies sit in the legal line beside the copyright");
  assert.deepEqual([...policies.querySelectorAll("a")].map(a => a.getAttribute("href")), ["/policies/privacy-policy", "/policies/terms-of-service", "/policies/shipping-policy", "/policies/refund-policy"]);
});

test("city cards pair each editable image with its published destination label", () => {
  const doc = render(<HomeCities layout={[{key:"delhi",enabled:true},{key:"agra",enabled:false},{key:"mumbai",enabled:true}]} />);
  const cards = [...doc.querySelectorAll("[data-city-track] figure")];
  assert.equal(cards.length, 2, "Enabled destinations should be distinct labeled city cards");
  assert.deepEqual(cards.map(card => card.querySelector("figcaption")?.textContent), ["Delhi", "Mumbai"]);
  assert.deepEqual(cards.map(card => card.querySelector("img")?.alt), ["Delhi", "Mumbai"]);
  assert.ok(doc.querySelector('button[aria-label="Next Cities served"]'));
});
