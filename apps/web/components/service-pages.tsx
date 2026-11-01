import Image from "next/image";
import { Fragment } from "react";
import Link from "next/link";
import type { BulkPageContent, ContactPageContent, ReturnsPageContent } from "@shopmaple/contracts";
import { ArrowRight, Check } from "lucide-react";
import {
  ContactForm,
  ContactHelp,
  type EnquiryContext,
} from "@/components/contact-form";
import { HomeCities } from "@/components/home-sections";
import { shopFile } from "@/lib/format";

export const emptyEnquiryContext: EnquiryContext = { product: "", variant: "", sku: "", pincode: "" };
const helpIcons = {
  tracking: "Del_mf.svg",
  payment: "engaged_3.svg",
  account: "engaged_2.svg",
  warranty: "qc_mf.svg",
  damage: "qc_mf.svg",
};
export function Contact({ context, content }: { context: EnquiryContext; content: ContactPageContent }) {
  const mapAddress = "A-2/56-57, W.H.S., Kirti Nagar, New Delhi, Delhi, 110015";
  const sections = {
    intro: (
      <section className="cp-contact-intro cp-container" data-service-section="intro">
        <div className="cp-contact-details">
          <p className="cp-contact-eyebrow">{content.eyebrow}</p>
          <h1>{content.heading}</h1>
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
    ),
    help: (
      <section className="cp-help-section" data-service-section="help">
        <header className="cp-container cp-section-title">
          <p>{content.helpEyebrow}</p>
          <h2>{content.helpHeading}</h2>
        </header>
        <ContactHelp
          categories={content.categories.map(category => ({
            ...category,
            icon: helpIcons[category.key],
          }))}
        />
      </section>
    ),
    cities: (
      <div data-service-section="cities">
        <HomeCities content={content.cities} />
      </div>
    ),
  };
  const visible = content.sections.filter(section => section.enabled);
  return (
    <div className="cp-page">
      {!visible.some(section => section.key === "intro") && <h1 className="sr-only">{content.heading}</h1>}
      {visible.map((section, index) => (
        <Fragment key={section.key}>
          {index === 0 && section.key === "intro" && <div className="cp-divider cp-divider-top" />}
          {index > 0 && visible[index - 1]?.key === "intro" && <div className="cp-divider" />}
          {sections[section.key]}
        </Fragment>
      ))}
    </div>
  );
}
const stepImages = {
  meet: "1_c060f484-f1f4-4f8a-826e-228632252413.jpg",
  design: "2.jpg",
  deliver: "3.jpg",
};
const trustIcons = {
  price: "price-tag-svgrepo-com_1.svg",
  quality: "icon_maple.svg",
  materials: "Cover_Image_Maple_4.svg",
  custom: "Cover_Image_Maple_2.svg",
};
export function BulkEnquiry({ context, content }: { context: EnquiryContext; content: BulkPageContent }) {
  const sections = {
    hero: (
      <section className="cp-bulk-hero" data-service-section="hero">
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
              <p className="cp-bulk-eyebrow">{content.eyebrow}</p>
              <h1>{content.heading}</h1>
              <p className="cp-bulk-subtitle">
                {content.subtitle}
              </p>
              <div className="cp-bulk-rule" />
              <div className="cp-bulk-form-wrap">
                <ContactForm bulk context={context} />
              </div>
            </div>
          </div>
        </div>
      </section>
    ),
    trust: (
      <section className="cp-container cp-bulk-trust" data-service-section="trust">
        <h2>{content.trust.heading}</h2>
        <div className="cp-bulk-proof">
          <div>
            <strong>{content.trust.metricValue}</strong>
            <p>{content.trust.metricLabel}</p>
          </div>
          {content.trust.items.map(item => (
            <div key={item.key}>
              <Image src={shopFile(trustIcons[item.key])} alt="" width={80} height={80} />
              <p>{item.title}</p>
            </div>
          ))}
        </div>
      </section>
    ),
    process: (
      <section className="cp-container cp-bulk-process" data-service-section="process">
        <header className="cp-section-title">
          <p>{content.process.eyebrow}</p>
          <h2>{content.process.heading}</h2>
        </header>
        <div className="cp-process-grid">
          {content.process.steps.map((step, index) => (
            <article key={step.key}>
              <div className="cp-process-image">
                <Image
                  src={shopFile(stepImages[step.key])}
                  alt={step.title}
                  width={600}
                  height={400}
                  sizes="(max-width: 749px) 85vw, 33vw"
                />
                <span>0{index + 1}</span>
              </div>
              <div className="cp-process-text">
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    ),
    business: (
      <section className="cp-indiamart" data-service-section="business">
        <div className="cp-indiamart-copy">
          <p className="cp-business-badge">{content.business.badge}</p>
          <h2>{content.business.heading}</h2>
          <p>{content.business.body}</p>
          <ul>
            {content.business.features.map((feature, index) => (
              <li key={index}>
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
              {content.business.cta} <ArrowRight size={18} />
            </a>
            <Image
              src={shopFile("indiamart-logo.png")}
              width={100}
              height={60}
              alt="IndiaMART"
            />
          </div>
          <p className="cp-business-trust">
            {content.business.trust}
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
    ),
    cities: (
      <div data-service-section="cities">
        <HomeCities content={content.cities} />
      </div>
    ),
  };
  const visible = content.sections.filter(section => section.enabled);
  return (
    <div className="cp-page cp-bulk-page">
      {!visible.some(section => section.key === "hero") && <h1 className="sr-only">{content.heading}</h1>}
      {visible.map((section, index) => {
        const previous = visible[index - 1]?.key;
        return (
          <Fragment key={section.key}>
            {previous === "trust" && <div className="cp-divider cp-divider-inset" />}
            {(previous === "process" || previous === "business") && <div className="cp-divider" />}
            {sections[section.key]}
          </Fragment>
        );
      })}
    </div>
  );
}
export function ReturnsPageContent({ content }: { content: ReturnsPageContent }) {
  return (
    <section className="editorial-page">
      <h1>{content.heading}</h1>
      <p>
        <Link href="/policies/refund-policy">
          {content.policyLabel}
        </Link>
      </p>
      <p>
        {content.intro}{" "}This form saves an enquiry; it does
        not automatically approve a return or issue a refund.
      </p>
      <ContactForm
        context={{
          product: "Return & Exchange",
          variant: "",
          sku: "",
          pincode: "",
        }}
      />
    </section>
  );
}
