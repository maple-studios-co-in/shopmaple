import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { storefrontContentSchema, type ServicePagesContent } from "@shopmaple/contracts";
import ServicePage from "../app/[slug]/page";
import { ServicePageFields } from "../components/admin/service-page-fields";
import { defaultStorefrontContent } from "../lib/content-defaults";
import { renderStorefrontRoute } from "../lib/storefront-routes";
import { customChrome } from "./support/site-chrome-fixture";

// The Bulk Enquiry redesign (Figma 298:924, owner 10 Nov 2026), between the site's own header and footer.

/** The original template's copy, word for word, as the live store still publishes it (10 Nov 2026). */
const legacyBulk = () => ({
  title: "Bulk Enquiry",
  eyebrow: "Place Your Bulk Orders",
  heading: "Home Interior",
  subtitle: "Work 1:1 with expert interior designers",
  cities: { eyebrow: "We Are Serving", heading: "20+ Cities" },
  sections: ["hero", "trust", "process", "business", "cities"].map(key => ({ key, enabled: true })),
  trust: {
    heading: "Trusted By Designers, Businesses & Modern Spaces",
    metricValue: "100+",
    metricLabel: "Projects Delivered",
    items: [
      { key: "price", title: "Price match guarantee" },
      { key: "quality", title: "250+ Steps Quality Check" },
      { key: "materials", title: "Premium Materials" },
      { key: "custom", title: "Custom Solutions" },
    ],
  },
  process: {
    eyebrow: "Here’s How We Bring Your Dream Space to Life",
    heading: "How it Works",
    steps: [
      { key: "meet", title: "Meet Your Designer", body: "Bring your ideas, inspirations, and budget. Our expert designer will understand your needs and start shaping a plan that fits your lifestyle." },
      { key: "design", title: "Finalize Your Design", body: "Work one-on-one with your designer to refine the details. Get realistic 3D renders so you can visualize your space before it comes to life." },
      { key: "deliver", title: "Bring It Home", body: "Relax while we handle the rest — from crafting to installation. Shop directly from your design and watch your dream home come alive." },
    ],
  },
  business: {
    badge: "★ TRUSTED BY BUSINESSES",
    heading: "Looking for Bulk Orders?",
    body: "Source directly from one of India's trusted furnishing suppliers. Hotels, Interior Designers, Contractors, Offices, Retailers & Project Buyers can place large-volume requirements through our IndiaMART business channel.",
    features: ["Factory & Wholesale Pricing", "Bulk Quantity Support", "Custom Sizes & Specifications", "Dedicated Business Assistance", "PAN India Delivery"],
    cta: "Request Bulk Quote",
    trust: "Secure • Verified • Trusted by Businesses",
  },
});
const redesignRegions = ["hero", "figures", "trust", "process", "proposal", "business", "cities"];
const receipt = { reference: "enq_00000000-0000-4000-8000-000000000000", mode: "preview", notificationSent: false };

/** Serves `content` as the published storefront (null: nothing published yet). Every other request fails the test. */
async function withPublished(content: Record<string, unknown> | null, run: () => Promise<void>) {
  const previous = globalThis.fetch;
  globalThis.fetch = async (input) => {
    assert.ok(String(input).endsWith("/api/content/storefront"), `Unexpected request to ${String(input)}`);
    return content === null ? Response.json({ code: "CONTENT_NOT_PUBLISHED" }, { status: 404 }) : Response.json({ version: 9, content });
  };
  try { await run(); } finally { globalThis.fetch = previous; }
}
const published = (bulk: unknown, extra: Record<string, unknown> = {}) => ({
  ...defaultStorefrontContent, servicePages: { ...defaultStorefrontContent.servicePages, bulk }, ...extra,
});
async function routeElement(query: Record<string, string | string[] | undefined> = {}) {
  return ServicePage({ params: Promise.resolve({ slug: "bulk-enquiry" }), searchParams: Promise.resolve(query) });
}
const markup = (node: ReactNode) => new JSDOM(renderToStaticMarkup(node)).window.document;
const renderBulk = async (query: Record<string, string | string[] | undefined> = {}) => markup(await routeElement(query));
const region = (doc: Document, key: string) => {
  const found = doc.querySelector(`[data-service-section="${key}"]`);
  assert.ok(found, `Missing the ${key} region`);
  return found;
};
const regions = (doc: Document) => [...doc.querySelectorAll("[data-service-section]")].map(node => node.getAttribute("data-service-section"));
const texts = (root: ParentNode, selector: string) => [...root.querySelectorAll(selector)].map(node => node.textContent?.trim());
const sources = (root: ParentNode, selector: string) => [...root.querySelectorAll(selector)].map(node => node.getAttribute("src"));

test("the bulk enquiry page is the redesign: opening, figures, advantages, steps, proposal, business band and cities", async () => {
  await withPublished(null, async () => {
    const doc = await renderBulk();
    assert.deepEqual(regions(doc), redesignRegions);
    assert.equal(doc.querySelectorAll("h1").length, 1);
    assert.equal(doc.querySelectorAll("form").length, 1);

    const hero = region(doc, "hero");
    assert.equal(hero.querySelector("h1")?.innerHTML, "Spaces with purpose.<br> Furniture with presence.");
    assert.equal(hero.querySelector("[data-bulk-eyebrow]")?.textContent, "Maple / Projects & partnerships");
    assert.equal(hero.querySelector("[data-bulk-subtitle]")?.innerHTML, "Considered furniture, crafted around your vision.<br> For residences, hospitality and spaces of business.");
    const cta = hero.querySelector("a[data-bulk-cta]");
    assert.equal(cta?.getAttribute("href"), "#request-proposal");
    assert.equal(cta?.textContent?.trim(), "Request a proposal");
    assert.equal(doc.getElementById("request-proposal")?.getAttribute("data-service-section"), "proposal", "the opening's button leads to the form");
    assert.equal(hero.querySelector("[data-bulk-note]")?.textContent, "Designers / Hospitality / Workspaces / Homes");
    assert.equal(hero.querySelector("img")?.getAttribute("src"), "/media/bulk-enquiry/hero.webp");

    const figures = region(doc, "figures");
    assert.deepEqual(texts(figures, "[data-bulk-figure] [data-figure-value]"), ["100+", "250+", "20+", "In-house"]);
    assert.deepEqual(texts(figures, "[data-bulk-figure] [data-figure-label]"), ["Projects delivered", "Quality-check steps", "Cities served", "Crafted in Delhi"]);

    const advantages = region(doc, "trust");
    assert.equal(advantages.querySelector("[data-bulk-eyebrow]")?.textContent, "The Maple advantage");
    assert.equal(advantages.querySelector("h2")?.textContent, "Your brief. Our craft.");
    assert.equal(advantages.querySelector("[data-bulk-lede]")?.textContent, "From a statement piece to a complete project, the details stay personal.");
    assert.deepEqual(texts(advantages, "[data-bulk-advantage] h3"), ["Custom specifications", "Premium materials", "Quality at every step", "Delivery across India"]);
    assert.deepEqual(texts(advantages, "[data-bulk-advantage] p"), [
      "Sizes, finishes and materials tailored to the project.",
      "Thoughtful selections for the look, feel and use of your space.",
      "A considered process, from production through finishing.",
      "Coordinate your project requirements with our team.",
    ]);
    assert.deepEqual(sources(advantages, "[data-bulk-advantage] img"), ["ruler", "layers", "shield", "truck"].map(icon => `/media/bulk-enquiry/${icon}.svg`));

    const process = region(doc, "process");
    assert.equal(process.querySelector("[data-bulk-eyebrow]")?.textContent, "From first idea to finished space");
    assert.equal(process.querySelector("h2")?.textContent, "A clear path from brief to delivery.");
    assert.deepEqual(texts(process, "[data-bulk-step] [data-step-number]"), ["01", "02", "03"]);
    assert.deepEqual(texts(process, "[data-bulk-step] h3"), ["Meet your designer", "Refine every detail", "Bring it home"]);
    assert.deepEqual(texts(process, "[data-bulk-step] h3 + p"), [
      "Share your ideas, inspiration and budget. We’ll shape the requirements around your space.",
      "Work one-to-one on materials, finishes and design. Visualize the space with 3D renders.",
      "Move from approved designs into crafting, delivery and installation.",
    ]);
    assert.deepEqual(sources(process, "[data-bulk-step] img"), ["meet", "design", "deliver"].map(step => `/media/bulk-enquiry/step-${step}.webp`));

    const proposal = region(doc, "proposal");
    assert.equal(proposal.querySelector("[data-bulk-eyebrow]")?.textContent, "Let’s build something lasting");
    assert.equal(proposal.querySelector("h2")?.innerHTML, "Your vision,<br> in the making.");
    assert.equal(proposal.querySelector("[data-bulk-lede]")?.textContent, "Share what you know now. Our team can help work through the details with you.");
    assert.equal(proposal.querySelector("img")?.getAttribute("src"), "/media/bulk-enquiry/proposal.webp");
    const form = proposal.querySelector("form")!;
    assert.equal(form.querySelector("h3")?.textContent, "Request a project proposal");
    assert.deepEqual([...form.querySelectorAll("input, select, textarea")].map(field => field.getAttribute("name")),
      ["name", "company", "email", "phone", "projectType", "city", "quantity", "timeline", "message"]);
    assert.deepEqual([...form.querySelectorAll("[required]")].map(field => field.getAttribute("name")), ["name", "email", "phone", "projectType", "city", "message"]);
    assert.deepEqual(texts(form, "[data-field-label]"), ["Full name *", "Company / studio", "Email address *", "Phone number *", "Project type *", "Project city *", "Approximate quantity", "Target delivery", "Your requirements *"]);
    assert.deepEqual([...form.querySelectorAll("input, textarea")].map(field => field.getAttribute("placeholder")),
      ["Your full name", "Business name", "you@company.com", "+91", "City / location", "Number of pieces", "Furniture types, dimensions, materials, budget or anything you have in mind…"]);
    assert.deepEqual(texts(form, 'select[name="projectType"] option'), ["Select project type", "Home or residence", "Hospitality", "Workspace or office", "Retail or showroom", "Designer or architect project", "Other"]);
    assert.deepEqual(texts(form, 'select[name="timeline"] option'), ["Select timeframe", "Within a month", "1–3 months", "3–6 months", "More than 6 months", "Not sure yet"]);
    assert.equal(form.querySelector("[data-bulk-form-note]")?.textContent, "We’ll use these details to discuss your project and proposal.");
    assert.equal(form.querySelector('button[type="submit"]')?.textContent?.trim(), "Request proposal");
    // The enquiry service takes no files: plans and references go to the bulk desk by email (the footer's bulk contact).
    const references = form.querySelector("a[data-bulk-references]");
    assert.equal(references?.getAttribute("href"), "mailto:aditya@maplefurnishers.com?subject=Project%20references");
    assert.match(references?.textContent ?? "", /^Add plans, moodboards or references\s*Optional — share files with your project brief/);
    const conversation = proposal.querySelector("[data-bulk-conversation]")!;
    assert.equal(conversation.querySelector("h3")?.textContent, "Prefer a conversation?");
    assert.deepEqual([...conversation.querySelectorAll("a")].map(link => [link.getAttribute("href"), link.textContent]),
      [["tel:+919262968727", "+91 92629 68727"], ["mailto:aditya@maplefurnishers.com", "aditya@maplefurnishers.com"]]);

    const business = region(doc, "business");
    assert.equal(business.querySelector("[data-bulk-eyebrow]")?.textContent, "For large-volume requirements");
    assert.equal(business.querySelector("h2")?.innerHTML, "Source directly.<br> Build with confidence.");
    assert.equal(business.querySelector("[data-bulk-lede]")?.textContent, "Hotels, interior designers, contractors, offices, retailers and project buyers can also connect through our IndiaMART business channel.");
    assert.deepEqual(texts(business, "[data-bulk-checks] li"), ["Factory & wholesale pricing", "Bulk quantity support", "Custom sizes & specifications", "Dedicated business assistance"]);
    const quote = business.querySelector("a[data-bulk-quote]");
    assert.equal(quote?.getAttribute("href"), "https://m.indiamart.com/maple-furnishers/");
    assert.equal(quote?.getAttribute("target"), "_blank");
    assert.match(quote?.getAttribute("rel") ?? "", /noreferrer/);
    assert.match(quote?.textContent ?? "", /^Request bulk quote/);

    const cities = region(doc, "cities");
    assert.equal(cities.querySelector("[data-bulk-eyebrow]")?.textContent, "From Delhi, across India");
    assert.equal(cities.querySelector("h2")?.textContent, "20+ cities. One dedicated team.");
    assert.equal(cities.querySelector("[data-bulk-cities-line]")?.textContent, "Delhi · Mumbai · Bengaluru · Hyderabad · Kolkata · Chennai · Jaipur · and more");
  });
});

test("the live store's published copy, the original template's word for word, reads as the redesign; staff's own words stay", async () => {
  await withPublished(published(legacyBulk()), async () => {
    const doc = await renderBulk();
    assert.deepEqual(regions(doc), redesignRegions, "the figures and the proposal join the original five regions");
    assert.equal(doc.querySelector("h1")?.innerHTML, "Spaces with purpose.<br> Furniture with presence.");
    assert.deepEqual(texts(region(doc, "figures"), "[data-figure-label]")[0], "Projects delivered");
    assert.deepEqual(texts(region(doc, "trust"), "[data-bulk-advantage] h3"), ["Custom specifications", "Premium materials", "Quality at every step", "Delivery across India"]);
    assert.deepEqual(texts(region(doc, "process"), "[data-bulk-step] h3"), ["Meet your designer", "Refine every detail", "Bring it home"]);
    assert.equal(texts(region(doc, "business"), "[data-bulk-checks] li").length, 4);
    assert.equal(region(doc, "cities").querySelector("h2")?.textContent, "20+ cities. One dedicated team.");
  });
  const own = legacyBulk();
  own.heading = "Commercial interiors";
  own.sections = ["business", "process", "hero", "trust", "cities"].map(key => ({ key, enabled: true }));
  own.trust.metricValue = "150+";
  own.trust.items = [{ key: "price", title: "Fair prices" }, { key: "quality", title: "Careful checks" }, { key: "materials", title: "Good materials" }, { key: "custom", title: "Made to measure" }];
  own.process.steps[0]!.title = "Share your brief";
  own.business.features = ["Value", "Volume", "Sizes", "Support", "Delivery"];
  await withPublished(published(own), async () => {
    const doc = await renderBulk();
    assert.deepEqual(regions(doc), ["business", "process", "proposal", "hero", "figures", "trust", "cities"], "new regions follow the ones they grew from");
    assert.equal(doc.querySelector("h1")?.textContent, "Commercial interiors");
    assert.equal(texts(region(doc, "figures"), "[data-figure-value]")[0], "150+");
    assert.deepEqual(texts(region(doc, "trust"), "[data-bulk-advantage] h3"), ["Fair prices", "Careful checks", "Good materials", "Made to measure"]);
    assert.equal(region(doc, "trust").querySelectorAll("[data-bulk-advantage] img").length, 4, "every promise keeps an icon");
    assert.deepEqual(texts(region(doc, "process"), "[data-bulk-step] h3"), ["Share your brief", "Refine every detail", "Bring it home"]);
    assert.deepEqual(texts(region(doc, "business"), "[data-bulk-checks] li"), ["Value", "Volume", "Sizes", "Support", "Delivery"]);
  });
});

test("the new regions keep the visibility of the regions they grew from, and a hidden form takes the opening's button with it", async () => {
  const hidden = legacyBulk();
  hidden.sections = hidden.sections.map(section => ({ ...section, enabled: !["hero", "trust"].includes(section.key) }));
  await withPublished(published(hidden), async () => {
    const doc = await renderBulk();
    assert.deepEqual(regions(doc), ["process", "business", "cities"]);
    assert.equal(doc.querySelectorAll("form").length, 0);
    assert.ok(doc.querySelector("h1.sr-only"), "the page keeps one accessible heading");
    assert.equal(doc.querySelectorAll("h1").length, 1);
  });
  const withoutForm = legacyBulk();
  withoutForm.sections = redesignRegions.map(key => ({ key, enabled: key !== "proposal" }));
  await withPublished(published(withoutForm), async () => {
    const doc = await renderBulk();
    assert.deepEqual(regions(doc), redesignRegions.filter(key => key !== "proposal"));
    assert.equal(doc.querySelector("a[data-bulk-cta]"), null);
    assert.equal(doc.querySelectorAll("form").length, 0);
  });
});

test("staff's words for the redesign's own fields, the footer's bulk contact and replaced artwork reach the page", async () => {
  const bulk = {
    ...legacyBulk(),
    heroCta: "Plan a project",
    heroNote: "Hotels / Offices",
    figures: [{ key: "checks", value: "300+", label: "Checks" }, { key: "cities", value: "25+", label: "Cities" }, { key: "workshop", value: "Delhi", label: "Workshop" }],
    trust: { ...legacyBulk().trust, eyebrow: "Why Maple", body: "Made for projects.", items: legacyBulk().trust.items.map(item => ({ ...item, body: `About ${item.key}` })) },
    proposal: {
      eyebrow: "Start here", heading: "Tell us\nabout it", body: "A few details help.", contactHeading: "Rather talk?",
      formHeading: "Your proposal", note: "We reply within a day.", cta: "Send brief", referencesTitle: "Plans and photos", referencesNote: "Email them along",
    },
    cities: { eyebrow: "Across India", heading: "25 cities", body: "Delhi · Pune" },
  };
  const art = { key: "bulk-hero", image: `/media/uploads/${"a".repeat(64)}.webp`, alt: "A hotel lobby furnished by Maple" };
  await withPublished(published(bulk, { siteChrome: customChrome(), templateMedia: [art] }), async () => {
    const doc = await renderBulk();
    const hero = region(doc, "hero");
    assert.equal(hero.querySelector("a[data-bulk-cta]")?.textContent?.trim(), "Plan a project");
    assert.equal(hero.querySelector("[data-bulk-note]")?.textContent, "Hotels / Offices");
    assert.equal(hero.querySelector("img")?.getAttribute("src"), art.image);
    assert.equal(hero.querySelector("img")?.getAttribute("alt"), art.alt);
    assert.deepEqual(texts(region(doc, "figures"), "[data-figure-value]"), ["100+", "300+", "25+", "Delhi"]);
    assert.equal(region(doc, "trust").querySelector("[data-bulk-eyebrow]")?.textContent, "Why Maple");
    assert.deepEqual(texts(region(doc, "trust"), "[data-bulk-advantage] p"), ["About price", "About quality", "About materials", "About custom"]);
    const proposal = region(doc, "proposal");
    assert.equal(proposal.querySelector("h2")?.innerHTML, "Tell us<br> about it");
    assert.equal(proposal.querySelector("form h3")?.textContent, "Your proposal");
    assert.equal(proposal.querySelector('button[type="submit"]')?.textContent?.trim(), "Send brief");
    assert.deepEqual([...proposal.querySelectorAll("[data-bulk-conversation] a")].map(link => [link.getAttribute("href"), link.textContent]),
      [["tel:+919876543211", "Business telephone"], ["mailto:business@example.com", "business@example.com"]]);
    assert.equal(proposal.querySelector("a[data-bulk-references]")?.getAttribute("href"), "mailto:business@example.com?subject=Project%20references");
    assert.equal(region(doc, "cities").querySelector("[data-bulk-cities-line]")?.textContent, "Delhi · Pune");
  });
});

test("the staff preview renders the draft's bulk page with the draft's artwork and footer contact", () => {
  const route = renderStorefrontRoute(["pages", "bulk-enquiry"], {
    ...defaultStorefrontContent, siteChrome: customChrome(),
    templateMedia: [{ key: "bulk-step-meet", image: "/media/uploads/" + "b".repeat(64) + ".webp", alt: "A designer with a client" }],
  } as Parameters<typeof renderStorefrontRoute>[1]);
  assert.ok(route);
  const doc = markup(route.node);
  assert.deepEqual(regions(doc), redesignRegions);
  assert.equal(region(doc, "process").querySelector("img")?.getAttribute("src"), "/media/uploads/" + "b".repeat(64) + ".webp");
  assert.equal(doc.querySelector("[data-bulk-conversation] a")?.getAttribute("href"), "tel:+919876543211");
});

test("the proposal form sends one bulk enquiry through the existing enquiry path, its project details in the message", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost:3000/bulk-enquiry" });
  const previous = { window: globalThis.window, document: globalThis.document };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  let element: ReactNode = null;
  await withPublished(null, async () => { element = await routeElement({ product: "Aero Dining Chair", variant: "Walnut", pincode: "110015" }); });
  const container = document.getElementById("root")!;
  const root = createRoot(container);
  const requests: { url: string; method?: string; key: string | null; body: unknown }[] = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), method: init?.method, key: new Headers(init?.headers).get("Idempotency-Key"), body: JSON.parse(String(init?.body)) });
    return Response.json(receipt);
  };
  try {
    await act(async () => root.render(element));
    const form = container.querySelector<HTMLFormElement>("[data-service-section=\"proposal\"] form");
    assert.ok(form, "the proposal region holds the form");
    assert.match(form.querySelector("[data-bulk-context]")?.textContent ?? "", /Aero Dining Chair/);
    const set = (name: string, value: string) => { (form.elements.namedItem(name) as HTMLInputElement).value = value; };
    set("name", "Asha Rao"); set("company", "Rao Studio"); set("email", "Asha@RaoStudio.example"); set("phone", "+91 98100 00000");
    set("projectType", "Hospitality"); set("city", "Jaipur"); set("quantity", "40 chairs"); set("timeline", "1–3 months");
    set("message", "Forty walnut dining chairs for a café.");
    await act(async () => { form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); });
    for (let tick = 0; tick < 20 && !container.querySelector('[role="status"]'); tick++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    assert.equal(requests.length, 1);
    assert.equal(requests[0]!.url, "/api/enquiries");
    assert.equal(requests[0]!.method, "POST");
    assert.ok(requests[0]!.key);
    assert.deepEqual(requests[0]!.body, {
      kind: "bulk", name: "Asha Rao", email: "asha@raostudio.example", phone: "+91 98100 00000",
      message: "Company / studio: Rao Studio\nProject type: Hospitality\nProject city: Jaipur\nApproximate quantity: 40 chairs\nTarget delivery: 1–3 months\n\nForty walnut dining chairs for a café.",
      context: { product: "Aero Dining Chair", variant: "Walnut", sku: "", pincode: "110015" },
    });
    assert.equal(container.querySelector('[role="status"]')?.textContent, `Your enquiry has been saved. Reference: ${receipt.reference}`);
    assert.equal(container.querySelector('[role="alert"]'), null);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previousFetch;
    Object.assign(globalThis, previous);
    dom.window.close();
  }
});

test("staff edit the redesign's words in the Bulk Enquiry editor, starting from the page as it reads, and the draft keeps the contract", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost:3000/admin" });
  const previous = { window: globalThis.window, document: globalThis.document };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.getElementById("root")!;
  const root = createRoot(container);
  // The live store's revision: the original template's copy, which the page now reads as the redesign.
  let value = { ...structuredClone(defaultStorefrontContent.servicePages!), bulk: legacyBulk() } as ServicePagesContent;
  const draw = () => root.render(<ServicePageFields value={value} page="bulk" onChange={next => { value = next; draw(); }} />);
  const field = (label: string) => {
    const found = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[aria-label="${label}"]`);
    assert.ok(found, `Missing the ${label} field`);
    return found;
  };
  async function fill(label: string, text: string) {
    const target = field(label);
    const setter = Object.getOwnPropertyDescriptor(target.tagName === "TEXTAREA" ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype, "value")!.set!;
    await act(async () => { setter.call(target, text); target.dispatchEvent(new dom.window.Event("input", { bubbles: true })); });
  }
  try {
    await act(async () => draw());
    for (const details of container.querySelectorAll("details")) details.open = true;
    assert.deepEqual(texts(container, '[aria-label^="Show Bulk "]').length, 7);
    assert.deepEqual([...container.querySelectorAll('[aria-label^="Show Bulk "]')].map(box => box.getAttribute("aria-label")),
      ["Opening", "Figures", "Advantages", "Process", "Proposal form", "Business", "Cities"].map(name => `Show Bulk ${name}`));
    assert.equal(field("Bulk heading").value, "Spaces with purpose.\nFurniture with presence.");
    assert.equal(field("Bulk opening button").value, "Request a proposal");
    assert.equal(field("Bulk project count label").value, "Projects delivered");
    assert.equal(field("Bulk workshop figure").value, "In-house");
    assert.equal(field("Bulk Delivery advantage").value, "Delivery across India");
    assert.equal(field("Bulk form heading").value, "Request a project proposal");
    assert.equal(field("Bulk cities line").value, "Delhi · Mumbai · Bengaluru · Hyderabad · Kolkata · Chennai · Jaipur · and more");
    assert.equal(container.querySelector('[aria-label="Bulk business trust text"]'), null, "the redesign no longer shows that line");
    await fill("Bulk proposal heading", "Tell us\nabout it");
    await fill("Bulk Quality advantage text", "Checked twice.");
    await fill("Bulk workshop figure label", "Made in Delhi");
    await fill("Bulk references note", "Email them along");
    assert.equal(value.bulk.proposal?.heading, "Tell us\nabout it");
    assert.equal(value.bulk.trust.items.find(item => item.key === "quality")?.body, "Checked twice.");
    assert.equal(value.bulk.figures?.find(item => item.key === "workshop")?.label, "Made in Delhi");
    assert.equal(value.bulk.proposal?.referencesNote, "Email them along");
    assert.equal(value.bulk.heading, "Spaces with purpose.\nFurniture with presence.", "an edit keeps the rest of the page as it reads");
    assert.deepEqual(value.bulk.sections.map(section => section.key), redesignRegions);
    assert.equal(storefrontContentSchema.safeParse({ ...defaultStorefrontContent, servicePages: value }).success, true);
  } finally {
    await act(async () => root.unmount());
    Object.assign(globalThis, previous);
    dom.window.close();
  }
});
