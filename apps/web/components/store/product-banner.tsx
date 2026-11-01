/** Frame 999:252: a rounded full-width photo with a burgundy wash on the left and a headline over it. */
export function ProductBanner() {
  return (
    <section data-store data-banner aria-labelledby="product-banner-title" className="w-full px-4 md:px-12">
      <div className="relative isolate flex min-h-[420px] items-end overflow-hidden rounded-[24px] bg-maple font-product text-white md:min-h-[751px] md:items-center md:rounded-[40px]">
        {/* eslint-disable-next-line @next/next/no-img-element -- static design photo, sized by the section */}
        <img src="/product-page/banner.jpg" alt="" width={800} height={450} loading="lazy" className="absolute inset-0 -z-20 size-full object-cover" />
        <span aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-r from-[rgba(128,36,28,0.8)] via-[rgba(128,36,28,0.2)] via-60% to-[rgba(102,102,102,0)] to-[75.786%]" />
        <div className="flex max-w-[640px] flex-col gap-3 p-6 md:gap-4 md:p-[72px]">
          <h2 id="product-banner-title" className="m-0 text-[40px] leading-[1.2] font-medium md:text-[64px]"><span className="block">Crafted in Delhi.</span>{" "}<span className="block">Made to order.</span></h2>
          <p className="m-0 text-[16px] leading-[1.6]">In our own workshop, and backed by our warranty.</p>
        </div>
      </div>
    </section>
  );
}
