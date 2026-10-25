import Link from "next/link";
import { notFound } from "next/navigation";
export default async function ContactPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  if (!["contact", "bulk-enquiry"].includes(slug)) notFound();
  const q = await searchParams;
  const product = typeof q.product === "string" ? q.product.slice(0, 500) : "";
  const variant = typeof q.variant === "string" ? q.variant.slice(0, 300) : "";
  const sku = typeof q.sku === "string" ? q.sku.slice(0, 160) : "";
  const body = product
    ? "I would like to enquire about " +
      product +
      "\nVariant: " +
      variant +
      "\nSKU: " +
      sku +
      "\n\nPlease share specifications, availability and delivery details."
    : "I would like to discuss a furniture project with Maple.";
  const mail =
    "mailto:contact@maplefurnishers.com?" +
    new URLSearchParams({
      subject: product ? "Enquiry: " + product : "Furniture enquiry",
      body,
    });
  return (
    <section className="page-section contact-page">
      <div className="breadcrumb">
        <Link href="/">Home</Link>
        <span>/</span>Contact
      </div>
      <h1>
        {slug === "bulk-enquiry"
          ? "Let’s Build Something Lasting"
          : "Have a Space in Mind?"}
      </h1>
      <p>
        Whether the brief is a single statement chair or a complete room, the
        process starts with a conversation.
      </p>
      {product && (
        <div className="enquiry-context">
          <h2>{product}</h2>
          <p>{variant}</p>
          {sku && <p>SKU: {sku}</p>}
        </div>
      )}
      <div className="button-row">
        <a href={mail} className="button">
          Email our team
        </a>
        <a href="tel:+919211819727" className="button secondary">
          Call +91 9211819727
        </a>
      </div>
      <p className="muted">
        Email opens in your email app with the selected product details
        included.
      </p>
      <address>
        A-2/56–57, W.H.S, Kirti Nagar,
        <br />
        New Delhi, Delhi, 110015
      </address>
    </section>
  );
}
