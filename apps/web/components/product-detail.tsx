"use client";
import { useState } from "react";
import { ProductImage } from "./product-image";
import { ProductGallery } from "./product-gallery";
import { ProductVisit } from "./product-visit";
import { ProductRichText } from "./product-rich-text";
import { canAddToCart } from "@/lib/product-availability";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Minus,
  Plus,
  ArrowRight,
  Truck,
  Ruler,
  MessageCircle,
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
  const searchParams = useSearchParams();
  const queryVariant = searchParams ? searchParams.get("variant") ?? undefined : initialVariant;
  const variantImage = (id: string) => {
    const src = presentation?.variantImages[id];
    return src && product.images.includes(src) ? src : undefined;
  };
  const initial =
    product.variants.find((v) => v.id === queryVariant)?.id ??
    product.variants.find((v) => v.id === "preview-" + queryVariant)?.id ??
    product.variants.find((v) => variantImage(v.id))?.id ??
    product.variants.find((v) => v.pricePaise !== null)?.id ??
    product.variants[0]?.id ??
    "";
  const [variantId, setVariantId] = useState(initial);
  const [urlVariant, setUrlVariant] = useState(initial);
  const [image, setImage] = useState(() =>
      Math.max(
        0,
        product.images.indexOf(variantImage(initial) ?? ""),
      ),
    ),
    [quantity, setQuantityValue] = useState(1),
    [zoom, setZoom] = useState(false),
    [pin, setPin] = useState(""),
    [checkedPin, setCheckedPin] = useState("");
  if (urlVariant !== initial) {
    setUrlVariant(initial);
    // History navigation changes the option without remounting the enquiry.
    if (variantId !== initial) {
      setVariantId(initial);
      const src = variantImage(initial);
      if (src) setImage(product.images.indexOf(src));
    }
  }
  const {
    cart,
    setQuantity,
    setCartOpen,
    busy,
    error,
    favourites,
    toggleFavourite,
  } = useShop();
  const variant = product.variants.find((v) => v.id === variantId);
  const enquiry = !product.published || !canAddToCart(variant);
  const selectedQuantity =
    cart.items.find((x) => x.variantId === variantId)?.quantity ?? 0;
  const saved = favourites.includes(product.handle);
  const enquiryHref =
    "/pages/contact?" +
    new URLSearchParams({
      product: product.title,
      ...(variant ? { variant: variant.title } : {}),
      ...(variant?.sku ? { sku: variant.sku } : {}),
      ...(checkedPin ? { pincode: checkedPin } : {}),
    });
  const discounted =
    variant?.pricePaise != null &&
    !!variant.compareAtPaise &&
    variant.compareAtPaise > variant.pricePaise;
  async function add() {
    if (enquiry || !variant) return;
    if (await setQuantity(variantId, selectedQuantity + quantity))
      setCartOpen(true);
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
  const stars = (
    <span className="product-stars" aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} size={19} />
      ))}
    </span>
  );
  return (
    <>
      <ProductVisit handle={product.handle} />
      <div className="pdp-shell">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span>›</span>
          <Link href={"/collections/" + (product.category ?? "all")}>
            {categoryNames[product.category ?? "all"]}
          </Link>
        </nav>
        <div className="product-detail pdp-detail">
          <ProductGallery
            images={product.images}
            title={product.title}
            selected={image}
            onSelect={setImage}
            onZoom={() => setZoom(true)}
            saved={saved}
            onSave={() => toggleFavourite(product.handle)}
          />
          <div className="product-information pdp-info">
            <h1>{product.title}</h1>
            {variant && !variantImage(variant.id) &&
              (product.variants.length > 1 || product.images.length === 0) && (
              <p className="pdp-option-photo-note" role="status">
                Photo for this option unavailable
              </p>
            )}
            {presentation?.reviewLabel === "No reviews" && (
              <a className="pdp-rating" href="#product-reviews">
                {stars}
                <span>No reviews yet</span>
              </a>
            )}
            <div className="pdp-price-block">
              <div>
                <strong>{shopMoney(variant?.pricePaise ?? null)}</strong>
                {discounted && (
                  <span className="pdp-discount">
                    {Math.round(
                      (1 - variant!.pricePaise! / variant!.compareAtPaise!) *
                        100,
                    )}
                    %Off
                  </span>
                )}
              </div>
              {discounted && <del>{shopMoney(variant!.compareAtPaise!)}</del>}
              <p>
                Delivery and applicable taxes will be confirmed by our team.
              </p>
            </div>
            {product.variants.length > 1 && (
              <fieldset className="pdp-variants">
                <legend>
                  Choose your option <span>{variant?.title}</span>
                </legend>
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
                        {variantImage(v.id) ? (
                          <ProductImage
                            src={variantImage(v.id)!}
                            alt=""
                            fill
                            sizes="143px"
                          />
                        ) : (
                          <span className="pdp-variant-placeholder">Photo unavailable</span>
                        )}
                      </span>
                      <span>{v.title}</span>
                      {v.sku?.trim() && product.variants.some(
                        (other) => other.id !== v.id && other.title === v.title &&
                          other.sku?.trim() && other.sku !== v.sku,
                      ) && (
                        <small className="pdp-variant-code">Item code: {v.sku}</small>
                      )}
                      <small>{shopMoney(v.pricePaise)}</small>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            <div className="pdp-help-links">
              <a href="#product-specifications">Dimensions &amp; specifications</a>
              <a href="#delivery-enquiry">Delivery enquiry</a>
            </div>
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
              <p>
                Have a size, fabric or finish in mind? Let’s discuss what’s
                possible.
              </p>
              <Link className="button" href={enquiryHref}>
                SPEAK TO OUR TEAM
              </Link>
            </div>
            <div className="pdp-benefits">
              <div>
                <Truck />
                <span>
                  Delivery enquiry
                  <br />
                  Check your postcode
                </span>
              </div>
              <div>
                <Ruler />
                <span>
                  Your space
                  <br />
                  Ask about sizing
                </span>
              </div>
              <div>
                <MessageCircle />
                <span>
                  Need a hand?
                  <br />
                  Speak to our team
                </span>
              </div>
            </div>
            <p className="preview-disclosure">
              Delivery and payment options will be confirmed before ordering.
            </p>
            <form
              className="pdp-serviceability"
              id="delivery-enquiry"
              onSubmit={(e) => {
                e.preventDefault();
                setCheckedPin(pin);
              }}
            >
              <label htmlFor="delivery-pincode">Delivery enquiry</label>
              <p>
                Add your Indian postcode so our team can confirm charges and
                lead time.
              </p>
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
                <button type="submit">Add postcode</button>
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
                {product.pdpContent ? <ProductRichText content={product.pdpContent.details} /> : <p>
                  {product.description ||
                    "Our team can help with materials, dimensions, finishes and customization for this piece."}
                </p>}
              </details>
              <details>
                <summary>Materials + Care</summary>
                {product.pdpContent ? <ProductRichText content={product.pdpContent.materialsCare} /> : <>
                <p>
                  Contact our team for the materials and care guidance for your
                  selected finish.
                </p>
                <Link href={enquiryHref}>Request care guidance</Link>
                </>}
              </details>
              <details>
                <summary>Shipping + Returns</summary>
                {product.pdpContent ? <ProductRichText content={product.pdpContent.shippingReturns} /> : <>
                <p>
                  Confirm delivery serviceability, charges, lead time and
                  applicable return terms before ordering.
                </p>
                <Link href={enquiryHref}>Ask about delivery</Link>
                </>}
              </details>
              <details id="product-specifications" open>
                <summary>Dimensions &amp; specifications</summary>
                <Link href={enquiryHref}>
                  Request dimensions and specifications
                </Link>
                {variant?.sku && <p>SKU: {variant.sku}</p>}
              </details>
            </div>
            <a className="pdp-phone" href="tel:+918796130252">
              CALL US ON +91 87961 30252
            </a>
          </div>
        </div>
        {product.source.startsWith("shopify") && (
          <section id="product-reviews" className="pdp-reviews">
            <h2>Customer Reviews</h2>
            <p>
              {presentation?.reviewLabel === "No reviews"
                ? "No reviews yet"
                : "Customer reviews are not available on this storefront yet."}
            </p>
            <Link className="button button-outline" href={enquiryHref}>
              Contact Support
            </Link>
          </section>
        )}
      </div>
      <Modal open={zoom} onClose={() => setZoom(false)} title={product.title}>
        <div className="pdp-zoom">
          <ProductImage
            src={product.images[image]}
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
