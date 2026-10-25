import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowRight, Check } from "lucide-react";
import {
  ContactForm,
  ContactHelp,
  type EnquiryContext,
} from "@/components/contact-form";
import { HomeCities } from "@/components/home-sections";
import { shopFile } from "@/lib/format";
import { contactCategories } from "../contact-content";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return {
    title:
      slug === "bulk-enquiry"
        ? "Bulk Enquiry | Maple Furnishers"
        : "Contact Us | Maple Furnishers",
  };
}

export default async function ContactPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  if (!["contact", "bulk-enquiry"].includes(slug)) notFound();
  const query = await searchParams;
  const text = (name: string, limit: number) =>
    typeof query[name] === "string" ? query[name].slice(0, limit) : "";
  const context = {
    product: text("product", 500),
    variant: text("variant", 300),
    sku: text("sku", 160),
    pincode:
      /^[1-9][0-9]{5}$/.test(text("pincode", 6)) &&
      typeof query.pincode === "string" &&
      query.pincode.length === 6
        ? query.pincode
        : "",
  };
  return slug === "bulk-enquiry" ? (
    <BulkEnquiry context={context} />
  ) : (
    <Contact context={context} />
  );
}

function Contact({ context }: { context: EnquiryContext }) {
  const mapAddress =
    "B3, Timber Block, WHS Block, Ware Housing Scheme, Kirti Nagar, New Delhi, Delhi, 110015";
  return (
    <div className="cp-page">
      <div className="cp-divider cp-divider-top" />
      <section className="cp-contact-intro cp-container">
        <div className="cp-contact-details">
          <p className="cp-contact-eyebrow">GET IN TOUCH</p>
          <h1>Tell us what you need. We’ll help you shape it</h1>
          <div className="cp-contact-links">
            <a href="tel:+918796130252">
              <Image src={shopFile("Call.svg")} alt="" width={40} height={40} />
              <span>+91 87961 30252</span>
            </a>
            <a href="mailto:contact@maplefurnishers.com">
              <Image src={shopFile("Mail.svg")} alt="" width={40} height={40} />
              <span>contact@maplefurnishers.com</span>
            </a>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapAddress)}`}
              target="_blank"
              rel="noreferrer"
            >
              <Image src={shopFile("Map.svg")} alt="" width={40} height={40} />
              <span>
                A-2/56 - 57, W.H.S, Kirti Nagar,
                <br />
                New Delhi, Delhi, 110015
              </span>
            </a>
          </div>
          <iframe
            className="cp-location-map"
            title="Maple Furnishers showroom in Kirti Nagar"
            src={`https://maps.google.com/maps?q=${encodeURIComponent(mapAddress)}&z=14&output=embed`}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
        <ContactForm context={context} />
      </section>
      <div className="cp-divider" />
      <section className="cp-help-section">
        <header className="cp-container cp-section-title">
          <p>Everything we do starts with why</p>
          <h2>Browse from category</h2>
        </header>
        <ContactHelp categories={contactCategories} />
      </section>
      <HomeCities />
    </div>
  );
}

const steps = [
  {
    image: "1_c060f484-f1f4-4f8a-826e-228632252413.jpg",
    title: "Meet Your Designer",
    text: "Bring your ideas, inspirations, and budget. Our expert designer will understand your needs and start shaping a plan that fits your lifestyle.",
  },
  {
    image: "2.jpg",
    title: "Finalize Your Design",
    text: "Work one-on-one with your designer to refine the details. Get realistic 3D renders so you can visualize your space before it comes to life.",
  },
  {
    image: "3.jpg",
    title: "Bring It Home",
    text: "Relax while we handle the rest — from crafting to installation. Shop directly from your design and watch your dream home come alive.",
  },
];
function BulkEnquiry({ context }: { context: EnquiryContext }) {
  return (
    <div className="cp-page cp-bulk-page">
      <section className="cp-bulk-hero">
        <div className="cp-bulk-scene">
          <div className="cp-bulk-image">
            <Image
              src={shopFile(
                "Living_Room_9ba370f6-00a3-4019-9900-b28fb6734ca6.png",
              )}
              alt="A contemporary living room with Maple furniture"
              fill
              sizes="100vw"
              priority
            />
          </div>
          <div className="cp-bulk-shade" />
          <div className="cp-bulk-content">
            <div className="cp-bulk-card">
              <p className="cp-bulk-eyebrow">Place Your Bulk Orders</p>
              <h1>Home Interior</h1>
              <p className="cp-bulk-subtitle">
                Work 1:1 with expert interior designers
              </p>
              <div className="cp-bulk-rule" />
              <div className="cp-bulk-form-wrap">
                <ContactForm bulk context={context} />
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="cp-container cp-bulk-trust">
        <h2>Trusted By Designers, Businesses &amp; Modern Spaces</h2>
        <div className="cp-bulk-proof">
          <div>
            <strong>100+</strong>
            <p>Projects Delivered</p>
          </div>
          {[
            ["price-tag-svgrepo-com_1.svg", "Price match guarantee"],
            ["icon_maple.svg", "250+ Steps Quality Check"],
            ["Cover_Image_Maple_4.svg", "Premium Materials"],
            ["Cover_Image_Maple_2.svg", "Custom Solutions"],
          ].map(([image, title]) => (
            <div key={title}>
              <Image src={shopFile(image!)} alt="" width={80} height={80} />
              <p>{title}</p>
            </div>
          ))}
        </div>
      </section>
      <div className="cp-divider cp-divider-inset" />
      <section className="cp-container cp-bulk-process">
        <header className="cp-section-title">
          <p>Here’s How We Bring Your Dream Space to Life</p>
          <h2>How it Works</h2>
        </header>
        <div className="cp-process-grid">
          {steps.map((step, index) => (
            <article key={step.title}>
              <div className="cp-process-image">
                <Image
                  src={shopFile(step.image)}
                  alt={step.title}
                  width={600}
                  height={400}
                  sizes="(max-width: 749px) 85vw, 33vw"
                />
                <span>0{index + 1}</span>
              </div>
              <div className="cp-process-text">
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
      <div className="cp-divider" />
      <section className="cp-indiamart">
        <div className="cp-indiamart-copy">
          <p className="cp-business-badge">★ TRUSTED BY BUSINESSES</p>
          <h2>Looking for Bulk Orders?</h2>
          <p>
            Source directly from one of India&apos;s trusted furnishing
            suppliers. Hotels, Interior Designers, Contractors, Offices,
            Retailers &amp; Project Buyers can place large-volume requirements
            through our IndiaMART business channel.
          </p>
          <ul>
            {[
              "Factory & Wholesale Pricing",
              "Bulk Quantity Support",
              "Custom Sizes & Specifications",
              "Dedicated Business Assistance",
              "PAN India Delivery",
            ].map((feature) => (
              <li key={feature}>
                <span>
                  <Check size={16} aria-hidden="true" />
                </span>
                {feature}
              </li>
            ))}
          </ul>
          <div className="cp-indiamart-cta">
            <a
              className="button"
              href="https://m.indiamart.com/maple-furnishers/"
              target="_blank"
              rel="noreferrer"
            >
              Request Bulk Quote <ArrowRight size={18} />
            </a>
            <Image
              src={shopFile("indiamart-logo.png")}
              width={100}
              height={60}
              alt="IndiaMART"
            />
          </div>
          <p className="cp-business-trust">
            Secure • Verified • Trusted by Businesses
          </p>
        </div>
        <div className="cp-indiamart-image">
          <Image
            src={shopFile("Chair_bulk.png")}
            alt="Upholstered chairs for commercial furnishing projects"
            width={900}
            height={1000}
            sizes="(max-width: 749px) 100vw, 50vw"
          />
        </div>
      </section>
      <div className="cp-divider" />
      <HomeCities />
    </div>
  );
}
