import { assurances } from "./product-assurances";

const promises = [
  { icon: "promise-shipping", title: assurances.delivery, detail: "Ask us about delivery to your location." },
  { icon: "promise-returns", title: assurances.cover, detail: "Manufacturing defects and transit damage are assessed for repair or replacement. Report within 24–48 hours of delivery." },
  { icon: "promise-support", title: "Customer service", detail: "Talk to our team about your space, finish or size." },
] as const;

/** Frame 999:436: a bordered card of icon, title and line per promise. */
export function ProductPromises() {
  return (
    <section data-store data-promises aria-label="Our promises" className="bg-white px-4 py-10 font-manrope md:px-12 md:py-[95px]">
      <ul className="m-0 mx-auto grid max-w-[1336px] list-none gap-8 rounded-[20px] border border-solid border-maple/8 px-8 py-8 md:grid-cols-3 md:gap-6 md:py-[26px]">
        {promises.map((promise) => (
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
