import { Fragment } from "react";
import type { ContactPageContent } from "@shopmaple/contracts";
import { ExternalLink, Mail, MapPin, Phone } from "lucide-react";
import { HomeCities } from "../home-sections";
import { HelpEnquiryForm, type EnquiryContext } from "./enquiry-form";
import { HelpTopics } from "./help-topics";

const helpIcons = {
  tracking: "Del_mf.svg",
  payment: "engaged_3.svg",
  account: "engaged_2.svg",
  warranty: "qc_mf.svg",
  damage: "qc_mf.svg",
};
const mapAddress = "A-2/56-57, W.H.S., Kirti Nagar, New Delhi, Delhi, 110015";
const mapHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapAddress)}`;
const eyebrow = "text-label font-semibold tracking-[0.14em] uppercase";

/**
 * The headline breaks after each sentence on wider screens, and the words after "help" take the
 * design's italic burgundy accent ("We'll help *you shape it*"). Edited headings without that
 * phrase render plainly.
 */
function Headline({ text }: { text: string }) {
  const sentences = text.split(/(?<=[.!?])\s+/);
  return sentences.map((sentence, index) => {
    const accent = index === sentences.length - 1 ? /^(.*\bhelp\s+)(\S.*)$/su.exec(sentence) : null;
    return (
      <Fragment key={index}>
        {index > 0 && " "}
        <span className="sm:block">
          {accent ? (
            <>
              {accent[1]}
              <em data-heading-accent className="text-brand italic">{accent[2]}</em>
            </>
          ) : sentence}
        </span>
      </Fragment>
    );
  });
}

const contactRow = "group flex items-start gap-3.5 text-ui text-espresso no-underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand";
const rowIcon = "grid size-9 shrink-0 place-items-center rounded-full bg-cream text-brand transition-colors group-hover:bg-brand group-hover:text-white";
const rowText = "pt-[7px] leading-[1.55] [overflow-wrap:anywhere] group-hover:text-brand";

/** Help Center (/pages/contact), "Maple Website review" design. */
export function HelpCenter({ context, content }: { context: EnquiryContext; content: ContactPageContent }) {
  const sections = {
    intro: (
      <section data-store data-service-section="intro" className="bg-linen font-body text-espresso">
        <div className="mx-auto grid max-w-[1320px] items-start gap-10 px-4 py-10 md:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,560px)] lg:gap-14 lg:py-16 xl:px-12">
          <div className="grid gap-6">
            <div className="grid gap-3">
              <p data-contact-eyebrow className={eyebrow + " text-brand"}>{content.eyebrow}</p>
              <h1 className="max-w-[560px] font-serif text-[34px] leading-[1.12] font-medium tracking-[-0.01em] text-espresso sm:text-[44px]">
                <Headline text={content.heading} />
              </h1>
            </div>
            <ul data-contact-links className="grid gap-4">
              <li>
                <a href="tel:+918796130252" className={contactRow}>
                  <span className={rowIcon}><Phone aria-hidden="true" className="size-4" /></span>
                  <span className={rowText}>+91 87961 30252</span>
                </a>
              </li>
              <li>
                <a href="mailto:contact@maplefurnishers.com" className={contactRow}>
                  <span className={rowIcon}><Mail aria-hidden="true" className="size-4" /></span>
                  <span className={rowText}>contact@maplefurnishers.com</span>
                </a>
              </li>
              <li>
                <a href={mapHref} target="_blank" rel="noreferrer" className={contactRow}>
                  <span className={rowIcon}><MapPin aria-hidden="true" className="size-4" /></span>
                  <span className={rowText}>
                    A-2/56 - 57, W.H.S, Kirti Nagar,
                    <br />
                    New Delhi, Delhi, 110015
                  </span>
                </a>
              </li>
            </ul>
            <div data-map-card className="relative h-[220px] max-w-[520px] overflow-hidden rounded-xl border border-solid border-sand bg-cream">
              <iframe
                title="Maple Furnishers showroom in Kirti Nagar"
                src={`https://maps.google.com/maps?q=${encodeURIComponent(mapAddress)}&z=14&output=embed`}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="block size-full border-0"
              />
              <a href={mapHref} target="_blank" rel="noreferrer"
                className="absolute bottom-3 left-3 inline-flex h-9 items-center gap-2 rounded-sm border border-solid border-sand bg-white px-3 text-meta font-semibold text-espresso no-underline shadow-[0_2px_8px_rgba(41,37,31,0.12)] transition-colors hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
                View on Google Maps <ExternalLink aria-hidden="true" className="size-3.5" />
              </a>
            </div>
          </div>
          <div data-enquiry-card className="min-w-0 rounded-2xl border border-solid border-sand bg-white p-5 shadow-[0_18px_40px_-24px_rgba(41,37,31,0.28)] sm:p-7">
            <HelpEnquiryForm context={context} />
          </div>
        </div>
      </section>
    ),
    help: (
      <section data-store data-service-section="help" className="bg-white font-body text-espresso">
        <div className="mx-auto max-w-[1320px] px-4 py-12 md:px-8 lg:py-16 xl:px-12">
          <header data-section-title className="mb-8 grid gap-2 text-center">
            <p className={eyebrow + " text-taupe"}>{content.helpEyebrow}</p>
            <h2 className="font-serif text-[34px] leading-[1.1] font-medium text-brand italic sm:text-h1">{content.helpHeading}</h2>
          </header>
          <HelpTopics
            categories={content.categories.map(category => ({
              ...category,
              icon: helpIcons[category.key],
            }))}
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
    <div data-help-center className="text-ink">
      {!visible.some(section => section.key === "intro") && <h1 className="sr-only">{content.heading}</h1>}
      {visible.map(section => <Fragment key={section.key}>{sections[section.key]}</Fragment>)}
    </div>
  );
}
