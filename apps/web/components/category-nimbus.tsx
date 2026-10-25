import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import {
  CategoryProducts,
  CategoryValues,
  landingCollectionHref,
} from "@/components/category-landing";
import {
  CategoryVideo,
  CategorySlideshow,
} from "@/components/category-controls";
import { HomeProjectForm } from "@/components/home-forms";
import nimbus from "@/data/landing-nimbus.json";
import { shopFile } from "@/lib/format";

const section = (key: string) =>
  nimbus.sections.find((item) => item.key === key)!;
export const maplePromises = [
  { title: "Fully Customizable", image: "Custom_F.svg" },
  { title: "Delivery Across India", image: "Del_mf.svg" },
  { title: "In-House Crafted in Delhi", image: "Icon_homepage.svg" },
  { title: "36-Month Warranty", image: "Maple_Banner_5.svg" },
];
export function MaplePromises() {
  return (
    <ul className="landing-promises home-container">
      {maplePromises.map((item) => (
        <li key={item.title}>
          <Image src={shopFile(item.image)} alt="" width={70} height={70} />
          <span>{item.title}</span>
        </li>
      ))}
    </ul>
  );
}

export function NimbusLanding() {
  const hero = section("hero_section_pfEKq3");
  const intro = section("section_E3gzag");
  const bento = section("blocks_6WyRMx");
  const origin = section("media_with_content_JLVGCA");
  const principles = section("section_aGJjhK");
  const rooms = section("slideshow_PnGjbg");
  const series = section("section_BBYid8");
  const project = section("section_PYMfcR");
  const tiles = [
    {
      title: "Bedroom",
      handle: "bedroom-nimbus",
      image: "ChatGPT_Image_Apr_24_2026_03_29_31_AM.png",
    },
    {
      title: "Living Room",
      handle: "living-room-nimbus",
      image: "Untitled_design_6.svg",
    },
    { title: "Dining Room", handle: "dining-room-nimbus", image: "Chairs.svg" },
    {
      title: "",
      handle: "nimbus",
      image: "Chairs_1.png",
      mobile: "Chairs_3.png",
    },
  ];
  return (
    <div className="home-parity landing-parity landing-nimbus">
      <h1 className="sr-only">The Nimbus Collection</h1>
      <CategoryVideo
        className="landing-nimbus-hero"
        desktop={hero.videos[0]!}
        mobile={hero.videos[1]!}
        label="Nimbus collection film"
      />
      <header className="landing-nimbus-intro home-container">
        <h2>{intro.texts[0]}</h2>
        <p>{intro.texts[1]}</p>
      </header>
      <section
        className="landing-nimbus-bento"
        aria-label="Explore Nimbus rooms"
      >
        <CategoryVideo
          desktop={bento.videos[0]!}
          label="Nimbus furniture craftsmanship"
        />
        <div className="landing-nimbus-tiles">
          {tiles.map((tile) => (
            <Link
              href={landingCollectionHref(`/collections/${tile.handle}`)}
              key={tile.handle}
              aria-label={tile.title || "Shop the Nimbus collection"}
            >
              <picture>
                {tile.mobile && (
                  <source
                    media="(max-width:749px)"
                    srcSet={shopFile(tile.mobile)}
                  />
                )}
                <img
                  src={shopFile(tile.image)}
                  alt={tile.title || "Nimbus collection"}
                  loading="lazy"
                />
              </picture>
              {tile.title && <h3>{tile.title}</h3>}
              <ArrowUpRight size={24} />
            </Link>
          ))}
        </div>
      </section>
      <div className="home-divider home-divider-short" />
      <section className="landing-media-content landing-nimbus-origin">
        <Image
          src={origin.images[0]!}
          alt="Nimbus sculptural lounge furniture"
          width={1200}
          height={1200}
          sizes="(max-width:749px) 100vw, 50vw"
        />
        <div>
          <p className="home-eyebrow">{origin.texts[0]}</p>
          <h2>{origin.texts[1]}</h2>
          <p>{origin.texts[2]?.replace("cloud.Nimbus", "cloud. Nimbus")}</p>
        </div>
      </section>
      <div className="home-divider" />
      <section className="landing-nimbus-principles">
        <h2>THE NIMBUS PRINCIPLES</h2>
        <CategoryValues
          items={principles.images.map((image, i) => ({
            image,
            title: principles.texts[i * 2]!,
            body: principles.texts[i * 2 + 1]!,
          }))}
        />
      </section>
      <div className="home-divider" />
      <CategorySlideshow
        slides={["Living room", "Bedroom", "Dining room"].map((alt, i) => ({
          alt,
          // The imported slideshow stores each mobile image before its desktop counterpart.
          desktop: rooms.images[i * 2 + 1]!,
          mobile: rooms.images[i * 2]!,
        }))}
      />
      <header className="landing-series home-container">
        <p>{series.texts[0]}</p>
        <h2>{series.texts[1]}</h2>
      </header>
      <CategoryProducts handles={section("product_list_fTpw38").handles} grid />
      <section className="landing-project home-container">
        <div className="landing-project-content">
          <h2>{project.texts[0]}</h2>
          <p>{project.texts[1]}</p>
          <HomeProjectForm />
        </div>
        <Image
          src={project.images[0]!}
          alt="Maple furniture design details"
          width={1000}
          height={1000}
          sizes="(max-width:749px) 100vw, 45vw"
        />
      </section>
      <div className="home-divider" />
      <MaplePromises />
    </div>
  );
}
