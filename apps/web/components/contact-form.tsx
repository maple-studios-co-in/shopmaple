"use client";
import { BulkEnquiryForm, useEnquiryForm, type EnquiryContext } from "@/components/store/enquiry-form";

export type { EnquiryContext } from "@/components/store/enquiry-form";
export { HelpTopics as ContactHelp } from "@/components/store/help-topics";

/**
 * The plain enquiry form the returns page still uses (legacy contact-parity rules). The Help
 * Center and Bulk Enquiry forms are rebuilt in components/store/enquiry-form.
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
      data-enquiry-form
      className="cp-form"
      onSubmit={submit}
      onChange={enquiry.clear}
      aria-describedby={`${id}-email-note`}
    >
      {(context.product || context.pincode) && (
        <div data-enquiry-context className="cp-enquiry-context">
          <strong>{context.product}</strong>
          <span>
            {context.variant}
            {context.sku ? ` · SKU: ${context.sku}` : ""}
          </span>
          {context.pincode && <span>Delivery pincode: {context.pincode}</span>}
        </div>
      )}
      <div className="cp-form-pair">
        <label>
          <span className="sr-only">Name</span>
          <input
            name="name"
            autoComplete="name"
            placeholder="Name"
            maxLength={100}
          />
        </label>
        <label>
          <span className="sr-only">Email (required)</span>
          <input
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
      <label>
        <span className="sr-only">Phone</span>
        <input
          name="phone"
          type="tel"
          autoComplete="tel"
          placeholder="Phone"
          maxLength={30}
        />
      </label>
      <label>
        <span className="sr-only">Tell us about your project</span>
        <textarea
          name="message"
          placeholder="Tell us about your project"
          rows={10}
          maxLength={5000}
        />
      </label>
      <button className="button" type="submit" disabled={enquiry.pending}>
        {enquiry.pending ? "Saving…" : "Submit"}
      </button>
      {enquiry.message && (
        <p role={enquiry.failed ? "alert" : "status"} className="cp-email-note">
          {enquiry.message}
        </p>
      )}
    </form>
  );
}
