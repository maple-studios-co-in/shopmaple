import { z } from "zod";

export const contactSectionKeys = ["intro", "help", "cities"] as const;
export const bulkSectionKeys = ["hero", "trust", "process", "business", "cities"] as const;
const categoryKeys = ["tracking", "payment", "account", "warranty", "damage"] as const;
const questionCounts = { tracking: 5, payment: 4, account: 2, warranty: 1, damage: 1 } as const;
const text = (max: number) => z.string().min(1).max(max).refine(
  value => value.trim().length > 0 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value),
  "Use nonempty text without control characters",
);
const cities = z.object({ eyebrow: text(160), heading: text(160) }).strict();
const unique = (items: { key: string }[]) => new Set(items.map(item => item.key)).size === items.length;
const uniqueMessage = "Service content identities must be unique";

/** Copy for existing service templates; destinations, media and commerce are fixed. */
export const contactPageContentSchema = z.object({
  title: text(160), eyebrow: text(160), heading: text(300),
  helpEyebrow: text(300), helpHeading: text(160), cities,
  sections: z.array(z.object({ key: z.enum(contactSectionKeys), enabled: z.boolean() }).strict()).length(3).refine(unique, uniqueMessage),
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
}).strict();

export const bulkPageContentSchema = z.object({
  title: text(160), eyebrow: text(160), heading: text(160), subtitle: text(300), cities,
  sections: z.array(z.object({ key: z.enum(bulkSectionKeys), enabled: z.boolean() }).strict()).length(5).refine(unique, uniqueMessage),
  trust: z.object({
    heading: text(300), metricValue: text(80), metricLabel: text(160),
    items: z.array(z.object({ key: z.enum(["price", "quality", "materials", "custom"]), title: text(160) }).strict()).length(4).refine(unique, uniqueMessage),
  }).strict(),
  process: z.object({
    eyebrow: text(300), heading: text(160),
    steps: z.array(z.object({ key: z.enum(["meet", "design", "deliver"]), title: text(160), body: text(3000) }).strict()).length(3).refine(unique, uniqueMessage),
  }).strict(),
  business: z.object({
    badge: text(160), heading: text(160), body: text(4000), features: z.array(text(200)).length(5), cta: text(160), trust: text(160),
  }).strict(),
}).strict();

export const returnsPageContentSchema = z.object({ title: text(160), heading: text(160), policyLabel: text(160), intro: text(1000) }).strict();
export const servicePagesContentSchema = z.object({ contact: contactPageContentSchema, bulk: bulkPageContentSchema, returns: returnsPageContentSchema }).strict();
export type ContactPageContent = z.infer<typeof contactPageContentSchema>;
export type BulkPageContent = z.infer<typeof bulkPageContentSchema>;
export type ReturnsPageContent = z.infer<typeof returnsPageContentSchema>;
export type ServicePagesContent = z.infer<typeof servicePagesContentSchema>;
export type ContactSectionKey = (typeof contactSectionKeys)[number];
export type BulkSectionKey = (typeof bulkSectionKeys)[number];
