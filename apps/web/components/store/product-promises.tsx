import { assurances, freeDelivery } from "./product-assurances";

const promises = [
  { icon: "promise-shipping", title: assurances.delivery, detail: "Ask us about delivery to your location." },
  { icon: "promise-returns", title: assurances.cover, detail: "Manufacturing defects and transit damage are assessed for repair or replacement. Report within 24–48 hours of delivery." },
  { icon: "detail-spec", title: "Made to order", detail: "Crafted for you in our own Delhi workshop." },
  { icon: "promise-support", title: "Customer service", detail: "Talk to our team about your space, finish or size." },
] as const;

/**
 * Frames 999:436 and 2:765: a bordered card of icon, title and line per promise, four across on wide screens.
 * `shipsFree` is the chosen finish's own free delivery, which takes the delivery promise's place.
 */
export function ProductPromises({ shipsFree = false }: { shipsFree?: boolean }) {
  const shown = shipsFree ? [{ ...promises[0], title: freeDelivery.label, detail: freeDelivery.detail }, ...promises.slice(1)] : promises;
  return (
    <section data-store data-promises aria-label="Our promises" className="bg-white px-4 font-text md:px-12">
      <ul className="m-0 mx-auto grid max-w-[1336px] wide:max-w-none list-none gap-8 rounded-[20px] border border-solid border-maple/8 px-8 py-8 md:grid-cols-2 md:gap-6 md:py-[26px] lg:grid-cols-4">
        {shown.map((promise) => (
          <li key={promise.icon} className="flex flex-col items-center gap-2 text-center text-[#1a1a1a]">
            <span aria-hidden="true" className="grid size-[46px] place-items-center rounded-full bg-maple/6">
              {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size design icon */}
              <img src={`/product-page/${promise.icon}.svg`} alt="" width={18} height={18} className="size-[18px]" />
            </span>
            <strong className="text-[16px] leading-[1.2] font-medium">{promise.title}</strong>
            <span className="max-w-[360px] text-[14px] leading-[1.6]">{promise.detail}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
