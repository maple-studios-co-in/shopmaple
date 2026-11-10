import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import type { SiteChrome } from "@shopmaple/contracts";

/**
 * The Help pages of the "Maple Website Review" Figma file: Privacy Policy 150:2569, Terms of Service 150:2895,
 * Shipping Policy 150:3279, Refund Policy 150:3623 and Return & Exchange 150:3952, with their mobile frames
 * 150:4266 to 150:4558 (desktop 1432 wide with 80 px margins, mobile 390 with 24 px). The frames set DM Sans;
 * like checkout, the store sets them in the product page's face. The header and footer stay the store's own.
 */

/** A Help tab. The tabs are the footer's Help links, so the two lists never disagree. */
export type HelpLink = { label: string; href: string };
/** The customer care contact under each Help page: the footer's, which staff keep current in the admin. */
export type CareContact = { email: string; phone: string; phoneLabel: string };
export type HelpChrome = { links: HelpLink[]; care: CareContact };

export function helpChromeFrom(footer: SiteChrome["footer"]): HelpChrome {
  return {
    links: footer.helpLinks.filter(link => link.enabled).map(({ label, href }) => ({ label, href })),
    care: { email: footer.customerEmail, phone: footer.customerPhone, phoneLabel: footer.customerPhoneLabel },
  };
}

const pathOf = (href: string) => {
  try { return new URL(href, "https://store.maplefurnishers.com").pathname.replace(/(.)\/$/, "$1"); }
  catch { return href; }
};

// Tailwind only sees whole class names, so both title scales are spelled out: the Return & Exchange frame
// sets its longer title at 86 px where the policies use 100 px; both shrink with the window below 1432 px.
const titleScales = {
  policy: "lg:text-[length:min(100px,7vw)]",
  compact: "lg:text-[length:min(86px,6.01vw)]",
} as const;

export function HelpPage({ chrome: { links, care }, current, title, opening, photo, titleScale = "policy", children }: {
  chrome: HelpChrome;
  /** This page's address, which marks its tab. */
  current: string;
  title: string;
  opening?: ReactNode;
  photo: string;
  titleScale?: keyof typeof titleScales;
  children: ReactNode;
}) {
  const here = links.find(link => pathOf(link.href) === current);
  const name = here?.label ?? title;
  return (
    <div data-store data-help-page className="bg-help-page font-text text-help-ink">
      <div className="mx-auto w-full max-w-[1432px] px-6 pt-6 lg:px-20">
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center text-[12px] leading-[19px] text-help-muted">
            <li><Link href="/" className="transition-colors hover:text-maple">Home</Link></li>
            <li className="before:mx-[7px] before:content-['/']"><Link href="/contact" className="transition-colors hover:text-maple">Help</Link></li>
            <li aria-current="page" className="before:mx-[7px] before:content-['/']">{name}</li>
          </ol>
        </nav>
        <HelpTabs links={links} current={current} />
        <HelpMenu key={current} links={links} current={current} name={name} />
        <article>
          <header className="flex flex-col items-center gap-[22px] pt-6 pb-10 text-center lg:pt-[42px] lg:pb-16">
            <h1 className={`w-full text-[43px] leading-none font-bold tracking-[-0.04em] text-balance uppercase ${titleScales[titleScale]}`}>{title}</h1>
            {opening && (
              <div data-help-opening className="max-w-[620px] text-[16px] leading-[25px] lg:text-[20px] lg:leading-[31px] [&>*+*]:mt-[25px] lg:[&>*+*]:mt-[31px]">
                {opening}
              </div>
            )}
          </header>
          <div data-help-photo className="relative aspect-[342/150] w-full overflow-hidden bg-cream lg:aspect-[1272/360]">
            <Image src={photo} alt="" fill preload sizes="(min-width: 1432px) 1272px, (min-width: 1024px) calc(100vw - 160px), calc(100vw - 48px)" className="object-cover" />
          </div>
          <div aria-hidden="true" className="h-px bg-help-rule" />
          {children}
        </article>
        <section data-customer-care aria-labelledby="customer-care-title" className="flex flex-col gap-3 pt-8 pb-11">
          <h2 id="customer-care-title" className="text-[26px] leading-10 font-medium lg:text-[36px] lg:leading-[56px]">A little help, whenever you need it.</h2>
          <p className="text-[14px] leading-[22px] text-maple lg:text-[17px] lg:leading-[26px]">
            <a href={`mailto:${care.email}`} className="hover:underline">{care.email}</a>
            <span aria-hidden="true" className="mx-[11px]">|</span>
            <a href={`tel:${care.phone}`} className="hover:underline">{care.phoneLabel}</a>
          </p>
        </section>
      </div>
    </div>
  );
}

/** Desktop: the five tabs in a row, the open page bold and underlined in burgundy (frame 150:2571). */
function HelpTabs({ links, current }: { links: readonly HelpLink[]; current: string }) {
  return (
    <nav aria-label="Help pages" className="hidden lg:block">
      <ul data-help-tabs className="flex gap-9 pt-8 pb-7">
        {links.map(link => {
          const open = pathOf(link.href) === current;
          return (
            <li key={link.href} className="min-w-0 flex-[0_1_205px]">
              <Link
                href={link.href}
                aria-current={open ? "page" : undefined}
                className={`block border-b pb-3 text-[14px] leading-[22px] transition-colors ${open ? "border-maple font-bold text-maple" : "border-transparent text-help-muted hover:text-maple"}`}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Mobile: "HELP / Privacy Policy ↓" opens the same list (frame 150:4271). */
function HelpMenu({ links, current, name }: { links: readonly HelpLink[]; current: string; name: string }) {
  return (
    <nav aria-label="Help pages" className="pt-5 pb-4 lg:hidden">
      <details data-help-menu className="group">
        {/* The arrow points down while closed and turns up once open (owner, 10 Nov 2026). */}
        <summary className="flex w-fit cursor-pointer list-none items-center text-[14px] leading-[22px] font-medium text-maple after:ml-[17px] after:inline-block after:content-['↓'] after:transition-transform after:duration-500 after:ease-[cubic-bezier(.22,1,.36,1)] group-open:after:rotate-180 motion-reduce:after:transition-none [&::-webkit-details-marker]:hidden">
          <span className="uppercase">Help</span> <span className="mx-2">/</span> {name}
        </summary>
        <ul className="mt-3 flex flex-col gap-2.5 border-l border-help-rule pl-4">
          {links.map(link => {
            const open = pathOf(link.href) === current;
            return (
              <li key={link.href}>
                <Link href={link.href} aria-current={open ? "page" : undefined} className={`block py-0.5 text-[14px] leading-[22px] ${open ? "font-medium text-maple" : "text-help-muted"}`}>
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </details>
    </nav>
  );
}
