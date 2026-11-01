import assert from "node:assert/strict";
import test from "node:test";
import { storefrontContentSchema } from "@shopmaple/contracts";
import { defaultStorefrontContent } from "../lib/content-defaults";

const serviceFixture = () => ({
  contact: {
    title: "Contact our studio", eyebrow: "Here to help", heading: "Tell us about your space",
    helpEyebrow: "Questions answered", helpHeading: "Find some help",
    cities: { eyebrow: "Delivery", heading: "Across India" },
    sections: ["cities", "intro", "help"].map(key => ({ key, enabled: key !== "cities" })),
    categories: [["tracking", 5], ["payment", 4], ["account", 2], ["warranty", 1], ["damage", 1]].map(([key, count]) => ({
      key, title: `Help with ${key}`, subtitle: "Answers from the team",
      questions: Array.from({ length: Number(count) }, (_, index) => ({ key: `q${index + 1}`, question: `Question ${index + 1}?`, answer: "<script>Plain text</script>\nAsk our team." })),
    })),
  },
  bulk: {
    title: "Projects with Maple", eyebrow: "Your next project", heading: "Made for your space", subtitle: "Talk to a designer",
    sections: ["business", "hero", "trust", "process", "cities"].map(key => ({ key, enabled: key !== "cities" })),
    cities: { eyebrow: "Serving", heading: "Across India" },
    trust: { heading: "Care for every project", metricValue: "200+", metricLabel: "Spaces furnished", items: ["price", "quality", "materials", "custom"].map(key => ({ key, title: `Our ${key}` })) },
    process: { eyebrow: "How we help", heading: "Your design journey", steps: ["meet", "design", "deliver"].map(key => ({ key, title: `We ${key}`, body: "Thoughtful support throughout." })) },
    business: { badge: "Business enquiries", heading: "Furnish your project", body: "Talk to our project team.", features: ["Design", "Materials", "Craft", "Delivery", "Care"], cta: "Request details", trust: "Trusted support" },
  },
  returns: { title: "Order support", heading: "Return enquiries", policyLabel: "Read our policy", intro: "Ask our team about your order." },
});

test("legacy storefront revisions remain accepted without service content", () => {
  const legacy = structuredClone(defaultStorefrontContent) as Record<string, unknown>;
  delete legacy.servicePages;
  assert.equal(storefrontContentSchema.safeParse(legacy).success, true);
  assert.equal(storefrontContentSchema.safeParse({ ...legacy, checkoutEnabled: true }).success, false);
});

test("service page copy and stable reordered sections survive the storefront contract", () => {
  const parsed = storefrontContentSchema.safeParse({ ...defaultStorefrontContent, servicePages: serviceFixture() });
  assert.equal(parsed.success, true, "the storefront accepts bounded typed service page content");
  if (!parsed.success) return;
  const services = (parsed.data as unknown as { servicePages: ReturnType<typeof serviceFixture> }).servicePages;
  assert.equal(services.contact.heading, "Tell us about your space");
  assert.deepEqual(services.contact.sections.map(s => s.key), ["cities", "intro", "help"]);
  assert.equal(services.contact.sections[0]!.enabled, false);
  assert.equal(services.contact.categories[0]!.questions[0]!.answer, "<script>Plain text</script>\nAsk our team.");
  assert.equal(services.bulk.process.steps[1]!.key, "design");
  assert.equal(services.returns.intro, "Ask our team about your order.");
});

test("service content rejects unknown capabilities, changed identities, incomplete sets and invalid text", () => {
  const valid = serviceFixture();
  const accepts = (servicePages: unknown) => storefrontContentSchema.safeParse({ ...defaultStorefrontContent, servicePages }).success;
  assert.equal(accepts(valid), true);
  for (const mutation of [
    (s: any) => { s.html = "<h1>HTML</h1>"; },
    (s: any) => { s.contact.email = "someone@example.invalid"; },
    (s: any) => { s.contact.cities.href = "/checkout"; },
    (s: any) => { s.contact.sections[0].key = "checkout"; },
    (s: any) => { s.contact.sections[0].key = s.contact.sections[1].key; },
    (s: any) => { s.contact.sections.pop(); },
    (s: any) => { s.contact.categories[0].key = "other"; },
    (s: any) => { s.contact.categories[0].key = "payment"; },
    (s: any) => { s.contact.categories.pop(); },
    (s: any) => { s.contact.categories[0].icon = "/media/custom.svg"; },
    (s: any) => { s.contact.categories[0].questions[0].key = "q6"; },
    (s: any) => { s.contact.categories[0].questions[0].key = "q2"; },
    (s: any) => { s.contact.categories[0].questions.pop(); },
    (s: any) => { s.contact.categories[4].questions[0].key = "q2"; },
    (s: any) => { s.bulk.sections.pop(); },
    (s: any) => { s.bulk.sections[0].key = "checkout"; },
    (s: any) => { s.bulk.sections[0].key = s.bulk.sections[1].key; },
    (s: any) => { s.bulk.trust.items[0].key = "stock"; },
    (s: any) => { s.bulk.trust.items[0].key = "quality"; },
    (s: any) => { s.bulk.trust.items.pop(); },
    (s: any) => { s.bulk.process.steps[0].key = "pay"; },
    (s: any) => { s.bulk.process.steps[0].key = "design"; },
    (s: any) => { s.bulk.process.steps.pop(); },
    (s: any) => { s.bulk.business.features.pop(); },
    (s: any) => { s.bulk.business.href = "https://example.invalid"; },
    (s: any) => { s.returns.policyHref = "/checkout"; },
    (s: any) => { s.returns.checkoutEnabled = true; },
  ]) {
    const invalid = structuredClone(valid);
    mutation(invalid);
    assert.equal(accepts(invalid), false, mutation.toString());
  }
  const fields: [string[], number][] = [
    ...["title", "eyebrow", "helpHeading"].map(key => [["contact", key], 160] as [string[], number]),
    ...["heading", "helpEyebrow"].map(key => [["contact", key], 300] as [string[], number]),
    [["contact", "cities", "eyebrow"], 160], [["contact", "cities", "heading"], 160],
    [["contact", "categories", "0", "title"], 160], [["contact", "categories", "0", "subtitle"], 300],
    [["contact", "categories", "0", "questions", "0", "question"], 300], [["contact", "categories", "0", "questions", "0", "answer"], 4000],
    ...["title", "eyebrow", "heading"].map(key => [["bulk", key], 160] as [string[], number]),
    [["bulk", "subtitle"], 300], [["bulk", "cities", "eyebrow"], 160], [["bulk", "cities", "heading"], 160],
    [["bulk", "trust", "heading"], 300], [["bulk", "trust", "metricValue"], 80], [["bulk", "trust", "metricLabel"], 160], [["bulk", "trust", "items", "0", "title"], 160],
    [["bulk", "process", "eyebrow"], 300], [["bulk", "process", "heading"], 160], [["bulk", "process", "steps", "0", "title"], 160], [["bulk", "process", "steps", "0", "body"], 3000],
    ...["badge", "heading", "cta", "trust"].map(key => [["bulk", "business", key], 160] as [string[], number]),
    [["bulk", "business", "body"], 4000], [["bulk", "business", "features", "0"], 200],
    ...["title", "heading", "policyLabel"].map(key => [["returns", key], 160] as [string[], number]),
    [["returns", "intro"], 1000],
  ];
  for (const [path, limit] of fields) for (const [value, expected] of [["x".repeat(limit), true], ["x".repeat(limit + 1), false], [" \n\t", false], ["bad\u0000text", false], ["Line one\nLine two\ttext", true]] as const) {
    const candidate: any = structuredClone(valid);
    let target = candidate;
    for (const key of path.slice(0, -1)) target = target[key];
    target[path.at(-1)!] = value;
    assert.equal(accepts(candidate), expected, `${path.join(".")} length ${value.length}`);
  }
});

test("the complete content payload still enforces the 128 KiB UTF-8 limit", () => {
  const content = { ...defaultStorefrontContent, servicePages: serviceFixture() };
  assert.equal(storefrontContentSchema.safeParse(content).success, true);
  content.servicePages.contact.categories.forEach(category => category.questions.forEach(question => { question.answer = "界".repeat(4000); }));
  assert.equal(storefrontContentSchema.safeParse(content).success, false);
});

test("service fallback preserves original page copy and returns isolated editable drafts", async () => {
  const { defaultServicePages, resolveServicePages } = await import("../lib/service-page-defaults");
  const fallback = resolveServicePages();
  assert.equal(storefrontContentSchema.safeParse({ ...defaultStorefrontContent, servicePages: fallback }).success, true);
  assert.equal(fallback.contact.title, "Contact Us");
  assert.equal(fallback.contact.heading, "Tell us what you need. We’ll help you shape it");
  assert.equal(fallback.contact.categories[0]!.questions[0]!.answer, "Go to My Orders in your Maple Furnishers account to track your order.");
  assert.deepEqual(fallback.contact.categories.map(category => category.questions.map(question => question.key)), [["q1", "q2", "q3", "q4", "q5"], ["q1", "q2", "q3", "q4"], ["q1", "q2"], ["q1"], ["q1"]]);
  assert.equal(fallback.bulk.heading, "Home Interior");
  assert.equal(fallback.bulk.trust.metricValue, "100+");
  assert.equal(fallback.bulk.process.steps[2]!.body, "Relax while we handle the rest — from crafting to installation. Shop directly from your design and watch your dream home come alive.");
  assert.equal(fallback.bulk.business.cta, "Request Bulk Quote");
  assert.equal(fallback.returns.intro, "Contact our team about your order.");
  fallback.contact.categories[0]!.questions[0]!.answer = "Private edit";
  fallback.bulk.sections[0]!.enabled = false;
  assert.equal(defaultServicePages.contact.categories[0]!.questions[0]!.answer, "Go to My Orders in your Maple Furnishers account to track your order.");
  assert.equal(resolveServicePages().bulk.sections[0]!.enabled, true);
  const edited = resolveServicePages(fallback);
  assert.equal(edited.contact.categories[0]!.questions[0]!.answer, "Private edit");
  edited.contact.categories[0]!.questions[0]!.answer = "Second private edit";
  assert.equal(fallback.contact.categories[0]!.questions[0]!.answer, "Private edit");
});
