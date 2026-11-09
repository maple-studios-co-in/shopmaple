import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { renderToStaticMarkup } from "react-dom/server";
import type { EditorialNode } from "@shopmaple/contracts";
import PolicyPage, { generateMetadata } from "../app/policies/[slug]/page";
import { StoreContent } from "../components/store-content";
import source from "../data/store-content.json";
import { fromEditorDoc, toEditorDoc } from "../lib/editorial-rich-text";
import published from "./fixtures/policy-source-text.json";

// Policies stay pages the page editor can write in plain HTML (owner, 1 November). Since 5 November they
// are laid out as the "Maple Website Review" Help pages (Figma 150:2569 to 150:4558): breadcrumb, Help
// tabs, title over the policy's opening line, a photograph, "On this page" and numbered sections.
const slugs = ["privacy-policy", "refund-policy", "shipping-policy", "terms-of-service"] as const;
type Slug = (typeof slugs)[number];
const policies = source.policies as Record<string, { title: string; content: EditorialNode[] }>;
const props = (slug: string) => ({ params: Promise.resolve({ slug }) });

async function unpublished(run: () => Promise<void>) {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ code: "CONTENT_NOT_PUBLISHED" }, { status: 404 });
  try { await run(); } finally { globalThis.fetch = previous; }
}
const render = async (slug: string) => new JSDOM(renderToStaticMarkup(await PolicyPage(props(slug)))).window.document;
const text = (element: Element | null | undefined) => (element?.textContent ?? "").replace(/\s+/g, " ").trim();

const helpPages = [
  ["Privacy Policy", "/policies/privacy-policy"],
  ["Terms of Service", "/policies/terms-of-service"],
  ["Shipping Policy", "/policies/shipping-policy"],
  ["Refund Policy", "/policies/refund-policy"],
  ["Return & Exchange", "/pages/returns"],
];

// What each frame shows: its Help tab, its title, the line under it and its "On this page" list.
const design: Record<Slug, { tab: string; title: string; opening: string; sections: string[] }> = {
  "privacy-policy": {
    tab: "Privacy Policy",
    title: "Privacy policy",
    opening: "Learn how Maple Furnishers collects, protects, and responsibly uses your information.",
    sections: [
      "Your Privacy Matters", "Information We Collect", "How We Use Your Information", "Sharing of Information", "Data Security", "Cookies & Tracking",
      "Customer Communication", "Data Retention", "Marketplace & Third-Party Policies", "Access & Preferences", "Updates to This Policy", "Contact Us",
    ],
  },
  "terms-of-service": {
    tab: "Terms of Service",
    title: "Terms of service",
    opening: "Please read these Terms & Conditions carefully before accessing, browsing, or placing an order with Maple Furnishers.",
    sections: [
      "Introduction", "Nature of Products", "Customisation Policy", "Orders & Payments", "Cancellation Policy", "Manufacturing & Delivery", "Installation",
      "Product Inspection & Acceptance", "Returns & Replacements", "Warranty", "Material Disclaimer", "Use of Website", "Intellectual Property",
      "Limitation of Liability", "Third-Party Platforms", "Governing Law", "Updates to Terms",
    ],
  },
  "shipping-policy": {
    tab: "Shipping Policy",
    title: "Shipping policy",
    opening: "Made-to-order furniture, crafted with care. Please review our shipping processes and terms below.",
    sections: [
      "Made-to-Order Manufacturing", "Delivery Timeline", "Shipping Charges", "Delivery Process", "Site Readiness", "Installation Services",
      "Delays & External Factors", "Delivery Acceptance", "Multiple Shipments",
    ],
  },
  "refund-policy": {
    tab: "Refund Policy",
    title: "Refund policy",
    opening: "Cancellation, Return & Refund Policy. Made-to-order furniture, crafted with care. Please review our policy terms below.",
    sections: ["Made-to-Order Policy", "Cancellation Policy", "Eligible Cases for Return / Replacement", "Reporting an Issue", "Assessment & Resolution", "Non-Eligible Conditions"],
  },
};

// Catches a policy page missing a part of the frame, or the Help tabs pointing at the wrong page.
test("each policy page has the Help frame's breadcrumb, Help tabs, title, opening line, photograph and customer care", async () => {
  await unpublished(async () => {
    for (const slug of slugs) {
      const doc = await render(slug);
      const { tab, title, opening } = design[slug];
      const crumbs = [...doc.querySelectorAll('nav[aria-label="Breadcrumb"] li')];
      assert.deepEqual(crumbs.map(text), ["Home", "Help", tab], slug);
      assert.deepEqual(crumbs.map(item => item.querySelector("a")?.getAttribute("href") ?? null), ["/", "/pages/contact", null], slug);
      assert.equal(crumbs[2]!.getAttribute("aria-current"), "page", slug);
      for (const menu of ["[data-help-tabs]", "[data-help-menu]"]) {
        const links = [...doc.querySelectorAll(`${menu} a`)];
        assert.deepEqual(links.map(link => [text(link), link.getAttribute("href")]), helpPages, `${slug} ${menu}`);
        assert.deepEqual(links.filter(link => link.getAttribute("aria-current") === "page").map(text), [tab], `${slug} ${menu}`);
      }
      assert.equal(text(doc.querySelector("[data-help-menu] summary")), `Help / ${tab}`, slug);
      assert.deepEqual([...doc.querySelectorAll("h1")].map(text), [title], slug);
      assert.equal(text(doc.querySelector("[data-help-opening]")), opening, slug);
      assert.equal(doc.querySelector("[data-help-photo] img")?.getAttribute("src"), `/media/policies/${slug}.jpg`, slug);
      const care = doc.querySelector("[data-customer-care]");
      assert.equal(text(care?.querySelector("h2")), "A little help, whenever you need it.", slug);
      // The footer's customer care contact, which staff keep current, not the number drawn in the frame.
      assert.deepEqual([...care!.querySelectorAll("a")].map(link => [text(link), link.getAttribute("href")]), [
        ["contact@maplefurnishers.com", "mailto:contact@maplefurnishers.com"],
        ["+91 87961 30252", "tel:+918796130252"],
      ], slug);
    }
  });
});

// Catches "On this page" and the sections drifting apart: a missing, renumbered or dead entry.
test("On this page lists every section with its number, and each entry opens that numbered section", async () => {
  await unpublished(async () => {
    for (const slug of slugs) {
      const doc = await render(slug);
      const expected = design[slug].sections.map((title, index) => [String(index + 1).padStart(2, "0"), title]);
      for (const list of ['[data-policy-contents="list"]', '[data-policy-contents="menu"]']) {
        const entries = [...doc.querySelectorAll(`${list} a`)];
        assert.deepEqual(entries.map(entry => [text(entry.querySelector("[data-number]")), text(entry.querySelector("[data-title]"))]), expected, `${slug} ${list}`);
        for (const [index, entry] of entries.entries()) {
          const target = doc.getElementById(entry.getAttribute("href")!.replace(/^#/, ""));
          assert.equal(target?.hasAttribute("data-policy-section"), true, `${slug}: ${entry.getAttribute("href")}`);
          assert.equal(text(target!.querySelector("h2")), `${expected[index]![0]}. ${expected[index]![1]}`, slug);
        }
      }
      assert.deepEqual([...doc.querySelectorAll('[data-policy-contents="list"] a[aria-current="location"]')].map(text), [`01 ${expected[0]![1]}`], `${slug}: the first section is the one being read`);
      assert.equal(text(doc.querySelector('[data-policy-contents="menu"] summary')), "Jump to a section", slug);
      assert.equal(doc.querySelectorAll("[data-policy-section]").length, expected.length, slug);
    }
  });
});

// Catches leftovers from the old store (unstyled boxes, cards, icons) that the editor cannot make.
test("policy text is plain editor HTML that comes back unchanged after a round trip through the page editor", () => {
  const editorTags = new Set(["h2", "h3", "p", "ul", "ol", "li", "strong", "em", "u", "a", "br"]);
  const tagsIn = (nodes: EditorialNode[]): string[] => nodes.flatMap(node => typeof node === "string" ? [] : [node.tag, ...tagsIn(node.children)]);
  for (const slug of slugs) {
    const { content } = policies[slug]!;
    assert.deepEqual([...new Set(tagsIn(content))].filter(tag => !editorTags.has(tag)), [], slug);
    assert.deepEqual(fromEditorDoc(toEditorDoc(content)), content, slug);
  }
});

// The decorative labels the old store's design carried, which plain HTML leaves out: icons, the
// brand line and section numbers above headings, topic labels repeating the heading below them, and an
// opening heading that repeats the page title. The Help frames also leave out the promise cards under the
// opening line of the privacy and refund policies, and the shipping policy's opening heading.
const dropped: Record<Slug, string[]> = {
  "privacy-policy": [
    "MAPLE FURNISHERS", "Privacy Policy", "✦", "◎", "◷", "Introduction", "Information Collection", "Data Usage", "Information Sharing",
    "Security", "Cookies", "Communication", "Retention", "Third-Party Platforms", "Your Rights", "Policy Updates", "Contact",
    "Privacy Focused", "Your information is treated with care and responsibility.", "Secure Handling",
    "Industry-standard security practices are followed.", "Transparent Policies", "Clear communication about how your data is used.",
  ],
  "refund-policy": [
    "Maple Furnishers", "✦", "◎", "◷", "Section 1", "Section 2", "Section 3", "Section 4", "Section 5", "Section 6",
    "Custom Built", "Every Maple piece is manufactured only after order confirmation.", "Inspection Led",
    "Claims are reviewed and approved after assessment by Maple Furnishers.", "Report Quickly", "Issues should be reported within 24–48 hours of delivery.",
  ],
  "shipping-policy": ["Maple Furnishers", ...Array.from({ length: 9 }, (_, index) => `Section 0${index + 1}`), "Shipping & Delivery Policy"],
  "terms-of-service": ["MAPLE FURNISHERS", "Terms of Service", ...Array.from({ length: 17 }, (_, index) => `Section ${String(index + 1).padStart(2, "0")}`)],
};
// The only wording the Help frames change: the refund policy's opening heading becomes the first sentence
// under its title, and two definitions gain their full stops. (The privacy frame also draws another
// contact number; the policy keeps the authorized one, see store-content.test.tsx.)
const edited: Record<Slug, [string, string][]> = {
  "privacy-policy": [],
  "refund-policy": [["Cancellation, Return & Refund Policy", "Cancellation, Return & Refund Policy."]],
  "shipping-policy": [],
  "terms-of-service": [
    ["“Company”, “we”, “us”, “our” refers to Maple Furnishers", "“Company”, “we”, “us”, “our” refers to Maple Furnishers."],
    ["“You”, “user”, “customer” refers to any individual accessing or purchasing from the website", "“You”, “user”, “customer” refers to any individual accessing or purchasing from the website."],
  ],
};

// Catches the rewrite losing, changing, reordering or inventing policy wording.
test("the plain HTML keeps every published line of each policy in order and adds no words", () => {
  for (const slug of slugs) {
    const lines = [...published[slug].runs];
    for (const label of dropped[slug]) {
      const index = lines.indexOf(label);
      assert.ok(index >= 0, `${slug}: "${label}" was published`);
      lines.splice(index, 1);
    }
    for (const [before, after] of edited[slug]) {
      const index = lines.indexOf(before);
      assert.ok(index >= 0, `${slug}: "${before}" was published`);
      lines[index] = after;
    }
    const copy = new JSDOM(`<main>${renderToStaticMarkup(<StoreContent nodes={policies[slug]!.content} />)}</main>`).window.document.querySelector("main")!;
    copy.querySelectorAll("br").forEach(lineBreak => lineBreak.replaceWith(" "));
    copy.querySelectorAll("h2, h3, p, li").forEach(block => block.append(" "));
    let text = (copy.textContent ?? "").replace(/\s+/g, " ").trim();
    for (const line of lines) {
      assert.ok(text.startsWith(line), `${slug}: expected "${line}" next, found "${text.slice(0, 80)}"`);
      text = text.slice(line.length).trimStart();
    }
    assert.equal(text, "", `${slug}: words not in the published policy`);
  }
});

// Catches the redesign changing titles or canonical addresses search engines already know. The shipping
// policy is the one exception: its frame names it "Shipping policy", like the other three.
test("policy titles and canonical addresses stay as published", async () => {
  const titles: Record<Slug, string> = { ...Object.fromEntries(slugs.map(slug => [slug, published[slug].title])) as Record<Slug, string>, "shipping-policy": "Shipping policy" };
  assert.equal(published["shipping-policy"].title, "Shipping");
  await unpublished(async () => {
    for (const slug of slugs)
      assert.deepEqual(await generateMetadata(props(slug)), { title: titles[slug], alternates: { canonical: `/policies/${slug}` } }, slug);
    assert.deepEqual(await generateMetadata(props("not-a-policy")), { title: "Policy" });
  });
});
