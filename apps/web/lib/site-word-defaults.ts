import type { SiteWords } from "@shopmaple/contracts";

/**
 * The theme's own words for each place (lib/site-words.ts says where each sits and what staff call it). Kept apart so
 * the storefront's client code, which every page loads, carries only the words and not the Site words screen's labels.
 */
export const siteWordDefaults = {
  // Homepage
  "home.bestsellers.eyebrow": "Handpicked favourites",
  "home.bestsellers.lede": "Discover the pieces that make a room feel complete.",
  "home.bestsellers.viewAll": "View all",
  "home.chairs.eyebrow": "Handpicked favourites",
  "home.chairs.viewAll": "View all",
  "home.rails.unavailable": "This collection is temporarily unavailable.",
  "home.rails.browseAll": "Browse all furniture",
  "home.values.watermark": "Maple Furnishers",
  "home.values.cta": "Experience Maple",
  "home.project.eyebrow": "Let’s connect",
  "home.project.promise": "Quick response",
  "home.project.respondWithin": "We respond within",
  "home.projectForm.name": "Name",
  "home.projectForm.email": "Email *",
  "home.projectForm.phone": "Phone",
  "home.projectForm.message": "Tell us about your project",
  "home.projectForm.send": "Send enquiry",
  "home.newsletter.email": "Email address",
  "home.newsletter.subscribe": "Subscribe",
  "home.newsletter.thanks": "Thank you. You’re on the list.",
  "home.newsletter.failed": "We couldn’t add you to the list just now. Please try again.",
  // Footer
  "footer.imageCredits": "Image credits",
  "footer.policies": "Terms and Policies",
  // Category pages (Sofas, Tables, Chairs)
  "category.readMore": "Read More",
  "category.readLess": "Read Less",
  "category.shopBy": "Shop By",
  "category.viewAll": "View all →",
  // Contact
  "contact.form.nameLabel": "Full name",
  "contact.form.namePlaceholder": "Your full name",
  "contact.form.emailLabel": "Email address",
  "contact.form.emailPlaceholder": "you@example.com",
  "contact.form.phoneLabel": "Phone number",
  "contact.form.phonePlaceholder": "+91",
  "contact.form.topicLabel": "I need help with",
  "contact.form.topicPlaceholder": "Select a topic",
  "contact.form.orderLabel": "Order number (optional)",
  "contact.form.orderPlaceholder": "For an existing order",
  "contact.form.messageLabel": "Your message",
  "contact.form.messagePlaceholder": "Tell us about your space, product or question…",
  "contact.form.send": "Send message",
  "contact.form.about": "Your enquiry is about",
  "contact.form.pincode": "Delivery pincode:",
  // Bulk Enquiry
  "bulk.form.nameLabel": "Full name",
  "bulk.form.namePlaceholder": "Your full name",
  "bulk.form.companyLabel": "Company / studio",
  "bulk.form.companyPlaceholder": "Business name",
  "bulk.form.emailLabel": "Email address",
  "bulk.form.emailPlaceholder": "you@company.com",
  "bulk.form.phoneLabel": "Phone number",
  "bulk.form.phonePlaceholder": "+91",
  "bulk.form.typeLabel": "Project type",
  "bulk.form.typePlaceholder": "Select project type",
  "bulk.form.cityLabel": "Project city",
  "bulk.form.cityPlaceholder": "City / location",
  "bulk.form.quantityLabel": "Approximate quantity",
  "bulk.form.quantityPlaceholder": "Number of pieces",
  "bulk.form.deliveryLabel": "Target delivery",
  "bulk.form.deliveryPlaceholder": "Select timeframe",
  "bulk.form.requirementsLabel": "Your requirements",
  "bulk.form.requirementsPlaceholder": "Furniture types, dimensions, materials, budget or anything you have in mind…",
  "bulk.form.about": "About",
  "bulk.form.pincode": "Delivery pincode:",
  // Return & Exchange
  "returns.form.heading": "Find your order",
  "returns.form.orderLabel": "Order number",
  "returns.form.orderPlaceholder": "e.g. #1001",
  "returns.form.contactLabel": "Email or phone number",
  "returns.form.contactPlaceholder": "Used when placing your order",
  "returns.form.submit": "Find your order",
  "returns.form.thanks": "Thank you. Your request is with our care team.",
  "returns.form.hint": "You can find your order number in your confirmation email.",
  "returns.form.notice": "This form saves an enquiry; it does not automatically approve a return or issue a refund.",
  "returns.needHelp": "Need help?",
  "returns.guidanceHeading": "Before you raise a request",
  "returns.guidanceBody": "Report manufacturing defects or transit damage within 24–48 hours of delivery. Keep your order details and clear photos or videos ready. Claims are subject to inspection and approval by Maple Furnishers.",
  // Policies and help pages
  "help.breadcrumbHome": "Home",
  "help.breadcrumbHelp": "Help",
  "help.careHeading": "A little help, whenever you need it.",
  "policy.contentsTitle": "On this page",
  "policy.contentsMenu": "Jump to a section",
  // Blog
  "blog.readMore": "Read more",
  "blog.loadMore": "Load more",
  "blog.empty": "No articles published yet.",
  "blog.recentArticles": "Recent Articles",
  "blog.share": "Share this article",
  "blog.relatedProducts": "Related Products",
  "blog.relatedView": "View",
  "blog.collections.eyebrow": "Maple Furnishers",
  "blog.collections.heading": "Explore our collections",
  "blog.collections.lede": "Furniture designed around your space, materials and finishes.",
  "blog.collections.cta": "Shop Now",
} as const satisfies Record<string, string>;

export type SiteWordKey = keyof typeof siteWordDefaults;

/** The words a place shows: the staff's own when they wrote some, else the theme's. */
export function siteWordText(words: SiteWords | undefined, key: SiteWordKey): string {
  const own = words?.[key];
  return own !== undefined && own.trim() ? own : siteWordDefaults[key];
}
