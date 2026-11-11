"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Star, Truck } from "lucide-react";
import { batchNudge, categoryNames, type Product, type ProductCard, type ProductRichText as ProductRichTextValue } from "@shopmaple/contracts";
import { canAddToCart } from "@/lib/product-availability";
import { LeadTimeNote } from "./lead-time-note";
import { shopMoney } from "@/lib/format";
import { cx } from "@/lib/cx";
import { ProductImage } from "./product-image";
import { useProductHighlights } from "./product-highlights";
import { ProductVisit } from "../product-visit";
import { ProductRichText } from "./product-rich-text";
import { useShop } from "../shop-provider";
import { Modal } from "./modal";
import { assurances, cheapestPriced, discountPercent, enquiryLink, showroom, warrantyLabel } from "./product-assurances";
import { ProductBanner } from "./product-banner";
import { CompleteTheLook } from "./complete-the-look";
import { ProductBundle } from "./product-bundle";
import { CustomiseQuote } from "./customise-quote";
import { DealTab, ProductDeal, dealKey, useRunningOffer } from "./product-deal";
import { ProductEnquiry } from "./product-enquiry";
import { ProductFaq } from "./product-faq";
import { ProductFeatures, previewChars, type Feature } from "./product-features";
import { ProductPromises } from "./product-promises";
import { ProductReviews } from "./product-reviews";
import { ProductTicker } from "./product-ticker";
import { ProductGallery } from "./product-gallery";
import { ProductRealImages } from "./product-real-images";
import { VariantSelector } from "./variant-selector";
import { selectedVariant, variantGallery } from "@/lib/product-address";
import { resolveHotspots, type Cutout } from "@/lib/product-hotspots";
import { cutoutOf, productFaq, productHighlightLines, productRating, productReviews, realPhotoGroups, specLines } from "@/lib/product-page-data";
import { labelledRows, richPlain } from "@/lib/product-detail-text";

type Presentation = {
  /** White-background photos by finish address (`variant.slug`), with hotspot positions; the notes come from the product's own text. */
  cutouts?: Record<string, Cutout>;
};

// Frame 2:561's pills: burgundy "Add to cart" and the outlined second action, 50 px tall in 16 px SemiBold. Their hover
// is the fill from the pointer (data-fill-button, styles/button-fill.css), which also brings their transitions.
const pill = "inline-flex h-[50px] items-center justify-center rounded-[30px] px-6 text-[16px] leading-[1.2] font-semibold no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maple disabled:cursor-not-allowed disabled:opacity-60";
const solid = cx(pill, "cursor-pointer border-0 bg-maple text-white");
const outline = cx(pill, "cursor-pointer border-2 border-solid border-maple bg-white text-maple");
const stepper = "grid size-[25px] cursor-pointer place-items-center rounded-full border-0 bg-[rgba(86,60,73,0.04)] p-0 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-maple";
const iconLink = "inline-flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-[14px] leading-[1.6] font-medium text-black no-underline hover:text-maple focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maple";

/** A card's text: the captured rich text when it has any; null when the catalogue holds nothing for it. */
const richCard = (content: ProductRichTextValue | null | undefined): ReactNode => content?.children.length ? <ProductRichText content={content} /> : null;
const textCard = (value: string | null | undefined): ReactNode => value?.trim() ? value : null;

/**
 * `children` render between the reviews band and the FAQ: the page passes the "You may also like" row. `completeLook`
 * holds pieces from the rooms this piece is styled with, for the buy box's "Complete the look"; `bundle` holds two of
 * them in full, for "Buy in Bundle" above the related row. When staff built a Keeri bundle for this piece, the page passes
 * its pieces instead, and `bundleQuantities` (by product handle) carries the quantity Keeri set for each. `serverNow` is
 * the server's clock when it rendered the page, which the offer timer starts from.
 */
export function ProductDetail({ product, initialVariant, presentation, completeLook = [], bundle = [], bundleQuantities, serverNow, banner, children }: {
  product: Product;
  /** The banner's photo (template artwork `product-banner`), resolved by the page. */
  banner?: { image: string; alt: string };
  serverNow?: number;
  initialVariant?: string;
  presentation?: Presentation;
  completeLook?: ProductCard[];
  bundle?: Product[];
  bundleQuantities?: Record<string, number>;
  children?: ReactNode;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryVariant = searchParams ? searchParams.get("variant") ?? undefined : initialVariant;
  // An option's photo: the variant's own first photo.
  const variantImage = (id: string) => product.variants.find((v) => v.id === id)?.images?.[0];
  // A finish with a white-background photo opens on it, and it leads that finish's gallery. Keeri's photo and notes
  // come first; the hand-placed presentation cut-outs remain only for products Keeri has none for.
  const presentationCutout = (id: string): Cutout | undefined => {
    const slug = product.variants.find((v) => v.id === id)?.slug;
    return slug ? presentation?.cutouts?.[slug] : undefined;
  };
  const cutoutFor = (id: string) => cutoutOf(product, id, presentationCutout(id), (c) => resolveHotspots(c, product.sourceDetails));
  const galleryFor = (id: string) => {
    const gallery = variantGallery(product, product.variants.find((v) => v.id === id));
    const cutout = cutoutFor(id);
    return cutout ? [cutout.image, ...gallery.filter((src) => src !== cutout.image)] : gallery;
  };
  // The photo to show when a finish is chosen: its white-background photo, else its own first photo.
  const startAt = (id: string) => {
    if (cutoutFor(id)) return 0;
    const src = variantImage(id);
    return src ? Math.max(0, galleryFor(id).indexOf(src)) : undefined;
  };
  // Catalogues without any per-option photos present plain option tiles rather than a grid of
  // "Photo unavailable" boxes.
  const optionPhotos = product.variants.some((v) => v.images?.length);
  const textOptions = !optionPhotos && product.images.length > 0;
  // Staff-entered colours (the card highlights' swatches) fill the finish circles when an option has no photo.
  const highlights = useProductHighlights();
  const { swatch } = highlights;
  const optionLayout = optionPhotos || !textOptions ? "photo" : product.variants.every((v) => swatch(v.title)) ? "swatch" : "text";
  const initial =
    selectedVariant(product, queryVariant)?.id ??
    product.variants.find((v) => v.id === "preview-" + queryVariant)?.id ??
    // With nothing chosen, open on a finish the shopper can price (see cheapestPriced); with no prices, the first finish
    // with a photo, else the first.
    cheapestPriced(product.variants, variantImage)?.id ??
    product.variants.find((v) => variantImage(v.id))?.id ??
    product.variants[0]?.id ??
    "";
  const [variantId, setVariantId] = useState(initial);
  const [urlVariant, setUrlVariant] = useState(initial);
  const [image, setImage] = useState(() => startAt(initial) ?? 0),
    [quantity, setQuantityValue] = useState(1),
    [zoom, setZoom] = useState(false),
    [shared, setShared] = useState(""),
    // When the page opened, by the server's clock when the page passes it: whether an offer is running is then read the
    // same way on server and browser, so a campaign starting or ending as the page loads cannot split the two renders.
    [openedAt] = useState(() => serverNow ?? Date.now());
  if (urlVariant !== initial) {
    setUrlVariant(initial);
    // History navigation changes the option without remounting the enquiry.
    if (variantId !== initial) {
      setVariantId(initial);
      const start = startAt(initial);
      if (start !== undefined) setImage(start);
    }
  }
  const { cart, setQuantity, setCartOpen, busy, error, favourites, toggleFavourite } = useShop();
  const variant = product.variants.find((v) => v.id === variantId);
  const images = galleryFor(variantId);
  const realPhotos = realPhotoGroups(product);
  // "Customisation available" opens the quote dialog (Figma 44:479 / 46:630); without script the link leads to the enquiry
  // page. The dialog joins the page on that first click (null until then) and keeps the visitor's choices once closed.
  const [customising, setCustomising] = useState<boolean | null>(null);
  const customiseLink = useRef<HTMLAnchorElement>(null);
  const stopCustomising = () => { setCustomising(false); customiseLink.current?.focus(); };
  // A shorter gallery after switching options never points past its last photo.
  const shown = Math.min(image, Math.max(0, images.length - 1));
  const enquiry = !product.published || !canAddToCart(variant, cart.checkoutEnabled);
  const selectedQuantity = cart.items.find((x) => x.variantId === variantId)?.quantity ?? 0;
  const saved = favourites.includes(product.handle);
  const enquiryHref = enquiryLink(product, variant);
  // Every piece can be made around its buyer (owner, 4 Nov 2026), so every piece offers it: beside the options when it
  // has some, else on a line of its own. Rendered in one place only, as it carries the ref focus returns to.
  const customiseTrigger = (place?: string) => (
    <Link ref={customiseLink} data-customization href={enquiryHref} onClick={(event) => { event.preventDefault(); setCustomising(true); }} className={cx("inline-flex items-center gap-1.5 text-[12px] leading-[1.6] font-medium text-maple no-underline hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maple", place)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size design icon */}
      <img src="/product-page/customise.svg" alt="" width={12} height={12} className="size-3" />
      Customisation available
    </Link>
  );
  const discount = discountPercent(variant?.pricePaise, variant?.compareAtPaise);
  // The rating is Keeri's: the average and count of the piece's approved reviews, and nothing in their place without any.
  const rating = productRating(product);
  const nudge = batchNudge(variant?.productPage?.batch);
  const highlightLines = productHighlightLines(product);
  const isNew = highlights.product(product.handle)?.isNew;
  const isLimited = highlights.product(product.handle)?.isLimited;
  async function add() {
    if (enquiry || !variant) return false;
    return setQuantity(variantId, selectedQuantity + quantity);
  }
  async function buyNow() {
    if (await add()) router.push("/checkout");
  }
  function selectVariant(id: string) {
    setVariantId(id);
    // The option's own photo leads its gallery; a shared gallery jumps to the option's photo.
    // Without one, the shopper keeps the photo they were looking at.
    const start = startAt(id);
    if (start !== undefined) setImage(start);
    const chosen = product.variants.find((v) => v.id === id);
    const url = new URL(window.location.href);
    url.searchParams.set("variant", chosen?.slug ?? id);
    window.history.replaceState(null, "", url);
  }
  useEffect(() => {
    if (!shared) return;
    const timer = window.setTimeout(() => setShared(""), 4000);
    return () => window.clearTimeout(timer);
  }, [shared]);
  // The header stays pinned on product pages (owner, 10 Nov 2026): its height, measured, is where the page's own sticky
  // parts stop. Until this runs, styles/product-parity.css gives the header's usual heights.
  const page = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const header = document.querySelector<HTMLElement>(".site-header[data-sticky]");
    const root = page.current;
    if (!header || !root) return;
    const measure = () => root.style.setProperty("--site-header-offset", `${Math.round(header.getBoundingClientRect().height)}px`);
    measure();
    if (typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
  async function share() {
    const url = window.location.href;
    try {
      if (typeof navigator.share === "function") { await navigator.share({ title: product.title, url }); return; }
      await navigator.clipboard.writeText(url);
      setShared("Link copied");
    } catch (error) {
      // A shopper closing the share sheet is not a failure; a denied or missing clipboard is.
      setShared(error instanceof Error && error.name === "AbortError" ? "" : "Couldn’t copy the link");
    }
  }
  const photo = product.images[1] ?? product.images[0];
  const source = product.sourceDetails, captured = product.pdpContent;
  const features: Feature[] = [];
  // Captured (admin) text leads; with none, the catalogue's own text. The description stands in for About only on
  // products that were never captured, and an empty captured card stays empty rather than borrowing other copy.
  const aboutText = captured?.details?.children.length ? richPlain(captured.details) : source?.details?.trim() || (captured ? "" : product.description.trim());
  const about = richCard(captured?.details) ?? textCard(source?.details) ?? (captured ? null : textCard(product.description));
  if (about) features.push({ key: "about", title: "About Product", icon: "detail-finish", body: about, long: aboutText.length > previewChars, link: { label: "Explore finishes with Maple", href: enquiryHref } });
  // Materials and care: one captured card when the admin captured them together, else the catalogue's two.
  const capturedCare = richCard(captured?.materialsCare);
  const materials = source?.materials?.trim();
  const materialRows = labelledRows(materials);
  if (capturedCare) features.push({ key: "materials", title: "Material & Care", icon: "detail-material", body: capturedCare, long: richPlain(captured?.materialsCare).length > previewChars, link: { label: "Explore materials with Maple", href: enquiryHref } });
  else if (materials) features.push({ key: "materials", title: "Materials", icon: "detail-material", ...(materialRows ? { rows: materialRows, long: materialRows.length > 3 } : { body: materials, long: materials.length > previewChars }), link: { label: "Explore materials with Maple", href: enquiryHref } });
  const dimensions = source?.dimensions?.trim();
  // Keeri's measured sizes lead; the free-text dimensions remain for products nobody has measured.
  const measured = specLines(product, variant).map((line): [string, string] => [line.slice(0, line.indexOf(": ")), line.slice(line.indexOf(": ") + 2)]);
  const dimensionRows = measured.length ? measured : labelledRows(dimensions);
  const ownWarranty = source?.warranty?.trim();
  // No item code: the owner asked for it off the page (2 Nov 2026); enquiries still carry the SKU.
  // Specifications open as a popup of chips, one per measurement (owner, 10 Nov 2026).
  if (dimensions || measured.length) features.push({ key: "specification", title: "Specifications", icon: "detail-spec", body: dimensionRows ? undefined : dimensions, chips: true,
    rows: [...(dimensionRows ?? []), ...(ownWarranty ? [["Warranty", ownWarranty] as [string, string]] : [])] });
  const care = capturedCare ? undefined : source?.careInstructions?.trim();
  if (care) features.push({ key: "care", title: "Material Care", icon: "detail-care", body: care, long: care.length > previewChars });
  const shipping = richCard(captured?.shippingReturns);
  if (shipping) features.push({ key: "shipping", title: "Shipping & Returns", icon: "feature-about", body: shipping, long: richPlain(captured?.shippingReturns).length > previewChars });
  // Every product shows the full set of cards (owner, 3 Nov 2026). Where the catalogue has no text for one, the card says
  // what holds for every Maple piece (finishes chosen with Maple, measurements given on request, the store's delivery,
  // cover and warranty); it never invents a specification.
  const storeWarranty = ownWarranty || "36 months";
  if (!features.some((feature) => feature.key === "specification"))
    features.push({ key: "specification", title: "Specifications", icon: "detail-spec", chips: true, rows: [
      ...(variant?.stockPolicy === "made_to_order" ? [["Made", "To order, in our Delhi workshop"] as [string, string]] : []),
      ["Measurements", "Shared on request"], ["Warranty", storeWarranty]], link: { label: "Ask Maple for exact dimensions", href: enquiryHref } });
  if (!features.some((feature) => feature.key === "materials"))
    features.push({ key: "materials", title: "Material & Care", icon: "detail-material", link: { label: "Explore materials with Maple", href: enquiryHref },
      body: "Choose the fabric, finish and colour with Maple. Dust with a soft, dry cloth, blot spills at once, and keep it out of direct sun and away from heat." });
  if (features.length < 4)
    features.push({ key: "delivery", title: "Delivery & Warranty", icon: "feature-about", rows: [["Delivery", "Across India"], ["Covered", "Defects and transit damage"], ["Warranty", storeWarranty]] });
  // Keeri's highlights have no position: they stand on the finish's white-background photo, the piece whole in the middle.
  const highlightPhoto = highlightLines.length ? cutoutFor(variantId)?.image : undefined;
  const warranty = warrantyLabel(product);
  const category = product.category ? categoryNames[product.category] : undefined;
  const deal = useRunningOffer(product.offer, openedAt);
  return (
    // 30px between the sections (owner, 9 Nov 2026).
    <div ref={page} data-store data-product-page className="flex flex-col gap-[30px] bg-white font-text text-black">
      <ProductVisit handle={product.handle} />
      <section aria-label={product.title} className="grid gap-8 px-4 pt-6 md:px-12 md:pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(clamp(400px,40vw,455px),32%)] lg:gap-[clamp(24px,2.4vw,35px)]">
        {/* What sits under the gallery (View real images, 40px and a 16px gap) comes off its height, so the column still fits the window.
            It stops 24px under the pinned header (owner, 10 Nov 2026). */}
        <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-[calc(var(--site-header-offset,0px)+24px)] lg:self-start" style={realPhotos.length ? { ["--gallery-below" as string]: "56px" } : undefined}>
          <ProductGallery images={images} title={product.title} selected={shown} onSelect={setImage}
            cutoutImage={cutoutFor(variantId)?.image}
            onZoom={() => setZoom(true)} saved={saved} onSave={() => toggleFavourite(product.handle)} />
          <ProductRealImages groups={realPhotos} variantId={variantId} title={product.title} />
        </div>
        <div data-product-info className="flex min-w-0 flex-col gap-5 rounded-[20px] border border-solid border-maple/8 bg-white p-5 sm:p-[22px]">
          {(category || isNew || isLimited) && (
            <div className="flex flex-wrap items-center gap-2">
              {/* Frame 2:435's vendor chip; every piece is Maple's own, so the chip names its collection instead. */}
              {category && <Link data-chip="category" href={`/collections/${product.category}`} className="inline-flex h-[27px] items-center rounded-[5px] bg-maple/12 px-2.5 text-[12px] leading-[1.6] font-semibold text-maple no-underline hover:bg-maple/16 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maple">{category}</Link>}
              {isNew && <span data-chip="new" className="inline-flex h-[23px] items-center rounded-[4px] bg-[#803cee] px-2 text-[12px] leading-[1.6] font-medium text-white">New</span>}
              {isLimited && <span data-chip="limited" className="inline-flex h-[23px] items-center rounded-[4px] bg-[#b07a1f] px-2 text-[12px] leading-[1.6] font-medium text-white">Limited</span>}
            </div>
          )}
          <h1 className="m-0 text-[28px] leading-[1.2] font-medium text-[#1c1c1c] sm:text-[34px]">{product.title}</h1>
          {variant && !variantImage(variant.id) && !cutoutFor(variant.id) && !textOptions && (product.variants.length > 1 || product.images.length === 0) && (
            <p role="status" className="-mt-2 text-meta text-taupe">Photo for this option unavailable</p>
          )}
          <div data-price-block className="grid gap-2">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <strong data-price className="font-heading text-[20px] leading-[1.2] font-medium text-maple">{shopMoney(variant?.pricePaise ?? null)}</strong>
              {discount >= 1 && <span data-discount className="inline-flex h-[27px] items-center rounded-[5px] bg-[rgba(66,132,69,0.1)] px-2 text-[12px] leading-[1.6] font-medium text-[#2f6b32]">{discount}%OFF</span>}
            </div>
            <div className="flex items-center justify-between gap-3">
              {discount >= 1 ? <p data-was className="m-0 text-[16px] font-medium text-black"><span className="sr-only">Was </span><del>{shopMoney(variant!.compareAtPaise!)}</del></p> : <span />}
              {rating ? <p data-rating className="m-0 inline-flex items-center gap-1 text-[14px] leading-[1.6] text-black">{rating.value.toFixed(1)}
                {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size design star */}
                <img src="/product-page/star.svg" alt="" width={15} height={15} className="size-[15px]" />
              </p> : (
                // No reviews yet: said in the rating's place, ending on an empty star, and leading to the reviews band.
                <a data-rating data-rating-empty href="#product-reviews" className="inline-flex items-center gap-1 text-[14px] leading-[1.6] text-[#5e574f] no-underline hover:text-maple">
                  No reviews yet
                  <Star aria-hidden="true" strokeWidth={1.75} className="size-[15px] text-[#FFB74A]" />
                </a>
              )}
            </div>
          </div>
          {product.description && <p data-description className="m-0 text-[14px] leading-[1.6] text-[#1c1c1c]">{product.description}</p>}
          {highlightLines.length > 0 && (
            <ul data-highlights className="m-0 -mt-2 grid list-none gap-1 p-0 text-[14px] leading-[1.6] text-[#1c1c1c]">
              {highlightLines.map((line) => <li key={line} className="flex gap-2"><span aria-hidden="true" className="text-maple">✓</span>{line}</li>)}
            </ul>
          )}
          {deal && <ProductDeal key={dealKey(deal)} deal={deal} openedAt={openedAt} />}
          {product.variants.length > 1 && (
            <div className="relative mt-2">
              <VariantSelector layout={optionLayout} selectedId={variantId} onSelect={selectVariant}
                variants={product.variants.map((v) => ({
                  id: v.id, name: v.title, slug: v.slug ?? undefined, image: variantImage(v.id), swatch: swatch(v.title),
                }))} />
              {customiseTrigger("absolute top-0 right-0")}
            </div>
          )}
          {product.variants.length < 2 && <div data-customization-row className="flex">{customiseTrigger()}</div>}
          <div className="mt-3 grid gap-3">
            <div data-purchase className="flex gap-[11px]">
              {!enquiry && (
                <div className="flex h-[50px] w-[128px] shrink-0 items-center justify-between rounded-[30px] border border-solid border-maple/8 bg-white px-[7px] text-[14px] text-maple">
                  <button type="button" aria-label="Decrease quantity" disabled={quantity <= 1 || busy} onClick={() => setQuantityValue((q) => q - 1)} className={stepper}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size design icon */}
                    <img src="/product-page/minus.svg" alt="" width={12} height={12} className="size-3" />
                  </button>
                  <output aria-live="polite" aria-label="Quantity" className="min-w-6 text-center tabular-nums">{quantity}</output>
                  <button type="button" aria-label="Increase quantity" disabled={quantity >= 20 || busy} onClick={() => setQuantityValue((q) => q + 1)} className={stepper}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size design icon */}
                    <img src="/product-page/plus.svg" alt="" width={12} height={12} className="size-3" />
                  </button>
                </div>
              )}
              {enquiry ? (
                <Link data-primary data-fill-button="" className={cx(solid, "flex-1")} href={enquiryHref}>Enquire about this piece</Link>
              ) : (
                <button type="button" data-primary data-fill-button="" className={cx(solid, "flex-1")} disabled={busy || selectedQuantity + quantity > 20} onClick={() => void add().then((added) => { if (added) setCartOpen(true); })}>
                  {busy ? "Updating cart…" : "Add to cart"}
                </button>
              )}
            </div>
            {!enquiry && cart.checkoutEnabled ? (
              <button type="button" data-buy-now data-fill-button="outline" className={cx(outline, "w-full")} disabled={busy || selectedQuantity + quantity > 20} onClick={() => void buyNow()}>Buy it now</button>
            ) : enquiry ? (
              <Link data-designer data-fill-button="outline" href={enquiryHref} className={cx(outline, "w-full")}>Speak to a designer</Link>
            ) : (
              <Link data-enquire data-fill-button="outline" href={enquiryHref} className={cx(outline, "w-full")}>Enquire about this piece</Link>
            )}
            <LeadTimeNote variant={variant} className="m-0 text-[12px] leading-[1.5] text-[#5e574f]" />
            {selectedQuantity + quantity > 20 && <p className="m-0 text-meta text-maple">You can add up to 20 of this item. Contact our team for larger orders.</p>}
            {error && <p role="alert" className="m-0 text-meta text-maple">{error}</p>}
          </div>
          {nudge !== null ? (
            // A staff-set production batch counted down by store orders, shown only at or below its threshold.
            <div data-batch className="relative mt-[7px] rounded-[10px] border border-solid border-maple/8 px-4 pt-[18px] pb-3.5">
              <p className="absolute -top-[7px] left-4 m-0 bg-white px-4 text-[14px] leading-[14px] font-medium text-[#2f6b32]">Only {nudge} left in this batch</p>
              {" "}
              <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-[#2f6b32]/12">
                <div className="h-full rounded-full bg-[#2f6b32]" style={{ width: `${Math.max(8, Math.min(100, (nudge / (variant?.productPage?.batch?.showAtOrBelow ?? nudge)) * 100))}%` }} />
              </div>
            </div>
          ) : variant?.stockPolicy === "made_to_order" && (
            // Frame 2:580's stock line, saying what the catalogue knows: the piece is made to order. No count is shown.
            <div data-availability className="relative mt-[7px] rounded-[10px] border border-solid border-maple/8 px-4 pt-[18px] pb-3.5">
              <p className="absolute -top-[7px] left-4 m-0 bg-white px-4 text-[14px] leading-[14px] font-medium text-maple">Made to order</p>
              {" "}
              <p className="m-0 flex items-center gap-[15px] text-[13px] leading-[1.5] text-[#5e574f]">
                {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size design icon */}
                <img src="/product-page/availability.svg" alt="" width={15} height={15} className="size-[15px] shrink-0" />
                Crafted for you in our Delhi workshop.
              </p>
            </div>
          )}
          <CompleteTheLook pieces={completeLook} />
          <div data-showroom className="relative rounded-[10px] bg-maple/6 py-4 pr-4 pl-10">
            {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size design icon */}
            <img src="/product-page/showroom-check.svg" alt="" width={14} height={14} className="absolute top-[20px] left-4 size-3.5" />
            <p className="m-0 text-[14px] leading-[22.4px] font-medium text-black">{showroom.title}</p>
            {" "}
            <p className="m-0 text-[12px] leading-[19.2px] text-black">{showroom.address}</p>
            {" "}
            <p className="m-0 mt-1 flex justify-end">
              <Link href={showroom.href} className="inline-flex items-center gap-1.5 text-[12px] leading-[14.4px] font-medium text-maple underline underline-offset-[3px] hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maple">
                View store information
                {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size design icon */}
                <img src="/product-page/store-arrow.svg" alt="" width={14} height={15} className="h-[15px] w-3.5" />
              </Link>
            </p>
          </div>
          {/* Frame 2:602: the store's promises drifting along a strip; still and wrapped for reduced motion. */}
          <div data-assurances-strip className="group/strip overflow-hidden rounded-[10px] bg-maple/6 text-[14px] leading-[14px] font-medium text-maple">
            <div className="flex w-max animate-pdp-strip group-hover/strip:[animation-play-state:paused] motion-reduce:w-full motion-reduce:animate-none">
              {[false, true].map((copy) => (
                <ul key={String(copy)} {...(copy ? { "data-assurances-copy": "", "aria-hidden": true } : { "data-assurances": "" })}
                  className={cx("m-0 flex shrink-0 list-none items-center p-0", copy ? "motion-reduce:hidden" : "motion-reduce:flex-wrap motion-reduce:justify-center")}>
                  <li className="flex h-[49px] items-center gap-1.5 border-0 border-r border-solid border-maple/10 px-[21px] whitespace-nowrap"><Truck aria-hidden="true" className="size-[15px]" strokeWidth={1.6} />{assurances.delivery}</li>
                  <li className="flex h-[49px] items-center gap-1.5 border-0 border-r border-solid border-maple/10 px-[21px] whitespace-nowrap">
                    {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size design icon */}
                    <img src="/product-page/returns.svg" alt="" width={13} height={12} className="h-3 w-[13px]" />{assurances.cover}
                  </li>
                  <li className="flex h-[49px] items-center gap-1.5 border-0 border-r border-solid border-maple/10 px-[21px] whitespace-nowrap">
                    {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size design icon */}
                    <img src="/product-page/shield-a.svg" alt="" width={11} height={14} className="h-3.5 w-[11px]" />{warranty}
                  </li>
                </ul>
              ))}
            </div>
          </div>
          <p data-shipping-note className="m-0 -mt-2 text-[12px] leading-[1.5] text-[#5e574f]">Shipping is charged separately and quoted before you confirm your order.</p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <Link data-ask href={enquiryHref} className={iconLink}>
              {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size design icon */}
              <img src="/product-page/ask.svg" alt="" width={14} height={14} className="size-3.5" />Ask a question
            </Link>
            <button type="button" data-share onClick={() => void share()} className={iconLink}>
              {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size design icon */}
              <img src="/product-page/share.svg" alt="" width={14} height={14} className="size-3.5" />Share
            </button>
            <span data-share-status role="status" className="text-[13px] text-black empty:hidden">{shared}</span>
          </div>
        </div>
      </section>
      {deal && <DealTab key={dealKey(deal)} deal={deal} />}
      {/* Every piece, sofas and beds included, gets the same section: Keeri's highlights as hotspots, cards that open in place (owner, 4 Nov 2026). */}
      <ProductFeatures features={features} highlights={highlightLines} photo={highlightPhoto ?? photo} contain={Boolean(highlightPhoto)} title={product.title} />
      <ProductBanner picture={banner} />
      <ProductTicker warranty={warranty} />
      <ProductReviews rating={rating} writeHref={enquiryHref} reviews={productReviews(product)}
        piece={{ handle: product.handle, title: product.title, image: images[0], collection: category, variantId: variant?.id }} />
      <ProductBundle product={product} variant={variant} paired={bundle} quantities={bundleQuantities} />
      {customising !== null && (
        <CustomiseQuote open={customising} onClose={stopCustomising} product={{ title: product.title, image: images[0], collection: category }}
          variant={variant ? { title: variant.title, sku: variant.sku } : undefined} />
      )}
      {children}
      <ProductFaq extra={productFaq(product)} />
      <ProductPromises />
      <ProductEnquiry product={product.title} variant={variant?.title ?? ""} sku={variant?.sku ?? ""} />
      <Modal open={zoom} onClose={() => setZoom(false)} title={product.title}>
        <div data-zoom className="[&_img]:h-auto [&_img]:w-full">
          <ProductImage src={images[shown]} alt={product.title} width={1200} height={1200} sizes="90vw" />
        </div>
      </Modal>
    </div>
  );
}
