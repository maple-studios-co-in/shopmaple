import Image from "next/image";
import Link from "next/link";
import { Fragment, type CSSProperties } from "react";
import { Instagram, Linkedin } from "lucide-react";
import type { ChromeLink, SiteChrome } from "@shopmaple/contracts";
import { DismissibleDetails } from "./dismissible-details";
import { textLink } from "./current-look";
import { defaultSiteChrome, chromeHref } from "@/lib/site-chrome-defaults";

/*
 * The site footer in the storefront's current look, re-skinned onto utilities without visual
 * change. Breakpoints follow the legacy rules: Tailwind's max-[N] means `width < N`, so
 * max-[750px] is `max-width: 749px` and max-[1101px] is `1100px`.
 * Editors can hide or reorder the optional columns; the grids keep their source proportions
 * through the column variables set inline.
 */
const heading = "[font-family:'Red_Hat_Display',Manrope,sans-serif] text-[18px] leading-[1.1] font-bold wrap-anywhere";
/** The column headings also reset style and tracking (legacy `.maple-footer-main h2`). */
const columnHeading = `${heading} not-italic tracking-[0]`;
/** A footer column's left rule, dropped under 750 px. */
const columnRule = "-ml-6 border-l border-l-[#43362512] pl-6 max-[750px]:m-0 max-[750px]:border-none max-[750px]:border-l-current max-[750px]:p-0";
const icon = "h-[42px] w-10 flex-[0_0_40px] object-contain";
const mailNowrap = "min-[1101px]:[&[href^='mailto:']]:whitespace-nowrap";

function Links({ links, className }: { links: ChromeLink[]; className?: string }) {
  return links
    .filter((link) => link.enabled)
    .map((link) => (
      <Link key={link.id} href={chromeHref(link)} className={className}>
        {link.label}
      </Link>
    ));
}

export function Footer({
  siteChrome = defaultSiteChrome,
}: { siteChrome?: SiteChrome } = {}) {
  const footer = siteChrome.footer;
  const columns = footer.columns.filter(
    (column) =>
      column.enabled &&
      (column.key === "care" ||
        (column.key === "shop" ? footer.shopLinks : footer.helpLinks).some(
          (link) => link.enabled,
        )),
  );
  const contactColumns = footer.contactColumns.filter(
    (column) => column.enabled,
  );
  const mainStyle = {
    "--chrome-footer-columns": [
      "2fr",
      ...columns.map(
        (column) =>
          ({ shop: "0.8fr", help: "0.8fr", care: "1.1fr" })[column.key],
      ),
    ].join(" "),
    "--chrome-footer-medium-columns": [
      "1.1fr",
      ...columns.map(
        (column) =>
          ({ shop: "0.7fr", help: "0.9fr", care: "1.5fr" })[column.key],
      ),
    ].join(" "),
  } as CSSProperties;
  const contactStyle = {
    "--chrome-contact-columns": [
      "1.7fr",
      ...contactColumns.map((column) =>
        column.key === "marketplace" ? "0.45fr" : "1fr",
      ),
    ].join(" "),
  } as CSSProperties;
  const contactLink = `flex min-h-[42px] items-center gap-4 text-[16px] wrap-anywhere [&+a]:mt-3 ${mailNowrap} ${textLink}`;
  return (
    <footer data-store data-footer className="bg-[#e9e4e0] text-[#433625]">
      <div
        data-footer-main
        className="mx-auto grid min-h-[346px] max-w-[1440px] grid-cols-[1.7fr_0.8fr_0.9fr_1.7fr] gap-12 px-10 pt-[52px] pb-5 *:min-w-0 min-[1101px]:grid-cols-(--chrome-footer-columns) max-[1101px]:grid-cols-[1.1fr_0.7fr_0.9fr_1.5fr] max-[1101px]:gap-7 max-[1101px]:text-[13px] min-[768px]:max-[1101px]:grid-cols-(--chrome-footer-medium-columns) max-[750px]:grid-cols-[1fr_1fr] max-[750px]:text-[14px] max-[750px]:gap-x-6 max-[750px]:gap-y-8 max-[750px]:px-5 max-[750px]:py-8"
        style={mainStyle}
      >
        <Link
          data-footer-logo
          className={`max-w-[330px] self-center wrap-anywhere min-[1101px]:ml-2.5 max-[750px]:col-span-full max-[750px]:w-[70%] ${textLink}`}
          href="/"
          aria-label="Maple Furnishers home"
        >
          <Image
            src={"/media/footer/maple-logo.webp"}
            alt="Maple Furnishers"
            width={1080}
            height={500}
            sizes="(max-width:749px) 70vw, 25vw"
            className="h-auto w-full"
          />
        </Link>
        {columns.map(({ key }) => {
          if (key === "care")
            return (
              <div
                data-footer-care
                className={`text-[16px] leading-[1.6] min-[750px]:max-[1101px]:text-[14px] max-[750px]:col-span-full ${columnRule}`}
                key={key}
              >
                <h2 className={`mb-7 ${columnHeading}`}>{footer.careHeading}</h2>
                <p className="mb-6 flex items-center gap-4">
                  <Image src={"/media/footer/map.svg"} alt="" width={40} height={42} className={icon} />
                  <span>
                    {footer.addressLines.map((line, index) => (
                      <Fragment key={index}>
                        {index > 0 && <br />}
                        {line}
                      </Fragment>
                    ))}
                  </span>
                </p>
                <a
                  href={`tel:${footer.customerPhone}`}
                  className={`mb-6 flex items-center gap-4 wrap-anywhere ${textLink}`}
                >
                  <Image src={"/media/footer/phone.svg"} alt="" width={40} height={42} className={icon} />{" "}
                  {footer.customerPhoneLabel}
                </a>
                <a
                  href={`mailto:${footer.customerEmail}`}
                  className={`mb-6 flex items-center gap-4 wrap-anywhere last:mb-0 ${mailNowrap} ${textLink}`}
                >
                  <Image src={"/media/footer/mail.svg"} alt="" width={40} height={42} className={icon} /> {footer.customerEmail}
                </a>
              </div>
            );
          const links = key === "shop" ? footer.shopLinks : footer.helpLinks;
          return links.some((link) => link.enabled) ? (
            <nav
              key={key}
              aria-label={key === "shop" ? "About Maple" : "Help and policies"}
              className={`flex flex-col gap-3 leading-[1.6] [nav+&]:-ml-6 [nav+&]:border-l [nav+&]:border-l-[#43362512] [nav+&]:pl-6 max-[750px]:[nav+&]:m-0 max-[750px]:[nav+&]:border-none max-[750px]:[nav+&]:border-l-current max-[750px]:[nav+&]:p-0`}
            >
              <h2 className={`mb-3 ${columnHeading}`}>
                {key === "shop" ? footer.shopHeading : footer.helpHeading}
              </h2>
              <Links
                links={links}
                className={`text-[16px] wrap-anywhere min-[750px]:max-[1101px]:text-[14px] ${textLink}`}
              />
            </nav>
          ) : null;
        })}
      </div>
      {contactColumns.length > 0 && (
        <div
          data-footer-contact
          className="m-0 grid min-h-[193px] grid-cols-[1fr_1.1fr_1.1fr_0.65fr] gap-16 rounded-none bg-[#741a14] px-[max(40px,calc((100vw-1360px)/2))] pt-5 pb-4 text-[#f5f5f5] *:min-w-0 min-[1101px]:grid-cols-(--chrome-contact-columns) max-[1101px]:grid-cols-[1fr_1fr] max-[1101px]:gap-7 max-[750px]:grid-cols-[1fr] max-[750px]:gap-6 max-[750px]:px-5 max-[750px]:py-7"
          style={contactStyle}
        >
          <div className="self-center">
            <h2 className="font-serif text-[48px] leading-[1.1] font-medium italic wrap-anywhere max-[750px]:text-[36px]">
              {footer.contactHeading}
            </h2>
          </div>
          {contactColumns.map(({ key }) => {
            if (key === "marketplace")
              return (
                <div key={key}>
                  <h3 className={`py-[11.2px] ${heading}`}>{footer.findUsHeading}</h3>
                  <Image
                    src={"/media/footer/amazon.avif"}
                    alt="Amazon"
                    width={150}
                    height={56}
                    className="h-auto w-[105px] object-contain"
                  />
                </div>
              );
            const bulk = key === "bulk";
            const phone = bulk ? footer.bulkPhone : footer.customerPhone;
            const email = bulk ? footer.bulkEmail : footer.customerEmail;
            return (
              <div key={key}>
                <h3 className={`py-[11.2px] ${heading}`}>{bulk ? footer.bulkHeading : footer.serviceHeading}</h3>
                <a href={`tel:${phone}`} className={contactLink}>
                  <Image src={"/media/footer/phone-light.svg"} alt="" width={40} height={42} className={icon} />{" "}
                  {bulk ? footer.bulkPhoneLabel : footer.customerPhoneLabel}
                </a>
                <a href={`mailto:${email}`} className={contactLink}>
                  <Image src={"/media/footer/mail-light.svg"} alt="" width={40} height={42} className={icon} /> {email}
                </a>
              </div>
            );
          })}
        </div>
      )}
      <div
        data-footer-bottom
        className="mx-auto flex min-h-16 max-w-[1440px] items-center justify-start gap-6 px-10 py-5 text-[12px] max-[750px]:flex-col max-[750px]:items-start max-[750px]:gap-5 max-[750px]:px-5 max-[750px]:pt-6 max-[750px]:pb-[90px]"
      >
        <span>
          © {new Date().getFullYear()} {footer.copyrightName}
        </span>
        {footer.policyLinks.some((link) => link.enabled) && (
          <DismissibleDetails className="relative">
            <summary className="cursor-pointer [list-style:none] focus-visible:outline-offset-[5px] [&::-webkit-details-marker]:hidden">
              Terms and Policies
            </summary>
            <nav
              aria-label="Store policies"
              className="absolute bottom-[calc(100%+12px)] left-0 z-[2] flex w-[200px] flex-col flex-wrap gap-[18px] border border-[#43362533] bg-[#e9e4e0] p-4 [box-shadow:0_4px_16px_#0001]"
            >
              <Links links={footer.policyLinks} className={textLink} />
            </nav>
          </DismissibleDetails>
        )}
        {(footer.instagram || footer.linkedin) && (
          <div className="ml-auto flex flex-wrap gap-[18px] max-[750px]:ml-0">
            {footer.instagram && (
              <a
                href={footer.instagram}
                aria-label="Maple Furnishers on Instagram"
                className={textLink}
              >
                <Instagram size={20} />
              </a>
            )}
            {footer.linkedin && (
              <a
                href={footer.linkedin}
                aria-label="Maple Furnishers on LinkedIn"
                className={textLink}
              >
                <Linkedin size={20} />
              </a>
            )}
          </div>
        )}
      </div>
    </footer>
  );
}
