import type { ReactNode } from "react";

/** The checkout page's frame (30:492's page): its heading over the details and order columns. */
export function CheckoutShell({ children }: { children: ReactNode }) {
  return (
    <section data-store className="bg-white px-4 pt-8 pb-16 font-product md:px-12 lg:pt-12 lg:pb-24">
      <div className="mx-auto max-w-[1176px] wide:max-w-[75vw]">
        <h1 className="m-0 mb-8 text-[34px] leading-[1.2] font-medium text-[#1c1c1c] lg:mb-12">Checkout</h1>
        {children}
      </div>
    </section>
  );
}
