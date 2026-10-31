import { Fragment } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { NimbusPageContent, NimbusSectionKey, TemplateMedia } from "@shopmaple/contracts";
import { ContentImage } from "@/components/content-image";
import { ProductCard } from "@/components/store/product-card";
import { CategoryVideo } from "@/components/store/category-video";
import { NimbusProjectForm, NimbusSlideshow } from "@/components/store/nimbus-client";
import nimbus from "@/data/landing-nimbus.json";
import sourceCatalog from "@/data/landing-catalog.json";
import { getProductCards } from "@/lib/catalog";
import { collectionTitles } from "@/lib/collections";
import { shopFile } from "@/lib/format";
import { resolveTemplateMedia } from "@/lib/template-media-defaults";
import { resolveNimbusPageContent } from "@/lib/nimbus-content-defaults";

// The Nimbus collection page (/pages/nimbus-collection), on the current storefront look
// (paper, ink, burgundy, Newsreader and Red Hat Display) in utilities.

const section = (key: string) => nimbus.sections.find((item) => item.key === key)!;
const container = "mx-auto max-w-[1440px] px-10 max-[749px]:px-4";
const rule = "mx-auto border-t border-t-[#292d2826]";
const divider = `${rule} my-8`;
const serif = "font-[Newsreader,Georgia,serif] font-medium leading-[1.13]";

function collectionHref(path: string) {
  const handle = path.split("/").filter(Boolean).at(-1) || "all";
  return Object.hasOwn(collectionTitles, handle)
    ? `/collections/${handle}`
    : `/collections/all?q=${encodeURIComponent(handle.replaceAll("-", " "))}`;
}

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
    <ul
      data-store
      data-nimbus-region="promises"
      className={`${container} my-0 grid list-none grid-cols-[repeat(4,1fr)] gap-6 pt-0 pb-10 max-[1000px]:gap-3 max-[749px]:grid-cols-[repeat(2,1fr)] max-[749px]:gap-y-6 max-[749px]:pt-4`}
    >
      {promises.map((item) => (
        <li
          key={item.key}
          className="flex items-center gap-3 border-r border-r-[#292d2826] pr-4 last:[border:0] max-[749px]:even:[border-right:0]"
        >
          <ContentImage src={shopFile(item.image)} alt="" width={70} height={70} className="shrink-0 object-contain max-[1000px]:h-[45px] max-[1000px]:w-[45px]" />
          <span className="font-[Newsreader,Georgia,serif] text-[22px] leading-[1.15] font-bold text-brand italic max-[1000px]:text-[18px]">{item.title}</span>
        </li>
      ))}
    </ul>
  );
}

/** The Nimbus principles: icon, title and body cards on the burgundy band. */
export function NimbusValues({ items }: { items: { key?: string; title: string; body?: string; image: string }[] }) {
  return (
    <section className={`${container} grid grid-cols-4 gap-4 pt-8 pb-12 text-center max-[749px]:grid-cols-[1fr] max-[749px]:gap-8`}>
      {items.map((item) => (
        <div data-nimbus-value key={item.key ?? item.title} className="rounded-[12px] bg-[#f6f2ed] px-4 py-6">
          <Image
            src={item.image.startsWith("https:") ? item.image : shopFile(item.image)}
            alt=""
            width={100}
            height={100}
            className="h-16 w-16 object-contain"
          />
          <h3 className="mt-4 mb-2 font-[Newsreader,Georgia,serif] text-[32px] leading-[1.13] font-normal">{item.title}</h3>
          {item.body && <p className="text-[14px] leading-[1.5]">{item.body}</p>}
        </div>
      ))}
    </section>
  );
}

type SourceProduct = { handle: string; title: string; image: string; price: string; compareAt: string };
const sourceProducts: Record<string, SourceProduct> = sourceCatalog;
function SourceProductCard({ product }: { product: SourceProduct }) {
  // Keep editorial products absent from the live catalogue enquiry-only.
  const href = `/pages/contact?product=${encodeURIComponent(product.title)}`;
  return (
    <article data-product-card data-source-product className="min-w-0">
      <div data-card-image className="group relative aspect-square overflow-hidden rounded-[12px] bg-[#ebe6df] max-[749px]:rounded-[8px]">
        <a href={href} className="absolute inset-0 hover:underline hover:underline-offset-[5px]">
          <Image
            src={product.image}
            alt={product.title}
            fill
            sizes="(max-width: 749px) 48vw, 25vw"
            className="object-cover [transition:transform_0.35s_ease] group-hover:[transform:scale(1.025)]"
          />
        </a>
      </div>
      <a data-card-name href={href} className="mt-[13px] block text-[15px] leading-[1.5] font-medium hover:underline hover:underline-offset-[5px] max-[749px]:text-[12px]">
        {product.title}
      </a>
      <p data-card-price className="mt-[5px] mb-[10px] flex flex-wrap items-baseline gap-2 text-[13px] text-brand max-[749px]:gap-1 max-[749px]:text-[11px]">
        <span>Price on request</span>
      </p>
    </article>
  );
}

/** The Nimbus series grid: live catalogue cards, and enquiry-only cards for editorial pieces. */
async function NimbusSeries({ handles }: { handles: string[] }) {
  const products = new Map((await getProductCards(handles)).map((product) => [product.handle, product]));
  return (
    <section
      data-store
      data-nimbus-region="series-products"
      aria-label="Nimbus Series"
      className={`${container} pt-6 pb-14 max-[749px]:pb-10`}
    >
      <div className="grid grid-cols-4 gap-6 max-[749px]:grid-cols-2 max-[749px]:gap-4">
        {handles.map((handle) => {
          const product = products.get(handle);
          return product ? (
            <ProductCard key={handle} product={product} />
          ) : sourceProducts[handle] ? (
            <SourceProductCard key={handle} product={sourceProducts[handle]!} />
          ) : null;
        })}
      </div>
    </section>
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
        return <CategoryVideo className="h-[500px] max-[749px]:h-[650px]" desktop={{ ...hero.videos[0]!, poster: heroPoster.image }} mobile={{ ...hero.videos[1]!, poster: heroPoster.mobileImage! }} label={heroPoster.alt} />;
      case "intro":
        return (
          <header data-store data-nimbus-region="intro" className={`${container} py-12 text-center max-[749px]:py-8`}>
            <h2 className="mb-1 font-redhat text-[16px] leading-[1.4] font-bold tracking-[0.03em] text-black uppercase">{page.intro.heading}</h2>
            <p className="font-[Newsreader,serif] text-[40px] leading-[1.2] font-medium text-brand">{page.intro.body}</p>
          </header>
        );
      case "rooms-grid":
        return (
          <section
            data-store
            data-nimbus-region="rooms-grid"
            aria-label="Explore Nimbus rooms"
            className="mx-auto my-5 grid h-[500px] max-w-[1600px] grid-cols-[1fr_1fr] gap-5 px-5 max-[749px]:flex max-[749px]:h-auto max-[749px]:flex-col max-[749px]:px-3"
          >
            <CategoryVideo className="rounded-[16px] max-[749px]:h-[360px]" desktop={{ ...bento.videos[0]!, poster: craftPoster.image }} label={craftPoster.alt} />
            <div data-nimbus-tiles className="grid min-w-0 grid-cols-[1fr_1fr] gap-3">
              {tiles.map(tile => (
                <Link
                  href={collectionHref(`/collections/${tile.handle}`)}
                  key={tile.key}
                  aria-label={tile.title || "Shop the Nimbus collection"}
                  className="relative block overflow-hidden rounded-[16px] hover:underline hover:underline-offset-[5px] max-[749px]:aspect-[1.2]"
                >
                  <picture className="block h-full w-full object-cover">
                    {tile.artwork.mobileImage && <source media="(max-width:749px)" srcSet={tile.artwork.mobileImage} />}
                    <img src={tile.artwork.image} alt={tile.artwork.alt} loading="lazy" className="block h-full w-full object-cover" />
                  </picture>
                  {tile.title && <h3 className={`absolute top-[22px] left-[22px] text-[28px] text-white ${serif} max-[749px]:top-4 max-[749px]:left-[14px] max-[749px]:text-[20px]`}>{tile.title}</h3>}
                  <ArrowUpRight size={24} className="absolute top-6 right-[18px] text-white max-[749px]:top-4 max-[749px]:right-3 max-[749px]:w-[18px]" />
                </Link>
              ))}
            </div>
          </section>
        );
      case "origin":
        return (
          <>
            <div data-nimbus-region="divider-short" className={`${rule} my-4 w-[74%]`} />
            <section data-store data-nimbus-region="origin" className="grid grid-cols-[1fr_1fr] overflow-hidden rounded-[16px] bg-transparent max-[749px]:grid-cols-[1fr]">
              <ContentImage
                src={origin.image}
                alt={origin.alt}
                width={1200}
                height={1200}
                sizes="(max-width:749px) 100vw, 50vw"
                className="block h-full min-h-[450px] w-full object-cover max-[749px]:aspect-square max-[749px]:max-h-[550px] max-[749px]:min-h-0"
              />
              <div className="flex flex-col justify-center p-12 max-[1000px]:p-8 max-[749px]:px-5 max-[749px]:py-8">
                <p data-nimbus-eyebrow className="mb-[6px] font-[family-name:'Red_Hat_Display',Manrope,sans-serif] text-[16px] leading-[1.6] tracking-[0.06em] uppercase">{page.origin.eyebrow}</p>
                <h2 className={`mb-6 text-[48px] text-brand italic ${serif} max-[749px]:text-[36px]`}>{page.origin.heading}</h2>
                <p className="my-[10px] text-[16px] leading-[1.6] whitespace-pre-line">{page.origin.body}</p>
              </div>
            </section>
          </>
        );
      case "principles":
        return (
          <>
            <div data-nimbus-region="divider" className={divider} />
            <section data-store data-nimbus-region="principles" className="overflow-hidden rounded-[16px] bg-brand pt-10 text-paper">
              <h2 className={`text-center text-[32px] text-paper ${serif} max-[749px]:text-[24px]`}>{page.principles.heading}</h2>
              <NimbusValues items={page.principles.items.map(item => ({
                key: item.key, title: item.title, body: item.body,
                image: principles.images[principleImageIndices[item.key]]!,
              }))} />
            </section>
          </>
        );
      case "rooms-slideshow":
        return (
          <>
            <div data-nimbus-region="divider" className={divider} />
            <NimbusSlideshow slides={page.roomSlides.map(item => {
              const artwork = resolveTemplateMedia(`nimbus-slide-${item.key}`, media, item.label);
              return { key: item.key, alt: artwork.alt, desktop: artwork.image, mobile: artwork.mobileImage! };
            })} />
          </>
        );
      case "series":
        return (
          <>
            <header data-store data-nimbus-region="series" className={`${container} pt-10 pb-0 text-center`}>
              <p className="my-[10px] text-[16px]">{page.series.eyebrow}</p>
              <h2 className={`mt-3 text-[48px] text-brand italic ${serif} max-[749px]:text-[36px]`}>{page.series.heading}</h2>
            </header>
            <NimbusSeries handles={section("product_list_fTpw38").handles} />
          </>
        );
      case "project":
        return (
          <section data-store data-nimbus-region="project" className={`${container} grid grid-cols-[1fr_1fr] gap-8 py-8 max-[749px]:grid-cols-[1fr]`}>
            <div>
              <h2 className={`mb-4 text-[40px] text-brand ${serif} max-[749px]:text-[34px]`}>{page.project.heading}</h2>
              <p className="mt-[10px] mb-6 text-[16px]">{page.project.body}</p>
              <NimbusProjectForm />
            </div>
            <ContentImage
              src={project.image}
              alt={project.alt}
              width={1000}
              height={1000}
              sizes="(max-width:749px) 100vw, 45vw"
              className="h-full w-full object-cover max-[749px]:aspect-square"
            />
          </section>
        );
      case "promises":
        return <><div data-nimbus-region="divider" className={divider} /><MaplePromises items={page.promises} /></>;
    }
  }
  return (
    <div data-nimbus-page className="overflow-x-clip">
      <h1 data-nimbus-region="title" className="sr-only">{page.title}</h1>
      {page.sections.filter(item => item.enabled).map(item => (
        <Fragment key={item.key}>{renderSection(item.key)}</Fragment>
      ))}
    </div>
  );
}
