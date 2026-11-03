import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { JSDOM } from "jsdom";
import { renderToStaticMarkup } from "react-dom/server";
import { productHighlightsSchema, type ProductHighlights } from "@shopmaple/contracts";
import { CardRating } from "../components/store/card-highlights";
import { ProductHighlightsProvider } from "../components/store/product-highlights";

// The owner holds each piece's real average (3 November 2026), sometimes without the review count behind it. Every
// rating shown is a product's own: there is no range-wide "4+" stand-in.
const doc = (node: React.ReactElement) => new JSDOM(renderToStaticMarkup(node)).window.document;
const ratingOn = (highlights: ProductHighlights, handle: string) =>
  doc(<ProductHighlightsProvider value={highlights}><CardRating handle={handle} /></ProductHighlightsProvider>).querySelector("[data-card-rating]")!;

test("a rating may hold its average alone; a count, when given, is a whole number; a range-wide floor is refused", () => {
  const piece = (rating: unknown) => ({ swatches: [], products: [{ handle: "nola", isNew: false, rating }] });
  assert.equal(productHighlightsSchema.safeParse(piece({ value: 4.1 })).success, true, "the average alone");
  assert.equal(productHighlightsSchema.safeParse(piece({ value: 4.1, count: 12 })).success, true);
  assert.equal(productHighlightsSchema.safeParse(piece({ value: 4.1, count: 2.5 })).success, false, "half a review");
  assert.equal(productHighlightsSchema.safeParse({ swatches: [], products: [], ratingFloor: 4 }).success, false, "no '4+' setting");
});

test("a card shows its own rating to one decimal, with the count read out only when there is one", () => {
  const highlights: ProductHighlights = { swatches: [], products: [
    { handle: "alone", isNew: false, rating: { value: 4.1 } },
    { handle: "counted", isNew: false, rating: { value: 4.3, count: 12 } },
  ] };
  const alone = ratingOn(highlights, "alone");
  assert.equal(alone.textContent, "4.1");
  assert.equal(alone.getAttribute("aria-label"), "Rated 4.1 out of 5");
  assert.equal(alone.querySelectorAll("svg").length, 1, "with the gold star");
  assert.equal(ratingOn(highlights, "counted").getAttribute("aria-label"), "Rated 4.3 out of 5 from 12 reviews");
  const unrated = ratingOn(highlights, "plain");
  assert.ok(unrated.hasAttribute("data-card-rating-empty"), "a piece without one says so: '– ☆'");
  assert.doesNotMatch(unrated.textContent ?? "", /\+/);
});
