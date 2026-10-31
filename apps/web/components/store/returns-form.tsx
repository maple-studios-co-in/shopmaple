"use client";
import { BulkEnquiryForm, useEnquiryForm, type EnquiryContext } from "@/components/store/enquiry-form";

const label = "block min-w-0";
const field = "w-full rounded-none border border-[#292d2866] bg-transparent px-4 py-3.5 text-[16px] text-[#292d28] placeholder:text-[#52554f] placeholder:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-brand";

/**
 * The plain enquiry form on the returns page, in the storefront's current look (legacy
 * `.cp-form` and `.button` restated as utilities). The Help Center and Bulk Enquiry forms are
 * rebuilt in components/store/enquiry-form.
 */
export function ContactForm({
  bulk = false,
  context,
}: {
  bulk?: boolean;
  context: EnquiryContext;
}) {
  const { id, enquiry, submit } = useEnquiryForm(bulk ? "bulk" : "contact", context);
  if (bulk) return <BulkEnquiryForm context={context} />;
  return (
    <form
      data-store
      data-enquiry-form
      className="flex min-w-0 flex-col gap-4"
      onSubmit={submit}
      onChange={enquiry.clear}
      aria-describedby={`${id}-email-note`}
    >
      {(context.product || context.pincode) && (
        <div data-enquiry-context className="grid gap-1 border border-[#d8d5cd] p-3.5 wrap-anywhere">
          <strong>{context.product}</strong>
          <span className="text-[13px]">
            {context.variant}
            {context.sku ? ` · SKU: ${context.sku}` : ""}
          </span>
          {context.pincode && <span className="text-[13px]">Delivery pincode: {context.pincode}</span>}
        </div>
      )}
      <div className="grid grid-cols-2 gap-4 max-[750px]:grid-cols-[1fr]">
        <label className={label}>
          <span className="sr-only">Name</span>
          <input
            className={field}
            name="name"
            autoComplete="name"
            placeholder="Name"
            maxLength={100}
          />
        </label>
        <label className={label}>
          <span className="sr-only">Email (required)</span>
          <input
            className={field}
            name="email"
            type="email"
            autoComplete="email"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="Email *"
            required
            maxLength={254}
          />
        </label>
      </div>
      <label className={label}>
        <span className="sr-only">Phone</span>
        <input
          className={field}
          name="phone"
          type="tel"
          autoComplete="tel"
          placeholder="Phone"
          maxLength={30}
        />
      </label>
      <label className={label}>
        <span className="sr-only">Tell us about your project</span>
        <textarea
          className={`${field} block min-h-[230px] resize-y`}
          name="message"
          placeholder="Tell us about your project"
          rows={10}
          maxLength={5000}
        />
      </label>
      <button className="inline-flex min-h-12 items-center justify-center gap-3 self-start border border-brand bg-brand px-7 py-[13px] font-medium text-white transition-[background,color] duration-150 ease-[ease] hover:bg-[#571710]" type="submit" disabled={enquiry.pending}>
        {enquiry.pending ? "Saving…" : "Submit"}
      </button>
      {enquiry.message && (
        <p role={enquiry.failed ? "alert" : "status"} className="text-[12px] leading-[1.5] text-[#686a63]">
          {enquiry.message}
        </p>
      )}
    </form>
  );
}
