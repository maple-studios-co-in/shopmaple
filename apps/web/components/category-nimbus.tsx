import { Fragment } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { NimbusPageContent, NimbusSectionKey } from "@shopmaple/contracts";
import {
  CategoryProducts,
  CategoryValues,
  landingCollectionHref,
} from "@/components/category-landing";
import { CategoryVideo, CategorySlideshow } from "@/components/category-controls";
import { HomeProjectForm } from "@/components/home-forms";
import nimbus from "@/data/landing-nimbus.json";
import { shopFile } from "@/lib/format";
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

const roomTileMedia = {
  bedroom: { handle: "bedroom-nimbus", image: "ChatGPT_Image_Apr_24_2026_03_29_31_AM.png" },
  living: { handle: "living-room-nimbus", image: "Untitled_design_6.svg" },
  dining: { handle: "dining-room-nimbus", image: "Chairs.svg" },
};
const principleImageIndices = { comfort: 0, silhouettes: 1, luxury: 2, spaces: 3 };
const roomImageIndices = { living: 0, bedroom: 1, dining: 2 };

export function NimbusLanding({ content }: { content?: NimbusPageContent } = {}) {
  const page = resolveNimbusPageContent(content);
  const hero = section("hero_section_pfEKq3");
  const bento = section("blocks_6WyRMx");
  const origin = section("media_with_content_JLVGCA");
  const principles = section("section_aGJjhK");
  const rooms = section("slideshow_PnGjbg");
  const project = section("section_PYMfcR");
  const tiles: { key: string; title: string; handle: string; image: string; mobile?: string }[] = [
    ...page.roomTiles.map(item => ({ ...item, ...roomTileMedia[item.key] })),
    { key: "collection", title: "", handle: "nimbus", image: "Chairs_1.png", mobile: "Chairs_3.png" },
  ];
  function renderSection(key: NimbusSectionKey) {
    switch (key) {
      case "hero":
        return <CategoryVideo className="landing-nimbus-hero" desktop={hero.videos[0]!} mobile={hero.videos[1]!} label="Nimbus collection film" />;
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
            <CategoryVideo desktop={bento.videos[0]!} label="Nimbus furniture craftsmanship" />
            <div className="landing-nimbus-tiles">
              {tiles.map(tile => (
                <Link href={landingCollectionHref(`/collections/${tile.handle}`)} key={tile.key} aria-label={tile.title || "Shop the Nimbus collection"}>
                  <picture>
                    {tile.mobile && <source media="(max-width:749px)" srcSet={shopFile(tile.mobile)} />}
                    <img src={shopFile(tile.image)} alt={tile.title || "Nimbus collection"} loading="lazy" />
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
              <Image src={origin.images[0]!} alt="Nimbus sculptural lounge furniture" width={1200} height={1200} sizes="(max-width:749px) 100vw, 50vw" />
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
            <CategorySlideshow slides={page.roomSlides.map(item => ({
              key: item.key,
              alt: item.label,
              // The source stores each mobile image before its desktop counterpart.
              desktop: rooms.images[roomImageIndices[item.key] * 2 + 1]!,
              mobile: rooms.images[roomImageIndices[item.key] * 2]!,
            }))} />
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
            <Image src={project.images[0]!} alt="Maple furniture design details" width={1000} height={1000} sizes="(max-width:749px) 100vw, 45vw" />
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
