"use client";
import { useId, type FormEvent } from "react";
import type { EnquiryInput } from "@shopmaple/contracts";
import { useEnquiry } from "../use-enquiry";

export type EnquiryContext = {
  product: string;
  variant: string;
  sku: string;
  pincode: string;
};

/** The one enquiry submission: every form posts the same fields to the enquiry API. */
export function useEnquiryForm(kind: EnquiryInput["kind"], context: EnquiryContext) {
  const id = useId();
  const enquiry = useEnquiry();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void enquiry.submit({
      kind,
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      phone: String(form.get("phone") ?? ""),
      message: String(form.get("message") ?? ""),
      context,
    });
  }
  return { id, enquiry, submit };
}

const hasContext = (context: EnquiryContext) => Boolean(context.product || context.pincode);
function ContextLines({ context, detail }: { context: EnquiryContext; detail: string }) {
  return (
    <>
      <strong>{context.product}</strong>
      <span className={detail}>
        {context.variant}
        {context.sku ? ` · SKU: ${context.sku}` : ""}
      </span>
      {context.pincode && <span className={detail}>Delivery pincode: {context.pincode}</span>}
    </>
  );
}

const field = "block h-[52px] w-full rounded-[6px] border border-solid border-sand bg-white px-[14px] font-body text-ui text-espresso transition-colors placeholder:text-taupe placeholder:opacity-100 hover:border-taupe focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

/** The Help Center's enquiry card ("Maple / PDF Review / Help Center"): plain fields, privacy note, Send enquiry. */
export function HelpEnquiryForm({ context }: { context: EnquiryContext }) {
  const { id, enquiry, submit } = useEnquiryForm("contact", context);
  return (
    <form data-enquiry-form className="grid min-w-0 gap-4" onSubmit={submit} onChange={enquiry.clear} aria-describedby={`${id}-email-note`}>
      {hasContext(context) && (
        <div data-enquiry-context className="grid gap-1 rounded-[6px] bg-cream px-[14px] py-3 text-ui [overflow-wrap:anywhere]">
          <ContextLines context={context} detail="text-meta text-taupe" />
        </div>
      )}
      <div className="grid grid-cols-2 gap-4 max-[750px]:grid-cols-1">
        <label className="block min-w-0">
          <span className="sr-only">Name</span>
          <input name="name" autoComplete="name" placeholder="Your name" maxLength={100} className={field} />
        </label>
        <label className="block min-w-0">
          <span className="sr-only">Email (required)</span>
          <input name="email" type="email" autoComplete="email" autoCapitalize="off" spellCheck={false}
            placeholder="Email address" required maxLength={254} className={field} />
        </label>
      </div>
      <label className="block min-w-0">
        <span className="sr-only">Phone</span>
        <input name="phone" type="tel" autoComplete="tel" placeholder="Phone number" maxLength={30} className={field} />
      </label>
      <label className="block min-w-0">
        <span className="sr-only">Tell us about your project</span>
        <textarea name="message" placeholder="Tell us about your project" rows={5} maxLength={5000}
          className={field + " h-[140px] min-h-[140px] resize-y py-[14px] leading-[1.45]"} />
      </label>
      <p id={`${id}-email-note`} data-enquiry-note className="text-label text-taupe">Your information stays with us.</p>
      <button type="submit" disabled={enquiry.pending}
        className="inline-flex h-12 w-[190px] cursor-pointer items-center justify-center rounded-[6px] border-0 bg-brand px-[14px] font-body text-ui font-bold text-white transition-colors hover:bg-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-60 max-[750px]:w-full">
        {enquiry.pending ? "Saving…" : <>Send enquiry <span aria-hidden="true" className="ml-1">→</span></>}
      </button>
      {enquiry.message && (
        <p role={enquiry.failed ? "alert" : "status"} className={"text-meta " + (enquiry.failed ? "text-brand" : "text-espresso")}>
          {enquiry.message}
        </p>
      )}
    </form>
  );
}

/** The Bulk Enquiry hero form, on utilities with the current look (unchanged from before). */
export function BulkEnquiryForm({ context }: { context: EnquiryContext }) {
  const { id, enquiry, submit } = useEnquiryForm("bulk", context);
  const input = "min-h-11 w-full rounded-[14px] border border-solid border-[#d9d9d9] bg-white px-[18px] py-4 text-[16px] text-[#111] placeholder:text-[#52554f] placeholder:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-brand";
  return (
    <form data-enquiry-form className="flex min-w-0 flex-col gap-[14px]" onSubmit={submit} onChange={enquiry.clear} aria-describedby={`${id}-email-note`}>
      {hasContext(context) && (
        <div data-enquiry-context className="grid gap-1 border border-solid border-[#d8d5cd] p-[14px] [overflow-wrap:anywhere]">
          <ContextLines context={context} detail="text-[13px]" />
        </div>
      )}
      <div className="flex flex-col gap-[14px]">
        <label className="block min-w-0">
          <span className="sr-only">Full Name (required)</span>
          <input name="name" autoComplete="name" placeholder="Full Name" required maxLength={100} className={input} />
        </label>
        <label className="block min-w-0">
          <span className="sr-only">Email (required)</span>
          <input name="email" type="email" autoComplete="email" autoCapitalize="off" spellCheck={false}
            placeholder="Email Address" required maxLength={254} className={input} />
        </label>
      </div>
      <label className="block min-w-0">
        <span className="sr-only">Phone Number (required)</span>
        <input name="phone" type="tel" autoComplete="tel" placeholder="Phone Number" required maxLength={30} className={input} />
      </label>
      <button type="submit" disabled={enquiry.pending}
        className="inline-flex min-h-12 w-full items-center justify-center gap-3 self-start rounded-[14px] border-0 bg-brand p-[18px] text-[18px] font-semibold text-white no-underline transition-[background,color] duration-150 ease-[ease]">
        {enquiry.pending ? "Saving…" : "Request Proposal"}
      </button>
      {enquiry.message && (
        <p role={enquiry.failed ? "alert" : "status"} className="m-0 text-[12px] leading-[1.5] text-[#686a63]">
          {enquiry.message}
        </p>
      )}
    </form>
  );
}
