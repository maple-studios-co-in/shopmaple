import { z } from "zod";

/** A place in the storefront theme that writes words of its own: "home.bestsellers.eyebrow", "contact.form.nameLabel". */
export const siteWordKeyPattern = /^[a-z][a-zA-Z0-9]*(?:\.[a-z][a-zA-Z0-9]*){1,4}$/;

const word = z
  .string()
  .max(600)
  .refine((value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value), "Control characters are not content");

/**
 * Words the storefront theme writes itself (small headings, buttons, form labels and messages), changed by staff from the
 * live preview or the Site words screen (owner, 16 Nov 2026: every page and section that does not come from Keeri should
 * be editable from the live preview). A missing word keeps the theme's own. The web app's word list
 * (apps/web/lib/site-words.ts) names each place and its own words.
 */
export const siteWordsSchema = z
  .record(z.string().max(80).regex(siteWordKeyPattern), word)
  .refine((words) => Object.keys(words).length <= 300, "Too many site words");

export type SiteWords = z.infer<typeof siteWordsSchema>;
