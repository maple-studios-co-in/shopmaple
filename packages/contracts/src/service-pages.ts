import { z } from "zod";

/** The contact page's regions in their default order. The redesign (Figma 298:511; owner, 10 Nov 2026) set the ways to
    reach us and the enquiry apart from the opening and added the Delhi address; its design has no cities band. */
export const contactSectionKeys = ["intro", "reach", "enquiry", "help", "visit", "cities"] as const;
/** The original template's three regions: older revisions list only these, and still validate. */
export const legacyContactSectionKeys = ["intro", "help", "cities"] as const;
export const contactGuidanceKeys = ["order", "project"] as const;
/** The bulk enquiry page's regions in their default order. The redesign (Figma 298:924; owner, 10 Nov 2026) added the
    figures band and moved the form out of the opening into a proposal region of its own. */
export const bulkSectionKeys = ["hero", "figures", "trust", "process", "proposal", "business", "cities"] as const;
/** The original template's five regions: older revisions list only these, and still validate. */
export const legacyBulkSectionKeys = ["hero", "trust", "process", "business", "cities"] as const;
/** The figures band's own three figures; the projects count before them is `trust.metricValue`. */
export const bulkFigureKeys = ["checks", "cities", "workshop"] as const;
/** The promises under "Your brief. Our craft."; the redesign traded the price match for delivery across India. */
export const bulkPromiseKeys = ["price", "quality", "materials", "custom", "delivery"] as const;
const categoryKeys = ["tracking", "payment", "account", "warranty", "damage"] as const;
const questionCounts = { tracking: 5, payment: 4, account: 2, warranty: 1, damage: 1 } as const;
const text = (max: number) => z.string().min(1).max(max).refine(
  value => value.trim().length > 0 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value),
  "Use nonempty text without control characters",
);
const cities = z.object({ eyebrow: text(160), heading: text(160) }).strict();
const unique = (items: { key: string }[]) => new Set(items.map(item => item.key)).size === items.length;
const uniqueMessage = "Service content identities must be unique";
const contactWay = z.object({ title: text(80), note: text(160) }).strict();

/** Copy for existing service templates; destinations, media and commerce are fixed. */
export const contactPageContentSchema = z.object({
  title: text(160), eyebrow: text(160), heading: text(300),
  helpEyebrow: text(300), helpHeading: text(160), cities,
  sections: z.array(z.object({ key: z.enum(contactSectionKeys), enabled: z.boolean() }).strict())
    .min(legacyContactSectionKeys.length).max(contactSectionKeys.length).refine(unique, uniqueMessage)
    .refine(items => legacyContactSectionKeys.every(key => items.some(item => item.key === key)), "List every contact page section"),
  categories: z.array(z.object({
    key: z.enum(categoryKeys), title: text(160), subtitle: text(300),
    questions: z.array(z.object({
      key: z.enum(["q1", "q2", "q3", "q4", "q5"]), question: text(300), answer: text(4000),
    }).strict()).min(1).max(5).refine(unique, uniqueMessage),
  }).strict().superRefine((category, ctx) => {
    const count = questionCounts[category.key];
    if (category.questions.length !== count || category.questions.some(question => Number(question.key.slice(1)) > count))
      ctx.addIssue({ code: "custom", path: ["questions"], message: "Questions must retain this category's exact identities" });
  })).length(5).refine(unique, uniqueMessage),
  // The redesign's own words (Figma 298:511). Older revisions omit them and show the design's copy. The phone number,
  // email and address come from the footer's customer care details; the destinations stay fixed.
  introBody: text(300).optional(),
  reach: z.object({ call: contactWay, write: contactWay, visit: contactWay.extend({ detail: text(160) }) }).strict().optional(),
  enquiryEyebrow: text(160).optional(),
  enquiryHeading: text(300).optional(),
  enquiryBody: text(600).optional(),
  guidance: z.array(z.object({ key: z.enum(contactGuidanceKeys), title: text(160), body: text(400) }).strict())
    .length(contactGuidanceKeys.length).refine(unique, uniqueMessage).optional(),
  bulkCta: text(80).optional(),
  formHeading: text(160).optional(),
  formNote: text(300).optional(),
  helpBody: text(300).optional(),
  visitEyebrow: text(160).optional(),
  visitHeading: text(300).optional(),
  visitBody: text(300).optional(),
  visitCta: text(80).optional(),
}).strict();

export const bulkPageContentSchema = z.object({
  title: text(160), eyebrow: text(160), heading: text(160), subtitle: text(300),
  cities: z.object({ eyebrow: text(160), heading: text(160), body: text(300).optional() }).strict(),
  sections: z.array(z.object({ key: z.enum(bulkSectionKeys), enabled: z.boolean() }).strict())
    .min(legacyBulkSectionKeys.length).max(bulkSectionKeys.length).refine(unique, uniqueMessage)
    .refine(items => legacyBulkSectionKeys.every(key => items.some(item => item.key === key)), "List every bulk enquiry section"),
  trust: z.object({
    heading: text(300), metricValue: text(80), metricLabel: text(160),
    items: z.array(z.object({ key: z.enum(bulkPromiseKeys), title: text(160), body: text(300).optional() }).strict()).length(4).refine(unique, uniqueMessage),
    eyebrow: text(160).optional(), body: text(300).optional(),
  }).strict(),
  process: z.object({
    eyebrow: text(300), heading: text(160),
    steps: z.array(z.object({ key: z.enum(["meet", "design", "deliver"]), title: text(160), body: text(3000) }).strict()).length(3).refine(unique, uniqueMessage),
  }).strict(),
  // The redesign shows four business points (the original five still validate); its `trust` line is no longer shown.
  business: z.object({
    badge: text(160), heading: text(160), body: text(4000), features: z.array(text(200)).min(1).max(5), cta: text(160), trust: text(160),
  }).strict(),
  // The redesign's own words (Figma 298:924). Older revisions omit them and show the design's copy. The phone number and
  // email come from the footer's bulk contact; IndiaMART, the photos and the form's questions stay fixed.
  heroCta: text(60).optional(),
  heroNote: text(160).optional(),
  figures: z.array(z.object({ key: z.enum(bulkFigureKeys), value: text(80), label: text(160) }).strict())
    .length(bulkFigureKeys.length).refine(unique, uniqueMessage).optional(),
  proposal: z.object({
    eyebrow: text(160), heading: text(160), body: text(600), contactHeading: text(160), formHeading: text(160),
    note: text(300), cta: text(60), referencesTitle: text(160), referencesNote: text(200),
  }).strict().optional(),
}).strict();

export const returnsPageContentSchema = z.object({ title: text(160), heading: text(160), policyLabel: text(160), intro: text(1000) }).strict();
export const servicePagesContentSchema = z.object({ contact: contactPageContentSchema, bulk: bulkPageContentSchema, returns: returnsPageContentSchema }).strict();
export type ContactPageContent = z.infer<typeof contactPageContentSchema>;
export type BulkPageContent = z.infer<typeof bulkPageContentSchema>;
export type ReturnsPageContent = z.infer<typeof returnsPageContentSchema>;
export type ServicePagesContent = z.infer<typeof servicePagesContentSchema>;
export type ContactSectionKey = (typeof contactSectionKeys)[number];
export type BulkSectionKey = (typeof bulkSectionKeys)[number];
