import { contentImageSchema, templateMediaResponsiveKeys, type StorefrontContent, type TemplateMediaKey } from "@shopmaple/contracts";
import type { PreviewPicture } from "./live-preview";
import { resolveTemplateMedia } from "./template-media-defaults";

/*
 * The pictures an edit just changed, as the live preview swaps them in on the page at once (owner, 17 Nov 2026: "the
 * changes with updated photo happens there immediately in live preview as I select the image"). The draft is saved a
 * moment later and the page redraws in place; this only makes the picture appear the instant it is chosen.
 *
 * Each picture shows as the preview's save will show it (lib/draft-pictures.ts): one chosen size stands in for a missing
 * other. A picture that is not a library picture, or a replacement with no picture yet, is not swapped: the save keeps
 * the original there, and the redraw shows it.
 */

const isPicture = (value: unknown): value is string => typeof value === "string" && value !== "" && contentImageSchema.safeParse(value).success;
/**
 * A picture chosen from the media library. Only those are swapped in at once: an address typed by hand into a picture's
 * text box changes letter by letter, and each half-typed address would flash a broken picture on the page. Those, and a
 * restored original, show when the page redraws after the save.
 */
const isLibraryPicture = (value: unknown): value is string => typeof value === "string" && /^\/media\/uploads\/[a-f0-9]{64}\.webp$/.test(value);

/** Library uploads stay private until published: the page in the frame shows them through the staff preview route. */
export function framePictureUrl(src: string) {
  const upload = /^\/media\/uploads\/([a-f0-9]{64})\.webp$/.exec(src);
  return upload ? `/api/admin/media/${upload[1]}/preview` : src;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** The pictures `next` shows differently from `previous`, ready to swap in on the page; [] when none changed. */
export function pictureChanges(previous: StorefrontContent | null, next: StorefrontContent): PreviewPicture[] {
  if (!previous || previous === next) return [];
  const items: PreviewPicture[] = [];
  /**
   * One picture (and its phone picture) as it now shows; `before` is what it was. Only a change to a library picture is
   * swapped in: a picture whose address was typed or cleared, or put back to its original, waits for the redraw.
   */
  const add = (where: { slot: TemplateMediaKey } | { target: string }, now: [unknown, unknown?], before: [unknown, unknown?], alt?: string) => {
    const [desktop, mobile] = now;
    const changed = [desktop !== before[0] ? desktop : undefined, mobile !== before[1] ? mobile : undefined].filter((value) => value !== undefined);
    if (!changed.length || !changed.every(isLibraryPicture)) return;
    const wide = isPicture(desktop) ? desktop : isPicture(mobile) ? mobile : null;
    if (!wide) return;
    const narrow = isPicture(mobile) ? mobile : wide;
    items.push({
      ...where, src: framePictureUrl(wide),
      ...(narrow !== wide ? { mobileSrc: framePictureUrl(narrow) } : {}),
      ...(alt && alt.trim() ? { alt: alt.slice(0, 200) } : {}),
    } as PreviewPicture);
  };

  // Artwork placements, the logo and every icon: by placement, as the page draws them (with their originals behind).
  if (next.templateMedia !== previous.templateMedia) {
    const keys = new Set([...(previous.templateMedia ?? []), ...(next.templateMedia ?? [])].map((item) => item.key));
    for (const key of keys) {
      const before = resolveTemplateMedia(key, previous.templateMedia), after = resolveTemplateMedia(key, next.templateMedia);
      const responsive = (templateMediaResponsiveKeys as readonly string[]).includes(key);
      add({ slot: key }, [after.image, responsive ? after.mobileImage : undefined], [before.image, responsive ? before.mobileImage : undefined], after.alt);
    }
  }

  if (next.campaigns !== previous.campaigns) {
    for (const campaign of next.campaigns) {
      const art = campaign.artwork, before = previous.campaigns.find((item) => item.key === campaign.key)?.artwork ?? null;
      if (art && !same(art, before)) add({ target: `campaign:${campaign.key}` }, [art.desktopImage, art.mobileImage], [before?.desktopImage, before?.mobileImage], art.alt);
    }
  }

  if (next.homeMerchandising && next.homeMerchandising !== previous.homeMerchandising) {
    for (const group of ["categories", "offers"] as const) {
      for (const tile of next.homeMerchandising[group]) {
        const before = previous.homeMerchandising?.[group].find((item) => item.key === tile.key);
        add({ target: `merch:${group}:${tile.key}` }, [tile.image], [before?.image], tile.alt);
      }
    }
  }

  const details = next.homeDetails, old = previous.homeDetails;
  if (details && details !== old) {
    const heroPicture = (slide?: NonNullable<typeof details.hero.slides>[number]) => slide && (slide.kind === "video" ? slide.poster : slide.src);
    details.hero.slides?.forEach((slide, index) => add({ target: `hero-slide:${index}` }, [heroPicture(slide)], [heroPicture(old?.hero.slides?.[index])], slide.alt));
    details.nimbus.slides?.forEach((slide, index) => {
      const before = old?.nimbus.slides?.[index];
      add({ target: `nimbus-slide:${index}` }, [slide.image, slide.mobileImage], [before?.image, before?.mobileImage], slide.alt);
    });
    if (details.editorial) {
      add({ target: "editorial:left" }, [details.editorial.leftImage], [old?.editorial?.leftImage], details.editorial.leftAlt);
      add({ target: "editorial:right" }, [details.editorial.rightImage], [old?.editorial?.rightImage], details.editorial.rightAlt);
    }
  }

  if (next.instagramPosts !== previous.instagramPosts) {
    next.instagramPosts.forEach((post, index) => add({ target: `instagram:${index}` }, [post.src], [previous.instagramPosts[index]?.src], post.alt));
  }

  if (next.pages !== previous.pages) {
    next.pages.forEach((page, index) => {
      const banner = page.banner, before = previous.pages[index]?.banner ?? null;
      if (banner && page.slug) add({ target: `page-banner:${page.slug}` }, [banner.desktopImage, banner.mobileImage], [before?.desktopImage, before?.mobileImage], banner.alt);
    });
  }

  return items.slice(0, 40);
}
