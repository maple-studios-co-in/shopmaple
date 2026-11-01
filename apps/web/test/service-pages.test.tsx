import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import ServicePage, { generateMetadata } from "../app/pages/[slug]/page";
import * as returnsRoute from "../app/pages/returns/page";
import { ContactHelp } from "../components/contact-form";
import { contactCategories } from "../app/pages/contact-content";
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
    const contact = await renderPage("contact");
    assert.equal(contact.querySelector("h1")?.textContent, "Tell us what you need. We’ll help you shape it");
    assert.equal(contact.querySelector(".cp-contact-eyebrow")?.textContent, "GET IN TOUCH");
    assert.equal(contact.querySelectorAll(".cp-help-categories button").length, 5);
    assert.equal(contact.querySelectorAll(".cp-help-answers details").length, 5);
    assert.ok(contact.querySelector('a[href="tel:+918796130252"]'));
    assert.ok(contact.querySelector('a[href="mailto:contact@maplefurnishers.com"]'));
    assert.ok(contact.querySelector('iframe[title="Maple Furnishers showroom in Kirti Nagar"]'));
    assert.match(contact.body.textContent ?? "", /Account sign-in and order tracking are not available/);
    assert.doesNotMatch(contact.body.textContent ?? "", /Development preview|Team notification is not confirmed/);
    assert.doesNotMatch(contact.body.textContent ?? "", /saved locally|notifications are not connected|has not been sent to our team/);
    assert.equal(contact.querySelector(".home-cities h2")?.textContent, "20+ Cities");
    const bulk = await renderPage("bulk-enquiry");
    assert.equal(bulk.querySelector("h1")?.textContent, "Home Interior");
    assert.equal(bulk.querySelector(".cp-bulk-eyebrow")?.textContent, "Place Your Bulk Orders");
    assert.equal(bulk.querySelector(".cp-bulk-trust h2")?.textContent, "Trusted By Designers, Businesses & Modern Spaces");
    assert.deepEqual(texts(bulk, ".cp-process-text h3"), ["Meet Your Designer", "Finalize Your Design", "Bring It Home"]);
    assert.equal(bulk.querySelector(".cp-indiamart-cta a")?.getAttribute("href"), "https://m.indiamart.com/maple-furnishers/");
    assert.ok(bulk.querySelector('input[name="name"][required]'));
    assert.ok(bulk.querySelector('input[name="phone"][required]'));
    assert.ok(bulk.querySelector('input[name="email"][required]'));
    assert.equal(bulk.querySelector("textarea"), null);
    const returns = await renderPage("returns");
    assert.equal(returns.querySelector("h1")?.textContent, "Return & Exchange");
    assert.equal(returns.querySelector("a")?.getAttribute("href"), "/policies/refund-policy");
    assert.ok(returns.body.textContent?.includes(fixedWarning));
    assert.equal(returns.querySelector(".cp-enquiry-context strong")?.textContent, "Return & Exchange");
    for (const doc of [contact, bulk, returns]) {
      assert.equal(doc.querySelectorAll("h1").length, 1);
      assert.equal(doc.querySelectorAll("form").length, 1);
    }
  });
});

test("service query context remains bounded, escaped and rejects array and malformed pincodes", async () => {
  await withResponse(null, async () => {
    const doc = await renderPage("contact", { product: "<script>bad()</script>" + "x".repeat(600), variant: "y".repeat(400), sku: "z".repeat(200), pincode: "1100157" });
    assert.equal(doc.querySelector(".cp-enquiry-context strong")?.textContent?.length, 500);
    assert.equal(doc.querySelector(".cp-enquiry-context span")?.textContent, "y".repeat(300), "The item code is sent with the enquiry but not written on the page");
    assert.equal(doc.querySelector("script"), null);
    assert.doesNotMatch(doc.body.textContent ?? "", /Delivery pincode/);
    for (const pincode of ["000000", "11001", "1100157", ["110015"]]) {
      const invalid = await renderPage("bulk-enquiry", { product: ["ignored"], pincode });
      assert.equal(invalid.querySelector(".cp-enquiry-context"), null);
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
    assert.equal(contact.querySelector(".cp-contact-eyebrow")?.textContent, "LET’S TALK");
    assert.deepEqual([...contact.querySelectorAll("[data-service-section]")].map(n => n.getAttribute("data-service-section")), ["cities", "help", "intro"]);
    assert.deepEqual(texts(contact, ".cp-section-title p, .cp-section-title h2"), ["Support topics", "Find an answer"]);
    assert.deepEqual(texts(contact, ".home-cities header p, .home-cities h2"), ["Near you", "Across the country"]);
    assert.equal(contact.querySelector(".cp-help-categories strong")?.textContent, "Topic 1");
    assert.equal(contact.querySelector(".cp-help-answers summary")?.textContent, "Question 1.1");
    assert.equal(contact.querySelector(".cp-help-answers details p")?.textContent, "Answer 1.1");
    assert.ok(contact.querySelector('a[href="tel:+918796130252"]'));
    assert.ok(contact.querySelector('a[href="mailto:contact@maplefurnishers.com"]'));
    const address = "A-2/56-57, W.H.S., Kirti Nagar, New Delhi, Delhi, 110015";
    assert.equal(contact.querySelector(".cp-contact-links a[target]")?.getAttribute("href"), `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`);
    assert.equal(contact.querySelector("iframe")?.getAttribute("src"), `https://maps.google.com/maps?q=${encodeURIComponent(address)}&z=14&output=embed`);
    assert.equal((await generateMetadata({ params: Promise.resolve({ slug: "contact" }) })).title, "Speak with Maple");
    const bulk = await renderPage("bulk-enquiry");
    assert.equal(bulk.querySelector("h1")?.textContent, "Commercial interiors");
    assert.deepEqual([...bulk.querySelectorAll("[data-service-section]")].map(n => n.getAttribute("data-service-section")), ["business", "process", "hero", "trust", "cities"]);
    assert.equal(bulk.querySelector(".cp-bulk-subtitle")?.textContent, "Bring your brief");
    assert.deepEqual(texts(bulk, ".cp-bulk-proof p"), ["Spaces furnished", "Thoughtful materials", "Fair prices", "Tailored designs", "Careful checks"]);
    assert.equal(bulk.querySelector(".cp-bulk-proof strong")?.textContent, "200+");
    assert.match(bulk.querySelector(".cp-bulk-proof img")?.getAttribute("src") ?? "", /Cover_Image_Maple_4.svg/);
    assert.deepEqual(texts(bulk, ".cp-process-text h3"), ["Enjoy your space", "Share your brief", "Make it yours"]);
    assert.deepEqual(texts(bulk, ".cp-process-text p"), ["We install it.", "We listen.", "We plan."]);
    assert.match(bulk.querySelector(".cp-process-image img")?.getAttribute("src") ?? "", /\/3.jpg/);
    assert.deepEqual(texts(bulk, ".cp-indiamart li"), ["Value", "Volume", "Sizes", "Support", "Delivery"]);
    assert.equal(bulk.querySelector(".cp-indiamart-cta a")?.textContent?.trim(), "Get a business quote");
    assert.equal(bulk.querySelector(".cp-indiamart-cta a")?.getAttribute("href"), "https://m.indiamart.com/maple-furnishers/");
    assert.equal((await generateMetadata({ params: Promise.resolve({ slug: "bulk-enquiry" }) })).title, "Maple for businesses");
    const returns = await renderPage("returns");
    assert.equal(returns.querySelector("h1")?.textContent, "Help with your order");
    assert.equal(returns.querySelector("a")?.textContent, "Read our return policy");
    assert.equal(returns.querySelector("a")?.getAttribute("href"), "/policies/refund-policy");
    assert.ok(returns.body.textContent?.includes(`Share your order details. ${fixedWarning}`));
    assert.equal(returns.querySelector(".cp-enquiry-context strong")?.textContent, "Return & Exchange");
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
    assert.deepEqual(texts(await renderPage("contact"), "h1, .cp-section-title h2"), ["Furniture for your life", "Find an answer"]);
    const bulk = await renderPage("bulk-enquiry");
    assert.equal(bulk.querySelector(".cp-bulk-process h2")?.textContent, "Our approach");
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
      if (slug === "contact") assert.match(doc.body.textContent ?? "", /Account sign-in and order tracking are not available/);
    }
  });
});

test("legacy, outage, malformed and draft responses retain original service defaults", async () => {
  const legacy = structuredClone(defaultStorefrontContent) as Record<string, unknown>;
  delete legacy.servicePages;
  for (const body of [{ version: 1, content: legacy }, "offline", { version: 2, draft: published().content }, { version: 2, content: { ...legacy, servicePages: { contact: { title: "Invalid" } } } }]) {
    await withResponse(body, async () => {
      assert.equal((await renderPage("contact")).querySelector("h1")?.textContent, "Tell us what you need. We’ll help you shape it");
      assert.equal((await renderPage("bulk-enquiry")).querySelector("h1")?.textContent, "Home Interior");
      assert.equal((await renderPage("returns")).querySelector("h1")?.textContent, "Return & Exchange");
    });
  }
});

test("custom pages still render published content and unknown routes remain not found", async () => {
  await withResponse({ version: 1, content: { ...defaultStorefrontContent, pages: [{ slug: "care-guide", title: "Care guide", description: "Care information", body: "Clean gently.", banner: null }] } }, async () => {
    assert.equal((await renderPage("care-guide")).querySelector("h1")?.textContent, "Care guide");
    assert.deepEqual(await generateMetadata({ params: Promise.resolve({ slug: "care-guide" }) }), { title: "Care guide", description: "Care information", alternates: { canonical: "/pages/care-guide" } });
    await assert.rejects(() => renderPage("unknown-service"), /NEXT_HTTP_ERROR_FALLBACK;404/);
  });
});

test("stable help keys preserve active category, focus and open answers through text edits and reordering", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" });
  const previous = { window: globalThis.window, document: globalThis.document };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  dom.window.matchMedia = () => ({ matches: false }) as MediaQueryList;
  const root = createRoot(document.getElementById("root")!);
  const categories = contactCategories.map((category, index) => ({ ...category, key: `category-${index}`, questions: category.questions.map((question, i) => ({ ...question, key: `q${i + 1}` })) }));
  try {
    await act(async () => root.render(<ContactHelp categories={categories} />));
    const button = document.querySelectorAll<HTMLButtonElement>(".cp-help-categories button")[1]!;
    await act(async () => button.click());
    button.focus();
    const detail = document.querySelector<HTMLDetailsElement>(".cp-help-answers details")!;
    detail.open = true;
    const edited = structuredClone(categories);
    edited[1]!.title = "Updated payment help";
    edited[1]!.questions[0]!.question = "Updated payment question";
    edited[1]!.questions.reverse();
    edited.reverse();
    await act(async () => root.render(<ContactHelp categories={edited} />));
    assert.equal(document.activeElement, button);
    assert.equal(document.querySelector(".cp-help-answers")?.getAttribute("aria-label"), "Updated payment help");
    assert.equal(document.querySelector(".cp-help-answers details[open]"), detail);
    assert.equal(detail.open, true);
    assert.equal(detail.querySelector("summary")?.textContent, "Updated payment question");
  } finally {
    await act(async () => root.unmount());
    Object.assign(globalThis, previous);
    dom.window.close();
  }
});


test("reordered help categories retain their fixed source icons and FAQ identity", async () => {
  const content = serviceEdits();
  content.contact.categories.reverse();
  await withResponse(published(content), async () => {
    const doc = await renderPage("contact");
    assert.equal(doc.querySelector(".cp-help-categories strong")?.textContent, "Topic 5");
    assert.match(doc.querySelector(".cp-help-categories img")?.getAttribute("src") ?? "", /qc_mf.svg/);
    assert.equal(doc.querySelector(".cp-help-answers summary")?.textContent, "Question 5.1");
    assert.equal(doc.querySelector(".cp-help-answers details p")?.textContent, "Answer 5.1");
  });
});

test("legacy help callers without stable keys can still switch categories and open answers", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" });
  const previous = { window: globalThis.window, document: globalThis.document };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  dom.window.matchMedia = () => ({ matches: false }) as MediaQueryList;
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => root.render(<ContactHelp categories={contactCategories} />));
    const buttons = document.querySelectorAll<HTMLButtonElement>(".cp-help-categories button");
    await act(async () => buttons[3]!.click());
    assert.equal(buttons[3]!.getAttribute("aria-pressed"), "true");
    assert.equal(document.querySelector(".cp-help-answers")?.getAttribute("aria-label"), "Warranty");
    const detail = document.querySelector<HTMLDetailsElement>(".cp-help-answers details")!;
    await act(async () => detail.querySelector("summary")!.click());
    assert.equal(detail.open, true);
    assert.match(detail.textContent ?? "", /The warranty we offer differs from product to product/);
    await act(async () => buttons[0]!.click());
    assert.equal(document.querySelector(".cp-help-answers")?.getAttribute("aria-label"), "Order Tracking And Delivery");
    assert.equal(document.querySelector<HTMLDetailsElement>(".cp-help-answers details")?.open, false);
  } finally {
    await act(async () => root.unmount());
    Object.assign(globalThis, previous);
    dom.window.close();
  }
});
