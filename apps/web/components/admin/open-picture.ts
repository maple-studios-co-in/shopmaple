"use client";
import type { StorefrontContent, TemplateMediaKey } from "@shopmaple/contracts";
import { rendered, selectNamed, selectOffering, setFieldValue } from "@/lib/admin-focus";
import type { HomeSectionKey } from "@/lib/section-thumbnails";

/**
 * Where a picture clicked in the live preview is changed (owner, 16 Nov 2026: banners, icons, cards, everything): a
 * homepage section's inspector, or a screen, with the campaign or page to choose there first. Artwork placements go
 * through the Artwork screen's own request; this covers what the page names by `data-picture-target`.
 */
export type PictureScreen = {
  section?: HomeSectionKey;
  tab?: "Campaigns" | "Artwork" | "Pages";
  campaign?: string;
  page?: string;
  /** A film is chosen beside the poster placement of its group on the Artwork screen. */
  filmSlot?: TemplateMediaKey;
};

/** The homepage sections that show each campaign (the section inspector edits them); the rest live on Campaigns. */
const sectionCampaigns: Record<string, HomeSectionKey> = {
  "landing-announcement": "announcement", "landing-dining-table": "dining-banner", "landing-sofa-accent-chair": "seating-banner",
  "landing-dining": "promos", "landing-storage": "promos", "landing-consoles": "promos",
};
const filmPosters: Record<string, TemplateMediaKey> = { "home-testimonial": "home-testimonial-poster", "nimbus-hero": "nimbus-hero-poster", "terra-hero": "terra-hero" };

export function pictureScreen(target: string): PictureScreen | null {
  const [kind, id = ""] = target.split(":");
  switch (kind) {
    case "campaign": return sectionCampaigns[id] ? { section: sectionCampaigns[id], campaign: id } : { tab: "Campaigns", campaign: id };
    case "merch": return { section: id === "offers" ? "offers" : "categories" };
    case "nimbus-slide": return { section: "nimbus" };
    case "hero-slide": return { section: "hero" };
    case "instagram": return { section: "instagram" };
    case "editorial": return { section: "editorial" };
    case "film": return filmPosters[id] ? { tab: "Artwork", filmSlot: filmPosters[id] } : null;
    case "page-banner": return { tab: "Pages", page: id };
    default: return null;
  }
}

/**
 * On the screen just opened, opens the chooser named `target`: chooses its campaign or page first, adds campaign artwork
 * when the campaign still shows the theme's, opens closed panels, lights the chooser up and opens its library.
 * False when no such chooser appears.
 */
export async function openPictureChooser(target: string, screen: PictureScreen, content: StorefrontContent | null): Promise<boolean> {
  const panel = await rendered(() => document.querySelector<HTMLElement>("[data-admin-panel]"), 20);
  if (!panel) return false;
  if (screen.campaign && content) {
    const index = content.campaigns.findIndex((campaign) => campaign.key === screen.campaign);
    const chooser = index >= 0 ? await rendered(() => selectNamed(document, "Campaign"), 6) : null;
    if (chooser && chooser.value !== String(index)) setFieldValue(chooser, String(index));
  }
  if (screen.page && content) {
    const index = content.pages.findIndex((page) => page.slug === screen.page);
    const chooser = index >= 0 ? await rendered(() => selectOffering(document, "Page", String(index)), 6) : null;
    if (chooser && chooser.value !== String(index)) setFieldValue(chooser, String(index));
  }
  const find = () => document.querySelector<HTMLElement>(`[data-picture-target="${target}"]`);
  let picker = await rendered(find, 15);
  if (!picker && screen.campaign) {
    // A campaign still on the theme's artwork has no choosers yet: "Replace campaign artwork" adds them.
    const add = await rendered(() => document.querySelector<HTMLElement>(`[data-picture-create="campaign:${screen.campaign}"]`), 8);
    add?.click();
    picker = await rendered(find, 15);
  }
  if (!picker) return false;
  for (let node = picker.parentElement; node; node = node.parentElement) {
    if (node.tagName === "DETAILS" && !(node as HTMLDetailsElement).open) (node as HTMLDetailsElement).open = true;
  }
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  picker.scrollIntoView?.({ behavior: reduce ? "auto" : "smooth", block: "center" });
  picker.setAttribute("data-field-flash", "true");
  window.setTimeout(() => picker!.removeAttribute("data-field-flash"), 1800);
  const choose = [...picker.querySelectorAll<HTMLButtonElement>("button")].find((button) => /^Choose (image|film)$/.test(button.textContent?.trim() ?? ""));
  if (choose && choose.getAttribute("aria-expanded") !== "true") choose.click();
  return true;
}
