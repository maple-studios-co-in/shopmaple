import type { SiteWords } from "@shopmaple/contracts";
import { siteWordDefaults, siteWordText, type SiteWordKey } from "@/lib/site-word-defaults";

export { siteWordText, type SiteWordKey };

/**
 * The words the storefront theme writes itself, by place: small headings, buttons, form labels and placeholders, and the
 * notes under forms. Staff change any of them from the live preview (click the words) or the Site words screen; a word
 * nobody changed keeps the theme's own (owner, 16 Nov 2026: "every page every section across the website which are not
 * coming from keeri can be edited from live preview"). Words screen readers alone hear are left out: nobody can click them.
 *
 * Adding a word: give it a key here (place.part.name), then show it with <SiteWord k="..." /> or useSiteWord("...").
 */
export const sitePlaces = ["Homepage", "Footer", "Category pages", "Contact", "Bulk Enquiry", "Return & Exchange", "Policies & help", "Blog"] as const;
export type SitePlace = (typeof sitePlaces)[number];
export type SiteWordEntry = { text: string; label: string; place: SitePlace; multiline?: boolean };

/** Where each word sits and what the Site words screen calls it; the words themselves live in lib/site-word-defaults.ts. */
const siteWordLabels = {
  // Homepage
  "home.bestsellers.eyebrow": { place: "Homepage", label: "Bestsellers: small heading" },
  "home.bestsellers.lede": { place: "Homepage", label: "Bestsellers: line under the heading" },
  "home.bestsellers.viewAll": { place: "Homepage", label: "Bestsellers: View all link (before the heading)" },
  "home.chairs.eyebrow": { place: "Homepage", label: "Chairs: small heading" },
  "home.chairs.viewAll": { place: "Homepage", label: "Chairs: View all link (before the heading)" },
  "home.rails.unavailable": { place: "Homepage", label: "Product rows: when products can't load" },
  "home.rails.browseAll": { place: "Homepage", label: "Product rows: link when products can't load" },
  "home.values.watermark": { place: "Homepage", label: "Quiet luxury: big background word" },
  "home.values.cta": { place: "Homepage", label: "Quiet luxury: button" },
  "home.project.eyebrow": { place: "Homepage", label: "Project: small heading" },
  "home.project.promise": { place: "Homepage", label: "Project: promise title" },
  "home.project.respondWithin": { place: "Homepage", label: "Project: promise words before the response time" },
  "home.projectForm.name": { place: "Homepage", label: "Project form: name box" },
  "home.projectForm.email": { place: "Homepage", label: "Project form: email box" },
  "home.projectForm.phone": { place: "Homepage", label: "Project form: phone box" },
  "home.projectForm.message": { place: "Homepage", label: "Project form: message box" },
  "home.projectForm.send": { place: "Homepage", label: "Project form: send button" },
  "home.newsletter.email": { place: "Homepage", label: "Newsletter: email box" },
  "home.newsletter.subscribe": { place: "Homepage", label: "Newsletter: button" },
  "home.newsletter.thanks": { place: "Homepage", label: "Newsletter: after signing up" },
  "home.newsletter.failed": { place: "Homepage", label: "Newsletter: when signing up fails" },

  // Footer
  "footer.imageCredits": { place: "Footer", label: "Image credits link" },
  "footer.policies": { place: "Footer", label: "Policies menu" },

  // Category pages (Sofas, Tables, Chairs)
  "category.readMore": { place: "Category pages", label: "Introduction: Read More button" },
  "category.readLess": { place: "Category pages", label: "Introduction: Read Less button" },
  "category.shopBy": { place: "Category pages", label: "Product row: small heading" },
  "category.viewAll": { place: "Category pages", label: "Product row: View all link" },

  // Contact
  "contact.form.nameLabel": { place: "Contact", label: "Form: name label" },
  "contact.form.namePlaceholder": { place: "Contact", label: "Form: name box" },
  "contact.form.emailLabel": { place: "Contact", label: "Form: email label" },
  "contact.form.emailPlaceholder": { place: "Contact", label: "Form: email box" },
  "contact.form.phoneLabel": { place: "Contact", label: "Form: phone label" },
  "contact.form.phonePlaceholder": { place: "Contact", label: "Form: phone box" },
  "contact.form.topicLabel": { place: "Contact", label: "Form: topic label" },
  "contact.form.topicPlaceholder": { place: "Contact", label: "Form: topic list, before a choice" },
  "contact.form.orderLabel": { place: "Contact", label: "Form: order number label" },
  "contact.form.orderPlaceholder": { place: "Contact", label: "Form: order number box" },
  "contact.form.messageLabel": { place: "Contact", label: "Form: message label" },
  "contact.form.messagePlaceholder": { place: "Contact", label: "Form: message box" },
  "contact.form.send": { place: "Contact", label: "Form: send button" },
  "contact.form.about": { place: "Contact", label: "Form: when opened from a product, before its name" },
  "contact.form.pincode": { place: "Contact", label: "Form: when opened from a product, before the pincode" },

  // Bulk Enquiry
  "bulk.form.nameLabel": { place: "Bulk Enquiry", label: "Form: name label" },
  "bulk.form.namePlaceholder": { place: "Bulk Enquiry", label: "Form: name box" },
  "bulk.form.companyLabel": { place: "Bulk Enquiry", label: "Form: company label" },
  "bulk.form.companyPlaceholder": { place: "Bulk Enquiry", label: "Form: company box" },
  "bulk.form.emailLabel": { place: "Bulk Enquiry", label: "Form: email label" },
  "bulk.form.emailPlaceholder": { place: "Bulk Enquiry", label: "Form: email box" },
  "bulk.form.phoneLabel": { place: "Bulk Enquiry", label: "Form: phone label" },
  "bulk.form.phonePlaceholder": { place: "Bulk Enquiry", label: "Form: phone box" },
  "bulk.form.typeLabel": { place: "Bulk Enquiry", label: "Form: project type label" },
  "bulk.form.typePlaceholder": { place: "Bulk Enquiry", label: "Form: project type list, before a choice" },
  "bulk.form.cityLabel": { place: "Bulk Enquiry", label: "Form: city label" },
  "bulk.form.cityPlaceholder": { place: "Bulk Enquiry", label: "Form: city box" },
  "bulk.form.quantityLabel": { place: "Bulk Enquiry", label: "Form: quantity label" },
  "bulk.form.quantityPlaceholder": { place: "Bulk Enquiry", label: "Form: quantity box" },
  "bulk.form.deliveryLabel": { place: "Bulk Enquiry", label: "Form: delivery label" },
  "bulk.form.deliveryPlaceholder": { place: "Bulk Enquiry", label: "Form: delivery list, before a choice" },
  "bulk.form.requirementsLabel": { place: "Bulk Enquiry", label: "Form: requirements label" },
  "bulk.form.requirementsPlaceholder": { place: "Bulk Enquiry", label: "Form: requirements box", multiline: true },
  "bulk.form.about": { place: "Bulk Enquiry", label: "Form: when opened from a product, before its name" },
  "bulk.form.pincode": { place: "Bulk Enquiry", label: "Form: when opened from a product, before the pincode" },

  // Return & Exchange
  "returns.form.heading": { place: "Return & Exchange", label: "Form: heading" },
  "returns.form.orderLabel": { place: "Return & Exchange", label: "Form: order number label" },
  "returns.form.orderPlaceholder": { place: "Return & Exchange", label: "Form: order number box" },
  "returns.form.contactLabel": { place: "Return & Exchange", label: "Form: email or phone label" },
  "returns.form.contactPlaceholder": { place: "Return & Exchange", label: "Form: email or phone box" },
  "returns.form.submit": { place: "Return & Exchange", label: "Form: button" },
  "returns.form.thanks": { place: "Return & Exchange", label: "Form: after sending" },
  "returns.form.hint": { place: "Return & Exchange", label: "Form: note under it" },
  "returns.form.notice": { place: "Return & Exchange", label: "Form: standing notice", multiline: true },
  "returns.needHelp": { place: "Return & Exchange", label: "Words before the phone number" },
  "returns.guidanceHeading": { place: "Return & Exchange", label: "Before you raise a request: heading" },
  "returns.guidanceBody": { place: "Return & Exchange", label: "Before you raise a request: text", multiline: true },

  // Policies and help pages
  "help.breadcrumbHome": { place: "Policies & help", label: "Breadcrumb: first link" },
  "help.breadcrumbHelp": { place: "Policies & help", label: "Breadcrumb: second link" },
  "help.careHeading": { place: "Policies & help", label: "Customer care: heading" },
  "policy.contentsTitle": { place: "Policies & help", label: "Contents: title" },
  "policy.contentsMenu": { place: "Policies & help", label: "Contents: menu on phones" },

  // Blog
  "blog.readMore": { place: "Blog", label: "Featured story: Read more link" },
  "blog.loadMore": { place: "Blog", label: "Story list: Load more button" },
  "blog.empty": { place: "Blog", label: "When a blog has no stories" },
  "blog.recentArticles": { place: "Blog", label: "Article: Recent Articles heading" },
  "blog.share": { place: "Blog", label: "Article: share heading" },
  "blog.relatedProducts": { place: "Blog", label: "Article: Related Products heading" },
  "blog.relatedView": { place: "Blog", label: "Article: product View button" },
  "blog.collections.eyebrow": { place: "Blog", label: "Collections block: small heading" },
  "blog.collections.heading": { place: "Blog", label: "Collections block: heading" },
  "blog.collections.lede": { place: "Blog", label: "Collections block: line under the heading" },
  "blog.collections.cta": { place: "Blog", label: "Collections block: button" },
} as const satisfies Record<SiteWordKey, Omit<SiteWordEntry, "text">>;

export const siteWordList = Object.fromEntries(
  (Object.keys(siteWordLabels) as SiteWordKey[]).map((key) => [key, { ...siteWordLabels[key], text: siteWordDefaults[key] }]),
) as { [K in SiteWordKey]: (typeof siteWordLabels)[K] & { text: string } };
export const siteWordKeys = Object.keys(siteWordList) as SiteWordKey[];
export const isSiteWordKey = (key: string): key is SiteWordKey => Object.hasOwn(siteWordList, key);

/** The saved words after one place changes: an emptied box drops the key, so the theme's own words come back. */
export function withSiteWord(words: SiteWords | undefined, key: SiteWordKey, value: string): SiteWords | undefined {
  const next: SiteWords = { ...words };
  if (!value.trim()) delete next[key];
  else next[key] = value;
  return Object.keys(next).length ? next : undefined;
}
