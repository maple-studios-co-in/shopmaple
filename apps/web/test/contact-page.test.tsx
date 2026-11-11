import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, readFileSync, statSync } from "node:fs";
import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { storefrontContentSchema } from "@shopmaple/contracts";
import ServicePage from "../app/[slug]/page";
import { ServicePageFields } from "../components/admin/service-page-fields";
import { ContactHelpCentre } from "../components/contact-page-client";
import { defaultStorefrontContent } from "../lib/content-defaults";
import { defaultContactPage, legacyContactPage, resolveContactPage } from "../lib/contact-page-content";
import { defaultServicePages } from "../lib/service-page-defaults";
import { resolveTemplateMedia, templateMediaSlots } from "../lib/template-media-defaults";
import { installUiDom, press } from "./support/ui-dom";

// The contact page from Figma 298:511 "Maple / Contact / Desktop" (owner, 10 Nov 2026): the introduction and its photo,
// three ways to reach us, the enquiry, the help centre and the Delhi workshop, between the store's own header and footer.
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("A-2/56-57, W.H.S., Kirti Nagar, New Delhi, Delhi, 110015")}`;
const receipt = { reference: "enq_00000000-0000-4000-8000-000000000000", mode: "preview", notificationSent: false };
const texts = (root: ParentNode, selector: string) => [...root.querySelectorAll(selector)].map(node => node.textContent?.trim());

async function withResponse(body: unknown, run: () => Promise<void>) {
  const previous = globalThis.fetch;
  globalThis.fetch = async (input) => {
    assert.ok(String(input).endsWith("/api/content/storefront"), `Unexpected request to ${String(input)}`);
    return body === null ? Response.json({ code: "CONTENT_NOT_PUBLISHED" }, { status: 404 }) : Response.json(body);
  };
  try { await run(); } finally { globalThis.fetch = previous; }
}
const route = (query: Record<string, string> = {}) => ServicePage({ params: Promise.resolve({ slug: "contact" }), searchParams: Promise.resolve(query) });
async function renderContact(query: Record<string, string> = {}) {
  return new JSDOM(renderToStaticMarkup(await route(query))).window.document;
}
const published = (contact: unknown) => ({ version: 9, content: { ...defaultStorefrontContent, servicePages: { ...structuredClone(defaultServicePages), contact } } });
const regions = (doc: Document) => [...doc.querySelectorAll("[data-service-section]")].map(node => node.getAttribute("data-service-section"));
const topicNames = ["Orders & delivery", "Payments", "Your account", "Warranty", "Damaged items"];
const deliveryQuestions = [
  "How do I track my order?", "What is the estimated delivery time?", "What if I miss my delivery?", "Can I update my delivery address?",
  "My item has already reached the distribution center, what happens next?",
];

function assertRedesign(doc: Document) {
  assert.deepEqual(regions(doc), ["intro", "reach", "enquiry", "help", "visit"], "the design's five regions, in order, and no cities band");
  assert.equal(doc.querySelectorAll("h1").length, 1);
  assert.equal(doc.querySelector("h1")?.textContent, "A conversation.\nA considered beginning.");
  assert.equal(doc.querySelector(".contact-intro .contact-eyebrow")?.textContent, "Contact / Maple Furnishers");
  assert.equal(doc.querySelector(".contact-intro-body")?.textContent, "For your home, your project, or a piece you have in mind.");
  assert.deepEqual(texts(doc, ".contact-way h3"), ["Call us", "Write to us", "Find us in Delhi"]);
  assert.equal(doc.querySelector(".contact-enquiry h2")?.textContent, "Let’s shape\nsomething personal.");
  assert.equal(doc.querySelector(".contact-help h2")?.textContent, "Find your next step.");
  assert.deepEqual(texts(doc, '[role="tab"]'), topicNames);
  assert.deepEqual(texts(doc, '[role="tabpanel"] summary'), deliveryQuestions);
  assert.equal(doc.querySelector(".contact-visit h2")?.textContent, "A real workshop. Real people.");
  assert.equal(doc.querySelector(".home-cities"), null);
}

test("the contact page draws Figma 298:511's five regions with the store's own contact details", async () => {
  await withResponse(null, async () => {
    const doc = await renderContact();
    assertRedesign(doc);
    // The opening: the design's photo, from the page's template artwork.
    const studio = doc.querySelector<HTMLImageElement>(".contact-intro-media img")!;
    assert.equal(studio.getAttribute("src"), "/media/contact/studio.webp");
    assert.match(studio.getAttribute("alt") ?? "", /walnut dining table/);
    // Ways to reach us: the footer's customer care number and email (staff keep them in the admin), and directions.
    const call = doc.querySelector<HTMLAnchorElement>('.contact-way a[href^="tel:"]')!;
    assert.equal(call.getAttribute("href"), "tel:+918796130252");
    assert.equal(call.textContent, "+91 87961 30252");
    const write = doc.querySelector<HTMLAnchorElement>('.contact-way a[href^="mailto:"]')!;
    assert.equal(write.getAttribute("href"), "mailto:contact@maplefurnishers.com");
    assert.equal(write.textContent, "contact@maplefurnishers.com");
    const find = doc.querySelectorAll<HTMLAnchorElement>(".contact-way a")[2]!;
    assert.equal(find.getAttribute("href"), maps);
    assert.equal(find.getAttribute("target"), "_blank");
    assert.match(find.getAttribute("rel") ?? "", /noreferrer/);
    assert.equal(find.textContent?.replace(/\s*\(opens.*\)$/, ""), "Kirti Nagar, New Delhi");
    assert.deepEqual(texts(doc, ".contact-way-note"), ["Speak to the Maple team", "For questions and support", "A-2/56–57, W.H.S, Delhi 110015"]);
    assert.deepEqual([...doc.querySelectorAll(".contact-way img")].map(img => [img.getAttribute("src"), img.getAttribute("alt")]),
      [["/media/contact/phone.svg", ""], ["/media/contact/mail.svg", ""], ["/media/contact/pin.svg", ""]]);
    // The enquiry: its guidance, the way to Bulk Enquiry, and one form.
    assert.deepEqual(texts(doc, ".contact-guide h3"), ["For an existing order", "Planning a larger project?"]);
    const bulk = doc.querySelector<HTMLAnchorElement>('.contact-guide a[href="/bulk-enquiry"]')!;
    assert.equal(bulk.textContent?.replace("→", "").trim(), "Explore bulk enquiries");
    assert.equal(doc.querySelectorAll("form").length, 1);
    const form = doc.querySelector("form")!;
    assert.equal(form.querySelector(".contact-form-title")?.textContent, "Send us a message");
    assert.ok(form.querySelector('input[name="name"][required][autocomplete="name"]'));
    assert.ok(form.querySelector('input[name="email"][type="email"][required]'));
    assert.ok(form.querySelector('input[name="phone"][type="tel"]:not([required])'));
    assert.ok(form.querySelector('input[name="order"]:not([required])'));
    assert.ok(form.querySelector('textarea[name="message"][required]'));
    assert.deepEqual([...form.querySelectorAll('select[name="topic"] option')].map(option => option.textContent),
      ["Select a topic", ...topicNames, "Something else"]);
    for (const control of form.querySelectorAll("input, select, textarea"))
      assert.ok(form.querySelector(`label[for="${control.id}"]`), `${control.getAttribute("name")} has a visible label`);
    assert.equal(form.querySelector('button[type="submit"]')?.textContent?.replace("→", "").trim(), "Send message");
    assert.equal(form.querySelector(".contact-form-note")?.textContent, "We’ll use these details to respond to your enquiry.");
    // The help centre opens on its first topic, its first answer showing.
    assert.equal(doc.querySelector('[role="tab"][aria-selected="true"]')?.textContent, "Orders & delivery");
    const answers = [...doc.querySelectorAll<HTMLDetailsElement>('[role="tabpanel"] details')];
    assert.deepEqual(answers.map(item => item.hasAttribute("open")), [true, false, false, false, false]);
    assert.doesNotMatch(doc.body.textContent ?? "", /My Orders|in your Maple account/, "no account the store does not have");
    // The Delhi workshop: the footer's address, the design's photo and directions in a new tab.
    assert.deepEqual(texts(doc, ".contact-visit address span"), ["A-2/56 - 57, W.H.S, Kirti Nagar,", "New Delhi, Delhi, 110015"]);
    assert.equal(doc.querySelector(".contact-visit-media img")?.getAttribute("src"), "/media/contact/workshop.webp");
    const directions = doc.querySelector<HTMLAnchorElement>(".contact-visit a")!;
    assert.equal(directions.getAttribute("href"), maps);
    assert.equal(directions.getAttribute("target"), "_blank");
    assert.match(directions.getAttribute("rel") ?? "", /noreferrer/);
    assert.match(directions.textContent ?? "", /^Get directions/);
    // Buttons fill from the pointer like every button on the site; the old map embed is gone.
    assert.equal(doc.querySelectorAll(".contact-button[data-fill-button]").length, 3);
    assert.equal(doc.querySelector("iframe"), null);
  });
});

test("the live store's copy, published unchanged from the original template, reads as the redesign", async () => {
  await withResponse(published(structuredClone(legacyContactPage)), async () => assertRedesign(await renderContact()));
  // The live revision (v53) holds the template's wording from before 1 Nov 2026, which sent customers to an account the
  // store does not have; it reads as today's answers too.
  const live = structuredClone(legacyContactPage);
  live.categories[0]!.questions[0]!.answer = "Go to My Orders in your Maple Furnishers account to track your order.";
  live.categories[2]!.questions[0]!.question = "How to Create an Account with Maple Furnishers?";
  live.categories[2]!.questions[0]!.answer = "Click on the signup link, present at the top right corner of our maplefurnishers. This will show a pop-up menu where you can register from either of the following ways to get on board.\n\nManual form filling: You can manually fill up the form to register yourself by filling the general details.\n\nSign up through Gmail: You can also sign up through your Gmail account by clicking on “or continue with Gmail”, presented at the below side of the popup menu.\nYour maplefurnishers account is now ready.";
  await withResponse(published(live), async () => {
    const doc = await renderContact();
    assertRedesign(doc);
    assert.match(doc.querySelector('[role="tabpanel"] details p')?.textContent ?? "", /^Contact our team with your order number/);
    assert.doesNotMatch(doc.body.textContent ?? "", /My Orders|signup link/);
  });
  const account = resolveContactPage(live).categories.find(category => category.key === "account")!;
  assert.equal(account.questions[0]!.question, "Do I need an account with Maple Furnishers?");
  assert.match(account.questions[0]!.answer, /^You don't need one: you can always check out as a guest/);
});

test("staff wording, order and visibility stay; new regions join an older list where the redesign puts them", async () => {
  const legacy = structuredClone(legacyContactPage);
  legacy.heading = "Furniture for your life";
  legacy.helpHeading = "Find an answer";
  legacy.categories[0]!.title = "Your delivery";
  legacy.categories[0]!.questions[0]!.question = "Where is my order?";
  legacy.sections = [{ key: "help", enabled: true }, { key: "intro", enabled: true }, { key: "cities", enabled: true }];
  await withResponse(published(legacy), async () => {
    const doc = await renderContact();
    assert.deepEqual(regions(doc), ["help", "visit", "intro", "reach", "enquiry"], "the cities band leaves with the redesign");
    assert.equal(doc.querySelector("h1")?.textContent, "Furniture for your life");
    assert.equal(doc.querySelector(".contact-help h2")?.textContent, "Find an answer");
    assert.equal(doc.querySelector('[role="tab"]')?.textContent, "Your delivery");
    assert.equal(doc.querySelector('[role="tabpanel"] summary')?.textContent, "Where is my order?");
  });
  const hidden = structuredClone(legacyContactPage);
  hidden.sections = [{ key: "intro", enabled: false }, { key: "help", enabled: true }, { key: "cities", enabled: false }];
  await withResponse(published(hidden), async () => {
    const doc = await renderContact();
    assert.deepEqual(regions(doc), ["help"], "the old introduction carried the details, the form and the address");
    assert.equal(doc.querySelector("h1.sr-only")?.textContent, "A conversation.\nA considered beginning.");
  });
  const redesigned = structuredClone(defaultContactPage);
  redesigned.cities = { eyebrow: "Near you", heading: "Across the country" };
  redesigned.sections = [
    { key: "visit", enabled: true }, { key: "cities", enabled: true }, { key: "intro", enabled: true },
    { key: "help", enabled: false }, { key: "enquiry", enabled: true }, { key: "reach", enabled: false },
  ];
  await withResponse(published(redesigned), async () => {
    const doc = await renderContact();
    assert.deepEqual(regions(doc), ["visit", "cities", "intro", "enquiry"]);
    assert.deepEqual(texts(doc, ".home-cities header .home-eyebrow, .home-cities h2"), ["Near you", "Across the country"], "staff can bring the cities band back");
  });
});

test("an enquiry about a product keeps its bounded context, shown above the form and never as markup", async () => {
  await withResponse(null, async () => {
    const doc = await renderContact({ product: "<script>bad()</script>" + "x".repeat(600), variant: "Walnut / Ivory", sku: "z".repeat(200), pincode: "110015" });
    const note = doc.querySelector(".contact-form-context")!;
    assert.equal(note.querySelector("strong")?.textContent?.length, 500);
    assert.match(note.textContent ?? "", /Walnut \/ Ivory/);
    assert.match(note.textContent ?? "", /Delivery pincode: 110015/);
    assert.doesNotMatch(doc.body.innerHTML, /zzzz/, "the item code is sent, not written");
    assert.equal(doc.querySelector("script"), null);
    assert.equal((await renderContact()).querySelector(".contact-form-context"), null);
  });
});

/** Mounts the page in a browser-like document and returns it; `fetch` answers the store's content and enquiry requests. */
async function mountContact(query: Record<string, string>, enquiries: { url: string; init?: RequestInit }[], run: (doc: Document) => Promise<void>) {
  const dom = installUiDom("http://localhost:3000/contact");
  // next/link schedules its prefetch through `self`, and the form reads itself with the window's FormData, as in a browser.
  const globals = { self: globalThis.self, FormData: globalThis.FormData };
  Object.assign(globalThis, { self: dom.window, FormData: dom.window.FormData });
  const previous = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/api/content/storefront")) return Response.json({ code: "CONTENT_NOT_PUBLISHED" }, { status: 404 });
    assert.equal(url, "/api/enquiries", "The form only posts to the store's enquiry endpoint");
    enquiries.push({ url, init });
    return Response.json(receipt);
  };
  const root = createRoot(document.getElementById("root")!);
  const router = { bfcacheId: "test", back() {}, forward() {}, refresh() {}, hmrRefresh() {}, push() {}, replace() {}, prefetch: async () => {} };
  try {
    const page = await route(query);
    await act(async () => root.render(<AppRouterContext.Provider value={router}>{page}</AppRouterContext.Provider>));
    await run(document);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previous;
    Object.assign(globalThis, globals);
    dom.window.close();
  }
}
async function type(doc: Document, selector: string, value: string) {
  const field = doc.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(selector)!;
  const view = doc.defaultView!;
  const proto = field instanceof view.HTMLSelectElement ? view.HTMLSelectElement.prototype : field instanceof view.HTMLTextAreaElement ? view.HTMLTextAreaElement.prototype : view.HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(field, value);
    field.dispatchEvent(new view.Event(field instanceof view.HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}

test("the form sends one enquiry through the store's enquiry path, its topic and order number leading the message", async () => {
  const enquiries: { url: string; init?: RequestInit }[] = [];
  await mountContact({ product: "Aero Dining Chair", variant: "Walnut", sku: "AERO-1", pincode: "110015" }, enquiries, async (doc) => {
    await type(doc, 'input[name="name"]', "Asha Rao");
    await type(doc, 'input[name="email"]', "Asha@Example.com");
    await type(doc, 'input[name="phone"]', "+91 98100 00000");
    await type(doc, 'select[name="topic"]', "Payments");
    assert.equal(doc.querySelector(".contact-select-value")?.textContent, "Payments", "the chosen topic shows where the design writes it");
    await type(doc, 'input[name="order"]', "MF-1042");
    await type(doc, 'textarea[name="message"]', "Can I pay the balance on delivery?");
    const form = doc.querySelector("form")!;
    await act(async () => { form.requestSubmit(); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    assert.equal(enquiries.length, 1);
    assert.equal(enquiries[0]!.init?.method, "POST");
    assert.deepEqual(JSON.parse(String(enquiries[0]!.init?.body)), {
      kind: "contact", name: "Asha Rao", email: "asha@example.com", phone: "+91 98100 00000",
      message: "I need help with: Payments\nOrder number: MF-1042\n\nCan I pay the balance on delivery?",
      context: { product: "Aero Dining Chair", variant: "Walnut", sku: "AERO-1", pincode: "110015" },
    });
    assert.match(doc.querySelector('form [role="status"]')?.textContent ?? "", /Your enquiry has been saved\. Reference: enq_/);
    assert.equal(doc.querySelector<HTMLInputElement>('input[name="name"]')?.value, "", "a sent form starts afresh");
    assert.equal(doc.querySelector(".contact-select-value")?.textContent, "Select a topic");
  });
  const plain: typeof enquiries = [];
  await mountContact({}, plain, async (doc) => {
    await type(doc, 'input[name="name"]', "Dev");
    await type(doc, 'input[name="email"]', "dev@example.com");
    await type(doc, 'textarea[name="message"]', "Hello");
    await act(async () => { doc.querySelector("form")!.requestSubmit(); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    assert.equal(JSON.parse(String(plain[0]!.init?.body)).message, "Hello", "nothing is added when no topic or order is given");
  });
});

test("the help centre's topics are tabs, and each question opens with its plus and closes with its minus", async () => {
  await mountContact({}, [], async (doc) => {
    const tabs = () => [...doc.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    const panel = () => doc.querySelector('[role="tabpanel"]')!;
    assert.equal(doc.querySelector('[role="tablist"]')?.getAttribute("aria-label"), "Help topics");
    assert.deepEqual(tabs().map(tab => tab.tabIndex), [0, -1, -1, -1, -1], "one tab stop");
    assert.equal(panel().getAttribute("aria-labelledby"), tabs()[0]!.id);
    await act(async () => tabs()[3]!.click());
    assert.equal(tabs()[3]!.getAttribute("aria-selected"), "true");
    assert.deepEqual(texts(panel(), "summary"), ["Where can I check my warranty?"]);
    assert.equal(panel().querySelector("details")?.open, true);
    assert.match(panel().textContent ?? "", /refer to the warranty tab on individual product pages/);
    tabs()[3]!.focus();
    await act(async () => press(tabs()[3]!, "ArrowRight"));
    assert.equal(doc.activeElement, tabs()[4]);
    assert.equal(tabs()[4]!.getAttribute("aria-selected"), "true");
    assert.deepEqual(texts(panel(), "summary"), ["What if my furniture arrives damaged?"]);
    await act(async () => press(tabs()[4]!, "ArrowRight"));
    assert.equal(doc.activeElement, tabs()[0], "the arrows wrap around");
    await act(async () => press(tabs()[0]!, "End"));
    assert.equal(doc.activeElement, tabs()[4]);
    await act(async () => press(tabs()[4]!, "Home"));
    assert.equal(tabs()[0]!.getAttribute("aria-selected"), "true");
    assert.deepEqual(texts(panel(), "summary"), deliveryQuestions);
    const second = panel().querySelectorAll<HTMLDetailsElement>("details")[1]!;
    assert.equal(second.open, false);
    await act(async () => second.querySelector("summary")!.click());
    assert.equal(second.open, true);
    assert.ok(second.querySelector(".contact-faq-sign[aria-hidden='true']"), "the sign is drawn, not read out");
  });
  // A plus while closed; its upright bar lies down (a quarter turn) into a minus once open, in maple red.
  const css = read("../styles/contact-page.css");
  assert.match(css, /\.contact-faq-sign::after \{[^}]*rotate: 90deg;/);
  assert.match(css, /\.contact-faq\[open\] \.contact-faq-sign::after \{\s*rotate: 0deg;/);
  assert.match(css, /--contact-maple: #80241c;/);
});

test("the chosen topic, its focus and an open answer stay through staff edits and reordering in the live preview", async () => {
  const dom = installUiDom("http://localhost:3000/admin");
  const root = createRoot(document.getElementById("root")!);
  const topics = defaultContactPage.categories.map(category => ({ key: category.key, title: category.title, icon: `/media/contact/${category.key}.svg`, questions: category.questions }));
  try {
    await act(async () => root.render(<ContactHelpCentre topics={topics} />));
    const payments = document.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1]!;
    await act(async () => payments.click());
    payments.focus();
    const second = document.querySelectorAll<HTMLDetailsElement>('[role="tabpanel"] details')[1]!;
    await act(async () => second.querySelector("summary")!.click());
    const edited = structuredClone(topics).reverse();
    const pay = edited.find(topic => topic.key === "payment")!;
    pay.title = "Paying for your order";
    pay.questions[1]!.question = "Can I pay in instalments?";
    await act(async () => root.render(<ContactHelpCentre topics={edited} />));
    assert.equal(document.activeElement, payments);
    assert.equal(payments.getAttribute("aria-selected"), "true");
    assert.equal(payments.textContent, "Paying for your order");
    assert.equal(document.querySelectorAll('[role="tabpanel"] details')[1], second);
    assert.equal(second.open, true);
    assert.equal(second.querySelector("summary")?.textContent, "Can I pay in instalments?");
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});

test("the page's sheet is loaded where it renders, eases on the site's curve and keeps still for reduced motion", () => {
  const css = read("../styles/contact-page.css");
  assert.match(css, /cubic-bezier\(0\.22, 1, 0\.36, 1\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{/);
  assert.match(css, /container: contact \/ inline-size;/);
  assert.match(read("../app/[slug]/layout.tsx"), /import "@\/styles\/contact-page\.css";/);
  assert.match(read("../app/admin/preview-frame/[...page]/page.tsx"), /import "@\/styles\/contact-page\.css";/);
  assert.match(read("../components/service-pages.tsx"), /export \{ ContactPage as Contact \} from "@\/components\/contact-page";/);
});

test("on a phone the help topics scroll as a strip whose next topic peeks in at the edge, so the rest can be found", () => {
  const css = read("../styles/contact-page.css").replace(/\r\n/g, "\n");
  const phone = css.slice(css.indexOf("@container contact (max-width: 759px) {"), css.indexOf("@container contact (max-width: 559px) {"));
  assert.match(phone, /\.contact-topic-list \{[^}]*overflow-x: auto;/);
  // 3.4 topics across the page at 390px: the fourth shows its edge. Where all five fit, they keep the design's 124px.
  assert.match(phone, /\.contact-us \.contact-topic \{[^}]*width: max\(92px, min\(124px, calc\(\(100cqw - var\(--contact-gutter\) - 24px\) \/ 3\.4\)\)\);/);
});

test("the design's photos and icons are local files, and the photos are template artwork staff can replace", () => {
  for (const name of ["studio.webp", "workshop.webp", "phone.svg", "mail.svg", "pin.svg", "truck.svg", "receipt.svg", "user.svg", "shield.svg", "box.svg"]) {
    const file = new URL(`../public/media/contact/${name}`, import.meta.url);
    assert.ok(existsSync(file) && statSync(file).size > 300, name);
  }
  const slots = templateMediaSlots.filter(slot => slot.group === "Contact");
  assert.deepEqual(slots.map(slot => [slot.key, slot.image]), [["contact-studio", "/media/contact/studio.webp"], ["contact-workshop", "/media/contact/workshop.webp"]]);
  const custom = [{ key: "contact-workshop" as const, image: "/media/contact/other.webp", alt: "Another workshop photo" }];
  assert.equal(resolveTemplateMedia("contact-workshop", custom).image, "/media/contact/other.webp");
  assert.equal(storefrontContentSchema.safeParse({ ...defaultStorefrontContent, templateMedia: custom }).success, true);
});

test("older revisions still validate, and the redesign's regions and words are bounded plain text", () => {
  const accepts = (contact: unknown) => storefrontContentSchema.safeParse({ ...defaultStorefrontContent, servicePages: { ...structuredClone(defaultServicePages), contact } }).success;
  assert.equal(accepts(legacyContactPage), true, "the live store's revision");
  assert.equal(accepts(defaultContactPage), true, "the redesign");
  assert.deepEqual(defaultServicePages.contact, defaultContactPage, "a new draft starts from the redesign");
  const withSections = (sections: { key: string; enabled: boolean }[]) => ({ ...structuredClone(defaultContactPage), sections });
  const all = defaultContactPage.sections;
  assert.equal(accepts(withSections([...all].reverse())), true);
  assert.equal(accepts(withSections(all.filter(item => item.key !== "visit"))), true, "a region the page adds back");
  assert.equal(accepts(withSections(all.filter(item => item.key !== "help"))), false, "every original region is listed");
  assert.equal(accepts(withSections([...all, { key: "intro", enabled: true }])), false);
  assert.equal(accepts(withSections([...all.slice(1), { key: "map", enabled: true }])), false);
  for (const [field, limit] of [["introBody", 300], ["enquiryHeading", 300], ["helpBody", 300], ["visitCta", 80]] as const) {
    assert.equal(accepts({ ...structuredClone(defaultContactPage), [field]: "x".repeat(limit) }), true, field);
    assert.equal(accepts({ ...structuredClone(defaultContactPage), [field]: "x".repeat(limit + 1) }), false, field);
    assert.equal(accepts({ ...structuredClone(defaultContactPage), [field]: " \n" }), false, field);
  }
  const guidance = structuredClone(defaultContactPage);
  (guidance.guidance[0] as { key: string }).key = "returns";
  assert.equal(accepts(guidance), false);
  const reach = structuredClone(defaultContactPage) as Record<string, any>;
  reach.reach.call.href = "tel:+910000000000";
  assert.equal(accepts(reach), false, "destinations are not copy");
});

test("staff edit the redesign's words in the contact editor; the draft keeps every region", async () => {
  const dom = installUiDom();
  const root = createRoot(document.getElementById("root")!);
  let saved: any;
  try {
    await act(async () => root.render(<ServicePageFields page="contact" onChange={value => { saved = value; }} />));
    for (const details of document.querySelectorAll<HTMLDetailsElement>("details")) details.open = true;
    const field = (label: string) => document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[aria-label="${label}"]`)!;
    assert.equal(field("Contact heading").value, "A conversation.\nA considered beginning.");
    assert.equal(field("Contact introduction text").value, "For your home, your project, or a piece you have in mind.");
    assert.equal(field("Contact call note").value, "Speak to the Maple team");
    assert.equal(field("Contact enquiry heading").value, "Let’s shape\nsomething personal.");
    assert.equal(field("Contact larger project title").value, "Planning a larger project?");
    assert.equal(field("Contact help text").value, "Choose a topic, or browse a few common questions.");
    assert.equal(field("Contact Tracking category title").value, "Orders & delivery");
    assert.equal(field("Contact Tracking question 1").value, "How do I track my order?");
    assert.equal(field("Contact address heading").value, "A real workshop. Real people.");
    assert.equal(field("Contact directions button").value, "Get directions");
    assert.equal(document.querySelector('[aria-label="Contact Tracking category subtitle"]'), null, "the redesign shows no subtitles");
    assert.deepEqual([...document.querySelectorAll<HTMLInputElement>('input[aria-label^="Show Contact"]')].map(box => [box.getAttribute("aria-label"), box.checked]), [
      ["Show Contact Introduction", true], ["Show Contact Ways to reach us", true], ["Show Contact Enquiry", true],
      ["Show Contact Help", true], ["Show Contact Delhi address", true], ["Show Contact Cities", false],
    ]);
    await type(document, '[aria-label="Contact form heading"]', "Write to the workshop");
    assert.equal(saved.contact.formHeading, "Write to the workshop");
    assert.deepEqual(saved.contact.sections.map((item: { key: string }) => item.key), ["intro", "reach", "enquiry", "help", "visit", "cities"]);
    assert.equal(storefrontContentSchema.safeParse({ ...defaultStorefrontContent, servicePages: saved }).success, true);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});
