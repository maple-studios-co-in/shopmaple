import type { ChromeLink, SiteChrome } from "@shopmaple/contracts";
import sourceNavigation from "../data/navigation.json";
import { navigationHref } from "./navigation";
const link = (id: string, label: string, href: string): ChromeLink => ({
  id,
  label,
  href,
  enabled: true,
});
const policies = [
  link("privacy", "Privacy Policy", "/policies/privacy-policy"),
  link("terms", "Terms of Service", "/policies/terms-of-service"),
  link("shipping", "Shipping Policy", "/policies/shipping-policy"),
  link("refund", "Refund Policy", "/policies/refund-policy"),
];
const utility = [
  link("story", "Our Story", "/pages/our-story"),
  link("bulk", "Bulk Enquiry", "/pages/bulk-enquiry"),
  link("help", "Help Center", "/pages/contact"),
];
// The main menu (Figma 256:3836, 9 Nov 2026): the rooms, then Collections, Custom Furniture and Sale. The old store's
// Contact item is in the footer and the phone menu.
const sourceItems = sourceNavigation.filter((item) => item.title !== "Contact");
export const defaultSiteChrome: SiteChrome = {
  announcement: {
    text: "LUXURY FURNITURE. FACTORY PRICES.",
    href: "/collections/all",
    enabled: true,
  },
  utilityLinks: structuredClone(utility),
  navigation: [...sourceItems.map((item, index): SiteChrome["navigation"][number] => ({
    id: `nav-${index + 1}`,
    label: item.title,
    enabled: true,
    href:
      index === 0
        ? "/collections/sofas"
        : index === 1
          ? "/collections/beds"
          : item.href,
    feature: index === 0 ? "living" : index === 1 ? "bedroom" : "none",
    columns: item.columns.map((column, columnIndex) => ({
      id: `column-${columnIndex + 1}`,
      links: column.links.map((item, linkIndex) => {
        const resolved = new URL(
          navigationHref(item.href, item.title),
          "https://maple.invalid",
        );
        const subject = resolved.searchParams.get("product");
        return {
          ...link(`link-${linkIndex + 1}`, item.title, resolved.pathname),
          parent: item.parent,
          ...(subject ? { enquirySubject: subject } : {}),
        };
      }),
    })),
  })),
    { id: "nav-collections", label: "Collections", enabled: true, href: "/collections/all", feature: "none" as const, columns: [] },
    { id: "nav-custom", label: "Custom Furniture", enabled: true, href: "/pages/contact", enquirySubject: "Custom furniture", feature: "none" as const, columns: [] },
    { id: "nav-sale", label: "Sale", enabled: true, href: "/collections/sale", feature: "none" as const, columns: [] },
  ],
  // The mega menu's right-hand list: each link's `cta` is the line under its name.
  desktopDiscovery: [
    { ...link("new", "New Arrivals", "/collections/new-arrivals"), cta: "Explore what’s new and trendy." },
    { ...link("bestsellers", "Bestsellers", "/collections/bestsellers"), cta: "Loved by our customers." },
    { ...link("look", "Complete the Look", "/collections/sofas-and-chairs"), cta: "Curated combinations for your space." },
  ],
  mobileQuickLinks: [
    link("all", "All furniture", "/collections/all"),
    link("saved", "Saved furniture", "/favourites"),
    {
      ...link("custom", "Custom furniture", "/pages/contact"),
      enquirySubject: "Custom furniture",
    },
    link("account", "Account", "/account"),
  ],
  footer: {
    columns: [
      { key: "shop", enabled: true },
      { key: "help", enabled: true },
      { key: "care", enabled: true },
    ],
    contactColumns: [
      { key: "bulk", enabled: true },
      { key: "service", enabled: true },
      { key: "marketplace", enabled: true },
    ],
    shopHeading: "SHOP",
    helpHeading: "HELP",
    careHeading: "CUSTOMER CARE",
    shopLinks: [
      ...structuredClone(utility),
      link("blogs", "Blogs", "/blogs/recent-stories"),
    ],
    helpLinks: [
      ...structuredClone(policies),
      link("returns", "Return & Exchange", "/pages/returns"),
    ],
    policyLinks: structuredClone(policies),
    addressLines: [
      "A-2/56 - 57, W.H.S, Kirti Nagar,",
      "New Delhi, Delhi, 110015",
    ],
    customerPhone: "+918796130252",
    customerPhoneLabel: "+91 87961 30252",
    customerEmail: "contact@maplefurnishers.com",
    contactHeading: "Let’s Build Something Lasting",
    bulkHeading: "For Bulk Order/Collaboration:",
    serviceHeading: "For Customer Service:",
    findUsHeading: "Find Us On",
    bulkPhone: "+919262968727",
    bulkPhoneLabel: "+91 92629 68727",
    bulkEmail: "aditya@maplefurnishers.com",
    copyrightName: "Maple Furnishers",
    instagram: "https://www.instagram.com/maplefurnishers/",
    linkedin: "https://www.linkedin.com/company/maplefurnishers/",
  },
  whatsapp: {
    enabled: true,
    phone: "+918796130252",
    label: "Chat with Maple Furnishers on WhatsApp",
  },
};
export function resolveSiteChrome(value?: SiteChrome): SiteChrome {
  return structuredClone(value ?? defaultSiteChrome);
}
export function chromeHref(link: ChromeLink): string {
  return link.href === "/pages/contact" && link.enquirySubject
    ? `${link.href}?${new URLSearchParams({ product: link.enquirySubject })}`
    : link.href;
}
