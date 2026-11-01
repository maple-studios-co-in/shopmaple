import type { ProductCard as ProductCardModel, CategoryPageSlug } from "@shopmaple/contracts";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { getProductCards } from "@/lib/catalog";
import { collectionTitles } from "@/lib/collections";
import { shopFile } from "@/lib/format";
import { resolveCategoryPage, type LandingSection } from "@/lib/category-content-defaults";
import { getPublishedContent, type StorefrontDocument } from "@/lib/content";
import sourceCatalog from "@/data/landing-catalog.json";
import { CampaignWindow } from "@/components/campaign-window";
import { ProductImage } from "./product-image";
import { CategoryCampaign, CategoryHero, resolveCampaign } from "./category-campaign";
import { CategoryIntro } from "./category-intro";
import { ProductCard } from "./product-card";
import { Rail } from "./rail";
import { SectionHeading } from "./section-heading";

type SourceProduct = { handle: string; title: string; image: string; price: string; compareAt: string };
const sourceProducts: Record<string, SourceProduct> = sourceCatalog;
type Catalogue = () => Promise<ReadonlyMap<string, ProductCardModel>>;

/** Local collections link directly; any other source path becomes a catalogue search. */
export function landingCollectionHref(path: string) {
  const handle = path.split("/").filter(Boolean).at(-1) || "all";
  return Object.hasOwn(collectionTitles, handle)
    ? `/collections/${handle}`
    : `/collections/all?q=${encodeURIComponent(handle.replaceAll("-", " "))}`;
}

const page = "mx-auto w-full max-w-[1440px] px-4 md:px-8 xl:px-16";
/** A section of the "Maple / PDF Review / Chairs" frame: 64 px around the content at 1440. */
const band = "mx-auto w-full max-w-[1440px] p-16 max-[1024px]:px-8 max-[1024px]:py-12 max-[750px]:px-5 max-[750px]:py-10";
const railId = (key: string) => `category-${key}`;
// Five 246 px cards across 1312 px as in the frame; four under 1140, three under 1024, and a
// card and a half on phones.
const railItem = "w-[calc((100%-80px)/5)] shrink-0 snap-start max-[1140px]:w-[calc((100%-60px)/4)] max-[1024px]:w-[calc((100%-40px)/3)] max-[750px]:w-[62%]";
const cardSizes = "(max-width:750px) 62vw, (max-width:1024px) 31vw, (max-width:1140px) 23vw, 246px";

/** A product from the original editorial page that the live catalogue lacks: an honest enquiry. */
function SourceProductCard({ product }: { product: SourceProduct }) {
  const href = `/pages/contact?product=${encodeURIComponent(product.title)}`;
  return (
    <article data-store data-product-card data-source-product className="flex h-full flex-col overflow-hidden rounded-lg border border-sand bg-white font-body text-espresso">
      <div data-card-image className="relative aspect-square overflow-hidden rounded-xl bg-cream [&_[role=img]]:grid [&_[role=img]]:size-full [&_[role=img]]:place-content-center [&_[role=img]]:justify-items-center [&_[role=img]]:gap-2 [&_[role=img]]:text-meta [&_[role=img]]:text-taupe">
        <Link href={href} className="absolute inset-0 focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-brand">
          <ProductImage src={product.image} alt={product.title} fill sizes={cardSizes} className="object-cover" />
        </Link>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3.5">
        <Link data-card-name href={href} className="line-clamp-2 min-h-[2.9em] text-card font-bold text-espresso no-underline hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
          {product.title}
        </Link>
        <p data-card-price className="m-0 text-price font-bold text-taupe">Price on request</p>
      </div>
    </article>
  );
}

/** A row of products under the design's centred heading, paged sideways with labelled arrows. */
export async function CategoryRail({ sectionKey, handles, heading, collection, viewAll, catalogue }: {
  sectionKey: string;
  handles: string[];
  heading?: string;
  collection?: string;
  viewAll?: boolean;
  catalogue: Catalogue;
}) {
  const products = await catalogue();
  const label = heading || "Furniture";
  const cards = handles.flatMap((handle) => {
    const product = products.get(handle);
    if (product) return [<div key={handle} className={railItem}><ProductCard product={product} imageSizes={cardSizes} className="h-full" /></div>];
    const source = sourceProducts[handle];
    return source ? [<div key={handle} className={railItem}><SourceProductCard product={source} /></div>] : [];
  });
  return (
    <section id={railId(sectionKey)} data-category-rail data-category-section="rail" aria-label={label} className={`${band} scroll-mt-6`}>
      <div className="mb-6 flex items-end justify-between gap-4">
        {heading && <SectionHeading eyebrow="Shop by" title={heading} />}
        {viewAll && collection && (
          <Link data-view-all href={landingCollectionHref(`/collections/${collection}`)} className="mb-1 inline-flex shrink-0 items-center gap-1.5 text-ui font-bold text-brand no-underline hover:underline hover:underline-offset-[5px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
            View all <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        )}
      </div>
      <Rail label={label} trackClassName="gap-5 pb-1 max-[750px]:gap-3" controlsClassName="top-[calc((100%-150px)/2)] -translate-y-1/2">{cards}</Rail>
    </section>
  );
}

function CategoryTiles({ title, items }: { title: string; items: NonNullable<LandingSection["items"]> }) {
  return (
    <nav data-category-tiles data-category-section="categories" aria-labelledby="category-tiles-title" className={band}>
      <SectionHeading eyebrow="Explore by category" title="Find what fits your space." id="category-tiles-title" className="mb-6" />
      <Rail label={`${title} categories`} trackClassName="gap-7 p-1 -m-1 max-[750px]:gap-4" controlsClassName="top-[82px] -translate-y-1/2 max-[750px]:top-[60px]">
        {items.map((item) => (
          <Link key={item.key} data-category-tile href={landingCollectionHref(item.href!)} className="group flex w-[195px] shrink-0 snap-start flex-col items-start gap-4 rounded-lg no-underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand max-[1024px]:w-[164px] max-[750px]:w-[120px] max-[750px]:gap-3">
            <span className="relative block size-[164px] overflow-hidden rounded-full bg-cream max-[750px]:size-[120px]">
              <Image src={item.image} alt="" fill sizes="(max-width:750px) 120px, 164px" className="object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none" />
            </span>
            <span className="w-[180px] text-center text-price font-bold text-espresso group-hover:text-brand max-[1024px]:w-[164px] max-[750px]:w-[120px] max-[750px]:text-ui">
              <span data-tile-label>{item.title}</span>&nbsp;&nbsp;<span aria-hidden="true">→</span>
            </span>
          </Link>
        ))}
      </Rail>
    </nav>
  );
}

type Room = { section: LandingSection; target?: LandingSection };
const roomColumns: Record<number, string> = { 1: "min-[751px]:grid-cols-1", 2: "min-[751px]:grid-cols-2", 3: "min-[751px]:grid-cols-3" };
/** "Shop by room": each picture is labelled with, and opens, the product row that followed it. */
function RoomCards({ title, rooms }: { title: string; rooms: Room[] }) {
  const image = (section: LandingSection, alt: string) => (
    <span className="relative block aspect-[313/270] overflow-hidden rounded-[12px] bg-cream">
      <Image src={shopFile(section.mobile!)} alt={alt} fill sizes="(max-width:750px) 78vw, 420px" className="object-cover transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transition-none" />
    </span>
  );
  const cardClass = "group flex w-[78%] shrink-0 snap-start flex-col gap-[14px] min-[751px]:w-auto";
  return (
    <section data-category-rooms data-category-section="rooms" aria-labelledby="category-rooms-title" className={band}>
      <SectionHeading eyebrow="Shop by room" title="Curated for every corner of your home." id="category-rooms-title" className="mb-7 max-[750px]:mb-6" />
      <Rail label={`${title} rooms`} trackClassName={`gap-5 max-[750px]:gap-3 min-[751px]:grid min-[751px]:overflow-visible ${roomColumns[rooms.length] ?? "min-[751px]:grid-cols-4"}`} controlsClassName="top-[calc((100%-44px)/2)] -translate-y-1/2 min-[751px]:hidden">
        {rooms.map(({ section, target }) => target ? (
          <Link key={section.key} data-room-card href={`#${railId(target.key)}`} className={`${cardClass} rounded-[12px] no-underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand`}>
            {image(section, "")}
            <span className="font-serif text-band font-bold text-espresso group-hover:text-brand max-[1024px]:text-h4">
              <span data-room-label>{target.heading}</span>&nbsp;&nbsp;<span aria-hidden="true">→</span>
            </span>
          </Link>
        ) : (
          <div key={section.key} data-room-card className={cardClass}>{image(section, `${title} — find furniture for your space`)}</div>
        ))}
      </Rail>
    </section>
  );
}

/** The frame's promise band ("OUR PROMISE / Every piece. Every time.") drawn from the page's own difference heading and values. */
function ValueCards({ items, heading }: { items: NonNullable<LandingSection["items"]>; heading?: LandingSection }) {
  return (
    <section data-category-values data-category-section="values" aria-label={heading?.heading || "Our promise"} className={band}>
      {heading?.heading && <SectionHeading eyebrow={heading.eyebrow || "Our promise"} title={heading.heading} className="mb-6" />}
      <ul className="m-0 grid list-none grid-cols-2 gap-x-4 gap-y-5 rounded-xl bg-cream p-5 sm:p-6 lg:grid-cols-4 lg:gap-6">
        {items.map((item) => (
          <li key={item.key} data-value-card className="flex items-start gap-3">
            <Image src={item.image.startsWith("https:") ? item.image : shopFile(item.image)} alt="" width={28} height={28} className="size-6 shrink-0 sm:size-7" />
            <span className="grid gap-1">
              <strong className="text-ui font-bold text-espresso sm:text-card">{item.title}</strong>
              {item.body && <span data-value-body className="text-label text-[#5e574f] sm:text-meta">{item.body}</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * A category page (sofas, tables, chairs) on the "Maple / PDF Review / Chairs" frame: hero card,
 * category circles, sale banner, product rows, room pictures, the promise band and the paired row.
 * Everything comes from the page's own published content; the admin's section order and
 * visibility still apply. While the hero campaign shows, its eyebrow is the page's h1 and the
 * introduction's text follows the rows; otherwise the introduction, with the h1, opens the page.
 */
export async function CategoryLanding({ slug, content: supplied }: { slug: CategoryPageSlug; content?: StorefrontDocument }) {
  const content = supplied ?? await getPublishedContent();
  const data = resolveCategoryPage(slug, content.landingPages);
  const sections = data.sections as LandingSection[];
  const handles = [...new Set(sections.filter((section) => section.type === "products").flatMap((section) => section.handles ?? []))];
  let catalogueRequest: Promise<ReadonlyMap<string, ProductCardModel>> | undefined;
  // Start only when a rail renders; the hero tree need not wait for cards.
  const catalogue = () => catalogueRequest ??= getProductCards(handles).then(
    (products) => new Map(products.map((product) => [product.handle, product])),
  );
  const isCampaign = (section: LandingSection) => section.key === "hero" || section.key === "sale";
  const isRoom = (section: LandingSection) => section.type === "banner" && !isCampaign(section);
  // Room pictures gather into one "Shop by room" row where the first of them stood; each opens
  // the product row that followed it.
  const rooms: Room[] = sections.flatMap((section, index) => {
    if (!isRoom(section)) return [];
    const next = sections[index + 1];
    return [{ section, target: next?.type === "products" ? next : undefined }];
  });
  const firstRoom = sections.find(isRoom);
  const neighbour = (index: number, step: 1 | -1) => {
    for (let i = index + step; i >= 0 && i < sections.length; i += step)
      if (sections[i]!.type !== "divider") return sections[i];
    return undefined;
  };
  const heroKey = `${slug}-hero` as const;
  const hero = sections.some((section) => section.key === "hero") ? resolveCampaign(heroKey, content) : null;
  const serverNow = Date.now();
  // The same schedule decides both places, so the h1 and the introduction show exactly once.
  const whileHero = (shown: ReactNode, otherwise: ReactNode) => !hero ? otherwise
    : hero.schedule ? <CampaignWindow schedule={hero.schedule} serverNow={serverNow} fallback={otherwise}>{shown}</CampaignWindow>
      : shown;
  const opening = <CategoryIntro title={data.title} description={data.description} />;

  return (
    <div data-store data-category-landing={slug} className="bg-linen font-body text-espresso">
      {!hero && opening}
      {sections.map((section, index) => {
        if (section.type === "banner") {
          if (section.key === "hero")
            return hero ? <Fragment key="hero">{whileHero(<CategoryHero campaign={heroKey} data={hero} title={data.title} />, opening)}</Fragment> : null;
          if (section.key === "sale")
            return <CategoryCampaign key={section.key} campaign={`${slug}-sale`} content={content} />;
          return section === firstRoom ? <RoomCards key="rooms" title={data.title} rooms={rooms} /> : null;
        }
        if (section.type === "categories")
          return <CategoryTiles key={section.key} title={data.title} items={section.items!} />;
        if (section.type === "products")
          return (
            <CategoryRail
              key={section.key}
              sectionKey={section.key}
              handles={section.handles!}
              catalogue={catalogue}
              heading={section.heading}
              collection={section.collection}
              viewAll={section.viewAll}
            />
          );
        if (section.type === "divider")
          return <div key={section.key} data-category-divider aria-hidden="true" className={page}><hr className="m-0 h-px border-0 bg-sand" /></div>;
        if (section.type === "heading") {
          if (neighbour(index, 1)?.type === "values" || !section.heading) return null;
          return (
            <section key={section.key} data-category-section="heading" aria-label={section.heading} className="mx-auto w-full max-w-[1440px] px-16 pt-16 max-[1024px]:px-8 max-[1024px]:pt-12 max-[750px]:px-5 max-[750px]:pt-10">
              <SectionHeading eyebrow={section.eyebrow || data.title} title={section.heading} />
            </section>
          );
        }
        if (section.type === "values") {
          const previous = neighbour(index, -1);
          return <ValueCards key={section.key} items={section.items!} heading={previous?.type === "heading" ? previous : undefined} />;
        }
        return null;
      })}
      {hero && whileHero(<CategoryIntro title={data.title} description={data.description} heading={false} />, null)}
    </div>
  );
}
