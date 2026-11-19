import type { CampaignContent } from "@shopmaple/contracts";

/**
 * How the homepage announcement strip shows a campaign's picture (owner, 19 Nov 2026). The strip was designed around a
 * photo: it drew the picture on its left half, faded into the middle, with the campaign's words written beside it. The
 * owner uploads finished banners, whose words and button are part of the picture, and the strip cut those off after the
 * left half and wrote the same words a second time on the right.
 *
 * "banner": the picture is the whole banner, shown uncropped at its own proportions, the phone banner on phones.
 * "photo": the strip's own design, the picture on the left beside the words.
 * Staff choose on the campaign's artwork; until they do, a picture from the media library is a banner and the theme's own
 * photo (the original "Always Together" strip) keeps the photo design.
 */
export type CampaignArtworkDisplay = "banner" | "photo";

/** A picture staff chose from the media library (published, or its staff-only preview), not one the theme ships. */
export const isLibraryPicture = (src: string) => src.startsWith("/media/uploads/") || src.startsWith("/api/admin/media/");

export function campaignArtworkDisplay(artwork: Pick<NonNullable<CampaignContent["artwork"]>, "desktopImage" | "display">): CampaignArtworkDisplay {
  if (artwork.display) return artwork.display;
  // A replacement whose picture is still being chosen will take a library picture.
  return artwork.desktopImage === "" || isLibraryPicture(artwork.desktopImage) ? "banner" : "photo";
}
