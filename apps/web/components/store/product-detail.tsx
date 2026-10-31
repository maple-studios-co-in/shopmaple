"use client";
import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, ChevronDown, CircleHelp, Hammer, Minus, PencilRuler, Plus, Share2, ShieldCheck, Star, Truck } from "lucide-react";
import type { Product } from "@shopmaple/contracts";
import { canAddToCart } from "@/lib/product-availability";
import { shopMoney, categoryNames } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ProductImage } from "./product-image";
import { ProductVisit } from "../product-visit";
import { ProductRichText } from "./product-rich-text";
import { useShop } from "../shop-provider";
import { Modal } from "../modal";
import { ProductGallery } from "./product-gallery";

type Presentation = {
  variantImages: Record<string, string>;
  reviewLabel: string | null;
};

const pill = "inline-flex h-[50px] items-center justify-center gap-2 rounded-full px-6 text-price font-semibold no-underline transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-60";
const solidPill = cn(pill, "cursor-pointer border-0 bg-brand text-white hover:bg-brand-deep");
const outlinePill = cn(pill, "border-2 border-solid border-brand bg-white text-brand hover:bg-cream");
const quiet = "inline-flex items-center gap-1.5 text-ui font-medium text-espresso no-underline hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";
const productPromises = [
  { icon: Hammer, label: "Made to order in Delhi" },
  { icon: ShieldCheck, label: "36-month warranty" },
  { icon: Truck, label: "Delivery across India" },
];

export function ProductDetail({ product, initialVariant, presentation }: {
  product: Product;
  initialVariant?: string;
  presentation?: Presentation;
}) {
  const searchParams = useSearchParams();
  const queryVariant = searchParams ? searchParams.get("variant") ?? undefined : initialVariant;
  const variantImage = (id: string) => {
    const src = presentation?.variantImages[id];
    return src && product.images.includes(src) ? src : undefined;
  };
  // Catalogues without any per-option photo mapping (every Keeri product today)
  // present plain option tiles rather than a grid of "Photo unavailable" boxes.
  const optionPhotos = Boolean(presentation && Object.keys(presentation.variantImages).length);
  const textOptions = !optionPhotos && product.images.length > 0;
  const initial =
    product.variants.find((v) => v.id === queryVariant)?.id ??
    product.variants.find((v) => v.id === "preview-" + queryVariant)?.id ??
    product.variants.find((v) => variantImage(v.id))?.id ??
    product.variants.find((v) => v.pricePaise !== null)?.id ??
    product.variants[0]?.id ??
    "";
  const [variantId, setVariantId] = useState(initial);
  const [urlVariant, setUrlVariant] = useState(initial);
  const [image, setImage] = useState(() => Math.max(0, product.images.indexOf(variantImage(initial) ?? ""))),
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
      if (src) setImage(product.images.indexOf(src));
    }
  }
  const { cart, setQuantity, setCartOpen, busy, error, favourites, toggleFavourite } = useShop();
  const variant = product.variants.find((v) => v.id === variantId);
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
    const src = variantImage(id);
    if (src) {
      const index = product.images.indexOf(src);
      if (index >= 0) setImage(index);
    }
    const url = new URL(window.location.href);
    url.searchParams.set("variant", id);
    window.history.replaceState(null, "", url);
  }
  async function share() {
    const url = window.location.href;
    try {
      if (typeof navigator.share === "function") { await navigator.share({ title: product.title, url }); return; }
      await navigator.clipboard.writeText(url);
      setShared("Link copied");
    } catch {
      setShared("");
    }
  }
  const detailImage = product.images[1] ?? product.images[0];
  const accordion = "group rounded-xl border border-solid border-sand bg-white open:shadow-xs";
  const summary = "flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-card font-bold text-espresso marker:hidden [&::-webkit-details-marker]:hidden focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand";
  const panel = "grid gap-2 px-5 pb-5 text-ui leading-[1.6] text-taupe [&_a]:font-semibold [&_a]:text-brand [&_a]:underline [&_a]:underline-offset-2";
  const chevron = <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-brand transition-transform group-open:rotate-180" />;
  return (
    <div data-store className="bg-white font-body text-espresso">
      <ProductVisit handle={product.handle} />
      <div className="mx-auto max-w-[1432px] px-4 pt-4 pb-10 md:px-8 lg:pb-16 xl:px-12">
        <nav data-breadcrumb aria-label="Breadcrumb" className="mb-4 flex items-center gap-2 text-label text-taupe [&_a]:text-taupe [&_a:hover]:text-brand">
          <Link href="/">Home</Link>
          <span aria-hidden="true">›</span>
          <Link href={"/collections/" + (product.category ?? "all")}>{categoryNames[product.category ?? "all"]}</Link>
        </nav>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_455px] lg:items-start xl:gap-10">
          <ProductGallery images={product.images} title={product.title} selected={image} onSelect={setImage}
            onZoom={() => setZoom(true)} saved={saved} onSave={() => toggleFavourite(product.handle)} />
          <div data-product-info className="grid gap-5 rounded-[20px] border border-solid border-brand/8 bg-white p-[22px] lg:sticky lg:top-6">
            <div className="grid gap-2">
              <Link href={"/collections/" + (product.category ?? "all")}
                className="w-fit rounded-[5px] bg-brand/12 px-2.5 py-1 text-label font-semibold text-brand no-underline hover:bg-brand/18">
                {categoryNames[product.category ?? "all"]}
              </Link>
              <h1 className="text-[28px] leading-[1.2] font-medium sm:text-title">{product.title}</h1>
              {variant && !variantImage(variant.id) && !textOptions && (product.variants.length > 1 || product.images.length === 0) && (
                <p role="status" className="text-meta text-taupe">Photo for this option unavailable</p>
              )}
              {presentation?.reviewLabel === "No reviews" && (
                <a href="#product-reviews" className="inline-flex w-fit items-center gap-2 text-meta text-taupe no-underline">
                  <span aria-hidden="true" className="flex text-sand">{Array.from({ length: 5 }, (_, i) => <Star key={i} className="size-4" />)}</span>
                  <span>No reviews yet</span>
                </a>
              )}
            </div>
            <div data-price-block className="grid gap-1">
              <div className="flex flex-wrap items-center gap-3">
                <strong className="text-subhead font-semibold text-brand">{shopMoney(variant?.pricePaise ?? null)}</strong>
                {discounted && (
                  <span data-discount className="rounded-[5px] bg-leaf/10 px-2.5 py-1 text-label font-semibold text-leaf">
                    {Math.round((1 - variant!.pricePaise! / variant!.compareAtPaise!) * 100)}% off
                  </span>
                )}
              </div>
              {discounted && <del className="text-price text-espresso">{shopMoney(variant!.compareAtPaise!)}</del>}
              <p className="text-meta text-taupe">Delivery and applicable taxes will be confirmed by our team.</p>
            </div>
            {product.description && <p data-description className="text-ui leading-[1.6]">{product.description}</p>}
            {product.variants.length > 1 && (
              <fieldset data-variants={textOptions ? "text" : "photo"} className="grid gap-3">
                <legend className="mb-3 flex w-full flex-wrap items-center justify-between gap-2 text-ui">
                  <span>Option: <strong className="font-semibold">{variant?.title}</strong></span>
                  <Link data-customization href={enquiryHref} className="inline-flex items-center gap-1 text-label font-medium text-brand no-underline hover:underline">
                    <PencilRuler aria-hidden="true" className="size-3.5" /> Customization available
                  </Link>
                </legend>
                <div className={cn("grid gap-3", textOptions ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-3")}>
                  {product.variants.map((v) => (
                    <label key={v.id}
                      className={cn("relative grid cursor-pointer content-start gap-1 rounded-[7px] p-2 text-label text-espresso shadow-[0_0_0_2px] transition-shadow has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand",
                        v.id === variantId ? "shadow-espresso" : "shadow-espresso/12 hover:shadow-espresso/40")}>
                      <input type="radio" name="variant" value={v.id} checked={v.id === variantId} onChange={() => selectVariant(v.id)} className="sr-only" />
                      {!textOptions && (
                        <span data-variant-image className="relative block aspect-[11/10] overflow-hidden rounded-[5px] bg-cream [&_img]:object-cover">
                          {variantImage(v.id) ? <ProductImage src={variantImage(v.id)!} alt="" fill sizes="130px" />
                            : <span data-variant-placeholder className="grid size-full place-items-center p-1 text-center text-label text-taupe">Photo unavailable</span>}
                        </span>
                      )}
                      <span className="font-semibold">{v.title}</span>
                      {v.sku?.trim() && product.variants.some((other) => other.id !== v.id && other.title === v.title && other.sku?.trim() && other.sku !== v.sku) && (
                        <small data-variant-code className="text-label text-taupe">Item code: {v.sku}</small>
                      )}
                      <small className="text-label text-taupe">{shopMoney(v.pricePaise)}</small>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-meta [&_a]:text-brand [&_a]:underline [&_a]:underline-offset-2">
              <a href="#product-specifications">Dimensions &amp; specifications</a>
              <a href="#delivery-enquiry">Delivery enquiry</a>
            </div>
            <div className="grid gap-3">
              <div data-purchase className="flex gap-3">
                {!enquiry && (
                  <div className="flex h-[50px] shrink-0 items-center gap-1 rounded-full border border-solid border-brand/8 px-2">
                    <button type="button" aria-label="Decrease quantity" disabled={quantity <= 1 || busy} onClick={() => setQuantityValue((q) => q - 1)}
                      className="grid size-[25px] cursor-pointer place-items-center rounded-full border-0 bg-espresso/4 p-0 text-espresso disabled:cursor-not-allowed disabled:opacity-50">
                      <Minus aria-hidden="true" className="size-3" />
                    </button>
                    <output aria-live="polite" aria-label="Quantity" className="w-10 text-center text-ui text-brand tabular-nums">{quantity}</output>
                    <button type="button" aria-label="Increase quantity" disabled={quantity >= 20 || busy} onClick={() => setQuantityValue((q) => q + 1)}
                      className="grid size-[25px] cursor-pointer place-items-center rounded-full border-0 bg-espresso/4 p-0 text-espresso disabled:cursor-not-allowed disabled:opacity-50">
                      <Plus aria-hidden="true" className="size-3" />
                    </button>
                  </div>
                )}
                {enquiry ? (
                  <Link data-primary className={cn(solidPill, "flex-1")} href={enquiryHref}>
                    Enquire about this piece <ArrowRight aria-hidden="true" className="size-4" />
                  </Link>
                ) : (
                  <button type="button" data-primary className={cn(solidPill, "flex-1")} disabled={busy || selectedQuantity + quantity > 20} onClick={() => void add()}>
                    {busy ? "Updating cart…" : "Add to cart"}
                  </button>
                )}
              </div>
              {selectedQuantity + quantity > 20 && <p className="text-meta text-brand">You can add up to 20 of this item. Contact our team for larger orders.</p>}
              {error && <p role="alert" className="text-meta text-brand">{error}</p>}
              <div data-custom className="grid gap-1.5">
                <Link className={outlinePill} href={enquiryHref}>Speak to our team</Link>
                <p className="text-center text-label text-taupe">Have a size, fabric or finish in mind? Let’s discuss what’s possible.</p>
              </div>
            </div>
            <ul data-product-promises aria-label="With every piece" className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[10px] bg-brand/6 px-4 py-3 text-ui font-medium text-brand">
              {productPromises.map(({ icon: Icon, label }) => (
                <li key={label} className="flex items-center gap-1.5"><Icon aria-hidden="true" className="size-4" />{label}</li>
              ))}
            </ul>
            <p data-disclosure className="text-label text-taupe">Delivery and payment options will be confirmed before ordering.</p>
            <form data-serviceability id="delivery-enquiry" className="grid scroll-mt-6 gap-2 rounded-[10px] bg-brand/6 p-4"
              onSubmit={(e) => { e.preventDefault(); setCheckedPin(pin); }}>
              <label htmlFor="delivery-pincode" className="text-ui font-semibold">Delivery enquiry</label>
              <p className="text-meta text-taupe">Add your Indian postcode so our team can confirm charges and lead time.</p>
              <div className="flex gap-2">
                <input id="delivery-pincode" placeholder="Enter pincode" inputMode="numeric" pattern="[1-9][0-9]{5}" maxLength={6} required value={pin}
                  onChange={(e) => { setPin(e.target.value.replace(/\D/g, "")); setCheckedPin(""); }}
                  className="h-10 min-w-0 flex-1 rounded-full border border-solid border-sand bg-white px-4 text-ui focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand" />
                <button type="submit" className="h-10 cursor-pointer rounded-full border-0 bg-white px-4 text-ui font-semibold text-brand hover:bg-cream focus-visible:outline-2 focus-visible:outline-brand">Add postcode</button>
              </div>
              {checkedPin && (
                <p role="status" className="text-meta [&_a]:font-semibold [&_a]:text-brand [&_a]:underline">
                  Please <Link href={enquiryHref}>ask our team to confirm delivery to {checkedPin}</Link>. Live delivery checking is being connected.
                </p>
              )}
            </form>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <Link data-ask href={enquiryHref} className={quiet}><CircleHelp aria-hidden="true" className="size-4" /> Ask a question</Link>
              <button type="button" data-share onClick={() => void share()} className={cn(quiet, "cursor-pointer border-0 bg-transparent p-0")}>
                <Share2 aria-hidden="true" className="size-4" /> Share
              </button>
              {shared && <span role="status" className="text-meta text-leaf">{shared}</span>}
              <a data-phone href="tel:+918796130252" className={cn(quiet, "ml-auto text-meta")}>Call +91 87961 30252</a>
            </div>
          </div>
        </div>
      </div>
      <section data-product-details aria-labelledby="product-details-title" className="bg-linen py-12 lg:py-20">
        <div className="mx-auto grid max-w-[1432px] gap-8 px-4 md:px-8 xl:px-12">
          <div className="grid justify-items-center gap-2 text-center">
            <h2 id="product-details-title" className="font-serif text-h2 font-bold text-brand md:text-h1">Precision in every detail</h2>
            <p className="text-ui text-taupe">Made in our Delhi workshop, to the size, fabric and finish you choose.</p>
          </div>
          <div className={cn("grid items-start gap-8", detailImage && "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]")}>
            <div data-accordions className="grid gap-3">
              <details open className={accordion}>
                <summary className={summary}>Details{chevron}</summary>
                <div className={panel}>
                  {product.pdpContent && (product.pdpContent.details?.children.length || !product.sourceDetails?.details) ? <ProductRichText content={product.pdpContent.details} /> : <p>
                    {product.sourceDetails?.details || product.description || "Our team can help with materials, dimensions, finishes and customization for this piece."}
                  </p>}
                </div>
              </details>
              <details className={accordion}>
                <summary className={summary}>Materials + Care{chevron}</summary>
                <div className={panel}>
                  {product.pdpContent && (product.pdpContent.materialsCare?.children.length || !(product.sourceDetails?.materials || product.sourceDetails?.careInstructions)) ? <ProductRichText content={product.pdpContent.materialsCare} /> : product.sourceDetails?.materials || product.sourceDetails?.careInstructions ? <>
                    {product.sourceDetails.materials && <p>{product.sourceDetails.materials}</p>}
                    {product.sourceDetails.careInstructions && <p>{product.sourceDetails.careInstructions}</p>}
                  </> : <>
                    <p>Contact our team for the materials and care guidance for your selected finish.</p>
                    <Link href={enquiryHref}>Request care guidance</Link>
                  </>}
                </div>
              </details>
              <details className={accordion}>
                <summary className={summary}>Shipping + Returns{chevron}</summary>
                <div className={panel}>
                  {product.pdpContent ? <ProductRichText content={product.pdpContent.shippingReturns} /> : <>
                    <p>Confirm delivery serviceability, charges, lead time and applicable return terms before ordering.</p>
                    <Link href={enquiryHref}>Ask about delivery</Link>
                  </>}
                </div>
              </details>
              <details id="product-specifications" open className={cn(accordion, "scroll-mt-6")}>
                <summary className={summary}>Dimensions &amp; specifications{chevron}</summary>
                <div className={panel}>
                  {product.sourceDetails?.dimensions ? <p>{product.sourceDetails.dimensions}</p> : <Link href={enquiryHref}>Request dimensions and specifications</Link>}
                  {variant?.sku && <p>SKU: {variant.sku}</p>}
                  {product.sourceDetails?.warranty && <p>Warranty: {product.sourceDetails.warranty}</p>}
                </div>
              </details>
            </div>
            {detailImage && (
              <div className="relative aspect-[4/3] overflow-hidden rounded-[30px] bg-cream lg:sticky lg:top-6 [&_img]:object-cover">
                <ProductImage src={detailImage} alt={product.title} fill sizes="(max-width:1023px) 100vw, 660px" />
              </div>
            )}
          </div>
        </div>
      </section>
      {product.source.startsWith("shopify") && (
        <section id="product-reviews" className="mx-auto grid max-w-[1432px] justify-items-center gap-3 px-4 py-12 text-center md:px-8 xl:px-12">
          <h2 className="font-serif text-h2 font-bold">Customer reviews</h2>
          <p className="text-ui text-taupe">{presentation?.reviewLabel === "No reviews" ? "No reviews yet" : "Customer reviews are not available on this storefront yet."}</p>
          <Link className={outlinePill} href={enquiryHref}>Contact support</Link>
        </section>
      )}
      <Modal open={zoom} onClose={() => setZoom(false)} title={product.title}>
        <div data-zoom className="[&_img]:h-auto [&_img]:w-full">
          <ProductImage src={product.images[image]} alt={product.title} width={1200} height={1200} sizes="90vw" />
        </div>
      </Modal>
    </div>
  );
}
