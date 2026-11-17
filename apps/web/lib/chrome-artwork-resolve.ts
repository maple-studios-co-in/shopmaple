import type { TemplateMedia } from "@shopmaple/contracts";
import { resolveTemplateMedia } from "@/lib/template-media-defaults";
import { chromeArtworkSlots, defaultChromeArtwork, type ChromeArtwork } from "@/lib/chrome-artwork";

/** The header's and footer's pictures from a content document's Artwork placements (server side; see chrome-artwork.ts). */
export function resolveChromeArtwork(media?: TemplateMedia): ChromeArtwork {
  const picture = (name: keyof ChromeArtwork) => {
    const { image, alt } = resolveTemplateMedia(chromeArtworkSlots[name], media);
    return image ? { src: image, alt } : defaultChromeArtwork[name];
  };
  return {
    logo: picture("logo"), map: picture("map"), phone: picture("phone"), mail: picture("mail"),
    phoneLight: picture("phoneLight"), mailLight: picture("mailLight"), marketplace: picture("marketplace"),
  };
}
