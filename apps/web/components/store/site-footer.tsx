import Image from "next/image";
import Link from "next/link";
import { Fragment, type CSSProperties } from "react";
import { Instagram, Linkedin } from "lucide-react";
import type { ChromeLink, SiteChrome } from "@shopmaple/contracts";
import { defaultSiteChrome, chromeHref } from "@/lib/site-chrome-defaults";
import { eyebrow } from "./section-heading";

/*
 * The site footer ("MF / Footer/1440" in the "Maple / PDF Review / UI Components" frame): the
 * brand story, the editors' shop, help and customer-care columns, a burgundy closing band with the
 * bulk-order contact, and one legal line. Editors still hide and reorder the columns; the band's
 * bulk line follows the bulk contact column's toggle. Tailwind's max-[750px] means `width < 750`.
 */
const footerLink = "w-fit text-ui text-espresso no-underline wrap-anywhere hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";
/** Column widths at 1440 in the design: the brand story, then 185 px link columns and a 322 px care column. */
const columnWidth = { shop: "minmax(0,185px)", help: "minmax(0,185px)", care: "minmax(0,322px)" } as const;

function Links({ links }: { links: ChromeLink[] }) {
  return links
    .filter((link) => link.enabled)
    .map((link) => (
      <Link key={link.id} href={chromeHref(link)} className={footerLink}>
        {link.label}
      </Link>
    ));
}

/** The design's spaced middle dot between items on one line. */
function Dot({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`px-1 ${className}`}>·</span>;
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
  const bulk = footer.contactColumns.some((column) => column.key === "bulk" && column.enabled);
  const policies = footer.policyLinks.filter((link) => link.enabled);
  const mainStyle = {
    "--footer-columns": ["minmax(0,390px)", ...columns.map(({ key }) => columnWidth[key])].join(" "),
  } as CSSProperties;
  return (
    <footer data-store data-footer className="bg-cream font-body text-espresso">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-8 p-16 max-[1024px]:px-8 max-[1024px]:py-12 max-[750px]:px-5 max-[750px]:pt-10 max-[750px]:pb-[90px]">
        <div
          data-footer-main
          className="grid grid-cols-3 gap-x-[70px] gap-y-10 lg:grid-cols-(--footer-columns) max-[1024px]:gap-x-8 max-[750px]:grid-cols-2 max-[750px]:gap-x-6 max-[750px]:gap-y-8"
          style={mainStyle}
        >
          <div data-footer-story className="flex flex-col items-start gap-4 max-[1024px]:col-span-full">
            <Link
              data-footer-logo
              href="/"
              aria-label="Maple Furnishers home"
              className="block h-[90px] w-[190px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand max-[750px]:h-[70px] max-[750px]:w-[150px]"
            >
              <Image
                src="/media/footer/maple-logo.webp"
                alt="Maple Furnishers"
                width={1080}
                height={500}
                sizes="190px"
                className="size-full object-contain"
              />
            </Link>
            <p className="max-w-[310px] text-price">
              Thoughtfully designed furniture <br className="max-[750px]:hidden" />
              for spaces that feel like home.
            </p>
          </div>
          {columns.map(({ key }) => {
            if (key === "care")
              return (
                <div data-footer-care key={key} className="flex flex-col items-start gap-4 max-[750px]:col-span-full">
                  <h2 className={eyebrow}>{footer.careHeading}</h2>
                  <a href={`tel:${footer.customerPhone}`} className={footerLink}>
                    {footer.customerPhoneLabel}
                  </a>
                  <a href={`mailto:${footer.customerEmail}`} className={footerLink}>
                    {footer.customerEmail}
                  </a>
                  <address className="contents not-italic">
                    {footer.addressLines.map((line, index) => (
                      <span key={index} className="text-ui">
                        {line}
                      </span>
                    ))}
                  </address>
                </div>
              );
            const shop = key === "shop";
            return (
              <nav
                key={key}
                aria-label={shop ? "About Maple" : "Help and policies"}
                className="flex flex-col items-start gap-4"
              >
                <h2 className={eyebrow}>{shop ? footer.shopHeading : footer.helpHeading}</h2>
                <Links links={shop ? footer.shopLinks : footer.helpLinks} />
              </nav>
            );
          })}
        </div>
        <div
          data-footer-contact
          className="flex w-full max-w-[1250px] items-start gap-10 bg-brand p-5 text-white max-[1024px]:flex-col max-[1024px]:gap-3"
        >
          <h2 className="font-serif text-band font-bold wrap-anywhere lg:w-[640px] lg:shrink-0">{footer.contactHeading}</h2>
          {bulk && (
            <p className="text-ui wrap-anywhere">
              Bulk enquiries <Dot />{" "}
              <a href={`tel:${footer.bulkPhone}`} className="text-white no-underline hover:underline hover:underline-offset-4">
                {footer.bulkPhoneLabel}
              </a>{" "}
              <Dot />{" "}
              <a href={`mailto:${footer.bulkEmail}`} className="text-white no-underline hover:underline hover:underline-offset-4">
                {footer.bulkEmail}
              </a>
            </p>
          )}
        </div>
        <div data-footer-bottom className="flex flex-wrap items-center gap-x-3 gap-y-2 text-label text-taupe">
          <span className="max-[750px]:basis-full">
            © {new Date().getFullYear()} {footer.copyrightName}
          </span>
          {policies.length > 0 && (
            <nav aria-label="Store policies" className="contents">
              {policies.map((link, index) => (
                <Fragment key={link.id}>
                  {/* Under 750 px the copyright takes its own line, so the first policy needs no dot. */}
                  <Dot className={index === 0 ? "max-[750px]:hidden" : ""} />
                  <Link href={chromeHref(link)} className="text-taupe no-underline hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
                    {link.label}
                  </Link>
                </Fragment>
              ))}
            </nav>
          )}
          {(footer.instagram || footer.linkedin) && (
            <div className="ml-auto flex gap-4 max-[750px]:ml-0 max-[750px]:basis-full">
              {footer.instagram && (
                <a href={footer.instagram} aria-label="Maple Furnishers on Instagram" className="text-taupe hover:text-brand">
                  <Instagram aria-hidden="true" className="size-4" />
                </a>
              )}
              {footer.linkedin && (
                <a href={footer.linkedin} aria-label="Maple Furnishers on LinkedIn" className="text-taupe hover:text-brand">
                  <Linkedin aria-hidden="true" className="size-4" />
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </footer>
  );
}
