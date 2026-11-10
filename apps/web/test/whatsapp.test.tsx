import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { WhatsAppLink } from "../components/whatsapp-link";
import { defaultSiteChrome } from "../lib/site-chrome-defaults";
test("WhatsApp support opens the authorized business number without sending or prefilling a message", () => {
  const doc = new JSDOM(renderToStaticMarkup(<WhatsAppLink />)).window.document;
  const link = doc.querySelector("a");
  assert.ok(link);
  assert.equal(link.getAttribute("href"), "https://wa.me/918796130252");
  assert.ok(link.querySelector('svg[data-brand="whatsapp"]'));
  assert.equal(link.target, "_blank");
  assert.ok(link.relList.contains("noopener"));
  assert.ok(link.relList.contains("noreferrer"));
});
test("the floating button reads Contact us beside the same glyph, and its name starts with those words (owner, 10 Nov 2026)", () => {
  const doc = new JSDOM(renderToStaticMarkup(<WhatsAppLink />)).window.document;
  const link = doc.querySelector("a")!;
  assert.equal(link.textContent, "Contact us", "the words on the button");
  assert.equal(link.getAttribute("aria-label"), "Contact us on WhatsApp", "what a reader hears, and what voice control can say");
  assert.equal(link.title, defaultSiteChrome.whatsapp.label, "the staff's own WhatsApp label stays as the hover hint");
  assert.equal(link.querySelectorAll("svg").length, 1);
});
