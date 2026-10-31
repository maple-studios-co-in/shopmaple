"use client";
import { useId, type FormEvent } from "react";
import { ArrowRight, Mail, MessageSquare, Phone, ShieldCheck, User } from "lucide-react";
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

const field = "block h-[52px] w-full rounded-lg border border-solid border-sand bg-white pr-4 pl-11 text-ui text-espresso transition-colors hover:border-taupe focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";
const fieldIcon = "pointer-events-none absolute top-[18px] left-4 size-4 text-taupe";

/** The Help Center's enquiry card ("Maple Website review"): icon fields, privacy note, Send Enquiry. */
export function HelpEnquiryForm({ context }: { context: EnquiryContext }) {
  const { id, enquiry, submit } = useEnquiryForm("contact", context);
  return (
    <form data-enquiry-form className="grid min-w-0 gap-4" onSubmit={submit} onChange={enquiry.clear} aria-describedby={`${id}-email-note`}>
      {hasContext(context) && (
        <div data-enquiry-context className="grid gap-1 rounded-lg bg-cream px-4 py-3 text-ui [overflow-wrap:anywhere]">
          <ContextLines context={context} detail="text-meta text-[#5f584f]" />
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="relative block min-w-0">
          <span className="sr-only">Name</span>
          <User aria-hidden="true" className={fieldIcon} />
          <input name="name" autoComplete="name" placeholder="Your Name" maxLength={100} className={field} />
        </label>
        <label className="relative block min-w-0">
          <span className="sr-only">Email (required)</span>
          <Mail aria-hidden="true" className={fieldIcon} />
          <input name="email" type="email" autoComplete="email" autoCapitalize="off" spellCheck={false}
            placeholder="Email Address *" required maxLength={254} className={field} />
        </label>
      </div>
      <label className="relative block min-w-0">
        <span className="sr-only">Phone</span>
        <Phone aria-hidden="true" className={fieldIcon} />
        <input name="phone" type="tel" autoComplete="tel" placeholder="Phone Number" maxLength={30} className={field} />
      </label>
      <label className="relative block min-w-0">
        <span className="sr-only">Tell us about your project</span>
        <MessageSquare aria-hidden="true" className={fieldIcon} />
        <textarea name="message" placeholder="Tell us about your project" rows={8} maxLength={5000}
          className={field + " h-auto min-h-[200px] resize-y pt-[15px] leading-[1.5]"} />
      </label>
      <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
        <p className="flex items-center gap-2 text-meta text-taupe">
          <ShieldCheck aria-hidden="true" className="size-4 shrink-0 text-espresso" />
          <span id={`${id}-email-note`} data-enquiry-note>Your information is safe with us</span>
        </p>
        <button type="submit" disabled={enquiry.pending}
          className="inline-flex h-12 cursor-pointer items-center justify-center gap-2 rounded-sm border-0 bg-brand px-6 text-ui font-semibold text-white transition-colors hover:bg-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-60 max-sm:w-full">
          {enquiry.pending ? "Saving…" : "Send Enquiry"}
          {!enquiry.pending && <ArrowRight aria-hidden="true" className="size-4" />}
        </button>
      </div>
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
