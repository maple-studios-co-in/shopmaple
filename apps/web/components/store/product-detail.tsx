"use client";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Truck } from "lucide-react";
import type { Product, ProductRichText as ProductRichTextValue } from "@shopmaple/contracts";
import { canAddToCart } from "@/lib/product-availability";
import { shopMoney } from "@/lib/format";
import { cx } from "@/lib/cx";
import { ProductImage } from "./product-image";
import { useProductHighlights } from "./product-highlights";
import { ProductVisit } from "../product-visit";
import { ProductRichText } from "./product-rich-text";
import { useShop } from "../shop-provider";
import { Modal } from "./modal";
import { assurances, discountPercent, enquiryLink, warrantyLabel } from "./product-assurances";
import { ProductBanner } from "./product-banner";
import { ProductEnquiry } from "./product-enquiry";
import { ProductFaq } from "./product-faq";
import { ProductFeatures, type Feature } from "./product-features";
import { ProductPromises } from "./product-promises";
import { ProductReviews } from "./product-reviews";
import { ProductTicker } from "./product-ticker";
import { ProductGallery } from "./product-gallery";
import { VariantSelector } from "./variant-selector";
import { selectedVariant, variantGallery } from "@/lib/product-address";

type Presentation = {
  variantImages: Record<string, string>;
  reviewLabel: string | null;
};

// Frame 999:3's pills: burgundy "Add to cart" and the outlined second action, 50 px tall.
const pill = "inline-flex h-[50px] items-center justify-center rounded-[30px] px-6 text-[14px] leading-[1.2] font-medium no-underline transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maple disabled:cursor-not-allowed disabled:opacity-60";
const solid = cx(pill, "cursor-pointer border-0 bg-maple text-white hover:bg-brand-deep");
const outline = cx(pill, "cursor-pointer border-2 border-solid border-maple bg-white text-maple hover:bg-maple/6");
const stepper = "grid size-[25px] cursor-pointer place-items-center rounded-full border-0 bg-[rgba(86,60,73,0.04)] p-0 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-maple";
const iconLink = "inline-flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-[14px] leading-[1.6] font-medium text-black no-underline hover:text-maple focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maple";

/** A card's text: the captured rich text when it has any; null when the catalogue holds nothing for it. */
const richCard = (content: ProductRichTextValue | null | undefined): ReactNode => content?.children.length ? <ProductRichText content={content} /> : null;
const textCard = (value: string | null | undefined): ReactNode => value?.trim() ? value : null;

/** `children` render between the reviews band and the FAQ: the page passes the "You may also like" row. */
export function ProductDetail({ product, initialVariant, presentation, children }: {
  product: Product;
  initialVariant?: string;
  presentation?: Presentation;
  children?: ReactNode;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
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
  const highlights = useProductHighlights();
  const { swatch } = highlights;
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
  const enquiryHref = enquiryLink(product, variant);
  const discount = discountPercent(variant?.pricePaise, variant?.compareAtPaise);
  const rating = highlights.product(product.handle)?.rating;
  const isNew = highlights.product(product.handle)?.isNew;
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
  const photo = product.images[1] ?? product.images[0];
  const features: Feature[] = [];
  // Captured (admin) text leads; with none, the catalogue's own text. The description stands in for About only on
  // products that were never captured, and an empty captured card stays empty rather than borrowing other copy.
  const about = richCard(product.pdpContent?.details) ?? textCard(product.sourceDetails?.details) ?? (product.pdpContent ? null : textCard(product.description));
  if (about) features.push({ key: "about", title: "About Product", icon: "feature-about", body: about });
  const dimensions = product.sourceDetails?.dimensions?.trim();
  if (dimensions) features.push({ key: "specification", title: "Specification", icon: "feature-specification", body: dimensions, meta: [variant?.sku && `SKU: ${variant.sku}`, product.sourceDetails?.warranty?.trim() && `Warranty: ${product.sourceDetails.warranty.trim()}`].filter(Boolean).join(" · ") || undefined });
  const care = richCard(product.pdpContent?.materialsCare) ?? textCard([product.sourceDetails?.materials?.trim(), product.sourceDetails?.careInstructions?.trim()].filter(Boolean).join("\n\n"));
  if (care) features.push({ key: "care", title: "Material & Care", icon: "feature-care", body: care });
  const shipping = richCard(product.pdpContent?.shippingReturns);
  if (shipping) features.push({ key: "shipping", title: "Shipping & Returns", icon: "feature-about", body: shipping });
  const warranty = warrantyLabel(product);
  return (
    <div data-store data-product-page className="bg-white font-product text-black">
      <ProductVisit handle={product.handle} />
      <section aria-label={product.title} className="mx-auto grid max-w-[1432px] gap-8 px-4 pt-6 pb-10 md:px-12 md:pt-12 lg:grid-cols-[minmax(0,1fr)_455px] lg:items-start lg:gap-[35px]">
        <div className="min-w-0 lg:sticky lg:top-6">
          <ProductGallery images={images} title={product.title} selected={shown} onSelect={setImage}
            onZoom={() => setZoom(true)} saved={saved} onSave={() => toggleFavourite(product.handle)} />
        </div>
        <div data-product-info className="flex min-w-0 flex-col gap-5 rounded-[24px] border border-solid border-maple/8 bg-white p-5 sm:p-[22px]">
          {isNew && <div className="flex gap-2"><span data-chip="new" className="inline-flex h-[23px] items-center rounded-[4px] bg-[#803cee] px-2 text-[12px] leading-[1.6] font-medium text-white">New</span></div>}
          <h1 className="m-0 text-[28px] leading-[1.2] font-medium text-[#1c1c1c] sm:text-[34px]">{product.title}</h1>
          {variant && !variantImage(variant.id) && !textOptions && (product.variants.length > 1 || product.images.length === 0) && (
            <p role="status" className="-mt-2 text-meta text-taupe">Photo for this option unavailable</p>
          )}
          <div data-price-block className="grid gap-2">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <strong data-price className="text-[20px] leading-[1.2] font-medium text-maple">{shopMoney(variant?.pricePaise ?? null)}</strong>
              {discount >= 1 && <span data-discount className="inline-flex h-[27px] items-center rounded-[5px] bg-[rgba(66,132,69,0.1)] px-2 text-[12px] leading-[1.6] font-medium text-[#2f6b32]">{discount}%OFF</span>}
            </div>
            <div className="flex items-center justify-between gap-3">
              {discount >= 1 ? <p data-was className="m-0 text-[16px] font-medium text-black"><span className="sr-only">Was </span><del>{shopMoney(variant!.compareAtPaise!)}</del></p> : <span />}
              {rating && <p data-rating className="m-0 inline-flex items-center gap-1 text-[14px] leading-[1.6] text-black">{rating.value.toFixed(1)}
                {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size design star */}
                <img src="/product-page/star.svg" alt="" width={15} height={15} className="size-[15px]" />
              </p>}
            </div>
          </div>
          {product.description && <p data-description className="m-0 text-[14px] leading-[1.6] text-[#1c1c1c]">{product.description}</p>}
          {product.variants.length > 1 && (
            <div className="relative mt-2">
              <VariantSelector layout={optionLayout} selectedId={variantId} onSelect={selectVariant}
                variants={product.variants.map((v) => ({
                  id: v.id, name: v.title, slug: v.slug ?? undefined, image: variantImage(v.id), swatch: swatch(v.title),
                  code: v.sku?.trim() && product.variants.some((other) => other.id !== v.id && other.title === v.title && other.sku?.trim() && other.sku !== v.sku) ? v.sku : undefined,
                }))} />
              <Link data-customization href={enquiryHref} className="absolute top-0 right-0 inline-flex items-center gap-1.5 text-[12px] leading-[1.6] font-medium text-maple no-underline hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maple">
                {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size design icon */}
                <img src="/product-page/customise.svg" alt="" width={12} height={12} className="size-3" />
                Customisation available
              </Link>
            </div>
          )}
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
                <Link data-primary className={cx(solid, "flex-1")} href={enquiryHref}>Enquire about this piece</Link>
              ) : (
                <button type="button" data-primary className={cx(solid, "flex-1")} disabled={busy || selectedQuantity + quantity > 20} onClick={() => void add().then((added) => { if (added) setCartOpen(true); })}>
                  {busy ? "Updating cart…" : "Add to cart"}
                </button>
              )}
            </div>
            {!enquiry && cart.checkoutEnabled ? (
              <button type="button" data-buy-now className={cx(outline, "w-full")} disabled={busy || selectedQuantity + quantity > 20} onClick={() => void buyNow()}>Buy it now</button>
            ) : enquiry ? (
              <Link data-designer href={enquiryHref} className={cx(outline, "w-full")}>Speak to a designer</Link>
            ) : (
              <Link data-enquire href={enquiryHref} className={cx(outline, "w-full")}>Enquire about this piece</Link>
            )}
            {selectedQuantity + quantity > 20 && <p className="m-0 text-meta text-maple">You can add up to 20 of this item. Contact our team for larger orders.</p>}
            {error && <p role="alert" className="m-0 text-meta text-maple">{error}</p>}
          </div>
          <ul data-assurances className="m-0 grid list-none grid-cols-3 rounded-[10px] bg-maple/6 py-3 text-center text-[13px] leading-[1.3] font-medium text-maple">
            <li className="flex flex-col items-center gap-1.5 px-2"><Truck aria-hidden="true" className="size-[18px]" strokeWidth={1.6} />{assurances.delivery}</li>
            <li className="flex flex-col items-center gap-1.5 border-0 border-l border-solid border-maple/10 px-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size design icon */}
              <img src="/product-page/returns.svg" alt="" width={15} height={15} className="size-[18px]" />{assurances.cover}
            </li>
            <li className="flex flex-col items-center gap-1.5 border-0 border-l border-solid border-maple/10 px-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size design icon */}
              <img src="/product-page/shield-a.svg" alt="" width={15} height={15} className="size-[18px]" />{warranty}
            </li>
          </ul>
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
      <ProductFeatures features={features} photo={photo} title={product.title} />
      <ProductBanner />
      <ProductTicker warranty={warranty} />
      <ProductReviews rating={rating} writeHref={enquiryHref} />
      {children}
      <ProductFaq />
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
