import { cx } from "@/lib/cx";

// Frame 1:78 ("The Maple promise"): the store's four promises, as its product pages make them.
const promises = [
  { icon: "promise-customise", title: "Fully customisable", line: "Design your perfect piece" },
  { icon: "promise-crafted", title: "Crafted in Delhi", line: "Made in our own workshop" },
  { icon: "promise-warranty", title: "36-month warranty", line: "Quality you can trust" },
  { icon: "promise-delivery", title: "Delivery across India", line: "Ask us about your location" },
] as const;

/** The Maple promise strip: four icons with a line each, on the cream panel (used under the mega menu, frame 1:1454). */
export function MaplePromise({ className }: { className?: string }) {
  return (
    <ul aria-label="The Maple promise" className={cx("m-0 grid list-none grid-cols-1 gap-6 rounded-[12px] bg-cream p-6 font-text sm:grid-cols-2 lg:grid-cols-4", className)}>
      {promises.map((promise) => (
        <li key={promise.icon} data-promise className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size design icon */}
          <img src={`/listing/${promise.icon}.svg`} alt="" width={28} height={28} className="size-7 shrink-0" />
          <span className="flex flex-col gap-1">
            <strong className="text-card font-bold text-espresso">{promise.title}</strong>
            <span className="text-meta text-taupe">{promise.line}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
