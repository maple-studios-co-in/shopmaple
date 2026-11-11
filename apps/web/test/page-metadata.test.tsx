import assert from "node:assert/strict";
import { test } from "node:test";
import { generateMetadata } from "../app/[slug]/page";
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
import { resolveContactPage } from "../lib/contact-page-content";
import { defaultServicePages } from "../lib/service-page-defaults";
test("the contact page's help is truthful about accounts with them on or off, and sends customers to no order page", () => {
  const answers = resolveContactPage(defaultServicePages.contact).categories.flatMap(category => category.questions.map(question => question.answer)).join("\n");
  assert.match(answers, /always check out as a guest/);
  assert.match(answers, /When online accounts are open/, "no claim that accounts exist, or that they do not");
  assert.doesNotMatch(answers, /My Orders|signup link|sign up through Gmail/i);
});

import * as collectionPage from "../app/collections/[handle]/page";
test("collection metadata identifies the page without duplicating the brand", async () => {
  assert.equal(typeof collectionPage.generateMetadata, "function");
  assert.deepEqual(
    await collectionPage.generateMetadata({
      params: Promise.resolve({ handle: "chairs" }),
    }),
    {
      title: "Chairs",
      description: "Chairs by Maple Furnishers: handcrafted luxury furniture, made to order in Delhi and delivered across India.",
      alternates: { canonical: "/collections/chairs" },
    },
  );
  assert.deepEqual(
    await collectionPage.generateMetadata({
      params: Promise.resolve({ handle: "tv-media-units" }),
    }),
    {
      title: "TV & Media Units",
      description: "TV & Media Units by Maple Furnishers: handcrafted luxury furniture, made to order in Delhi and delivered across India.",
      alternates: { canonical: "/collections/tv-media-units" },
    },
  );
});
