import { Fragment } from "react";
import { ContentImage as Image } from "@/components/content-image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { NimbusPageContent, NimbusSectionKey, TemplateMedia, TemplateMediaItem, TemplateMediaKey } from "@shopmaple/contracts";
import {
  CategoryProducts,
  CategoryValues,
  landingCollectionHref,
} from "@/components/category-landing";
import { CategorySlideshow } from "@/components/category-controls";
import { HomeProjectForm } from "@/components/home-forms";
import nimbus from "@/data/landing-nimbus.json";
import { currentHandles } from "@/lib/retired-products";
import { artworkProducts, resolveArtwork, type ProductPhotos } from "@/lib/template-media-defaults";
import { defaultNimbusPage, resolveNimbusPageContent } from "@/lib/nimbus-content-defaults";

const section = (key: string) => nimbus.sections.find((item) => item.key === key)!;
/**
 * The promise strip's words. Its icons were Shopify files and left the store with it (owner, 11 Nov 2026); the strip
 * reads as words alone.
 */
export function MaplePromises({ items = defaultNimbusPage.promises }: { items?: NimbusPageContent["promises"] } = {}) {
  return (
    <ul className="landing-promises home-container">
      {items.map((item) => (
        <li key={item.key}>
          <span>{item.title}</span>
        </li>
      ))}
    </ul>
  );
}

/** A still in a film's place: the page's films were on Shopify, and films cannot be uploaded yet. */
function NimbusStill({ artwork, className = "" }: { artwork: TemplateMediaItem; className?: string }) {
  return (
    <div className={`landing-video landing-still ${className}`.trim()} data-nimbus-still>
      <picture>
        {artwork.mobileImage && artwork.mobileImage !== artwork.image && <source media="(max-width:749px)" srcSet={artwork.mobileImage} />}
        <img src={artwork.image} alt={artwork.alt} loading="lazy" />
      </picture>
    </div>
  );
}

/** Every placement the page draws that a Keeri product's photo can stand in for. */
const nimbusArtworkKeys: TemplateMediaKey[] = [
  "nimbus-hero-poster", "nimbus-craft-poster", "nimbus-room-bedroom", "nimbus-room-living", "nimbus-room-dining",
  "nimbus-room-collection", "nimbus-origin", "nimbus-slide-living", "nimbus-slide-bedroom", "nimbus-slide-dining", "nimbus-project",
];
/** The Keeri products whose photos the page needs where staff have uploaded none (lib/product-photos.ts). */
export function nimbusArtworkProducts(_content: NimbusPageContent | undefined, media?: TemplateMedia): string[] {
  return artworkProducts(nimbusArtworkKeys, media);
}

const roomTileHandles = {
  bedroom: "bedroom-nimbus",
  living: "living-room-nimbus",
  dining: "dining-room-nimbus",
};

/**
 * The Nimbus page. Its artwork is staff's upload where there is one, else a Keeri product's photo from `photos`
 * (nimbusArtworkProducts); a placement with neither is left out, as is a section left with nothing to show.
 */
export function NimbusLanding({ content, media, photos }: { content?: NimbusPageContent; media?: TemplateMedia; photos?: ProductPhotos } = {}) {
  const page = resolveNimbusPageContent(content);
  const origin = resolveArtwork("nimbus-origin", media, photos);
  const heroPoster = resolveArtwork("nimbus-hero-poster", media, photos);
  const craftPoster = resolveArtwork("nimbus-craft-poster", media, photos);
  const project = resolveArtwork("nimbus-project", media, photos);
  const tiles = [
    ...page.roomTiles.map(item => ({ ...item, handle: roomTileHandles[item.key], artwork: resolveArtwork(`nimbus-room-${item.key}`, media, photos, item.title) })),
    { key: "collection", title: "", handle: "nimbus", artwork: resolveArtwork("nimbus-room-collection", media, photos) },
  ].flatMap(tile => (tile.artwork ? [{ ...tile, artwork: tile.artwork }] : []));
  const slides = page.roomSlides.flatMap(item => {
    const artwork = resolveArtwork(`nimbus-slide-${item.key}`, media, photos, item.label);
    return artwork ? [{ key: item.key, alt: artwork.alt, desktop: artwork.image, mobile: artwork.mobileImage ?? artwork.image }] : [];
  });
  function renderSection(key: NimbusSectionKey) {
    switch (key) {
      case "hero":
        return heroPoster && <NimbusStill className="landing-nimbus-hero" artwork={heroPoster} />;
      case "intro":
        return (
          <header className="landing-nimbus-intro home-container">
            <h2>{page.intro.heading}</h2>
            <p>{page.intro.body}</p>
          </header>
        );
      case "rooms-grid":
        return (
          (craftPoster || tiles.length > 0) && <section className="landing-nimbus-bento" aria-label="Explore Nimbus rooms">
            {craftPoster && <NimbusStill artwork={craftPoster} />}
            <div className="landing-nimbus-tiles">
              {tiles.map(tile => (
                <Link href={landingCollectionHref(`/collections/${tile.handle}`)} key={tile.key} aria-label={tile.title || "Shop the Nimbus collection"}>
                  <picture>
                    {tile.artwork.mobileImage && <source media="(max-width:749px)" srcSet={tile.artwork.mobileImage} />}
                    <img src={tile.artwork.image} alt={tile.artwork.alt} loading="lazy" />
                  </picture>
                  {tile.title && <h3>{tile.title}</h3>}
                  <ArrowUpRight size={24} />
                </Link>
              ))}
            </div>
          </section>
        );
      case "origin":
        return (
          <>
            <section className="landing-media-content landing-nimbus-origin">
              {origin && <Image src={origin.image} alt={origin.alt} width={1200} height={1200} sizes="(max-width:749px) 100vw, 50vw" />}
              <div>
                <p className="home-eyebrow">{page.origin.eyebrow}</p>
                <h2>{page.origin.heading}</h2>
                <p>{page.origin.body}</p>
              </div>
            </section>
          </>
        );
      case "principles":
        return (
          <>
            <section className="landing-nimbus-principles">
              <h2>{page.principles.heading}</h2>
              {/* The principles' icons were Shopify files; the principles read as words alone. */}
              <CategoryValues items={page.principles.items.map(item => ({ key: item.key, title: item.title, body: item.body }))} />
            </section>
          </>
        );
      case "rooms-slideshow":
        return slides.length > 0 && <CategorySlideshow slides={slides} />;
      case "series":
        return (
          <>
            <header className="landing-series home-container">
              <p>{page.series.eyebrow}</p>
              <h2>{page.series.heading}</h2>
            </header>
            <CategoryProducts handles={currentHandles(section("product_list_fTpw38").handles)} grid />
          </>
        );
      case "project":
        return (
          <section className="landing-project home-container">
            <div className="landing-project-content">
              <h2>{page.project.heading}</h2>
              <p>{page.project.body}</p>
              <HomeProjectForm />
            </div>
            {project && <Image src={project.image} alt={project.alt} width={1000} height={1000} sizes="(max-width:749px) 100vw, 45vw" />}
          </section>
        );
      case "promises":
        return <MaplePromises items={page.promises} />;
    }
  }
  return (
    <div className="home-parity landing-parity landing-nimbus">
      <h1 className="sr-only">{page.title}</h1>
      {page.sections.filter(item => item.enabled).map(item => (
        <Fragment key={item.key}>{renderSection(item.key)}</Fragment>
      ))}
    </div>
  );
}
