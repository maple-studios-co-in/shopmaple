import Link from "next/link";
import Image from "next/image";
import type { ChromeActionLink, ChromeNavigationItem, SiteChrome } from "@shopmaple/contracts";
import { chromeHref } from "@/lib/site-chrome-defaults";
import { shopFile } from "@/lib/format";
import { PromiseStrip } from "./promise-strip";

const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";
const linkClass = `group/link inline-flex w-fit items-center gap-2 text-(length:--text-card) text-espresso no-underline hover:text-brand ${focus}`;
/** A 220 px column ("Sofas", "Discover"): five fit beside the feature card at 1440, fewer wrap on narrower screens. */
const column = "flex min-w-0 max-w-[220px] flex-[1_1_150px] flex-col items-start gap-[22px]";
const heading = "m-0 font-serif text-h4 font-bold text-espresso";

function Arrow() {
  return <span aria-hidden="true" className="transition-transform group-hover/link:translate-x-0.5">→</span>;
}

/** The custom furniture enquiry keeps a descriptive name while it carries one of the preset labels. */
function enquiryName(entry: ChromeActionLink) {
  return entry.enquirySubject === "Custom furniture" && (entry.label === "Fully Customizable" || entry.label === "Custom furniture") ? "Enquire about custom furniture" : undefined;
}

/**
 * A desktop menu's panel ("Living room mega-menu" in "Maple / PDF Review / Mega-menu open"): the feature card,
 * then one row of 220 px columns (the menu's own, then Discover), the promises and the consultation line.
 * Discovery enquiries are the column's outlined action; other discovery entries are plain links.
 */
export function MegaPanel({ item, siteChrome, onNavigate }: { item: ChromeNavigationItem; siteChrome: SiteChrome; onNavigate: () => void }) {
  const columns = item.columns.filter((entry) => entry.links.some((link) => link.enabled));
  const discovery = siteChrome.desktopDiscovery.filter((entry) => entry.enabled);
  const actions = discovery.filter((entry) => entry.enquirySubject);
  return (
    <div data-store data-mega id={`maple-panel-${item.id}`} aria-labelledby={`maple-trigger-${item.id}`}
      className="absolute inset-x-0 top-full border-0 border-b border-solid border-sand bg-white font-body text-(length:--text-card) leading-[1.45] font-normal text-espresso shadow-md">
      <div className="mx-auto grid max-h-[calc(100dvh-190px)] max-w-[1440px] gap-6 overflow-y-auto px-8 py-8 xl:px-16 xl:py-16">
        <div className="flex items-start gap-7">
          {item.feature !== "none" && (
            <div data-mega-feature className="grid w-[260px] shrink-0 gap-3.5 rounded-xl bg-cream p-[18px]">
              <Image
                src={shopFile(item.feature === "bedroom" ? "engaged_9_1.jpg?v=1767448207" : "engaged_5.jpg?v=1767435623")}
                alt={item.feature === "bedroom" ? "Upholstered bed" : "A thoughtfully furnished living room"}
                width={448} height={380} sizes="224px" className="h-[190px] w-full rounded-xl object-cover"
              />
              <h2 className="m-0 font-serif text-h2 font-bold text-espresso">{item.label}</h2>
              <Link href={item.href} onClick={onNavigate}
                className={`group/link inline-flex items-center justify-center gap-2 rounded-sm bg-brand p-3.5 text-ui font-bold text-white no-underline hover:bg-brand-deep ${focus}`}>
                Explore {item.label.toLowerCase()} <Arrow />
              </Link>
            </div>
          )}
          <div data-mega-grid className="flex min-w-0 flex-1 flex-wrap items-start gap-x-7 gap-y-8">
            {columns.map((entry) => (
              <div data-mega-column key={entry.id} className={column}>
                {entry.links.filter((link) => link.enabled).map((link) => link.parent ? (
                  <Link key={link.id} href={chromeHref(link)} onClick={onNavigate} className={`${heading} no-underline hover:text-brand ${focus}`}>
                    {link.label}
                  </Link>
                ) : (
                  <Link key={link.id} href={chromeHref(link)} onClick={onNavigate} className={linkClass}>
                    {link.label} <Arrow />
                  </Link>
                ))}
              </div>
            ))}
            {discovery.length > 0 && (
              <div data-mega-discovery className={column}>
                <h3 className={heading}>Discover</h3>
                {discovery.filter((entry) => !entry.enquirySubject).map((entry) => (
                  <Link key={entry.id} href={chromeHref(entry)} onClick={onNavigate} className={linkClass}>
                    {entry.label} <Arrow />
                  </Link>
                ))}
                {actions.map((entry) => (
                  <Link key={entry.id} data-mega-action href={chromeHref(entry)} onClick={onNavigate} aria-label={enquiryName(entry)}
                    className={`group/link inline-flex w-full items-center justify-center gap-2 rounded-sm border border-solid border-sand bg-white p-3.5 text-ui font-bold text-brand no-underline hover:border-brand ${focus}`}>
                    {entry.label} <Arrow />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
        <PromiseStrip />
        <p className="m-0 text-price text-taupe">Your space. Your choices. Consult with Maple on colour, material, finish, and size.</p>
      </div>
    </div>
  );
}
