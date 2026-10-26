import { z } from "zod";
import { contentLinkSchema } from "./content";

const text = (max: number) => z.string().min(1).max(max).refine(
  value => value.trim().length > 0 && !/[\u0000-\u001f\u007f-\u009f]/.test(value),
  "Use nonblank text without control characters",
);
const id = z.string().max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
// Deferred because the legacy content module also contains the enclosing document schema.
const destination = z.union([z.lazy(() => contentLinkSchema), z.literal("/account"), z.literal("/favourites")]);
const linkFields = { id, label: text(120), href: destination, enabled: z.boolean(), enquirySubject: text(160).optional() };
const contactSubject = (value: { href: string; enquirySubject?: string }, ctx: z.RefinementCtx) => {
  if (value.enquirySubject !== undefined && value.href !== "/pages/contact")
    ctx.addIssue({ code: "custom", path: ["enquirySubject"], message: "Enquiry subjects require the contact page destination" });
};
const linkSchema = z.object(linkFields).strict().superRefine(contactSubject);
const navigationLinkSchema = z.object({ ...linkFields, parent: z.boolean() }).strict().superRefine(contactSubject);
const uniqueIds = (items: { id: string }[]) => new Set(items.map(item => item.id)).size === items.length;
const links = (max: number) => z.array(linkSchema).max(max).refine(uniqueIds, "Link identities must be unique");
const navigationColumnSchema = z.object({
  id, links: z.array(navigationLinkSchema).min(1).max(12).refine(uniqueIds, "Link identities must be unique"),
}).strict();
const navigationItemSchema = z.object({
  id, label: text(120), href: destination, enabled: z.boolean(), feature: z.enum(["living", "bedroom", "none"]),
  columns: z.array(navigationColumnSchema).max(4).refine(uniqueIds, "Column identities must be unique"),
}).strict();
const actionLinkSchema = z.object({ ...linkFields, cta: text(80) }).strict().superRefine(contactSubject);
const phone = z.string().regex(/^\+[1-9][0-9]{7,14}$/, "Use a canonical international phone number");
const email = z.email().max(254).refine(value => !/[\u0000-\u001f\u007f-\u009f]/.test(value), "Use a mailbox without control characters");
const instagram = z.string().max(300).regex(/^https:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9_][A-Za-z0-9_.]{0,29}\/?$/).refine(
  value => !["p", "reel", "reels", "stories", "explore", "accounts", "direct"].includes(value.split("/")[3]!.toLowerCase()) && !value.split("/")[3]!.includes("..") && !value.split("/")[3]!.endsWith("."),
  "Use an Instagram profile URL",
).nullable();
const linkedin = z.string().max(300).regex(/^https:\/\/(?:www\.)?linkedin\.com\/company\/[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*\/?$/).nullable();
const footerSchema = z.object({
  columns: z.array(z.object({ key: z.enum(["shop", "help", "care"]), enabled: z.boolean() }).strict()).length(3).refine(items => new Set(items.map(item => item.key)).size === 3, "Include each footer column exactly once"),
  contactColumns: z.array(z.object({ key: z.enum(["bulk", "service", "marketplace"]), enabled: z.boolean() }).strict()).length(3).refine(items => new Set(items.map(item => item.key)).size === 3, "Include each contact column exactly once"),
  shopHeading: text(160), helpHeading: text(160), careHeading: text(160),
  shopLinks: links(12), helpLinks: links(12), policyLinks: links(8), addressLines: z.array(text(160)).min(1).max(4),
  customerPhone: phone, customerPhoneLabel: text(60), customerEmail: email,
  contactHeading: text(160), bulkHeading: text(160), serviceHeading: text(160), findUsHeading: text(160),
  bulkPhone: phone, bulkPhoneLabel: text(60), bulkEmail: email, copyrightName: text(160), instagram, linkedin,
}).strict();
export const siteChromeSchema = z.object({
  announcement: z.object({ text: text(200), href: destination, enabled: z.boolean() }).strict(),
  utilityLinks: links(6),
  navigation: z.array(navigationItemSchema).min(1).max(8).refine(uniqueIds, "Navigation identities must be unique"),
  desktopDiscovery: z.array(actionLinkSchema).max(6).refine(uniqueIds, "Discovery identities must be unique"),
  mobileQuickLinks: links(8), footer: footerSchema,
  whatsapp: z.object({ enabled: z.boolean(), phone, label: text(120) }).strict(),
}).strict().superRefine((value, ctx) => {
  if (new TextEncoder().encode(JSON.stringify(value)).length > 64 * 1024)
    ctx.addIssue({ code: "custom", message: "Site chrome exceeds 64 KiB" });
});
export type SiteChrome = z.infer<typeof siteChromeSchema>;
export type ChromeLink = z.infer<typeof linkSchema>;
export type ChromeNavigationLink = z.infer<typeof navigationLinkSchema>;
export type ChromeNavigationColumn = z.infer<typeof navigationColumnSchema>;
export type ChromeNavigationItem = z.infer<typeof navigationItemSchema>;
export type ChromeActionLink = z.infer<typeof actionLinkSchema>;
export type FooterContent = z.infer<typeof footerSchema>;
