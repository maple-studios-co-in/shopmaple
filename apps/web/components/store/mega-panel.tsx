import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import type { ChromeNavigationItem, SiteChrome } from "@shopmaple/contracts";
import { chromeHref } from "@/lib/site-chrome-defaults";
import { shopFile } from "@/lib/format";
import { PromiseStrip } from "./promise-strip";

const link = "group/link inline-flex w-fit items-center gap-2 text-card text-espresso no-underline hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

/** A desktop menu's panel ("Living room mega-menu" in the design): feature card, grouped links, discovery, promises. */
export function MegaPanel({ item, siteChrome, onNavigate }: { item: ChromeNavigationItem; siteChrome: SiteChrome; onNavigate: () => void }) {
  const columns = item.columns.filter((column) => column.links.some((entry) => entry.enabled));
  const discovery = siteChrome.desktopDiscovery.filter((entry) => entry.enabled);
  return (
    <div data-store data-mega id={`maple-panel-${item.id}`} aria-labelledby={`maple-trigger-${item.id}`}
      className="absolute inset-x-0 top-full border-0 border-b border-solid border-sand bg-white font-body text-card leading-[1.45] font-normal text-espresso shadow-md">
      <div className="mx-auto grid max-h-[calc(100dvh-190px)] max-w-[1440px] gap-6 overflow-y-auto px-8 py-8 xl:px-16 xl:py-10">
        <div className="flex items-start gap-7">
          {item.feature !== "none" && (
            <div data-mega-feature className="grid w-[260px] shrink-0 gap-3.5 rounded-xl bg-cream p-[18px]">
              <Image
                src={shopFile(item.feature === "bedroom" ? "engaged_9_1.jpg?v=1767448207" : "engaged_5.jpg?v=1767435623")}
                alt={item.feature === "bedroom" ? "Upholstered bed" : "A thoughtfully furnished living room"}
                width={448} height={380} sizes="224px" className="h-[190px] w-full rounded-xl object-cover"
              />
              <h2 className="font-serif text-h2 font-bold">{item.label}</h2>
              <Link href={item.href} onClick={onNavigate}
                className="inline-flex items-center justify-center gap-2 rounded-sm bg-brand px-4 py-3.5 text-ui font-bold text-white no-underline hover:bg-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
                Explore {item.label.toLowerCase()} <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </div>
          )}
          <div data-mega-grid className="grid flex-1 grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-x-7 gap-y-8">
            {columns.map((column) => (
              <div data-mega-column key={column.id} className="flex flex-col items-start gap-[18px]">
                {column.links.filter((entry) => entry.enabled).map((entry) => entry.parent ? (
                  <Link key={entry.id} href={chromeHref(entry)} onClick={onNavigate}
                    className="font-serif text-h4 font-bold text-espresso no-underline hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
                    {entry.label}
                  </Link>
                ) : (
                  <Link key={entry.id} href={chromeHref(entry)} onClick={onNavigate} className={link}>
                    {entry.label} <ArrowRight aria-hidden="true" className="size-3.5 transition-transform group-hover/link:translate-x-0.5" />
                  </Link>
                ))}
              </div>
            ))}
          </div>
          {discovery.length > 0 && (
              <div data-mega-discovery className="flex w-[220px] shrink-0 flex-col items-start gap-[18px]">
                <p className="font-serif text-h4 font-bold">Discover</p>
                {discovery.map((entry) => (
                  <Link key={entry.id} href={chromeHref(entry)} onClick={onNavigate}
                    aria-label={entry.enquirySubject === "Custom furniture" && (entry.label === "Fully Customizable" || entry.label === "Custom furniture") ? "Enquire about custom furniture" : undefined}
                    className={`${link} flex-wrap gap-x-2 gap-y-0`}>
                    <span>{entry.label}</span>
                    <span className="text-meta text-taupe">{entry.cta}</span>
                    <ArrowRight aria-hidden="true" className="size-3.5 transition-transform group-hover/link:translate-x-0.5" />
                  </Link>
                ))}
              </div>
          )}
        </div>
        <PromiseStrip />
        <p className="text-price text-taupe">Your space. Your choices. Consult with Maple on colour, material, finish, and size.</p>
      </div>
    </div>
  );
}
