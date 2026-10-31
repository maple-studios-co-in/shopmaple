"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Minus, Plus, Share2 } from "lucide-react";
import type { Product } from "@shopmaple/contracts";
import { canAddToCart } from "@/lib/product-availability";
import { shopMoney, categoryNames } from "@/lib/format";
import { cx } from "@/lib/cx";
import { ProductImage } from "./product-image";
import { PromiseStrip } from "./promise-strip";
import { eyebrow } from "./section-heading";
import { useProductHighlights } from "./product-highlights";
import { ProductVisit } from "../product-visit";
import { ProductRichText } from "./product-rich-text";
import { useShop } from "../shop-provider";
import { Modal } from "../modal";
import { ProductGallery } from "./product-gallery";
import { VariantSelector } from "./variant-selector";
import { selectedVariant, variantGallery } from "@/lib/product-address";

type Presentation = {
  variantImages: Record<string, string>;
  reviewLabel: string | null;
};

// The design's 6 px buttons: burgundy (Add to cart, Check) and white with a sand border (Speak to a designer, Write a review).
const button = "inline-flex items-center justify-center gap-2 rounded-[6px] px-[14px] text-ui font-bold no-underline transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-60";
const solid = cx(button, "h-12 cursor-pointer border-0 bg-brand text-white hover:bg-brand-deep");
const outline = cx(button, "h-[50px] border border-solid border-sand bg-white text-brand hover:bg-cream");
const stepper = "grid size-7 cursor-pointer place-items-center rounded-full border-0 bg-transparent p-0 text-taupe hover:text-espresso disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-brand";

export function ProductDetail({ product, initialVariant, presentation }: {
  product: Product;
  initialVariant?: string;
  presentation?: Presentation;
}) {
  const searchParams = useSearchParams();
  const queryVariant = searchParams ? searchParams.get("variant") ?? undefined : initialVariant;
  // An option's photo: the variant's own first photo, else the curated Shopify mapping.
  const variantImage = (id: string) => {
    const own = product.variants.find((v) => v.id === id)?.images?.[0];
    if (own) return own;
    const src = presentation?.variantImages[id];
    return src && product.images.includes(src) ? src : undefined;
  };
  const galleryFor = (id: string) => variantGallery(product, product.variants.find((v) => v.id === id));
  // Catalogues without any per-option photos present plain option tiles rather than a grid of
  // "Photo unavailable" boxes.
  const optionPhotos = product.variants.some((v) => v.images?.length) || Boolean(presentation && Object.keys(presentation.variantImages).length);
  const textOptions = !optionPhotos && product.images.length > 0;
  // Staff-entered colours (the card highlights' swatches) fill the finish circles when an option has no photo.
  const { swatch } = useProductHighlights();
  const optionLayout = optionPhotos || !textOptions ? "photo" : product.variants.every((v) => swatch(v.title)) ? "swatch" : "text";
  const initial =
    selectedVariant(product, queryVariant)?.id ??
    product.variants.find((v) => v.id === "preview-" + queryVariant)?.id ??
    product.variants.find((v) => variantImage(v.id))?.id ??
    product.variants.find((v) => v.pricePaise !== null)?.id ??
    product.variants[0]?.id ??
    "";
  const [variantId, setVariantId] = useState(initial);
  const [urlVariant, setUrlVariant] = useState(initial);
  const [image, setImage] = useState(() => Math.max(0, galleryFor(initial).indexOf(variantImage(initial) ?? ""))),
    [quantity, setQuantityValue] = useState(1),
    [zoom, setZoom] = useState(false),
    [pin, setPin] = useState(""),
    [checkedPin, setCheckedPin] = useState(""),
    [shared, setShared] = useState("");
  if (urlVariant !== initial) {
    setUrlVariant(initial);
    // History navigation changes the option without remounting the enquiry.
    if (variantId !== initial) {
      setVariantId(initial);
      const src = variantImage(initial);
      if (src) setImage(Math.max(0, galleryFor(initial).indexOf(src)));
    }
  }
  const { cart, setQuantity, setCartOpen, busy, error, favourites, toggleFavourite } = useShop();
  const variant = product.variants.find((v) => v.id === variantId);
  const images = galleryFor(variantId);
  // A shorter gallery after switching options never points past its last photo.
  const shown = Math.min(image, Math.max(0, images.length - 1));
  const enquiry = !product.published || !canAddToCart(variant);
  const selectedQuantity = cart.items.find((x) => x.variantId === variantId)?.quantity ?? 0;
  const saved = favourites.includes(product.handle);
  const enquiryHref =
    "/pages/contact?" +
    new URLSearchParams({
      product: product.title,
      ...(variant ? { variant: variant.title } : {}),
      ...(variant?.sku ? { sku: variant.sku } : {}),
      ...(checkedPin ? { pincode: checkedPin } : {}),
    });
  const discounted = variant?.pricePaise != null && !!variant.compareAtPaise && variant.compareAtPaise > variant.pricePaise;
  async function add() {
    if (enquiry || !variant) return;
    if (await setQuantity(variantId, selectedQuantity + quantity)) setCartOpen(true);
  }
  function selectVariant(id: string) {
    setVariantId(id);
    // The option's own photo leads its gallery; a shared gallery jumps to the option's photo.
    // Without one, the shopper keeps the photo they were looking at.
    const src = variantImage(id);
    if (src) setImage(Math.max(0, galleryFor(id).indexOf(src)));
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
  const category = product.category && categoryNames[product.category] ? product.category : "all";
  const accordion = "group bg-white p-6";
  const summary = "flex w-fit cursor-pointer list-none items-center gap-[22px] text-subhead font-bold text-espresso marker:hidden [&::-webkit-details-marker]:hidden focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand";
  // The sign follows the label ("Details  −" in the design). It is generated content on a hidden span, so neither the
  // summary's text nor its accessible name includes it.
  const sign = <span data-disclosure-sign aria-hidden="true" className="after:content-['+'] group-open:after:content-['−']" />;
  // Panels hold admin rich text or plain catalogue text: headings, paragraph spacing, lists and line breaks are restated here.
  const panel = "mt-3 text-price leading-[1.45] text-taupe [&_a]:font-semibold [&_a]:text-brand [&_a]:underline [&_a]:underline-offset-2 [&_:is(h2,h3,h4,h5,h6)]:font-serif [&_:is(h2,h3,h4,h5,h6)]:text-card [&_:is(h2,h3,h4,h5,h6)]:font-semibold [&_:is(h2,h3,h4,h5,h6)]:text-espresso [&_:is(h2,h3,h4,h5,h6):not(:first-child)]:mt-4 [&_:is(h2,h3,h4,h5,h6)+*]:mt-1.5 [&_p+p]:mt-2.5 [&_p+a]:mt-2.5 [&_p+a]:inline-block [&_:is(ul,ol)]:my-2 [&_:is(ul,ol)]:pl-5 [&_li+li]:mt-1";
  return (
    <div data-store className="bg-linen font-body text-espresso">
      <ProductVisit handle={product.handle} />
      <div className="mx-auto max-w-[1440px] px-4 pt-6 pb-12 md:px-8 md:pt-10 xl:px-16 xl:pt-16 xl:pb-16">
        <nav data-breadcrumb aria-label="Breadcrumb" className="mb-5 text-meta text-taupe md:mb-7">
          <ol className="m-0 flex list-none flex-wrap items-center gap-x-2 p-0 [&_a]:text-taupe [&_a]:no-underline [&_a:hover]:text-brand">
            <li className="flex items-center gap-2"><Link href="/">Home</Link><span aria-hidden="true">/</span></li>
            <li className="flex items-center gap-2"><Link href={"/collections/" + category}>{categoryNames[category]}</Link><span aria-hidden="true">/</span></li>
            <li><span aria-current="page">{product.title}</span></li>
          </ol>
        </nav>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,680fr)_minmax(0,584fr)] lg:items-start xl:gap-12">
          <ProductGallery images={images} title={product.title} selected={shown} onSelect={setImage}
            onZoom={() => setZoom(true)} saved={saved} onSave={() => toggleFavourite(product.handle)} />
          <div data-product-info className="flex min-w-0 flex-col gap-5">
            <Link data-product-eyebrow href={"/collections/" + category} className={cx(eyebrow, "w-fit no-underline hover:underline hover:underline-offset-4")}>
              Maple · {category === "all" ? "Collection" : categoryNames[category] + " collection"}
            </Link>
            <h1 className="font-serif text-[34px] leading-[1.1] font-bold text-espresso sm:text-h1">{product.title}</h1>
            {variant && !variantImage(variant.id) && !textOptions && (product.variants.length > 1 || product.images.length === 0) && (
              <p role="status" className="-mt-2 text-meta text-taupe">Photo for this option unavailable</p>
            )}
            <div data-price-block className="flex flex-col gap-5">
              <strong className="text-[30px] leading-[1.45] font-bold text-brand">{shopMoney(variant?.pricePaise ?? null)}</strong>
              {discounted && <p data-was className="text-price text-taupe"><span className="sr-only">Was </span><del>{shopMoney(variant!.compareAtPaise!)}</del></p>}
            </div>
            {product.description && <p data-description className="text-lead text-espresso">{product.description}</p>}
            {product.variants.length > 1 && <>
              <VariantSelector layout={optionLayout} selectedId={variantId} onSelect={selectVariant}
                variants={product.variants.map((v) => ({
                  id: v.id, name: v.title, slug: v.slug ?? undefined, image: variantImage(v.id), swatch: swatch(v.title),
                  code: v.sku?.trim() && product.variants.some((other) => other.id !== v.id && other.title === v.title && other.sku?.trim() && other.sku !== v.sku) ? v.sku : undefined,
                }))} />
              <p data-variant-note className="text-meta text-taupe">Other finishes are custom requests. Confirm materials and pricing with our team.</p>
            </>}
            <div className="grid gap-3">
              <div data-purchase className="flex gap-4">
                {!enquiry && (
                  <div className="flex h-[52px] w-[120px] shrink-0 items-center justify-between rounded-[6px] border border-solid border-sand bg-white px-2 text-ui text-taupe">
                    <button type="button" aria-label="Decrease quantity" disabled={quantity <= 1 || busy} onClick={() => setQuantityValue((q) => q - 1)} className={stepper}>
                      <Minus aria-hidden="true" className="size-3" />
                    </button>
                    <output aria-live="polite" aria-label="Quantity" className="min-w-6 text-center tabular-nums">{quantity}</output>
                    <button type="button" aria-label="Increase quantity" disabled={quantity >= 20 || busy} onClick={() => setQuantityValue((q) => q + 1)} className={stepper}>
                      <Plus aria-hidden="true" className="size-3" />
                    </button>
                  </div>
                )}
                {enquiry ? (
                  <Link data-primary className={cx(solid, "flex-1 sm:max-w-[360px]")} href={enquiryHref}>
                    Enquire about this piece <ArrowRight aria-hidden="true" className="size-4" />
                  </Link>
                ) : (
                  <button type="button" data-primary className={cx(solid, "flex-1 sm:max-w-[360px]")} disabled={busy || selectedQuantity + quantity > 20} onClick={() => void add()}>
                    {busy ? "Updating cart…" : "Add to cart"}
                  </button>
                )}
              </div>
              {selectedQuantity + quantity > 20 && <p className="text-meta text-brand">You can add up to 20 of this item. Contact our team for larger orders.</p>}
              {error && <p role="alert" className="text-meta text-brand">{error}</p>}
            </div>
            <section data-custom aria-labelledby="customisation-title" className="flex flex-col items-start gap-2.5 bg-cream p-5">
              <h2 id="customisation-title" className="text-[18px] leading-[1.45] font-bold text-espresso">Customisation available</h2>
              <p className="text-card text-espresso">A different colour or material? Let’s shape it together.</p>
              <Link data-customization href={enquiryHref} className={cx(outline, "w-full sm:w-[240px]")}>
                Speak to a designer <span aria-hidden="true">→</span>
              </Link>
            </section>
            <form data-serviceability id="delivery-enquiry" className="flex scroll-mt-6 flex-col gap-3"
              onSubmit={(e) => { e.preventDefault(); setCheckedPin(pin); }}>
              <label htmlFor="delivery-pincode" className="text-lead font-bold text-espresso">Delivery enquiry</label>
              <div className="flex gap-3">
                <input id="delivery-pincode" placeholder="Enter your pincode" inputMode="numeric" pattern="[1-9][0-9]{5}" maxLength={6} required value={pin}
                  onChange={(e) => { setPin(e.target.value.replace(/\D/g, "")); setCheckedPin(""); }}
                  className="h-[52px] min-w-0 flex-1 rounded-[6px] border border-solid border-sand bg-white px-[15px] text-ui text-espresso placeholder:text-taupe focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand" />
                <button type="submit" className={cx(solid, "w-[120px] shrink-0 sm:w-[182px]")}>Add pincode</button>
              </div>
              <p data-disclosure className="text-meta text-taupe">Enter a pincode so our team can confirm delivery, lead time and applicable taxes. Delivery and payment options will be confirmed before ordering.</p>
              {checkedPin && (
                <p role="status" className="text-meta [&_a]:font-semibold [&_a]:text-brand [&_a]:underline">
                  Please <Link href={enquiryHref}>ask our team to confirm delivery to {checkedPin}</Link>. Live delivery checking is being connected.
                </p>
              )}
            </form>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <button type="button" data-share onClick={() => void share()}
                className="inline-flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-meta font-medium text-taupe hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
                <Share2 aria-hidden="true" className="size-3.5" /> Share
              </button>
              <span data-share-status role="status" className="text-meta text-espresso empty:hidden">{shared}</span>
            </div>
          </div>
        </div>
      </div>
      <section data-product-details aria-label="Product details" className="mx-auto flex max-w-[1440px] flex-col gap-6 px-4 pt-4 pb-12 md:px-8 md:pt-6 xl:px-16 xl:pt-16 xl:pb-16">
        <PromiseStrip warranty={product.sourceDetails?.warranty} />
        <div data-accordions className="grid gap-6">
          <details open className={accordion}>
            <summary className={summary}>Details{sign}</summary>
            <div data-prose className={panel}>
              {product.pdpContent && (product.pdpContent.details?.children.length || !product.sourceDetails?.details) ? <ProductRichText content={product.pdpContent.details} /> : <p className="whitespace-pre-line">
                {product.sourceDetails?.details || product.description || "Our team can help with materials, dimensions, finishes and customization for this piece."}
              </p>}
            </div>
          </details>
          <details className={accordion}>
            <summary className={summary}>Materials &amp; care{sign}</summary>
            <div data-prose className={panel}>
              {product.pdpContent && (product.pdpContent.materialsCare?.children.length || !(product.sourceDetails?.materials || product.sourceDetails?.careInstructions)) ? <ProductRichText content={product.pdpContent.materialsCare} /> : product.sourceDetails?.materials || product.sourceDetails?.careInstructions ? <>
                {product.sourceDetails.materials && <p className="whitespace-pre-line">{product.sourceDetails.materials}</p>}
                {product.sourceDetails.careInstructions && <p className="whitespace-pre-line">{product.sourceDetails.careInstructions}</p>}
              </> : <>
                <p>Contact our team for the materials and care guidance for your selected finish.</p>
                <Link href={enquiryHref}>Request care guidance</Link>
              </>}
            </div>
          </details>
          <details className={accordion}>
            <summary className={summary}>Shipping &amp; returns{sign}</summary>
            <div data-prose className={panel}>
              {product.pdpContent ? <ProductRichText content={product.pdpContent.shippingReturns} /> : <>
                <p>Confirm delivery serviceability, charges, lead time and applicable return terms before ordering.</p>
                <Link href={enquiryHref}>Ask about delivery</Link>
              </>}
            </div>
          </details>
          <details id="product-specifications" className={cx(accordion, "scroll-mt-6")}>
            <summary className={summary}>Product specifications{sign}</summary>
            <div data-prose className={panel}>
              {product.sourceDetails?.dimensions ? <p className="whitespace-pre-line">{product.sourceDetails.dimensions}</p> : <Link href={enquiryHref}>Request dimensions and specifications</Link>}
              {variant?.sku && <p>SKU: {variant.sku}</p>}
              {product.sourceDetails?.warranty && <p>Warranty: {product.sourceDetails.warranty}</p>}
            </div>
          </details>
        </div>
        {product.source.startsWith("shopify") && (
          <section id="product-reviews" aria-labelledby="product-reviews-title" className="flex flex-col items-start gap-6">
            <h2 id="product-reviews-title" className="font-serif text-[30px] leading-[1.1] font-bold text-espresso">Customer reviews</h2>
            <p className="text-price text-taupe">{presentation?.reviewLabel === "No reviews" ? "No reviews yet." : "Customer reviews are not shown on this storefront yet."} Share your experience with this piece.</p>
            <Link className={cx(outline, "w-[180px]")} href={enquiryHref}>Write a review</Link>
          </section>
        )}
      </section>
      <Modal open={zoom} onClose={() => setZoom(false)} title={product.title}>
        <div data-zoom className="[&_img]:h-auto [&_img]:w-full">
          <ProductImage src={images[shown]} alt={product.title} width={1200} height={1200} sizes="90vw" />
        </div>
      </Modal>
    </div>
  );
}
