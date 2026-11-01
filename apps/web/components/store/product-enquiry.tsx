"use client";
import type { FormEvent } from "react";
import { useEnquiry } from "@/components/use-enquiry";

const field = "block w-full border-0 bg-white px-[21px] text-[16px] text-black placeholder:text-black focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-maple";

/**
 * Frame 1020:15473 ("Have a Space in Mind?"): the project enquiry form. It goes through the store's enquiry service
 * (kind "project") with the piece being viewed as context, so the team knows what the visitor was looking at.
 */
export function ProductEnquiry({ product, variant, sku }: { product: string; variant: string; sku: string }) {
  const enquiry = useEnquiry();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void enquiry.submit({
      kind: "project",
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      phone: String(form.get("phone") ?? ""),
      message: String(form.get("message") ?? ""),
      context: { product, variant, sku, pincode: "" },
    });
  }
  return (
    <section data-store data-enquiry aria-labelledby="product-enquiry-title" className="bg-[#f8f7f3] px-4 py-12 font-product md:px-12 md:py-[32px] lg:px-[50px]">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,max(674px,45%))] lg:items-center lg:gap-[40px]">
        <div className="flex flex-col gap-6">
          <h2 id="product-enquiry-title" className="m-0 max-w-[433px] text-[44px] leading-[1.1] font-medium text-black md:text-[64px] md:leading-[75px]">Have a Space in Mind?</h2>
          <p className="m-0 max-w-[560px] text-[18px] leading-[1.45] text-[#4b4b4b]">Describe your project to us and our team will come back within 24 hours with options, pricing and a clear timeline.</p>
          <p className="m-0 max-w-[560px] text-[18px] leading-[1.45] text-[#4b4b4b]">Whether the brief is a single statement chair or a complete room, the process starts the same way: with a conversation.</p>
        </div>
        <form onSubmit={submit} onChange={enquiry.clear} className="grid gap-3.5">
          <div className="grid gap-3.5 sm:grid-cols-2">
            <label><span className="sr-only">Name</span><input name="name" autoComplete="name" placeholder="Name" maxLength={100} className={`${field} h-[59px]`} /></label>
            <label><span className="sr-only">Email (required)</span><input name="email" type="email" autoComplete="email" autoCapitalize="off" spellCheck={false} placeholder="Email" required maxLength={254} className={`${field} h-[59px]`} /></label>
          </div>
          <label><span className="sr-only">Phone</span><input name="phone" type="tel" autoComplete="tel" placeholder="Phone" maxLength={30} className={`${field} h-[59px]`} /></label>
          <label><span className="sr-only">Tell us about your project</span><textarea name="message" placeholder="Tell us about your project" maxLength={5000} className={`${field} h-[289px] resize-y py-[18px]`} /></label>
          <div className="flex flex-wrap items-center gap-4">
            <button type="submit" disabled={enquiry.pending} className="h-[57px] cursor-pointer rounded-[4px] border-0 bg-[#741a14] px-6 font-[family-name:var(--font-redhat)] text-[16px] text-white shadow-[inset_0_0_0_2px_rgba(255,255,255,0.68)] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#741a14]">
              {enquiry.pending ? "Sending…" : "Submit"}
            </button>
            {enquiry.message && <p role={enquiry.failed ? "alert" : "status"} className={`m-0 text-[14px] ${enquiry.failed ? "text-maple" : "text-[#2f6b32]"}`}>{enquiry.message}</p>}
          </div>
        </form>
      </div>
    </section>
  );
}
