import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import type { ContactPageContent, ContactSectionKey, StorefrontContent } from "@shopmaple/contracts";
import type { EnquiryContext } from "@/lib/enquiry-context";
import { ContactEnquiryForm, ContactHelpCentre } from "@/components/contact-page-client";
import { ContentImage as Image } from "@/components/content-image";
import { HomeCities } from "@/components/home-sections";
import { resolveContactPage } from "@/lib/contact-page-content";
import { resolveSiteChrome } from "@/lib/site-chrome-defaults";
import { resolveTemplateMedia } from "@/lib/template-media-defaults";

// The showroom's approved map search; the address shown is the footer's, which staff keep current.
const directions = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("A-2/56-57, W.H.S., Kirti Nagar, New Delhi, Delhi, 110015")}`;
const topicIcons: Record<ContactPageContent["categories"][number]["key"], string> = {
  tracking: "/media/contact/truck.svg",
  payment: "/media/contact/receipt.svg",
  account: "/media/contact/user.svg",
  warranty: "/media/contact/shield.svg",
  damage: "/media/contact/box.svg",
};

/** An icon from the design, drawn at its own size. */
function Icon({ name }: { name: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- the design's 36px line icon
  return <img className="contact-way-icon" src={`/media/contact/${name}.svg`} width={36} height={36} alt="" loading="lazy" decoding="async" />;
}
function Arrow() {
  return <span className="contact-button-arrow" aria-hidden="true">→</span>;
}
const newTab = <span className="sr-only"> (opens in a new tab)</span>;

/**
 * The contact page (Figma 298:511 "Maple / Contact / Desktop"; owner, 10 Nov 2026), between the store's own header and
 * footer: the opening and its photo, three ways to reach us, the enquiry, the help centre and the Delhi workshop. Staff
 * choose the regions' order and visibility and every word; the phone number, email and address are the footer's customer
 * care details, and the photos are template artwork.
 */
export function ContactPage({ context, content, site }: {
  context: EnquiryContext;
  content?: ContactPageContent;
  /** The content the page draws its contact details and photos from: the published store, or a staff draft. */
  site?: Pick<StorefrontContent, "siteChrome" | "templateMedia">;
}) {
  const page = resolveContactPage(content);
  const { footer } = resolveSiteChrome(site?.siteChrome);
  const studio = resolveTemplateMedia("contact-studio", site?.templateMedia);
  const workshop = resolveTemplateMedia("contact-workshop", site?.templateMedia);
  const shown = page.sections.filter(section => section.enabled);
  const { call, write, visit } = page.reach;
  const regions: Record<ContactSectionKey, ReactNode> = {
    intro: (
      <section className="contact-intro" data-service-section="intro" aria-labelledby="contact-title">
        <div className="contact-intro-copy">
          <p className="contact-eyebrow">{page.eyebrow}</p>
          <h1 className="contact-title" id="contact-title">{page.heading}</h1>
          <p className="contact-intro-body">{page.introBody}</p>
        </div>
        <div className="contact-intro-media">
          {/* Under 630px wide the frame's 240px floor makes the photo wider than the window: it is drawn 560px wide. */}
          <Image src={studio.image} alt={studio.alt} width={1792} height={768} preload sizes="(max-width: 629px) 560px, 89vw" />
        </div>
      </section>
    ),
    reach: (
      <section className="contact-reach" data-service-section="reach" aria-labelledby="contact-reach-title">
        <h2 className="sr-only" id="contact-reach-title">Ways to reach us</h2>
        <ul className="contact-ways">
          <li className="contact-way">
            <Icon name="phone" />
            <h3>{call.title}</h3>
            <a className="contact-way-detail" href={`tel:${footer.customerPhone}`}>{footer.customerPhoneLabel}</a>
            <p className="contact-way-note">{call.note}</p>
          </li>
          <li className="contact-way">
            <Icon name="mail" />
            <h3>{write.title}</h3>
            <a className="contact-way-detail" href={`mailto:${footer.customerEmail}`}>{footer.customerEmail}</a>
            <p className="contact-way-note">{write.note}</p>
          </li>
          <li className="contact-way">
            <Icon name="pin" />
            <h3>{visit.title}</h3>
            <a className="contact-way-detail" href={directions} target="_blank" rel="noreferrer">{visit.detail}{newTab}</a>
            <p className="contact-way-note">{visit.note}</p>
          </li>
        </ul>
      </section>
    ),
    enquiry: (
      <section className="contact-enquiry" id="contact-enquiry" data-service-section="enquiry" aria-labelledby="contact-enquiry-title">
        <div className="contact-guide">
          <p className="contact-eyebrow">{page.enquiryEyebrow}</p>
          <h2 className="contact-enquiry-title" id="contact-enquiry-title">{page.enquiryHeading}</h2>
          <p className="contact-guide-lead">{page.enquiryBody}</p>
          {page.guidance.map(item => (
            <Fragment key={item.key}>
              <h3 className="contact-guide-title">{item.title}</h3>
              <p className="contact-guide-text">{item.body}</p>
            </Fragment>
          ))}
          <Link className="contact-button contact-bulk-link" href="/bulk-enquiry" data-fill-button="">{page.bulkCta}<Arrow /></Link>
        </div>
        <ContactEnquiryForm heading={page.formHeading} note={page.formNote} topics={page.categories.map(category => category.title)} context={context} />
      </section>
    ),
    help: (
      <section className="contact-help" id="contact-help" data-service-section="help" aria-labelledby="contact-help-title">
        <p className="contact-eyebrow">{page.helpEyebrow}</p>
        <h2 className="contact-help-title" id="contact-help-title">{page.helpHeading}</h2>
        <p className="contact-help-lead">{page.helpBody}</p>
        <ContactHelpCentre topics={page.categories.map(category => ({
          key: category.key, title: category.title, icon: topicIcons[category.key], questions: category.questions,
        }))} />
      </section>
    ),
    visit: (
      <section className="contact-visit" id="contact-visit" data-service-section="visit" aria-labelledby="contact-visit-title">
        <div className="contact-visit-media">
          <Image src={workshop.image} alt={workshop.alt} width={1536} height={1024} loading="lazy"
            sizes="(max-width: 799px) calc(100vw - 40px), 32vw" />
        </div>
        <div className="contact-visit-copy">
          <p className="contact-eyebrow">{page.visitEyebrow}</p>
          <h2 className="contact-visit-title" id="contact-visit-title">{page.visitHeading}</h2>
          <address className="contact-visit-address">{footer.addressLines.map((line, index) => <span key={index}>{line}</span>)}</address>
          <p className="contact-visit-body">{page.visitBody}</p>
          <a className="contact-button contact-directions" href={directions} target="_blank" rel="noreferrer" data-fill-button="">{page.visitCta}<Arrow />{newTab}</a>
        </div>
      </section>
    ),
    cities: (
      <div className="contact-cities" data-service-section="cities">
        <HomeCities content={page.cities} media={site?.templateMedia} />
      </div>
    ),
  };
  return (
    <div className="contact-us" data-store>
      {!shown.some(section => section.key === "intro") && <h1 className="sr-only">{page.heading}</h1>}
      {shown.map(section => <Fragment key={section.key}>{regions[section.key]}</Fragment>)}
    </div>
  );
}
