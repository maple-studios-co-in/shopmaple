import { cn } from "@/lib/utils";

/** The design's four promises ("MF / The Maple promise"), shown under heroes and in the mega-menu. */
export const promises = [
  { icon: "customisable", title: "Fully customisable", detail: "Design your perfect piece" },
  { icon: "crafted", title: "Crafted in Delhi", detail: "Made in our own workshop" },
  { icon: "warranty", title: "36-month warranty", detail: "Quality you can trust" },
  { icon: "delivery", title: "Delivery across India", detail: "Ask us about your location" },
] as const;

export function PromiseStrip({ className }: { className?: string }) {
  return (
    <ul data-store data-promise-strip aria-label="The Maple promise" className={cn("m-0 grid list-none grid-cols-2 gap-x-4 gap-y-5 rounded-xl bg-cream p-5 font-body sm:p-6 lg:grid-cols-4 lg:gap-6", className)}>
      {promises.map((promise) => (
        <li key={promise.icon} className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size line icon from the design */}
          <img src={`/icons/store/${promise.icon}.svg`} alt="" width={28} height={28} className="size-6 shrink-0 sm:size-7" />
          <span className="grid gap-1">
            <strong className="text-ui font-bold text-espresso sm:text-card">{promise.title}</strong>
            <span className="text-label text-taupe sm:text-meta">{promise.detail}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
