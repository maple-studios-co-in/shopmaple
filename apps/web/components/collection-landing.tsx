import Link from "next/link";
import { Fragment, type CSSProperties, type ReactNode } from "react";
import {
  Armchair, BedDouble, Cloud, Feather, Hammer, Hand, Layers, Leaf, Mountain, Palette, Ruler, Sofa, Table2, TreePine, Truck, Wind,
  type LucideIcon,
} from "lucide-react";
import type { CollectionSectionKey } from "@shopmaple/contracts";
import { CollectionFilm } from "@/components/collection-landing-client";
import { ContentImage as Image, getContentImageProps } from "@/components/content-image";
import type { CollectionIcon, CollectionLanding, CollectionLink, CollectionMedia } from "@/lib/collection-landing";

/**
 * The collection landing template (Figma 311:548 Nimbus, 311:921 Terra; owner, 10 Nov 2026), between the store's own
 * header and footer. It draws a resolved `CollectionLanding` (lib/collection-landing.ts): every word, link and photo comes
 * from the page; this file only lays them out. Styles: styles/collection-landing.css, scoped to `.collection`.
 */

// The design's line icons are Lucide's shapes drawn 1.3px wide at 28 and 52px; the sheet scales them with the page.
const icons: Record<CollectionIcon, LucideIcon> = {
  armchair: Armchair, "bed-double": BedDouble, cloud: Cloud, feather: Feather, hammer: Hammer, hand: Hand, layers: Layers,
  leaf: Leaf, mountain: Mountain, palette: Palette, ruler: Ruler, sofa: Sofa, "table-2": Table2, "tree-pine": TreePine,
  truck: Truck, wind: Wind,
};
function Icon({ name, size }: { name: CollectionIcon; size: 28 | 52 }) {
  const Glyph = icons[name];
  return <Glyph className={`collection-icon collection-icon-${size}`} size={size} strokeWidth={1.3} absoluteStrokeWidth aria-hidden="true" focusable="false" />;
}

/** The design writes its links' arrow after the words; screen readers hear the words alone. */
const Arrow = () => <span className="collection-arrow" aria-hidden="true">→</span>;
/** Two-digit room numbers, as the design numbers them: 01, 02, 03. */
const number = (index: number) => String(index + 1).padStart(2, "0");

/** A store path through the router; an in-page anchor or any other address as a plain link. */
function Go({ href, className, children, ...rest }: { href: string; className?: string; children: ReactNode } & Record<`data-${string}`, string>) {
  return href.startsWith("/") && !href.startsWith("//")
    ? <Link href={href} className={className} {...rest}>{children}</Link>
    : <a href={href} className={className} {...rest}>{children}</a>;
}
function Button({ link, tone = "maple" }: { link: CollectionLink; tone?: "maple" | "light" }) {
  return (
    // The site's buttons fill from the pointer (styles/button-fill.css); a light one fills with cream.
    <Go href={link.href} className={`collection-button collection-button-${tone}`} data-collection-cta="" data-fill-button={tone === "light" ? "light" : ""}>
      {link.label}<Arrow />
    </Go>
  );
}

/**
 * A photo filling its frame (the frame's shape is the sheet's): object-fit cover, never letterboxed. A slot with a phone
 * crop switches to it up to 749px wide.
 */
function Photo({ media, sizes, eager = false }: { media: CollectionMedia; sizes: string; eager?: boolean }) {
  const style: CSSProperties | undefined = media.focus ? { objectPosition: media.focus } : undefined;
  const loading = eager ? { loading: "eager" as const, fetchPriority: "high" as const } : { loading: "lazy" as const };
  if (!media.mobileSrc) return <Image src={media.src} alt={media.alt} fill sizes={sizes} style={style} {...loading} />;
  const desktop = getContentImageProps({ src: media.src, alt: media.alt, fill: true, sizes, ...loading }).props;
  const phone = getContentImageProps({ src: media.mobileSrc, alt: media.alt, fill: true, sizes: "100vw", ...loading }).props;
  return (
    <picture>
      <source media="(max-width: 749px)" srcSet={phone.srcSet ?? phone.src} sizes={phone.sizes} />
      <img src={desktop.src} srcSet={desktop.srcSet} sizes={desktop.sizes} alt={media.alt} loading={desktop.loading}
        fetchPriority={desktop.fetchPriority} decoding="async" style={style} />
    </picture>
  );
}

/** The small capitals over a heading. */
const Eyebrow = ({ children }: { children: ReactNode }) => <p className="collection-eyebrow" data-collection-eyebrow="">{children}</p>;

export function CollectionLandingView({ page }: { page: CollectionLanding }) {
  const id = (section: string) => `${page.key}-${section}`;
  const heading = (section: string) => `${page.key}-${section}-title`;
  const regions: Record<CollectionSectionKey, () => ReactNode> = {
    hero: () => (
      <section className="collection-hero" id={id("hero")} data-collection-section="hero" aria-labelledby={heading("hero")}>
        <div className="collection-hero-media">
          <Photo media={page.hero.media} sizes="100vw" eager />
        </div>
        <div className="collection-hero-copy">
          <Eyebrow>{page.hero.eyebrow}</Eyebrow>
          <h1 className="collection-hero-title" id={heading("hero")}>{page.hero.heading}</h1>
          <p className="collection-hero-body" data-collection-body="">{page.hero.body}</p>
          <Button link={page.hero.cta} tone="light" />
          {page.hero.film && <CollectionFilm film={page.hero.film} />}
        </div>
      </section>
    ),
    "room-nav": () => (
      <nav className="collection-room-nav" id={id("room-nav")} data-collection-section="room-nav" aria-label={`${page.title}: rooms`}>
        <ul>
          {page.roomNav.map((room, index) => (
            <li key={index}>
              <Go href={room.href}><span className="collection-room-number">{number(index)}</span> <span>{room.label}</span></Go>
            </li>
          ))}
        </ul>
      </nav>
    ),
    philosophy: () => (
      <section className="collection-philosophy" id={id("philosophy")} data-collection-section="philosophy" aria-labelledby={heading("philosophy")}>
        <div className="collection-statement">
          <Eyebrow>{page.philosophy.eyebrow}</Eyebrow>
          <h2 className="collection-title collection-title-statement" id={heading("philosophy")}>{page.philosophy.heading}</h2>
        </div>
        <p className="collection-story" data-collection-body="">{page.philosophy.body}</p>
      </section>
    ),
    origin: () => (
      <section className="collection-origin collection-split" id={id("origin")} data-collection-section="origin" aria-labelledby={heading("origin")}>
        <div className="collection-photo collection-origin-photo">
          <Photo media={page.origin.media} sizes="(max-width: 799px) calc(100vw - 40px), 42vw" />
        </div>
        <div className="collection-narrative collection-origin-copy">
          <Eyebrow>{page.origin.eyebrow}</Eyebrow>
          <h2 className="collection-title collection-title-origin" id={heading("origin")}>{page.origin.heading}</h2>
          <p className="collection-text" data-collection-body="">{page.origin.body}</p>
        </div>
      </section>
    ),
    rooms: () => page.rooms && (
      <section className="collection-rooms" id={id("rooms")} data-collection-section="rooms" aria-labelledby={heading("rooms")}>
        <Eyebrow>{page.rooms.eyebrow}</Eyebrow>
        <h2 className="collection-title collection-title-section" id={heading("rooms")}>{page.rooms.heading}</h2>
        <div className="collection-room-list">
          {page.rooms.items.map((room, index) => (
            <article className="collection-room" id={room.id} key={room.id} data-collection-room="" aria-labelledby={`${room.id}-title`}>
              <div className="collection-photo collection-room-photo">
                <Photo media={room.media} sizes="(max-width: 899px) calc(100vw - 40px), 53vw" />
              </div>
              <div className="collection-room-copy">
                <p className="collection-eyebrow" data-collection-eyebrow="">
                  <span>{number(index)}</span> <span aria-hidden="true">/</span> <span>{room.label}</span>
                </p>
                <h3 className="collection-title collection-title-room" id={`${room.id}-title`}>{room.heading}</h3>
                <p className="collection-text collection-room-text" data-collection-body="">{room.body}</p>
                {room.tags.length > 0 && (
                  <p className="collection-tags" data-collection-tags="">
                    {room.tags.map((tag, tagIndex) => (
                      <Fragment key={tagIndex}>{tagIndex > 0 && <span className="collection-tag-slash"> / </span>}{tag}</Fragment>
                    ))}
                  </p>
                )}
                <Button link={room.cta} />
              </div>
            </article>
          ))}
        </div>
      </section>
    ),
    feeling: () => (
      <section className="collection-feeling" id={id("feeling")} data-collection-section="feeling" aria-labelledby={heading("feeling")}>
        <Eyebrow>{page.feeling.eyebrow}</Eyebrow>
        <h2 className="collection-title collection-title-section" id={heading("feeling")}>{page.feeling.heading}</h2>
        <ul className="collection-feeling-cards">
          {page.feeling.items.map((item, index) => (
            <li className="collection-feeling-card" key={index}>
              <Icon name={item.icon} size={52} />
              <h3 className="collection-feeling-title">{item.title}</h3>
              <p className="collection-feeling-text">{item.body}</p>
            </li>
          ))}
        </ul>
      </section>
    ),
    material: () => (
      <section className="collection-material collection-split" id={id("material")} data-collection-section="material" aria-labelledby={heading("material")}>
        <div className="collection-photo collection-material-photo">
          <Photo media={page.material.media} sizes="(max-width: 799px) calc(100vw - 40px), 42vw" />
        </div>
        <div className="collection-narrative collection-material-copy">
          <Eyebrow>{page.material.eyebrow}</Eyebrow>
          <h2 className="collection-title collection-title-material" id={heading("material")}>{page.material.heading}</h2>
          <p className="collection-text" data-collection-body="">{page.material.body}</p>
          <ul className="collection-notes">
            {page.material.notes.map((note, index) => (
              <li key={index}><Icon name={note.icon} size={28} /><span>{note.label}</span></li>
            ))}
          </ul>
          <Button link={page.material.cta} />
        </div>
      </section>
    ),
    browse: () => (
      <section className="collection-browse" id={id("browse")} data-collection-section="browse" aria-labelledby={heading("browse")}>
        <Eyebrow>{page.browse.eyebrow}</Eyebrow>
        <h2 className="collection-title collection-title-browse" id={heading("browse")}>{page.browse.heading}</h2>
        <ul className="collection-browse-cards">
          {page.browse.items.map((card, index) => (
            <li className="collection-card" key={index} data-collection-card="">
              <div className="collection-photo collection-card-photo">
                {/* On a phone the frame is 4:3 and a 16:9 photo covers it at ~1.33× its width: ask for that much. */}
                <Photo media={card.media} sizes="(max-width: 699px) calc((100vw - 40px) * 1.34), 53vw" />
              </div>
              <Icon name={card.icon} size={52} />
              <h3 className="collection-card-title"><Go href={card.href} className="collection-card-link">{card.title}</Go></h3>
              <p className="collection-card-more" data-collection-link="" aria-hidden="true">{page.browse.linkLabel}</p>
            </li>
          ))}
        </ul>
      </section>
    ),
    pieces: () => (
      <section className="collection-pieces" id={id("pieces")} data-collection-section="pieces" data-mode={page.pieces.mode} aria-labelledby={heading("pieces")}>
        <Eyebrow>{page.pieces.eyebrow}</Eyebrow>
        <h2 className="collection-title collection-title-section" id={heading("pieces")}>{page.pieces.heading}</h2>
        {page.pieces.lead && <p className="collection-lead" data-collection-lead="">{page.pieces.lead}</p>}
        <ul className="collection-piece-grid">
          {page.pieces.items.map((piece, index) => (
            <li className="collection-piece" key={index} data-collection-piece="">
              <div className="collection-piece-photo">
                <Image src={piece.media.src} alt={piece.media.alt} fill loading="lazy" sizes="(max-width: 899px) calc(50vw - 28px), 22vw"
                  style={piece.media.focus ? { objectPosition: piece.media.focus } : undefined} />
              </div>
              <h3 className="collection-piece-title"><Go href={piece.href} className="collection-card-link">{piece.title}</Go></h3>
              <p className="collection-piece-line" data-collection-line="">{piece.line}</p>
              <p className="collection-piece-more" data-collection-link="" aria-hidden="true">{page.pieces.linkLabel} <span className="collection-arrow">→</span></p>
            </li>
          ))}
        </ul>
        {page.pieces.cta && <Button link={page.pieces.cta} />}
      </section>
    ),
    consultation: () => (
      <section className="collection-consultation" id={id("consultation")} data-collection-section="consultation" aria-labelledby={heading("consultation")}>
        <div className="collection-invitation">
          <Eyebrow>{page.consultation.eyebrow}</Eyebrow>
          <h2 className="collection-title collection-title-statement" id={heading("consultation")}>{page.consultation.heading}</h2>
          <p className="collection-text" data-collection-body="">{page.consultation.body}</p>
        </div>
        <div className="collection-contact">
          <Button link={page.consultation.cta} tone="light" />
          <p className="collection-note" data-collection-note="">{page.consultation.note}</p>
          <a className="collection-email" href={`mailto:${page.consultation.email}`}>{page.consultation.email}</a>
        </div>
      </section>
    ),
    promise: () => (
      <section className="collection-promise" id={id("promise")} data-collection-section="promise" aria-label="The Maple promise">
        <ul>
          {page.promise.map((item, index) => <li key={index}><Icon name={item.icon} size={28} /><span>{item.label}</span></li>)}
        </ul>
      </section>
    ),
  };
  const shown = page.sections.filter(key => key !== "rooms" || page.rooms);
  return (
    <div className="collection" data-store="" data-collection={page.key}>
      {!shown.includes("hero") && <h1 className="sr-only">{page.title}</h1>}
      {shown.map(key => <Fragment key={key}>{regions[key]()}</Fragment>)}
    </div>
  );
}
