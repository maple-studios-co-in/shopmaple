import Image from "next/image";
import Link from "next/link";
import { Fragment, type CSSProperties } from "react";
import { Instagram, Linkedin, Mail, MapPin, Phone } from "lucide-react";
import type { ChromeLink, SiteChrome } from "@shopmaple/contracts";
import { shopFile } from "@/lib/format";
import { defaultSiteChrome, chromeHref } from "@/lib/site-chrome-defaults";
function Links({ links }: { links: ChromeLink[] }) {
  return links
    .filter((link) => link.enabled)
    .map((link) => (
      <Link key={link.id} href={chromeHref(link)}>
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
      "1.7fr",
      ...columns.map(
        (column) =>
          ({ shop: "0.8fr", help: "0.9fr", care: "1.7fr" })[column.key],
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
      "1fr",
      ...contactColumns.map((column) =>
        column.key === "marketplace" ? "0.65fr" : "1.1fr",
      ),
    ].join(" "),
  } as CSSProperties;
  return (
    <footer className="maple-footer">
      <div className="maple-footer-main" style={mainStyle}>
        <Link
          className="maple-footer-logo"
          href="/"
          aria-label="Maple Furnishers home"
        >
          <Image
            src={shopFile("Cover_Image_Maple_1.png?v=1752647999")}
            alt="Maple Furnishers"
            width={1080}
            height={500}
            sizes="(max-width:749px) 70vw, 25vw"
          />
        </Link>
        {columns.map(({ key }) => {
          if (key === "care")
            return (
              <div className="maple-footer-care" key={key}>
                <h2>{footer.careHeading}</h2>
                <p>
                  <MapPin size={26} strokeWidth={1} />
                  <span>
                    {footer.addressLines.map((line, index) => (
                      <Fragment key={index}>
                        {index > 0 && <br />}
                        {line}
                      </Fragment>
                    ))}
                  </span>
                </p>
                <a href={`tel:${footer.customerPhone}`}>
                  <Phone size={26} strokeWidth={1} />{" "}
                  {footer.customerPhoneLabel}
                </a>
                <a href={`mailto:${footer.customerEmail}`}>
                  <Mail size={26} strokeWidth={1} /> {footer.customerEmail}
                </a>
              </div>
            );
          const links = key === "shop" ? footer.shopLinks : footer.helpLinks;
          return links.some((link) => link.enabled) ? (
            <nav
              key={key}
              aria-label={key === "shop" ? "About Maple" : "Help and policies"}
            >
              <h2>
                {key === "shop" ? footer.shopHeading : footer.helpHeading}
              </h2>
              <Links links={links} />
            </nav>
          ) : null;
        })}
      </div>
      {contactColumns.length > 0 && (
        <div className="maple-footer-contact" style={contactStyle}>
          <div>
            <h2>{footer.contactHeading}</h2>
          </div>
          {contactColumns.map(({ key }) => {
            if (key === "marketplace")
              return (
                <div key={key}>
                  <h3>{footer.findUsHeading}</h3>
                  <Image
                    src={shopFile("amazon_logo.avif?v=1778615085")}
                    alt="Amazon"
                    width={150}
                    height={56}
                  />
                </div>
              );
            const bulk = key === "bulk";
            const phone = bulk ? footer.bulkPhone : footer.customerPhone;
            const email = bulk ? footer.bulkEmail : footer.customerEmail;
            return (
              <div key={key}>
                <h3>{bulk ? footer.bulkHeading : footer.serviceHeading}</h3>
                <a href={`tel:${phone}`}>
                  <Phone size={24} strokeWidth={1} />{" "}
                  {bulk ? footer.bulkPhoneLabel : footer.customerPhoneLabel}
                </a>
                <a href={`mailto:${email}`}>
                  <Mail size={24} strokeWidth={1} /> {email}
                </a>
              </div>
            );
          })}
        </div>
      )}
      <div className="maple-footer-bottom">
        <span>
          © {new Date().getFullYear()} {footer.copyrightName}
        </span>
        {footer.policyLinks.some((link) => link.enabled) && (
          <nav aria-label="Store policies">
            <Links links={footer.policyLinks} />
          </nav>
        )}
        {(footer.instagram || footer.linkedin) && (
          <div>
            {footer.instagram && (
              <a
                href={footer.instagram}
                aria-label="Maple Furnishers on Instagram"
              >
                <Instagram size={20} />
              </a>
            )}
            {footer.linkedin && (
              <a
                href={footer.linkedin}
                aria-label="Maple Furnishers on LinkedIn"
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
