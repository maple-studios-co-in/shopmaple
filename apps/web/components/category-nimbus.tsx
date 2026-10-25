import { Fragment } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { NimbusPageContent, NimbusSectionKey, TemplateMedia } from "@shopmaple/contracts";
import {
  CategoryProducts,
  CategoryValues,
  landingCollectionHref,
} from "@/components/category-landing";
import { CategoryVideo, CategorySlideshow } from "@/components/category-controls";
import { HomeProjectForm } from "@/components/home-forms";
import nimbus from "@/data/landing-nimbus.json";
import { shopFile } from "@/lib/format";
import { resolveTemplateMedia } from "@/lib/template-media-defaults";
import { resolveNimbusPageContent } from "@/lib/nimbus-content-defaults";

const section = (key: string) => nimbus.sections.find((item) => item.key === key)!;
export const maplePromises = [
  { title: "Fully Customizable", image: "Custom_F.svg" },
  { title: "Delivery Across India", image: "Del_mf.svg" },
  { title: "In-House Crafted in Delhi", image: "Icon_homepage.svg" },
  { title: "36-Month Warranty", image: "Maple_Banner_5.svg" },
];
const promiseImages = {
  custom: "Custom_F.svg",
  delivery: "Del_mf.svg",
  craft: "Icon_homepage.svg",
  warranty: "Maple_Banner_5.svg",
};
export function MaplePromises({ items }: { items?: NimbusPageContent["promises"] } = {}) {
  const promises = items
    ? items.map(item => ({ key: item.key, title: item.title, image: promiseImages[item.key] }))
    : maplePromises.map(item => ({ ...item, key: item.image }));
  return (
    <ul className="landing-promises home-container">
      {promises.map((item) => (
        <li key={item.key}>
          <Image src={shopFile(item.image)} alt="" width={70} height={70} />
          <span>{item.title}</span>
        </li>
      ))}
    </ul>
  );
}

const roomTileHandles = {
  bedroom: "bedroom-nimbus",
  living: "living-room-nimbus",
  dining: "dining-room-nimbus",
};
const principleImageIndices = { comfort: 0, silhouettes: 1, luxury: 2, spaces: 3 };

export function NimbusLanding({ content, media }: { content?: NimbusPageContent; media?: TemplateMedia } = {}) {
  const page = resolveNimbusPageContent(content);
  const hero = section("hero_section_pfEKq3");
  const bento = section("blocks_6WyRMx");
  const origin = resolveTemplateMedia("nimbus-origin", media);
  const heroPoster = resolveTemplateMedia("nimbus-hero-poster", media);
  const craftPoster = resolveTemplateMedia("nimbus-craft-poster", media);
  const principles = section("section_aGJjhK");
  const project = resolveTemplateMedia("nimbus-project", media);
  const tiles = [
    ...page.roomTiles.map(item => ({ ...item, handle: roomTileHandles[item.key], artwork: resolveTemplateMedia(`nimbus-room-${item.key}`, media, item.title) })),
    { key: "collection", title: "", handle: "nimbus", artwork: resolveTemplateMedia("nimbus-room-collection", media) },
  ];
  function renderSection(key: NimbusSectionKey) {
    switch (key) {
      case "hero":
        return <CategoryVideo className="landing-nimbus-hero" desktop={{ ...hero.videos[0]!, poster: heroPoster.image }} mobile={{ ...hero.videos[1]!, poster: heroPoster.mobileImage! }} label={heroPoster.alt} />;
      case "intro":
        return (
          <header className="landing-nimbus-intro home-container">
            <h2>{page.intro.heading}</h2>
            <p>{page.intro.body}</p>
          </header>
        );
      case "rooms-grid":
        return (
          <section className="landing-nimbus-bento" aria-label="Explore Nimbus rooms">
            <CategoryVideo desktop={{ ...bento.videos[0]!, poster: craftPoster.image }} label={craftPoster.alt} />
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
            <div className="home-divider home-divider-short" />
            <section className="landing-media-content landing-nimbus-origin">
              <Image src={origin.image} alt={origin.alt} width={1200} height={1200} sizes="(max-width:749px) 100vw, 50vw" />
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
            <div className="home-divider" />
            <section className="landing-nimbus-principles">
              <h2>{page.principles.heading}</h2>
              <CategoryValues items={page.principles.items.map(item => ({
                key: item.key, title: item.title, body: item.body,
                image: principles.images[principleImageIndices[item.key]]!,
              }))} />
            </section>
          </>
        );
      case "rooms-slideshow":
        return (
          <>
            <div className="home-divider" />
            <CategorySlideshow slides={page.roomSlides.map(item => {
              const artwork = resolveTemplateMedia(`nimbus-slide-${item.key}`, media, item.label);
              return { key: item.key, alt: artwork.alt, desktop: artwork.image, mobile: artwork.mobileImage! };
            })} />
          </>
        );
      case "series":
        return (
          <>
            <header className="landing-series home-container">
              <p>{page.series.eyebrow}</p>
              <h2>{page.series.heading}</h2>
            </header>
            <CategoryProducts handles={section("product_list_fTpw38").handles} grid />
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
            <Image src={project.image} alt={project.alt} width={1000} height={1000} sizes="(max-width:749px) 100vw, 45vw" />
          </section>
        );
      case "promises":
        return <><div className="home-divider" /><MaplePromises items={page.promises} /></>;
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
