import { assurances } from "./product-assurances";

/**
 * Frame 999:317: large burgundy promises on a loop, a green dot between each. It stops on hover and, wrapped and still,
 * for people who ask for reduced motion (the owner did not want a pause button on the page).
 */
export function ProductTicker({ warranty }: { warranty: string }) {
  const items = [warranty, "Crafted in Delhi", "Fully customisable", assurances.delivery];
  const row = () => (
    <ul aria-hidden="true" className="m-0 flex shrink-0 list-none items-center p-0">
      {items.map((item) => (
        <li key={item} data-ticker-item className="flex shrink-0 items-center gap-6 pr-[72px] whitespace-nowrap md:gap-[67px] md:pr-[168px]">
          {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size design bullet */}
          <img src="/product-page/dot.svg" alt="" width={24} height={24} className="size-4 md:size-6" />
          {item}
        </li>
      ))}
    </ul>
  );
  return (
    <section data-store data-ticker aria-label="Maple promises" className="overflow-hidden bg-white py-10 font-product text-[44px] leading-[1.2] font-medium text-maple md:py-[68px] md:text-[86px]">
      <p data-ticker-copy className="sr-only">{items.join(". ")}.</p>
      <div data-ticker-track aria-hidden="true" className="flex w-max animate-pdp-ticker hover:[animation-play-state:paused] motion-reduce:hidden">
        {row()}
        {row()}
      </div>
      <ul aria-hidden="true" className="m-0 hidden list-none flex-wrap justify-center gap-x-10 gap-y-2 p-0 text-[32px] motion-reduce:flex">
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </section>
  );
}
