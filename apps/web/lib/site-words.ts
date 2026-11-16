import type { SiteWords } from "@shopmaple/contracts";

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

export const siteWordList = {
  // Homepage
  "home.bestsellers.eyebrow": { place: "Homepage", label: "Bestsellers: small heading", text: "Handpicked favourites" },
  "home.bestsellers.lede": { place: "Homepage", label: "Bestsellers: line under the heading", text: "Discover the pieces that make a room feel complete." },
  "home.bestsellers.viewAll": { place: "Homepage", label: "Bestsellers: View all link (before the heading)", text: "View all" },
  "home.chairs.eyebrow": { place: "Homepage", label: "Chairs: small heading", text: "Handpicked favourites" },
  "home.chairs.viewAll": { place: "Homepage", label: "Chairs: View all link (before the heading)", text: "View all" },
  "home.rails.unavailable": { place: "Homepage", label: "Product rows: when products can't load", text: "This collection is temporarily unavailable." },
  "home.rails.browseAll": { place: "Homepage", label: "Product rows: link when products can't load", text: "Browse all furniture" },
  "home.values.watermark": { place: "Homepage", label: "Quiet luxury: big background word", text: "Maple Furnishers" },
  "home.values.cta": { place: "Homepage", label: "Quiet luxury: button", text: "Experience Maple" },
  "home.project.eyebrow": { place: "Homepage", label: "Project: small heading", text: "Let’s connect" },
  "home.project.promise": { place: "Homepage", label: "Project: promise title", text: "Quick response" },
  "home.project.respondWithin": { place: "Homepage", label: "Project: promise words before the response time", text: "We respond within" },
  "home.projectForm.name": { place: "Homepage", label: "Project form: name box", text: "Name" },
  "home.projectForm.email": { place: "Homepage", label: "Project form: email box", text: "Email *" },
  "home.projectForm.phone": { place: "Homepage", label: "Project form: phone box", text: "Phone" },
  "home.projectForm.message": { place: "Homepage", label: "Project form: message box", text: "Tell us about your project" },
  "home.projectForm.send": { place: "Homepage", label: "Project form: send button", text: "Send enquiry" },
  "home.newsletter.email": { place: "Homepage", label: "Newsletter: email box", text: "Email address" },
  "home.newsletter.subscribe": { place: "Homepage", label: "Newsletter: button", text: "Subscribe" },
  "home.newsletter.thanks": { place: "Homepage", label: "Newsletter: after signing up", text: "Thank you. You’re on the list." },
  "home.newsletter.failed": { place: "Homepage", label: "Newsletter: when signing up fails", text: "We couldn’t add you to the list just now. Please try again." },

  // Footer
  "footer.imageCredits": { place: "Footer", label: "Image credits link", text: "Image credits" },
  "footer.policies": { place: "Footer", label: "Policies menu", text: "Terms and Policies" },

  // Category pages (Sofas, Tables, Chairs)
  "category.readMore": { place: "Category pages", label: "Introduction: Read More button", text: "Read More" },
  "category.readLess": { place: "Category pages", label: "Introduction: Read Less button", text: "Read Less" },
  "category.shopBy": { place: "Category pages", label: "Product row: small heading", text: "Shop By" },
  "category.viewAll": { place: "Category pages", label: "Product row: View all link", text: "View all →" },

  // Contact
  "contact.form.nameLabel": { place: "Contact", label: "Form: name label", text: "Full name" },
  "contact.form.namePlaceholder": { place: "Contact", label: "Form: name box", text: "Your full name" },
  "contact.form.emailLabel": { place: "Contact", label: "Form: email label", text: "Email address" },
  "contact.form.emailPlaceholder": { place: "Contact", label: "Form: email box", text: "you@example.com" },
  "contact.form.phoneLabel": { place: "Contact", label: "Form: phone label", text: "Phone number" },
  "contact.form.phonePlaceholder": { place: "Contact", label: "Form: phone box", text: "+91" },
  "contact.form.topicLabel": { place: "Contact", label: "Form: topic label", text: "I need help with" },
  "contact.form.topicPlaceholder": { place: "Contact", label: "Form: topic list, before a choice", text: "Select a topic" },
  "contact.form.orderLabel": { place: "Contact", label: "Form: order number label", text: "Order number (optional)" },
  "contact.form.orderPlaceholder": { place: "Contact", label: "Form: order number box", text: "For an existing order" },
  "contact.form.messageLabel": { place: "Contact", label: "Form: message label", text: "Your message" },
  "contact.form.messagePlaceholder": { place: "Contact", label: "Form: message box", text: "Tell us about your space, product or question…" },
  "contact.form.send": { place: "Contact", label: "Form: send button", text: "Send message" },
  "contact.form.about": { place: "Contact", label: "Form: when opened from a product, before its name", text: "Your enquiry is about" },
  "contact.form.pincode": { place: "Contact", label: "Form: when opened from a product, before the pincode", text: "Delivery pincode:" },

  // Bulk Enquiry
  "bulk.form.nameLabel": { place: "Bulk Enquiry", label: "Form: name label", text: "Full name" },
  "bulk.form.namePlaceholder": { place: "Bulk Enquiry", label: "Form: name box", text: "Your full name" },
  "bulk.form.companyLabel": { place: "Bulk Enquiry", label: "Form: company label", text: "Company / studio" },
  "bulk.form.companyPlaceholder": { place: "Bulk Enquiry", label: "Form: company box", text: "Business name" },
  "bulk.form.emailLabel": { place: "Bulk Enquiry", label: "Form: email label", text: "Email address" },
  "bulk.form.emailPlaceholder": { place: "Bulk Enquiry", label: "Form: email box", text: "you@company.com" },
  "bulk.form.phoneLabel": { place: "Bulk Enquiry", label: "Form: phone label", text: "Phone number" },
  "bulk.form.phonePlaceholder": { place: "Bulk Enquiry", label: "Form: phone box", text: "+91" },
  "bulk.form.typeLabel": { place: "Bulk Enquiry", label: "Form: project type label", text: "Project type" },
  "bulk.form.typePlaceholder": { place: "Bulk Enquiry", label: "Form: project type list, before a choice", text: "Select project type" },
  "bulk.form.cityLabel": { place: "Bulk Enquiry", label: "Form: city label", text: "Project city" },
  "bulk.form.cityPlaceholder": { place: "Bulk Enquiry", label: "Form: city box", text: "City / location" },
  "bulk.form.quantityLabel": { place: "Bulk Enquiry", label: "Form: quantity label", text: "Approximate quantity" },
  "bulk.form.quantityPlaceholder": { place: "Bulk Enquiry", label: "Form: quantity box", text: "Number of pieces" },
  "bulk.form.deliveryLabel": { place: "Bulk Enquiry", label: "Form: delivery label", text: "Target delivery" },
  "bulk.form.deliveryPlaceholder": { place: "Bulk Enquiry", label: "Form: delivery list, before a choice", text: "Select timeframe" },
  "bulk.form.requirementsLabel": { place: "Bulk Enquiry", label: "Form: requirements label", text: "Your requirements" },
  "bulk.form.requirementsPlaceholder": { place: "Bulk Enquiry", label: "Form: requirements box", text: "Furniture types, dimensions, materials, budget or anything you have in mind…", multiline: true },
  "bulk.form.about": { place: "Bulk Enquiry", label: "Form: when opened from a product, before its name", text: "About" },
  "bulk.form.pincode": { place: "Bulk Enquiry", label: "Form: when opened from a product, before the pincode", text: "Delivery pincode:" },

  // Return & Exchange
  "returns.form.heading": { place: "Return & Exchange", label: "Form: heading", text: "Find your order" },
  "returns.form.orderLabel": { place: "Return & Exchange", label: "Form: order number label", text: "Order number" },
  "returns.form.orderPlaceholder": { place: "Return & Exchange", label: "Form: order number box", text: "e.g. #1001" },
  "returns.form.contactLabel": { place: "Return & Exchange", label: "Form: email or phone label", text: "Email or phone number" },
  "returns.form.contactPlaceholder": { place: "Return & Exchange", label: "Form: email or phone box", text: "Used when placing your order" },
  "returns.form.submit": { place: "Return & Exchange", label: "Form: button", text: "Find your order" },
  "returns.form.thanks": { place: "Return & Exchange", label: "Form: after sending", text: "Thank you. Your request is with our care team." },
  "returns.form.hint": { place: "Return & Exchange", label: "Form: note under it", text: "You can find your order number in your confirmation email." },
  "returns.form.notice": { place: "Return & Exchange", label: "Form: standing notice", text: "This form saves an enquiry; it does not automatically approve a return or issue a refund.", multiline: true },
  "returns.needHelp": { place: "Return & Exchange", label: "Words before the phone number", text: "Need help?" },
  "returns.guidanceHeading": { place: "Return & Exchange", label: "Before you raise a request: heading", text: "Before you raise a request" },
  "returns.guidanceBody": { place: "Return & Exchange", label: "Before you raise a request: text", text: "Report manufacturing defects or transit damage within 24–48 hours of delivery. Keep your order details and clear photos or videos ready. Claims are subject to inspection and approval by Maple Furnishers.", multiline: true },

  // Policies and help pages
  "help.breadcrumbHome": { place: "Policies & help", label: "Breadcrumb: first link", text: "Home" },
  "help.breadcrumbHelp": { place: "Policies & help", label: "Breadcrumb: second link", text: "Help" },
  "help.careHeading": { place: "Policies & help", label: "Customer care: heading", text: "A little help, whenever you need it." },
  "policy.contentsTitle": { place: "Policies & help", label: "Contents: title", text: "On this page" },
  "policy.contentsMenu": { place: "Policies & help", label: "Contents: menu on phones", text: "Jump to a section" },

  // Blog
  "blog.readMore": { place: "Blog", label: "Featured story: Read more link", text: "Read more" },
  "blog.loadMore": { place: "Blog", label: "Story list: Load more button", text: "Load more" },
  "blog.empty": { place: "Blog", label: "When a blog has no stories", text: "No articles published yet." },
  "blog.recentArticles": { place: "Blog", label: "Article: Recent Articles heading", text: "Recent Articles" },
  "blog.share": { place: "Blog", label: "Article: share heading", text: "Share this article" },
  "blog.relatedProducts": { place: "Blog", label: "Article: Related Products heading", text: "Related Products" },
  "blog.relatedView": { place: "Blog", label: "Article: product View button", text: "View" },
  "blog.collections.eyebrow": { place: "Blog", label: "Collections block: small heading", text: "Maple Furnishers" },
  "blog.collections.heading": { place: "Blog", label: "Collections block: heading", text: "Explore our collections" },
  "blog.collections.lede": { place: "Blog", label: "Collections block: line under the heading", text: "Furniture designed around your space, materials and finishes." },
  "blog.collections.cta": { place: "Blog", label: "Collections block: button", text: "Shop Now" },
} as const satisfies Record<string, SiteWordEntry>;

export type SiteWordKey = keyof typeof siteWordList;
export const siteWordKeys = Object.keys(siteWordList) as SiteWordKey[];
export const isSiteWordKey = (key: string): key is SiteWordKey => Object.hasOwn(siteWordList, key);

/** The words a place shows: the staff's own when they wrote some, else the theme's. */
export function siteWordText(words: SiteWords | undefined, key: SiteWordKey): string {
  const own = words?.[key];
  return own !== undefined && own.trim() ? own : siteWordList[key].text;
}

/** The saved words after one place changes: an emptied box drops the key, so the theme's own words come back. */
export function withSiteWord(words: SiteWords | undefined, key: SiteWordKey, value: string): SiteWords | undefined {
  const next: SiteWords = { ...words };
  if (!value.trim()) delete next[key];
  else next[key] = value;
  return Object.keys(next).length ? next : undefined;
}
