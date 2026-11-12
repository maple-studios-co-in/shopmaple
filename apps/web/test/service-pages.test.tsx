import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import ServicePage, { generateMetadata } from "../app/[slug]/page";
import * as returnsRoute from "../app/returns/page";
import { contactCategories } from "../lib/contact-content";
import { defaultStorefrontContent } from "../lib/content-defaults";

async function withResponse(body: unknown, run: () => Promise<void>) {
  const previous = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    assert.ok(String(input).endsWith("/api/content/storefront"));
    assert.equal(init?.cache, "no-store");
    assert.equal(init?.method ?? "GET", "GET");
    if (body === "offline") throw new Error("offline");
    return body === null
      ? Response.json({ code: "CONTENT_NOT_PUBLISHED" }, { status: 404 })
      : Response.json(body);
  };
  try { await run(); } finally { globalThis.fetch = previous; }
}
async function renderPage(slug: string, query: Record<string, string | string[] | undefined> = {}) {
  const element = slug === "returns" ? await returnsRoute.default() : await ServicePage({
    params: Promise.resolve({ slug }), searchParams: Promise.resolve(query),
  });
  return new JSDOM(renderToStaticMarkup(element)).window.document;
}
const texts = (doc: Document, selector: string) => [...doc.querySelectorAll(selector)].map(n => n.textContent?.trim());
const fixedWarning = "This form saves an enquiry; it does not automatically approve a return or issue a refund.";

test("source service routes retain forms, help, operational notices, media and approved destinations", async () => {
  await withResponse(null, async () => {
    // The contact page's redesign (Figma 298:511, owner 10 Nov 2026); test/contact-page.test.tsx covers it whole.
    const contact = await renderPage("contact");
    assert.equal(contact.querySelector("h1")?.textContent, "A conversation.\nA considered beginning.");
    assert.equal(contact.querySelector(".contact-intro .contact-eyebrow")?.textContent, "Contact / Maple Furnishers");
    assert.equal(contact.querySelectorAll('[role="tab"]').length, 5);
    assert.equal(contact.querySelectorAll('[role="tabpanel"] details').length, 5);
    assert.ok(contact.querySelector('a[href="tel:+918796130252"]'));
    assert.ok(contact.querySelector('a[href="mailto:contact@maplefurnishers.com"]'));
    assert.ok(contact.querySelector('a[href^="https://www.google.com/maps/search/"][rel="noreferrer"]'), "directions in place of the old map embed");
    assert.match(contact.body.textContent ?? "", /Contact our team with your order number/, "tracking is the team's, not an account's");
    assert.doesNotMatch(contact.body.textContent ?? "", /Development preview|Team notification is not confirmed/);
    assert.doesNotMatch(contact.body.textContent ?? "", /saved locally|notifications are not connected|has not been sent to our team/);
    assert.equal(contact.querySelector(".home-cities"), null, "the redesign has no cities band");
    // The Bulk Enquiry redesign (Figma 298:924, owner 10 Nov 2026); test/bulk-enquiry-page.test.tsx covers it whole.
    const bulk = await renderPage("bulk-enquiry");
    assert.equal(bulk.querySelector("h1")?.textContent, "Spaces with purpose. Furniture with presence.");
    assert.equal(bulk.querySelector('[data-service-section="hero"] [data-bulk-eyebrow]')?.textContent, "Maple / Projects & partnerships");
    assert.equal(bulk.querySelector('[data-service-section="trust"] h2')?.textContent, "Your brief. Our craft.");
    assert.deepEqual(texts(bulk, "[data-bulk-step] h3"), ["Meet your designer", "Refine every detail", "Bring it home"]);
    assert.equal(bulk.querySelector("a[data-bulk-quote]")?.getAttribute("href"), "https://m.indiamart.com/maple-furnishers/");
    assert.ok(bulk.querySelector('input[name="name"][required]'));
    assert.ok(bulk.querySelector('input[name="phone"][required]'));
    assert.ok(bulk.querySelector('input[name="email"][required]'));
    assert.ok(bulk.querySelector('textarea[name="message"][required]'), "the brief is part of the proposal form");
    const returns = await renderPage("returns");
    assert.equal(returns.querySelector("h1")?.textContent, "Return & Exchange");
    assert.equal(returns.querySelector("[data-return-guidance] a")?.getAttribute("href"), "/policies/refund-policy");
    assert.ok(returns.body.textContent?.includes(fixedWarning));
    assert.ok(returns.querySelector("form[data-return-lookup]"));
    for (const doc of [contact, bulk, returns]) {
      assert.equal(doc.querySelectorAll("h1").length, 1);
      assert.equal(doc.querySelectorAll("form").length, 1);
    }
  });
});

// The enquiry context the contact page hands its form: walks the element tree for the `context` prop.
const contextOf = (node: unknown): Record<string, string> | undefined => {
  if (!node || typeof node !== "object") return undefined;
  const props = (node as { props?: { context?: Record<string, string>; children?: unknown } }).props;
  if (props?.context && "sku" in props.context) return props.context;
  for (const child of ([] as unknown[]).concat(props?.children ?? [])) { const found = contextOf(child); if (found) return found; }
  return undefined;
};
test("the contact page bounds the item code it sends with the enquiry, though it no longer writes it", async () => {
  await withResponse(null, async () => {
    const element = await ServicePage({ params: Promise.resolve({ slug: "contact" }), searchParams: Promise.resolve({ product: "Aero", sku: "z".repeat(200) }) });
    assert.equal(contextOf(element)?.sku, "z".repeat(160));
    assert.doesNotMatch(renderToStaticMarkup(element), /zzzz/);
  });
});

test("service query context remains bounded, escaped and rejects array and malformed pincodes", async () => {
  await withResponse(null, async () => {
    const doc = await renderPage("contact", { product: "<script>bad()</script>" + "x".repeat(600), variant: "y".repeat(400), sku: "z".repeat(200), pincode: "1100157" });
    assert.equal(doc.querySelector(".contact-form-context strong")?.textContent?.length, 500);
    assert.equal(doc.querySelector(".contact-form-context span")?.textContent, "y".repeat(300), "The item code is sent with the enquiry but not written on the page");
    assert.equal(doc.querySelector("script"), null);
    assert.doesNotMatch(doc.body.textContent ?? "", /Delivery pincode/);
    for (const pincode of ["000000", "11001", "1100157", ["110015"]]) {
      const invalid = await renderPage("bulk-enquiry", { product: ["ignored"], pincode });
      assert.equal(invalid.querySelector("[data-bulk-context]"), null);
    }
    assert.match((await renderPage("contact", { pincode: "110015" })).body.textContent ?? "", /Delivery pincode: 110015/);
  });
});

function serviceEdits() {
  return {
    contact: {
      title: "Speak with Maple", eyebrow: "LET’S TALK", heading: "Furniture for your life",
      helpEyebrow: "Support topics", helpHeading: "Find an answer",
      cities: { eyebrow: "Near you", heading: "Across the country" },
      sections: [{ key: "cities", enabled: true }, { key: "help", enabled: true }, { key: "intro", enabled: true }],
      categories: contactCategories.map((category, index) => ({
        key: ["tracking", "payment", "account", "warranty", "damage"][index],
        title: `Topic ${index + 1}`, subtitle: `About topic ${index + 1}`,
        questions: category.questions.map((_, questionIndex) => ({ key: `q${questionIndex + 1}`, question: `Question ${index + 1}.${questionIndex + 1}`, answer: `Answer ${index + 1}.${questionIndex + 1}` })),
      })),
    },
    bulk: {
      title: "Maple for businesses", eyebrow: "YOUR PROJECT", heading: "Commercial interiors", subtitle: "Bring your brief",
      sections: [{ key: "business", enabled: true }, { key: "process", enabled: true }, { key: "hero", enabled: true }, { key: "trust", enabled: true }, { key: "cities", enabled: true }],
      cities: { eyebrow: "Service locations", heading: "Your city" },
      trust: { heading: "Trusted collaborators", metricValue: "200+", metricLabel: "Spaces furnished", items: [
        { key: "materials", title: "Thoughtful materials" }, { key: "price", title: "Fair prices" }, { key: "custom", title: "Tailored designs" }, { key: "quality", title: "Careful checks" },
      ] },
      process: { eyebrow: "Step by step", heading: "Our approach", steps: [
        { key: "deliver", title: "Enjoy your space", body: "We install it." }, { key: "meet", title: "Share your brief", body: "We listen." }, { key: "design", title: "Make it yours", body: "We plan." },
      ] },
      business: { badge: "BUSINESS SUPPORT", heading: "Plan a large order", body: "Tell our team what you need.", features: ["Value", "Volume", "Sizes", "Support", "Delivery"], cta: "Get a business quote", trust: "A trusted team" },
    },
    returns: { title: "Order support", heading: "Help with your order", policyLabel: "Read our return policy", intro: "Share your order details." },
  };
}
const published = (servicePages = serviceEdits()) => ({ version: 8, content: { ...defaultStorefrontContent, servicePages } });

test("published service copy, order and metadata reach public routes with immutable links and asset keys", async () => {
  await withResponse(published(), async () => {
    const contact = await renderPage("contact");
    assert.equal(contact.querySelector("h1")?.textContent, "Furniture for your life");
    assert.equal(contact.querySelector(".contact-intro .contact-eyebrow")?.textContent, "LET’S TALK");
    // An older list of regions gains the redesign's where it puts them; the cities band leaves with the redesign.
    assert.deepEqual([...contact.querySelectorAll("[data-service-section]")].map(n => n.getAttribute("data-service-section")), ["help", "visit", "intro", "reach", "enquiry"]);
    assert.deepEqual(texts(contact, ".contact-help .contact-eyebrow, .contact-help h2"), ["Support topics", "Find an answer"]);
    assert.equal(contact.querySelector('[role="tab"]')?.textContent, "Topic 1");
    assert.equal(contact.querySelector('[role="tabpanel"] summary')?.textContent, "Question 1.1");
    assert.equal(contact.querySelector('[role="tabpanel"] details p')?.textContent, "Answer 1.1");
    assert.ok(contact.querySelector('a[href="tel:+918796130252"]'));
    assert.ok(contact.querySelector('a[href="mailto:contact@maplefurnishers.com"]'));
    const address = "A-2/57, W.H.S., Kirti Nagar, New Delhi, Delhi, 110015";
    for (const link of contact.querySelectorAll(".contact-way a[target], .contact-visit a[target]"))
      assert.equal(link.getAttribute("href"), `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`);
    assert.equal(contact.querySelectorAll(".contact-way a[target], .contact-visit a[target]").length, 2);
    assert.equal((await generateMetadata({ params: Promise.resolve({ slug: "contact" }) })).title, "Speak with Maple");
    const bulk = await renderPage("bulk-enquiry");
    assert.equal(bulk.querySelector("h1")?.textContent, "Commercial interiors");
    // The redesign's figures and proposal form follow the regions they grew from: the opening and the trust promises.
    assert.deepEqual([...bulk.querySelectorAll("[data-service-section]")].map(n => n.getAttribute("data-service-section")), ["business", "process", "proposal", "hero", "figures", "trust", "cities"]);
    assert.equal(bulk.querySelector("[data-bulk-subtitle]")?.textContent, "Bring your brief");
    assert.deepEqual(texts(bulk, "[data-bulk-figure] [data-figure-value]"), ["200+", "250+", "20+", "In-house"]);
    assert.equal(bulk.querySelector("[data-bulk-figure] [data-figure-label]")?.textContent, "Spaces furnished");
    assert.deepEqual(texts(bulk, "[data-bulk-advantage] h3"), ["Thoughtful materials", "Fair prices", "Tailored designs", "Careful checks"]);
    assert.match(bulk.querySelector("[data-bulk-advantage] img")?.getAttribute("src") ?? "", /\/media\/bulk-enquiry\/layers\.svg$/);
    assert.deepEqual(texts(bulk, "[data-bulk-step] h3"), ["Enjoy your space", "Share your brief", "Make it yours"]);
    assert.deepEqual(texts(bulk, "[data-bulk-step] h3 + p"), ["We install it.", "We listen.", "We plan."]);
    assert.match(bulk.querySelector("[data-bulk-step] img")?.getAttribute("src") ?? "", /\/media\/bulk-enquiry\/step-deliver\.webp$/);
    assert.deepEqual(texts(bulk, "[data-bulk-checks] li"), ["Value", "Volume", "Sizes", "Support", "Delivery"]);
    assert.equal(bulk.querySelector("a[data-bulk-quote]")?.textContent?.trim(), "Get a business quote");
    assert.equal(bulk.querySelector("a[data-bulk-quote]")?.getAttribute("href"), "https://m.indiamart.com/maple-furnishers/");
    assert.equal((await generateMetadata({ params: Promise.resolve({ slug: "bulk-enquiry" }) })).title, "Maple for businesses");
    const returns = await renderPage("returns");
    assert.equal(returns.querySelector("h1")?.textContent, "Help with your order");
    assert.equal(returns.querySelector("[data-return-guidance] a")?.textContent, "Read our return policy");
    assert.equal(returns.querySelector("[data-return-guidance] a")?.getAttribute("href"), "/policies/refund-policy");
    assert.equal(returns.querySelector("[data-help-opening]")?.textContent, "Share your order details.");
    assert.ok(returns.body.textContent?.includes(fixedWarning));
    assert.ok(returns.querySelector("form[data-return-lookup]"));
    const metadata = "generateMetadata" in returnsRoute
      ? await (returnsRoute.generateMetadata as () => Promise<{ title: string }>)()
      : (returnsRoute as unknown as { metadata: { title: string } }).metadata;
    assert.equal(metadata.title, "Order support");
  });
});

test("hidden service regions remove their content and dividers while preserving one accessible H1", async () => {
  const content = serviceEdits();
  content.contact.sections.forEach(section => { section.enabled = false; });
  content.bulk.sections.forEach(section => { section.enabled = false; });
  await withResponse(published(content), async () => {
    for (const slug of ["contact", "bulk-enquiry"]) {
      const doc = await renderPage(slug);
      assert.equal(doc.querySelectorAll("h1").length, 1);
      assert.ok(doc.querySelector("h1.sr-only"));
      assert.equal(doc.querySelectorAll("[data-service-section], .cp-divider, form, .home-cities").length, 0);
    }
  });
  content.contact.sections.find(s => s.key === "help")!.enabled = true;
  content.bulk.sections.find(s => s.key === "process")!.enabled = true;
  await withResponse(published(content), async () => {
    assert.deepEqual(texts(await renderPage("contact"), "h1, .contact-help h2"), ["Furniture for your life", "Find an answer"]);
    const bulk = await renderPage("bulk-enquiry");
    assert.equal(bulk.querySelector('[data-service-section="process"] h2')?.textContent, "Our approach");
    assert.equal(bulk.querySelectorAll(".cp-divider").length, 0);
  });
});

test("service marketing fields are plain text and never replace operational notices", async () => {
  const content = serviceEdits();
  const attack = '<img src=x onerror="alert(1)">';
  content.contact.heading = attack;
  content.contact.categories[0]!.questions[0]!.answer = attack;
  content.bulk.business.body = attack;
  content.returns.intro = attack;
  await withResponse(published(content), async () => {
    for (const slug of ["contact", "bulk-enquiry", "returns"]) {
      const doc = await renderPage(slug);
      assert.ok(doc.body.textContent?.includes(attack));
      assert.equal(doc.querySelectorAll("[onerror], img[src=x]").length, 0);
      assert.doesNotMatch(doc.body.textContent ?? "", /Development preview|Team notification is not confirmed/);
      assert.doesNotMatch(doc.body.textContent ?? "", /saved locally|notifications are not connected|has not been sent to our team/);
      if (slug === "returns") assert.ok(doc.body.textContent?.includes(fixedWarning));
      if (slug === "contact") assert.ok(doc.querySelector('form textarea[name="message"][required]') && doc.querySelector('form input[name="email"][required]'), "the enquiry form keeps its fixed fields");
    }
  });
});

test("legacy, outage, malformed and draft responses retain original service defaults", async () => {
  const legacy = structuredClone(defaultStorefrontContent) as Record<string, unknown>;
  delete legacy.servicePages;
  for (const body of [{ version: 1, content: legacy }, "offline", { version: 2, draft: published().content }, { version: 2, content: { ...legacy, servicePages: { contact: { title: "Invalid" } } } }]) {
    await withResponse(body, async () => {
      assert.equal((await renderPage("contact")).querySelector("h1")?.textContent, "A conversation.\nA considered beginning.");
      assert.equal((await renderPage("bulk-enquiry")).querySelector("h1")?.textContent, "Spaces with purpose. Furniture with presence.");
      assert.equal((await renderPage("returns")).querySelector("h1")?.textContent, "Return & Exchange");
    });
  }
});

test("custom pages still render published content and unknown routes remain not found", async () => {
  await withResponse({ version: 1, content: { ...defaultStorefrontContent, pages: [{ slug: "care-guide", title: "Care guide", description: "Care information", body: "Clean gently.", banner: null }] } }, async () => {
    assert.equal((await renderPage("care-guide")).querySelector("h1")?.textContent, "Care guide");
    assert.deepEqual(await generateMetadata({ params: Promise.resolve({ slug: "care-guide" }) }), { title: "Care guide", description: "Care information", alternates: { canonical: "/care-guide" } });
    await assert.rejects(() => renderPage("unknown-service"), /NEXT_HTTP_ERROR_FALLBACK;404/);
  });
});

test("reordered help categories retain their fixed source icons and FAQ identity", async () => {
  const content = serviceEdits();
  content.contact.categories.reverse();
  await withResponse(published(content), async () => {
    const doc = await renderPage("contact");
    assert.equal(doc.querySelector('[role="tab"]')?.textContent, "Topic 5");
    assert.match(doc.querySelector<HTMLElement>(".contact-topic-icon")?.getAttribute("style") ?? "", /\/media\/contact\/box\.svg/);
    assert.equal(doc.querySelector('[role="tabpanel"] summary')?.textContent, "Question 5.1");
    assert.equal(doc.querySelector('[role="tabpanel"] details p')?.textContent, "Answer 5.1");
  });
});

