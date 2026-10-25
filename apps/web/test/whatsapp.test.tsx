import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { WhatsAppLink } from "../components/whatsapp-link";
test("WhatsApp support opens the authorized business number without sending or prefilling a message", () => {
  const doc = new JSDOM(renderToStaticMarkup(<WhatsAppLink />)).window.document;
  const link = doc.querySelector("a");
  assert.ok(link);
  assert.equal(link.getAttribute("href"), "https://wa.me/918796130252");
  assert.equal(
    link.getAttribute("aria-label"),
    "Chat with Maple Furnishers on WhatsApp",
  );
  assert.ok(link.querySelector('svg[data-brand="whatsapp"]'));
  assert.equal(link.target, "_blank");
  assert.ok(link.relList.contains("noopener"));
  assert.ok(link.relList.contains("noreferrer"));
});
