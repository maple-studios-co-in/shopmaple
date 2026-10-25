"use client";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Heart, Minus, Plus, ArrowRight } from "lucide-react";
import type { Product } from "@shopmaple/contracts";
import { useShop } from "./shop-provider";
import { money } from "@/lib/format";
export function ProductDetail({
  product,
  initialVariant,
}: {
  product: Product;
  initialVariant?: string;
}) {
  const router = useRouter();
  const [variantId, setVariantId] = useState(
    product.variants.find(
      (v) => v.id === initialVariant || v.id === "preview-" + initialVariant,
    )?.id ??
      product.variants.find((v) => v.available)?.id ??
      product.variants[0]!.id,
  );
  const [image, setImage] = useState(0),
    [quantity, setQuantityValue] = useState(1);
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
  const saved = favourites.includes(product.handle);
  const selectedQuantity =
    cart.items.find((x) => x.variantId === variantId)?.quantity ?? 0;
  async function add() {
    if (await setQuantity(variantId, selectedQuantity + quantity))
      setCartOpen(true);
  }
  const enquiryHref =
    "/pages/contact?" +
    new URLSearchParams({
      product: product.title,
      variant: variant.title,
      sku: variant.sku ?? variant.id,
    });
  return (
    <div className="product-detail">
      <div className="product-gallery">
        <div className="product-main-image">
          <Image
            src={product.images[image]!}
            alt={product.title + " — view " + (image + 1)}
            fill
            sizes="(max-width:800px) 100vw, 56vw"
            preload
          />
        </div>
        {product.images.length > 1 && (
          <div className="product-thumbnails">
            {product.images.map((src, i) => (
              <button
                key={src}
                onClick={() => setImage(i)}
                aria-label={"Show product image " + (i + 1)}
                aria-pressed={image === i}
              >
                <Image src={src} alt="" width={100} height={100} />
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="product-information">
        <div className="breadcrumb">
          <Link href="/">Home</Link>
          <span>/</span>
          <Link href={"/collections/" + product.category}>
            {product.category}
          </Link>
        </div>
        <h1>{product.title}</h1>
        <div className="product-price">
          <strong>{money(variant.pricePaise)}</strong>
          {variant.compareAtPaise &&
          variant.compareAtPaise > variant.pricePaise ? (
            <del>{money(variant.compareAtPaise)}</del>
          ) : null}
        </div>
        <p className="muted">Price shown from the current shop preview.</p>
        {product.variants.length > 1 && (
          <div className="variant-options">
            <label htmlFor="variant">Choose your finish</label>
            <select
              id="variant"
              value={variantId}
              onChange={(e) => {
                setVariantId(e.target.value);
                router.replace(
                  "?variant=" + encodeURIComponent(e.target.value),
                  { scroll: false },
                );
              }}
            >
              {product.variants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.title}
                  {!v.available ? " — enquire" : ""}
                </option>
              ))}
            </select>
          </div>
        )}
        {!enquiry && (
          <div className="quantity-field">
            <label>Quantity</label>
            <div className="quantity-control">
              <button
                aria-label="Decrease quantity"
                disabled={quantity <= 1 || busy}
                onClick={() => setQuantityValue((q) => q - 1)}
              >
                <Minus size={16} />
              </button>
              <output aria-live="polite">{quantity}</output>
              <button
                aria-label="Increase quantity"
                disabled={quantity >= 20 || busy}
                onClick={() => setQuantityValue((q) => q + 1)}
              >
                <Plus size={16} />
              </button>
            </div>
          </div>
        )}
        <div className="purchase-actions">
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
          <button
            className={"icon-button save-detail" + (saved ? " saved" : "")}
            onClick={() => toggleFavourite(product.handle)}
            aria-label={
              saved ? "Remove from saved furniture" : "Save furniture"
            }
            aria-pressed={saved}
          >
            <Heart />
          </button>
        </div>
        {selectedQuantity + quantity > 20 && (
          <p className="error-text">
            You can add up to 20 of this item. For larger orders, contact our
            team.
          </p>
        )}
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <Link href={enquiryHref} className="text-link">
          Speak To Our Team <ArrowRight size={17} />
        </Link>
        <p className="preview-disclosure">
          This is a development preview. Stock, delivery and payment will be
          confirmed before ordering.
        </p>
        <div className="product-accordions">
          <details open>
            <summary>About this piece</summary>
            <p>
              {product.description ||
                "Our team can help with materials, dimensions, finishes and customization for this piece."}
            </p>
          </details>
          <details>
            <summary>Materials, dimensions & care</summary>
            <p>
              Contact our team for the specifications and care guidance for your
              selected variant.
            </p>
            <Link href={enquiryHref}>Request product specifications</Link>
          </details>
          <details>
            <summary>Delivery & returns</summary>
            <p>
              Please confirm delivery serviceability, charges, lead time and
              applicable return terms with our team before placing your order.
            </p>
            <Link href={enquiryHref}>Ask about delivery</Link>
          </details>
        </div>
        {variant.sku && <p className="sku">SKU: {variant.sku}</p>}
      </div>
    </div>
  );
}
