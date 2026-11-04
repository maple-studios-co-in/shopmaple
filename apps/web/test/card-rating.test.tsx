import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { JSDOM } from "jsdom";
import { renderToStaticMarkup } from "react-dom/server";
import { productHighlightsSchema } from "@shopmaple/contracts";
import { CardRating } from "../components/store/card-highlights";

// A card's rating is Keeri's: the average and count of the piece's approved reviews, which the card carries (owner,
// 4 Nov 2026). Nothing typed, sampled or range-wide ("4+") stands in for one.
const doc = (node: React.ReactElement) => new JSDOM(renderToStaticMarkup(node)).window.document;
const ratingOf = (rating?: { value: number; count: number }) => doc(<CardRating rating={rating} />).querySelector("[data-card-rating]")!;

test("content saved before Keeri's ratings still reads, and a range-wide floor is still refused", () => {
  const piece = (rating: unknown) => ({ swatches: [], products: [{ handle: "nola", isNew: false, rating }] });
  assert.equal(productHighlightsSchema.safeParse(piece({ value: 4.1, count: 12 })).success, true, "an old typed rating is kept, unread");
  assert.equal(productHighlightsSchema.safeParse(piece(null)).success, true);
  assert.equal(productHighlightsSchema.safeParse({ swatches: [], products: [], ratingFloor: 4 }).success, false, "no '4+' setting");
});

test("a card shows Keeri's average to one decimal with the count read out, and says so when there are no reviews", () => {
  const rated = ratingOf({ value: 4.6, count: 12 });
  assert.equal(rated.textContent, "4.6");
  assert.equal(rated.getAttribute("aria-label"), "Rated 4.6 out of 5 from 12 reviews");
  assert.equal(rated.getAttribute("role"), "img");
  assert.equal(rated.querySelectorAll("svg").length, 1, "with the gold star");
  assert.equal(ratingOf({ value: 5, count: 1 }).getAttribute("aria-label"), "Rated 5.0 out of 5 from 1 review");
  const unrated = ratingOf(undefined);
  assert.ok(unrated.hasAttribute("data-card-rating-empty"), "a piece without approved reviews says so");
  assert.equal(unrated.getAttribute("aria-label"), "No reviews yet");
  assert.doesNotMatch(unrated.textContent ?? "", /\d/, "and shows no number");
});
