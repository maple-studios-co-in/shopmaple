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
export const sitePlaces = ["Homepage", "Footer", "Category pages", "Collection pages", "Product cards", "Contact", "Bulk Enquiry", "Return & Exchange", "Policies & help", "Blog"] as const;
export type SitePlace = (typeof sitePlaces)[number];
export type SiteWordEntry = { text: string; label: string; place: SitePlace; multiline?: boolean };

/** Where each word sits and what the Site words screen calls it; the words themselves live in lib/site-word-defaults.ts. */
const siteWordLabels = {
  // Homepage
  "home.hero.nimbusLabel": { place: "Homepage", label: "Hero: small heading on the Nimbus photos" },
  "home.hero.terraLabel": { place: "Homepage", label: "Hero: small heading on the Terra photos" },
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

  // Collection pages (/collections/..., owner 19 Nov 2026): the hero's own words, then the listing's
  "collection.hero.breadcrumbHome": { place: "Collection pages", label: "Top: breadcrumb, first link" },
  "collection.hero.breadcrumbAll": { place: "Collection pages", label: "Top: breadcrumb, second link" },
  "collection.hero.featured": { place: "Collection pages", label: "Top: featured product card heading" },
  "collection.hero.discover": { place: "Collection pages", label: "Top: featured product link (before the kind of piece)" },
  "collection.intro.chairs": { place: "Collection pages", label: "Top: line under the title, chair collections" },
  "collection.intro.sofas": { place: "Collection pages", label: "Top: line under the title, sofa collections" },
  "collection.intro.tables": { place: "Collection pages", label: "Top: line under the title, table collections" },
  "collection.intro.beds": { place: "Collection pages", label: "Top: line under the title, bed collections" },
  "collection.intro.storage": { place: "Collection pages", label: "Top: line under the title, storage collections" },
  "collection.intro.outdoors": { place: "Collection pages", label: "Top: line under the title, outdoor collections" },
  "collection.intro.everything": { place: "Collection pages", label: "Top: line under the title, mixed collections (All, Sale…)" },
  "collection.filters.heading": { place: "Collection pages", label: "Filters: heading (and the phone button)" },
  "collection.filters.clearAll": { place: "Collection pages", label: "Filters: Clear all link" },
  "collection.filters.availability": { place: "Collection pages", label: "Filters: availability heading" },
  "collection.filters.inStock": { place: "Collection pages", label: "Filters: in stock choice" },
  "collection.filters.madeToOrder": { place: "Collection pages", label: "Filters: made to order choice" },
  "collection.filters.price": { place: "Collection pages", label: "Filters: price heading" },
  "collection.filters.priceOnRequest": { place: "Collection pages", label: "Filters: price note when no piece has a price" },
  "collection.filters.priceUpTo": { place: "Collection pages", label: "Filters: price note, before the highest price" },
  "collection.filters.priceInCollection": { place: "Collection pages", label: "Filters: price note, after the highest price" },
  "collection.filters.anyPrice": { place: "Collection pages", label: "Filters: highest price box when no piece has a price" },
  "collection.filters.category": { place: "Collection pages", label: "Filters: category heading" },
  "collection.filters.material": { place: "Collection pages", label: "Filters: material heading" },
  "collection.filters.colour": { place: "Collection pages", label: "Filters: colour heading" },
  "collection.filters.size": { place: "Collection pages", label: "Filters: size heading" },
  "collection.filters.width": { place: "Collection pages", label: "Filters: width" },
  "collection.filters.depth": { place: "Collection pages", label: "Filters: depth" },
  "collection.filters.min": { place: "Collection pages", label: "Filters: smallest size box" },
  "collection.filters.max": { place: "Collection pages", label: "Filters: largest size box" },
  "collection.filters.apply": { place: "Collection pages", label: "Filters: button" },
  "collection.results.all": { place: "Collection pages", label: "Products: word before the collection's name" },
  "collection.results.product": { place: "Collection pages", label: "Products: count, one piece" },
  "collection.results.products": { place: "Collection pages", label: "Products: count, several pieces" },
  "collection.results.pieces": { place: "Collection pages", label: "Products: count with filters on (after “3 of 12”)" },
  "collection.results.sort": { place: "Collection pages", label: "Products: sort label" },
  "collection.sort.featured": { place: "Collection pages", label: "Sort: featured" },
  "collection.sort.title": { place: "Collection pages", label: "Sort: A to Z" },
  "collection.sort.titleDesc": { place: "Collection pages", label: "Sort: Z to A" },
  "collection.sort.priceAsc": { place: "Collection pages", label: "Sort: price low to high" },
  "collection.sort.priceDesc": { place: "Collection pages", label: "Sort: price high to low" },
  "collection.empty.filteredHeading": { place: "Collection pages", label: "No results with filters: heading" },
  "collection.empty.filteredText": { place: "Collection pages", label: "No results with filters: text" },
  "collection.empty.filteredButton": { place: "Collection pages", label: "No results with filters: button" },
  "collection.empty.heading": { place: "Collection pages", label: "Empty collection: heading" },
  "collection.empty.text": { place: "Collection pages", label: "Empty collection: text" },
  "collection.empty.button": { place: "Collection pages", label: "Empty collection: button" },
  "collection.pages.previous": { place: "Collection pages", label: "Page links: previous" },
  "collection.pages.next": { place: "Collection pages", label: "Page links: next" },
  "collection.pages.page": { place: "Collection pages", label: "Page links: word before the page number" },
  "collection.custom.heading": { place: "Collection pages", label: "Custom order: heading" },
  "collection.custom.button": { place: "Collection pages", label: "Custom order: button" },
  "collection.note": { place: "Collection pages", label: "Note under the products" },

  // Product cards, on every page that shows them
  "productCard.priceOnRequest": { place: "Product cards", label: "Price, when a piece has none" },
  "productCard.from": { place: "Product cards", label: "Word before a starting price" },
  "productCard.sale": { place: "Product cards", label: "Sale tag on the photo" },
  "productCard.freeDelivery": { place: "Product cards", label: "Free delivery line" },
  "productCard.otherOptions": { place: "Product cards", label: "Line when other options are made on request" },
  "productCard.options": { place: "Product cards", label: "Word after the number of options" },
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
