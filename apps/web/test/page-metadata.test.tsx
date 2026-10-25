import assert from "node:assert/strict";
import { test } from "node:test";
import { generateMetadata } from "../app/pages/[slug]/page";
test("contact page titles allow the root layout to add the brand once", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ code: "CONTENT_NOT_PUBLISHED" }, { status: 404 });
  try {
    assert.equal(
      (await generateMetadata({ params: Promise.resolve({ slug: "contact" }) }))
        .title,
      "Contact Us",
    );
    assert.equal(
      (
        await generateMetadata({
          params: Promise.resolve({ slug: "bulk-enquiry" }),
        })
      ).title,
      "Bulk Enquiry",
    );
  } finally { globalThis.fetch = previous; }
});
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ContactHelp } from "../components/contact-form";
import { contactCategories } from "../app/pages/contact-content";
test("source help copy is accompanied by truthful account availability", () => {
  const markup = renderToStaticMarkup(
    <ContactHelp categories={contactCategories} />,
  );
  assert.match(
    markup,
    /Account sign-in and order tracking are not available on this storefront yet/,
  );
});

import * as collectionPage from "../app/collections/[handle]/page";
test("collection metadata identifies the page without duplicating the brand", async () => {
  assert.equal(typeof collectionPage.generateMetadata, "function");
  assert.deepEqual(
    await collectionPage.generateMetadata({
      params: Promise.resolve({ handle: "chairs" }),
    }),
    { title: "Chairs" },
  );
  assert.deepEqual(
    await collectionPage.generateMetadata({
      params: Promise.resolve({ handle: "tv-media-units" }),
    }),
    { title: "TV & Media Units" },
  );
});
