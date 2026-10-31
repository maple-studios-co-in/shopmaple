import { cx } from "@/lib/cx";
import { SectionHeading } from "./section-heading";

/** The design's four promises ("MF / The Maple promise"), shown under heroes and in the mega-menu. */
export const promises = [
  { icon: "customisable", title: "Fully customisable", detail: "Design your perfect piece" },
  { icon: "crafted", title: "Crafted in Delhi", detail: "Made in our own workshop" },
  { icon: "warranty", title: "36-month warranty", detail: "Quality you can trust" },
  { icon: "delivery", title: "Delivery across India", detail: "Ask us about your location" },
] as const;

export function PromiseStrip({ className }: { className?: string }) {
  return (
    <ul data-store data-promise-strip aria-label="The Maple promise" className={cx("m-0 grid list-none grid-cols-2 gap-x-4 gap-y-5 rounded-xl bg-cream p-5 font-body sm:p-6 lg:grid-cols-4 lg:gap-6", className)}>
      {promises.map((promise) => (
        <li key={promise.icon} className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size line icon from the design */}
          <img src={`/icons/store/${promise.icon}.svg`} alt="" width={28} height={28} className="size-6 shrink-0 sm:size-7" />
          <span className="grid gap-1">
            <strong className="text-ui font-bold text-espresso sm:text-card">{promise.title}</strong>
            <span className="text-label text-[#5e574f] sm:text-meta">{promise.detail}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The promises as a section with its heading ("MF / The Maple promise/1440": "OUR PROMISE / Every piece. Every time."). */
export function PromiseSection({ id = "maple-promise-heading", className }: { id?: string; className?: string }) {
  return (
    <section data-store data-promise-section aria-labelledby={id} className={cx("flex flex-col gap-6 bg-linen p-16 max-[1024px]:px-8 max-[1024px]:py-12 max-[750px]:px-5 max-[750px]:py-10", className)}>
      <SectionHeading eyebrow="Our promise" title="Every piece. Every time." id={id} />
      <PromiseStrip />
    </section>
  );
}
