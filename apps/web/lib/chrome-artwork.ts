/**
 * The header's and footer's own pictures: the logo, the footer's contact icons and its marketplace badge. Each is an
 * Artwork placement staff replace from the admin or by clicking it in the live preview (owner, 16 Nov 2026: banners,
 * icons, cards, everything). The server resolves them (chrome-artwork-resolve.ts) and hands the chrome plain addresses,
 * as it does the mega menu's pictures, so the browser never loads the placement list.
 */
export type ChromePicture = { src: string; alt: string };
export type ChromeArtwork = Record<"logo" | "map" | "phone" | "mail" | "phoneLight" | "mailLight" | "marketplace", ChromePicture>;

/** Each chrome picture's Artwork placement. */
export const chromeArtworkSlots = {
  logo: "site-logo", map: "icon-footer-map", phone: "icon-footer-phone", mail: "icon-footer-mail",
  phoneLight: "icon-footer-phone-light", mailLight: "icon-footer-mail-light", marketplace: "icon-footer-marketplace",
} as const satisfies Record<keyof ChromeArtwork, string>;

/** What the chrome showed before these became placements: also what it shows when no content gave any. */
export const defaultChromeArtwork: ChromeArtwork = {
  logo: { src: "/media/footer/maple-logo.webp", alt: "Maple Furnishers" },
  map: { src: "/media/footer/map.svg", alt: "" },
  phone: { src: "/media/footer/phone.svg", alt: "" },
  mail: { src: "/media/footer/mail.svg", alt: "" },
  phoneLight: { src: "/media/footer/phone-light.svg", alt: "" },
  mailLight: { src: "/media/footer/mail-light.svg", alt: "" },
  marketplace: { src: "/media/footer/amazon.avif", alt: "Amazon" },
};
