import { Fragment, type ReactNode } from "react";
import type { BulkPageContent, BulkSectionKey, SiteChrome, TemplateMedia } from "@shopmaple/contracts";
import { ArrowRight, Check } from "lucide-react";
import { BulkPageFrame, BulkProposalForm } from "@/components/bulk-enquiry-form";
import { ContentImage as Image } from "@/components/content-image";
import type { EnquiryContext } from "@/lib/enquiry-context";
import { resolveBulkPage, type ResolvedBulkPage } from "@/lib/bulk-enquiry-defaults";
import { resolveSiteChrome } from "@/lib/site-chrome-defaults";
import { resolveTemplateMedia } from "@/lib/template-media-defaults";

const indiaMart = "https://m.indiamart.com/maple-furnishers/";
/** The design's line icons (Figma 298:983); the price promise, which the redesign retired, keeps one drawn to match. */
const promiseIcons: Record<ResolvedBulkPage["trust"]["items"][number]["key"], string> = {
  custom: "/media/bulk-enquiry/ruler.svg",
  materials: "/media/bulk-enquiry/layers.svg",
  quality: "/media/bulk-enquiry/shield.svg",
  delivery: "/media/bulk-enquiry/truck.svg",
  price: "/media/bulk-enquiry/tag.svg",
};

/** Text whose line breaks are kept (a heading set on two lines in the design); a space after each break keeps the words
    apart where a phone lets the lines run on, and for anything reading the text. */
function Lines({ text }: { text: string }) {
  return text.split("\n").map((line, index) => <Fragment key={index}>{index > 0 && <><br />{" "}</>}{line}</Fragment>);
}
/** Words split at their slashes ("Maple / Projects & partnerships"), the slashes set apart as in the design. */
function Slashed({ text }: { text: string }) {
  return text.split("/").map(part => part.trim()).filter(Boolean)
    .map((part, index) => <Fragment key={index}>{index > 0 && <> <span className="bulk-slash" aria-hidden="true">/</span> </>}{part}</Fragment>);
}
function Eyebrow({ text }: { text: string }) {
  return <p className="bulk-eyebrow" data-bulk-eyebrow=""><Slashed text={text} /></p>;
}

/**
 * Bulk Enquiry (Figma 298:924, owner 10 Nov 2026), between the site's own header and footer: the opening over a lounge,
 * the figures, the advantages, the three steps, the proposal form, the IndiaMART band and the cities. Staff choose the
 * regions' order and visibility and every word; the photos are template artwork and the phone and email are the footer's
 * bulk contact.
 */
export function BulkEnquiry({ context, content, site }: {
  context: EnquiryContext; content?: BulkPageContent;
  /** The storefront document the page belongs to (published, or the staff preview's draft): its artwork and footer. */
  site?: { templateMedia?: TemplateMedia; siteChrome?: SiteChrome };
}) {
  const page = resolveBulkPage(content);
  const shown = new Set(page.sections.filter(section => section.enabled).map(section => section.key));
  const media = site?.templateMedia;
  const footer = resolveSiteChrome(site?.siteChrome).footer;
  const opening = resolveTemplateMedia("bulk-hero", media);
  const materials = resolveTemplateMedia("bulk-proposal", media);
  const figures = [{ key: "projects", value: page.trust.metricValue, label: page.trust.metricLabel }, ...page.figures];
  const regions: Record<BulkSectionKey, ReactNode> = {
    hero: (
      <section className="bulk-hero" data-service-section="hero" aria-labelledby="bulk-hero-title">
        <div className="bulk-hero-media">
          <Image src={opening.image} alt={opening.alt} fill sizes="100vw" preload />
        </div>
        <div className="bulk-hero-intro">
          <Eyebrow text={page.eyebrow} />
          <h1 className="bulk-hero-title" id="bulk-hero-title"><Lines text={page.heading} /></h1>
          <p className="bulk-hero-subtitle" data-bulk-subtitle=""><Lines text={page.subtitle} /></p>
          {shown.has("proposal") && (
            <a className="bulk-button bulk-button-light bulk-hero-cta" href="#request-proposal" data-bulk-cta="" data-fill-button="light">
              <span>{page.heroCta}</span> <ArrowRight aria-hidden="true" strokeWidth={1.5} />
            </a>
          )}
          <p className="bulk-hero-note" data-bulk-note=""><Slashed text={page.heroNote} /></p>
        </div>
      </section>
    ),
    figures: (
      <section className="bulk-figures" data-service-section="figures" aria-labelledby="bulk-figures-title">
        <h2 className="sr-only" id="bulk-figures-title">Maple in figures</h2>
        <ul className="bulk-figures-list">
          {figures.map(figure => (
            <li key={figure.key} className="bulk-figure" data-bulk-figure={figure.key} data-reveal="">
              <p className="bulk-figure-value" data-figure-value="">{figure.value}</p>
              <p className="bulk-figure-label" data-figure-label="">{figure.label}</p>
            </li>
          ))}
        </ul>
      </section>
    ),
    trust: (
      <section className="bulk-advantages" data-service-section="trust" aria-labelledby="bulk-advantages-title">
        <div className="bulk-head" data-reveal="">
          <Eyebrow text={page.trust.eyebrow} />
          <h2 className="bulk-title" id="bulk-advantages-title"><Lines text={page.trust.heading} /></h2>
          <p className="bulk-lede" data-bulk-lede="">{page.trust.body}</p>
        </div>
        <ul className="bulk-advantages-list">
          {page.trust.items.map(item => (
            <li key={item.key} className="bulk-advantage" data-bulk-advantage={item.key} data-reveal="">
              {/* eslint-disable-next-line @next/next/no-img-element -- the design's 42px line icon */}
              <img src={promiseIcons[item.key]} width={42} height={42} alt="" loading="lazy" decoding="async" />
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </li>
          ))}
        </ul>
      </section>
    ),
    process: (
      <section className="bulk-process" data-service-section="process" aria-labelledby="bulk-process-title">
        <div className="bulk-head" data-reveal="">
          <Eyebrow text={page.process.eyebrow} />
          <h2 className="bulk-title" id="bulk-process-title"><Lines text={page.process.heading} /></h2>
        </div>
        <ol className="bulk-steps">
          {page.process.steps.map((step, index) => {
            const art = resolveTemplateMedia(`bulk-step-${step.key}`, media);
            return (
              <li key={step.key} className="bulk-step" data-bulk-step={step.key} data-reveal="">
                <div className="bulk-step-media">
                  <Image src={art.image} alt={art.alt} width={1254} height={1254} loading="lazy"
                    sizes="(max-width: 599px) calc(100vw - 40px), (max-width: 899px) 40vw, 29vw" />
                </div>
                <div className="bulk-step-copy">
                  <p className="bulk-step-number" data-step-number="" aria-hidden="true">{String(index + 1).padStart(2, "0")}</p>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    ),
    proposal: (
      <section className="bulk-proposal" id="request-proposal" data-service-section="proposal" aria-labelledby="bulk-proposal-title">
        <div className="bulk-proposal-intro" data-reveal="">
          <Eyebrow text={page.proposal.eyebrow} />
          <h2 className="bulk-proposal-title" id="bulk-proposal-title"><Lines text={page.proposal.heading} /></h2>
          <p className="bulk-lede" data-bulk-lede="">{page.proposal.body}</p>
        </div>
        <div className="bulk-proposal-aside" data-reveal="">
          <div className="bulk-proposal-media">
            <Image src={materials.image} alt={materials.alt} width={1280} height={1024} loading="lazy" sizes="(max-width: 999px) calc(100vw - 40px), 31vw" />
          </div>
          <div className="bulk-conversation" data-bulk-conversation="">
            <h3>{page.proposal.contactHeading}</h3>
            <p>
              <a href={`tel:${footer.bulkPhone}`}>{footer.bulkPhoneLabel}</a>
              <a href={`mailto:${footer.bulkEmail}`}>{footer.bulkEmail}</a>
            </p>
          </div>
        </div>
        <div className="bulk-proposal-form" data-reveal="">
          <BulkProposalForm copy={page.proposal} email={footer.bulkEmail} context={context} />
        </div>
      </section>
    ),
    business: (
      <section className="bulk-business" data-service-section="business" aria-labelledby="bulk-business-title">
        <div className="bulk-business-copy" data-reveal="">
          <Eyebrow text={page.business.badge} />
          <h2 className="bulk-business-title" id="bulk-business-title"><Lines text={page.business.heading} /></h2>
          <p className="bulk-lede" data-bulk-lede="">{page.business.body}</p>
        </div>
        <div className="bulk-business-support" data-reveal="">
          <ul className="bulk-checks" data-bulk-checks="">
            {page.business.features.map((feature, index) => (
              <li key={index}><Check aria-hidden="true" strokeWidth={2} />{feature}</li>
            ))}
          </ul>
          <a className="bulk-button bulk-button-sand" href={indiaMart} target="_blank" rel="noreferrer" aria-describedby="bulk-quote-note"
            data-bulk-quote="" data-fill-button="light">
            <span>{page.business.cta}</span> <ArrowRight aria-hidden="true" strokeWidth={1.5} />
          </a>
          <span id="bulk-quote-note" hidden>Opens Maple’s IndiaMART page in a new tab</span>
        </div>
      </section>
    ),
    cities: (
      <section className="bulk-reach" data-service-section="cities" aria-labelledby="bulk-reach-title">
        <div className="bulk-head" data-reveal="">
          <Eyebrow text={page.cities.eyebrow} />
          <h2 className="bulk-title" id="bulk-reach-title"><Lines text={page.cities.heading} /></h2>
          <p className="bulk-lede" data-bulk-cities-line="">{page.cities.body}</p>
        </div>
      </section>
    ),
  };
  return (
    <BulkPageFrame>
      {!shown.has("hero") && <h1 className="sr-only"><Lines text={page.heading} /></h1>}
      {page.sections.filter(section => section.enabled).map(section => <Fragment key={section.key}>{regions[section.key]}</Fragment>)}
    </BulkPageFrame>
  );
}
