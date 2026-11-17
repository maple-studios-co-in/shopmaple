import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { siteWordsSchema, storefrontContentSchema } from "@shopmaple/contracts";
import { defaultStorefrontContent } from "../lib/content-defaults";
import { siteWordKeys, siteWordList, siteWordText, withSiteWord } from "../lib/site-words";

const { renderToStaticMarkup } = await import("react-dom/server");
const { SiteWord, SiteWordsProvider, useSiteWordPlaceholder } = await import("../components/site-words");

test("a place shows the staff's words when they wrote some, else the theme's; an emptied box brings the theme's back", () => {
  assert.equal(siteWordText(undefined, "footer.imageCredits"), "Image credits");
  assert.equal(siteWordText({ "footer.imageCredits": "Photo credits" }, "footer.imageCredits"), "Photo credits");
  assert.equal(siteWordText({ "footer.imageCredits": "   " }, "footer.imageCredits"), "Image credits", "blank words never blank the page");
  assert.deepEqual(withSiteWord(undefined, "blog.share", "Share this story"), { "blog.share": "Share this story" });
  assert.deepEqual(withSiteWord({ "blog.share": "Share this story", "blog.loadMore": "More" }, "blog.share", ""), { "blog.loadMore": "More" });
  assert.equal(withSiteWord({ "blog.share": "Share this story" }, "blog.share", " "), undefined, "no words left: no field saved");
});

test("every place in the list has a key the shop's server accepts and words within its length", () => {
  assert.ok(siteWordKeys.length >= 80);
  const all = Object.fromEntries(siteWordKeys.map((key) => [key, siteWordList[key].text]));
  assert.equal(siteWordsSchema.safeParse(all).success, true, "the theme's own words would all save");
  for (const key of siteWordKeys) assert.ok(siteWordList[key].text.length <= 600 && siteWordList[key].label.length > 0, key);
});

test("the server keeps staff's words with the draft and refuses odd places, control characters and floods", () => {
  const saved = storefrontContentSchema.safeParse({ ...defaultStorefrontContent, siteWords: { "home.project.eyebrow": "Say hello" } });
  assert.equal(saved.success, true);
  assert.deepEqual(saved.success && saved.data.siteWords, { "home.project.eyebrow": "Say hello" });
  assert.equal(siteWordsSchema.safeParse({ "<script>": "x" }).success, false);
  assert.equal(siteWordsSchema.safeParse({ "home.project.eyebrow": "bad\u0007" }).success, false);
  assert.equal(siteWordsSchema.safeParse({ "home.project.eyebrow": "x".repeat(601) }).success, false);
  assert.equal(siteWordsSchema.safeParse(Object.fromEntries(Array.from({ length: 301 }, (_, at) => [`home.w${at}`, "x"]))).success, false);
});

test("on the storefront a word is plain text; in the draft preview it names its place, and so does a form box's placeholder", () => {
  function Box() { return <input {...useSiteWordPlaceholder("contact.form.namePlaceholder")} />; }
  const page = (marked: boolean) => renderToStaticMarkup(
    <SiteWordsProvider words={{ "footer.imageCredits": "Photo credits" }} marked={marked}><p><SiteWord k="footer.imageCredits" /></p><Box /></SiteWordsProvider>,
  );
  assert.equal(page(false), '<p>Photo credits</p><input placeholder="Your full name"/>');
  assert.equal(page(true), '<p><span data-site-word="footer.imageCredits">Photo credits</span></p><input placeholder="Your full name" data-site-word-placeholder="contact.form.namePlaceholder"/>');
});

test("the homepage's project section and footer show staff's words, and the theme's where none were written", async () => {
  const { HomeProject } = await import("../components/home-sections");
  const html = renderToStaticMarkup(<SiteWordsProvider words={{ "home.project.eyebrow": "Say hello", "home.projectForm.send": "Send it" }}><HomeProject /></SiteWordsProvider>);
  assert.match(html, /data-project-eyebrow="[^"]*">Say hello</);
  assert.match(html, /Send it/);
  assert.match(html, /<strong>Quick response<\/strong>/, "unchanged words keep the theme's own");
  assert.match(html, /placeholder="Tell us about your project"/);
});
