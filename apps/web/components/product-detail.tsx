"use client";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Heart,
  Minus,
  Plus,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Truck,
  ShieldCheck,
  LockKeyhole,
  Star,
} from "lucide-react";
import type { Product } from "@shopmaple/contracts";
import { useShop } from "./shop-provider";
import { Modal } from "./modal";
import { shopMoney, categoryNames } from "@/lib/format";

type Presentation = {
  variantImages: Record<string, string>;
  reviewLabel: string | null;
};
export function ProductDetail({
  product,
  initialVariant,
  presentation,
}: {
  product: Product;
  initialVariant?: string;
  presentation?: Presentation;
}) {
  const router = useRouter();
  const initial =
    product.variants.find(
      (v) => v.id === initialVariant || v.id === "preview-" + initialVariant,
    )?.id ??
    product.variants.find((v) => v.available)?.id ??
    product.variants[0]!.id;
  const [variantId, setVariantId] = useState(initial);
  const [image, setImage] = useState(() =>
      Math.max(
        0,
        product.images.indexOf(presentation?.variantImages[initial] ?? ""),
      ),
    ),
    [quantity, setQuantityValue] = useState(1),
    [zoom, setZoom] = useState(false),
    [pin, setPin] = useState(""),
    [checkedPin, setCheckedPin] = useState("");
  const {
    cart,
    setQuantity,
    setCartOpen,
    busy,
    error,
    favourites,
    toggleFavourite,
  } = useShop();
  const variant = product.variants.find((v) => v.id === variantId)!;
  const enquiry = variant.stockPolicy === "made_to_order" || !variant.available;
  const selectedQuantity =
    cart.items.find((x) => x.variantId === variantId)?.quantity ?? 0;
  const saved = favourites.includes(product.handle);
  const enquiryHref =
    "/pages/contact?" +
    new URLSearchParams({
      product: product.title,
      variant: variant.title,
      sku: variant.sku ?? variant.id,
      ...(checkedPin ? { pincode: checkedPin } : {}),
    });
  const discounted =
    !!variant.compareAtPaise && variant.compareAtPaise > variant.pricePaise;
  async function add() {
    if (await setQuantity(variantId, selectedQuantity + quantity))
      setCartOpen(true);
  }
  function selectVariant(id: string) {
    setVariantId(id);
    const src = presentation?.variantImages[id];
    if (src) {
      const index = product.images.indexOf(src);
      if (index >= 0) setImage(index);
    }
    router.replace("?variant=" + encodeURIComponent(id), { scroll: false });
  }
  const stars = (
    <span className="product-stars" aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} size={19} />
      ))}
    </span>
  );
  return (
    <>
      <div className="pdp-shell">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span>›</span>
          <Link href={"/collections/" + product.category}>
            {categoryNames[product.category]}
          </Link>
        </nav>
        <div className="product-detail pdp-detail">
          <div className="product-gallery pdp-gallery">
            <div className="product-thumbnails">
              {product.images.map((src, i) => (
                <button
                  key={src}
                  onClick={() => setImage(i)}
                  aria-label={"Show product image " + (i + 1)}
                  aria-pressed={image === i}
                >
                  <Image src={src} alt="" width={76} height={76} />
                </button>
              ))}
            </div>
            <div className="pdp-gallery-stage">
              <button
                className="product-main-image"
                aria-label="Enlarge product image"
                onClick={() => setZoom(true)}
              >
                <Image
                  src={product.images[image]!}
                  alt={product.title + " — view " + (image + 1)}
                  fill
                  sizes="(max-width:749px) 100vw, 44vw"
                  preload
                />
              </button>
              <button
                className={"icon-button pdp-save" + (saved ? " saved" : "")}
                onClick={() => toggleFavourite(product.handle)}
                aria-label={
                  saved ? "Remove from saved furniture" : "Save furniture"
                }
                aria-pressed={saved}
              >
                <Heart />
              </button>
              {product.images.length > 1 && (
                <div className="pdp-gallery-controls">
                  <button
                    className="icon-button"
                    aria-label="Previous product image"
                    onClick={() =>
                      setImage(
                        (i) =>
                          (i - 1 + product.images.length) %
                          product.images.length,
                      )
                    }
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <span>
                    {image + 1} / {product.images.length}
                  </span>
                  <button
                    className="icon-button"
                    aria-label="Next product image"
                    onClick={() =>
                      setImage((i) => (i + 1) % product.images.length)
                    }
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="product-information pdp-info">
            <h1>{product.title}</h1>
            {presentation?.reviewLabel === "No reviews" && (
              <a className="pdp-rating" href="#product-reviews">
                {stars}
                <span>No reviews</span>
              </a>
            )}
            <div className="pdp-price-block">
              <div>
                <strong>{shopMoney(variant.pricePaise)}</strong>
                {discounted && (
                  <span className="pdp-discount">
                    {Math.round(
                      (1 - variant.pricePaise / variant.compareAtPaise!) * 100,
                    )}
                    %Off
                  </span>
                )}
              </div>
              {discounted && <del>{shopMoney(variant.compareAtPaise!)}</del>}
              <p>
                {product.source === "shopify-preview"
                  ? "Taxes included. Shipping calculated at checkout."
                  : "Delivery and applicable taxes will be confirmed by our team."}
              </p>
            </div>
            {product.variants.length > 1 && (
              <fieldset className="pdp-variants">
                <legend>Variants</legend>
                <div>
                  {product.variants.map((v) => (
                    <label
                      key={v.id}
                      className={v.id === variantId ? "selected" : ""}
                    >
                      <input
                        type="radio"
                        name="variant"
                        value={v.id}
                        checked={v.id === variantId}
                        onChange={() => selectVariant(v.id)}
                      />
                      <span className="pdp-variant-image">
                        {presentation?.variantImages[v.id] && (
                          <Image
                            src={presentation.variantImages[v.id]!}
                            alt=""
                            fill
                            sizes="143px"
                          />
                        )}
                      </span>
                      <span>{v.title}</span>
                      <small>{shopMoney(v.pricePaise)}</small>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            <div className="pdp-purchase">
              {!enquiry && (
                <div className="quantity-control">
                  <button
                    aria-label="Decrease quantity"
                    disabled={quantity <= 1 || busy}
                    onClick={() => setQuantityValue((q) => q - 1)}
                  >
                    <Minus size={16} />
                  </button>
                  <output aria-live="polite" aria-label="Quantity">
                    {quantity}
                  </output>
                  <button
                    aria-label="Increase quantity"
                    disabled={quantity >= 20 || busy}
                    onClick={() => setQuantityValue((q) => q + 1)}
                  >
                    <Plus size={16} />
                  </button>
                </div>
              )}
              {enquiry ? (
                <Link className="button full-width" href={enquiryHref}>
                  Enquire about this piece <ArrowRight size={18} />
                </Link>
              ) : (
                <button
                  className="button full-width"
                  disabled={busy || selectedQuantity + quantity > 20}
                  onClick={() => void add()}
                >
                  {busy ? "Updating cart…" : "Add to cart"}
                </button>
              )}
            </div>
            {selectedQuantity + quantity > 20 && (
              <p className="error-text">
                You can add up to 20 of this item. Contact our team for larger
                orders.
              </p>
            )}
            {error && (
              <p className="error-text" role="alert">
                {error}
              </p>
            )}
            <div className="pdp-custom">
              <h2>Customization Available</h2>
              <p>100% Bespoke - Every element is yours to reshape.</p>
              <Link className="button" href={enquiryHref}>
                SPEAK TO OUR TEAM
              </Link>
            </div>
            <div className="pdp-benefits">
              <div>
                <Truck />
                <span>
                  Delivery Across India
                  <br />& Installation
                </span>
              </div>
              <div>
                <ShieldCheck />
                <span>
                  36 Month
                  <br />
                  Warranty*
                </span>
              </div>
              <div>
                <LockKeyhole />
                <span>
                  Safe & Secure
                  <br />
                  Payment
                </span>
              </div>
            </div>
            <p className="preview-disclosure">
              Development preview. Checkout is unavailable; stock, delivery,
              warranty and payment terms must be confirmed before ordering.
            </p>
            <form
              className="pdp-serviceability"
              onSubmit={(e) => {
                e.preventDefault();
                setCheckedPin(pin);
              }}
            >
              <label htmlFor="delivery-pincode">Check Availability</label>
              <div>
                <input
                  id="delivery-pincode"
                  placeholder="Enter pincode"
                  inputMode="numeric"
                  pattern="[1-9][0-9]{5}"
                  maxLength={6}
                  required
                  value={pin}
                  onChange={(e) => {
                    setPin(e.target.value.replace(/\D/g, ""));
                    setCheckedPin("");
                  }}
                />
                <button type="submit">Check</button>
              </div>
              {checkedPin && (
                <p role="status">
                  Please{" "}
                  <Link href={enquiryHref}>
                    ask our team to confirm delivery to {checkedPin}
                  </Link>
                  . Live delivery checking is being connected.
                </p>
              )}
            </form>
            <div className="product-accordions">
              <details open>
                <summary>Details</summary>
                <p>
                  {product.description ||
                    "Our team can help with materials, dimensions, finishes and customization for this piece."}
                </p>
              </details>
              <details>
                <summary>Materials + Care</summary>
                <p>
                  Contact our team for the materials and care guidance for your
                  selected finish.
                </p>
                <Link href={enquiryHref}>Request care guidance</Link>
              </details>
              <details>
                <summary>Shipping + Returns</summary>
                <p>
                  Confirm delivery serviceability, charges, lead time and
                  applicable return terms before ordering.
                </p>
                <Link href={enquiryHref}>Ask about delivery</Link>
              </details>
              <details>
                <summary>Product Specification</summary>
                <Link href={enquiryHref}>
                  Request dimensions and specifications
                </Link>
                {variant.sku && <p>SKU: {variant.sku}</p>}
              </details>
            </div>
            <a className="pdp-phone" href="tel:+919211819727">
              CALL US ON +919211819727
            </a>
          </div>
        </div>
        <section id="product-reviews" className="pdp-reviews">
          <h2>Customer Reviews</h2>
          {presentation?.reviewLabel === "No reviews" ? (
            <>
              <div>
                {stars}
                <p>Be the first to write a review</p>
              </div>
              <a
                className="button"
                href={
                  "https://shop.maplefurnishers.com/products/" +
                  product.handle +
                  "#judgeme_product_reviews"
                }
              >
                Write a review on our current shop
              </a>
            </>
          ) : (
            <p>
              Customer reviews are available on{" "}
              <a
                href={
                  "https://shop.maplefurnishers.com/products/" +
                  product.handle +
                  "#judgeme_product_reviews"
                }
              >
                our current shop
              </a>
              .
            </p>
          )}
        </section>
      </div>
      <Modal open={zoom} onClose={() => setZoom(false)} title={product.title}>
        <div className="pdp-zoom">
          <Image
            src={product.images[image]!}
            alt={product.title}
            width={1200}
            height={1200}
            sizes="90vw"
          />
        </div>
      </Modal>
    </>
  );
}
