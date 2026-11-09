/**
 * Frame 999:252: a rounded full-width photo with a burgundy wash on the left and a headline over it. The photo is 16:9, so
 * the chair is never cut (owner, 4 Nov 2026): where the banner is cropped, it crops towards the chair; from 1600px wide
 * the photo keeps its own shape on the right and fades into the burgundy, and the banner grows a little with the screen.
 */
export function ProductBanner() {
  return (
    <section data-store data-banner aria-labelledby="product-banner-title" className="w-full px-4 md:px-12">
      <div className="relative isolate flex min-h-[420px] items-end overflow-hidden rounded-[24px] bg-maple font-text text-white md:min-h-[751px] md:items-center md:rounded-[40px] wide:min-h-[max(751px,30vw)]">
        {/* eslint-disable-next-line @next/next/no-img-element -- static design photo, sized by the section */}
        <img src="/product-page/banner.jpg" alt="" width={800} height={450} loading="lazy" className="absolute inset-0 -z-20 size-full object-cover object-[80%_center] wide:inset-auto wide:top-0 wide:right-0 wide:aspect-[16/9] wide:w-auto wide:[mask-image:linear-gradient(to_right,transparent,#000_35%)]" />
        <span aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-r from-[rgba(128,36,28,0.8)] via-[rgba(128,36,28,0.2)] via-60% to-[rgba(102,102,102,0)] to-[75.786%]" />
        <div className="flex max-w-[640px] flex-col gap-3 p-6 md:gap-4 md:p-[72px]">
          <h2 id="product-banner-title" className="m-0 text-[40px] leading-[1.2] font-medium md:text-[64px]">Made for your space.</h2>
          <p className="m-0 text-[16px] leading-[1.6]">Every Maple piece is made to order in our Delhi workshop, in the finish you choose.</p>
        </div>
      </div>
    </section>
  );
}
