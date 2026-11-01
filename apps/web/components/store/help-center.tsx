import { Fragment } from "react";
import type { ContactPageContent } from "@shopmaple/contracts";
import { ExternalLink } from "lucide-react";
import { HomeCities } from "../home-sections";
import { HelpEnquiryForm, type EnquiryContext } from "./enquiry-form";
import { HelpTopics } from "./help-topics";
import { SectionHeading, eyebrow } from "./section-heading";

const mapAddress = "A-2/56-57, W.H.S., Kirti Nagar, New Delhi, Delhi, 110015";
const mapHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapAddress)}`;
const promises = [
  ["Quick response", "We respond within 24 hours."],
  ["Transparent pricing", "Clear quotes, with no hidden costs."],
  ["End-to-end support", "From the first conversation to final installation."],
] as const;
const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

/** The headline breaks after each sentence on wider screens ("Tell us what you need. / We’ll help you shape it."). */
function Headline({ text }: { text: string }) {
  return text.split(/(?<=[.!?])\s+/).map((sentence, index) => (
    <Fragment key={index}>
      {index > 0 && " "}
      <span className="min-[751px]:block">{sentence}</span>
    </Fragment>
  ));
}

/** The frame's 24 px burgundy tick. */
function Tick() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-6 shrink-0 text-brand">
      <path d="M4 12L9 17L21 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The showroom's address and map, under the help topics (the frame has no map; the page keeps it). */
function Showroom() {
  return (
    <div data-showroom className="flex flex-col gap-4 bg-cream p-6 font-body text-espresso">
      <h3 className={eyebrow}>Visit our showroom</h3>
      <ul data-contact-links>
        <li>
          <a href={mapHref} target="_blank" rel="noreferrer" className={"text-ui leading-[1.45] text-espresso no-underline hover:text-brand " + focusRing}>
            A-2/56-57, W.H.S., Kirti Nagar,
            <br />
            New Delhi, Delhi 110015
          </a>
        </li>
      </ul>
      <div data-map-card className="relative h-[160px] overflow-hidden rounded-[6px] border border-solid border-sand bg-white">
        <iframe
          title="Maple Furnishers showroom in Kirti Nagar"
          src={`https://maps.google.com/maps?q=${encodeURIComponent(mapAddress)}&z=14&output=embed`}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="block size-full border-0"
        />
        <a href={mapHref} target="_blank" rel="noreferrer"
          className={"absolute bottom-3 left-3 inline-flex h-8 items-center gap-1.5 rounded-[6px] border border-solid border-sand bg-white px-2.5 text-label font-bold text-espresso no-underline hover:text-brand " + focusRing}>
          View on Google Maps <ExternalLink aria-hidden="true" className="size-3.5" />
        </a>
      </div>
    </div>
  );
}

/** Help Center (/pages/contact), "Maple / PDF Review / Help Center" frame. */
export function HelpCenter({ context, content }: { context: EnquiryContext; content: ContactPageContent }) {
  const sections = {
    intro: (
      <section data-store data-service-section="intro" className="bg-cream p-16 font-body text-espresso max-[1140px]:px-8 max-[1140px]:py-12 max-[750px]:px-4 max-[750px]:py-10">
        <div className="mx-auto grid max-w-[1312px] grid-cols-[minmax(0,600fr)_minmax(0,648fr)] items-start gap-16 max-[1140px]:grid-cols-1 max-[1140px]:gap-10">
          <div className="flex flex-col gap-6 max-[750px]:gap-5">
            <p data-contact-eyebrow className={eyebrow}>{content.eyebrow}</p>
            <h1 className="max-w-[560px] font-serif text-[54px] leading-[1.1] font-bold text-espresso max-[750px]:text-[36px]">
              <Headline text={content.heading} />
            </h1>
            <p data-contact-lead className="max-w-[530px] text-[18px] leading-[1.45] max-[750px]:text-price">
              Share your ideas. Our team will come back within 24 hours with options, pricing, and a clear timeline.
            </p>
            <ul data-contact-promises className="flex flex-col gap-6 max-[750px]:gap-5">
              {promises.map(([title, detail]) => (
                <li key={title} className="flex items-start gap-3.5">
                  <Tick />
                  <p className="flex flex-col gap-0.5 leading-[1.45]">
                    <strong className="text-price font-bold">{title}</strong>
                    <span className="text-ui text-taupe">{detail}</span>
                  </p>
                </li>
              ))}
            </ul>
          </div>
          <div data-enquiry-card className="min-w-0 rounded-[14px] bg-white p-7 max-[750px]:p-5">
            <HelpEnquiryForm context={context} />
          </div>
        </div>
      </section>
    ),
    help: (
      <section data-store data-service-section="help" className="bg-linen p-16 font-body text-espresso max-[1140px]:px-8 max-[1140px]:py-12 max-[750px]:px-4 max-[750px]:py-10">
        <div className="mx-auto flex max-w-[1312px] flex-col gap-7">
          <header data-section-title>
            <SectionHeading eyebrow={content.helpEyebrow} title={content.helpHeading} />
          </header>
          <HelpTopics
            categories={content.categories}
            aside={<Showroom />}
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
