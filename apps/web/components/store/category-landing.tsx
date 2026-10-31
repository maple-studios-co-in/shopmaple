import type { ProductCard as ProductCardModel, CategoryPageSlug } from "@shopmaple/contracts";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { getProductCards } from "@/lib/catalog";
import { collectionTitles } from "@/lib/collections";
import { shopFile } from "@/lib/format";
import { resolveCategoryPage, type LandingSection } from "@/lib/category-content-defaults";
import { getPublishedContent, type StorefrontDocument } from "@/lib/content";
import sourceCatalog from "@/data/landing-catalog.json";
import { ProductImage } from "./product-image";
import { CategoryCampaign } from "./category-campaign";
import { CategoryIntro } from "./category-intro";
import { ProductCard } from "./product-card";
import { PromiseStrip } from "./promise-strip";
import { Rail } from "./rail";

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
const railId = (key: string) => `category-${key}`;
// One card per 72% of a phone, two on small tablets, three on tablets, four from 1024 px.
const railItem = "w-[72%] shrink-0 snap-start sm:w-[calc((100%-16px)/2)] md:w-[calc((100%-32px)/3)] lg:w-[calc((100%-48px)/4)]";
const cardSizes = "(max-width:639px) 72vw, (max-width:767px) 48vw, (max-width:1023px) 31vw, (min-width:1440px) 316px, 23vw";

function SectionHeader({ eyebrow, title, id, children }: { eyebrow?: string; title?: string; id?: string; children?: ReactNode }) {
  return (
    <header className="mb-6 grid justify-items-center gap-2 text-center md:mb-8">
      {eyebrow && <p data-eyebrow className="m-0 text-label font-bold tracking-[0.14em] text-espresso uppercase">{eyebrow}</p>}
      {title && <h2 id={id} className="m-0 font-serif text-[28px] leading-[1.15] font-medium text-brand italic md:text-[36px]">{title}</h2>}
      <span aria-hidden="true" className="mt-1 h-px w-12 bg-brand/40" />
      {children}
    </header>
  );
}

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
    <section id={railId(sectionKey)} data-category-rail data-category-section="rail" aria-label={label} className={`${page} scroll-mt-6 py-8 md:py-12`}>
      <SectionHeader eyebrow="Shop by" title={heading}>
        {viewAll && collection && (
          <Link data-view-all href={landingCollectionHref(`/collections/${collection}`)} className="mt-1 inline-flex items-center gap-1.5 text-ui font-bold text-brand no-underline hover:underline hover:underline-offset-[5px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
            View all <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        )}
      </SectionHeader>
      <Rail label={label} trackClassName="pb-1" controlsClassName="top-[calc((100%-96px)/2)] -translate-y-1/2">{cards}</Rail>
    </section>
  );
}

function CategoryTiles({ title, items }: { title: string; items: NonNullable<LandingSection["items"]> }) {
  return (
    <nav data-category-tiles data-category-section="categories" aria-labelledby="category-tiles-title" className={`${page} py-8 md:py-12`}>
      <SectionHeader eyebrow="Explore by category" title="Find what fits your space" id="category-tiles-title" />
      <Rail label={`${title} categories`} trackClassName="gap-3 px-1 pt-1 pb-2 md:gap-6 lg:justify-center-safe" controlsClassName="top-[52px] -translate-y-1/2 md:top-[70px] lg:top-[82px]">
        {items.map((item) => (
          <Link key={item.key} data-category-tile href={landingCollectionHref(item.href!)} className="group flex w-[108px] shrink-0 snap-start flex-col items-center gap-3 rounded-lg text-center no-underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand md:w-[148px] lg:w-[172px]">
            <span className="relative block size-[104px] overflow-hidden rounded-full border-[5px] border-white bg-cream shadow-[0_0_0_1px_#e1d9d0] md:size-[140px] lg:size-[164px]">
              <Image src={item.image} alt="" fill sizes="(max-width:767px) 104px, 164px" className="object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none" />
            </span>
            <span className="text-ui font-medium text-espresso group-hover:text-brand md:text-card">{item.title}</span>
          </Link>
        ))}
      </Rail>
    </nav>
  );
}

type Room = { section: LandingSection; target?: LandingSection };
function RoomCards({ title, rooms }: { title: string; rooms: Room[] }) {
  const columns = rooms.length >= 4 ? "md:grid-cols-2 lg:grid-cols-4" : rooms.length === 3 ? "md:grid-cols-3" : "md:grid-cols-2";
  const image = (section: LandingSection, alt: string) => (
    <Image src={shopFile(section.mobile!)} alt={alt} fill sizes="(max-width:767px) 78vw, 420px" className="object-cover transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transition-none" />
  );
  const cardClass = "group relative block aspect-square w-[78%] shrink-0 snap-start overflow-hidden rounded-xl bg-cream md:w-auto";
  return (
    <section data-category-rooms data-category-section="rooms" aria-labelledby="category-rooms-title" className={`${page} py-8 md:py-12`}>
      <SectionHeader eyebrow="Shop by room" title="Curated for every corner of your home" id="category-rooms-title" />
      <Rail label={`${title} rooms`} trackClassName={`md:grid md:overflow-visible ${columns}`} controlsClassName="top-1/2 -translate-y-1/2 md:hidden">
        {rooms.map(({ section, target }) => target ? (
          <Link key={section.key} data-room-card href={`#${railId(target.key)}`} className={`${cardClass} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand`}>
            {image(section, "")}
            <span className="sr-only">See {target.heading}</span>
            <span aria-hidden="true" className="absolute right-4 bottom-4 grid size-10 place-items-center rounded-full bg-white text-brand shadow-[0_4px_14px_rgba(41,37,31,0.18)] transition-transform group-hover:translate-x-0.5">
              <ArrowRight className="size-5" />
            </span>
          </Link>
        ) : (
          <div key={section.key} data-room-card className={cardClass}>{image(section, `${title} — find furniture for your space`)}</div>
        ))}
      </Rail>
    </section>
  );
}

function ValueCards({ items, heading }: { items: NonNullable<LandingSection["items"]>; heading?: LandingSection }) {
  return (
    <section data-category-values data-category-section="values" aria-label={heading?.heading || "Our promise"} className={`${page} py-8 md:py-12`}>
      {heading && <SectionHeader eyebrow={heading.eyebrow} title={heading.heading} />}
      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        {items.map((item) => (
          <div key={item.key} data-value-card className="flex flex-col items-center gap-2 rounded-xl bg-cream px-3 py-5 text-center md:gap-3 md:px-5 md:py-7">
            <Image src={item.image.startsWith("https:") ? item.image : shopFile(item.image)} alt="" width={56} height={56} className="size-11 md:size-14" />
            <h3 className="m-0 font-serif text-[19px] leading-[1.15] font-medium text-espresso md:text-h4">{item.title}</h3>
            {item.body && <p className="m-0 max-w-[260px] text-meta text-[#5e574f] md:text-ui">{item.body}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * A category page (sofas, tables, chairs) on the chair-category design: hero card, introduction,
 * category circles, sale banner, product rows, room pictures, promise cards. Everything comes from
 * the page's own published content; the admin's section order and visibility still apply.
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
  const introduction = <CategoryIntro key="intro" title={data.title} description={data.description} />;
  const heroVisible = sections.some((section) => section.key === "hero");

  return (
    <div data-store data-category-landing={slug} className="bg-linen pb-12 font-body text-espresso">
      {!heroVisible && introduction}
      {sections.map((section, index) => {
        if (section.type === "banner") {
          if (isCampaign(section))
            return [
              <CategoryCampaign key={section.key} campaign={`${slug}-${section.key as "hero" | "sale"}`} content={content} variant={section.key === "hero" ? "hero" : "banner"} />,
              section.key === "hero" ? introduction : null,
            ];
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
          if (neighbour(index, 1)?.type === "values") return null;
          return (
            <section key={section.key} data-category-section="heading" aria-label={section.heading} className={`${page} pt-8 md:pt-12`}>
              <SectionHeader eyebrow={section.eyebrow} title={section.heading} />
            </section>
          );
        }
        if (section.type === "values") {
          const previous = neighbour(index, -1);
          return <ValueCards key={section.key} items={section.items!} heading={previous?.type === "heading" ? previous : undefined} />;
        }
        return null;
      })}
      <div className={`${page} pt-4`}><PromiseStrip /></div>
    </div>
  );
}
