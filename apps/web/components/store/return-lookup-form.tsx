"use client";
import { useId, useRef, useState, type FormEvent } from "react";
import { createEnquirySender } from "@/lib/enquiry-client";
import { returnRequest } from "@/lib/return-request";
import type { CareContact } from "./help-page";

type State =
  | { status: "idle" }
  | { status: "invalid"; field: "order" | "contact"; message: string }
  | { status: "phone"; order: string }
  | { status: "sending" }
  | { status: "sent"; order: string; email: string; reference: string }
  | { status: "failed" };

// Figma draws strokes inside a box, so each padding here is the frame's less the 1 px border: the fields stay
// 55 px tall and the card's content 488 px wide (302 on mobile), as drawn.
const control = "w-full rounded-[4px] border border-help-rule bg-help-page p-[15px] text-[15px] leading-[23px] font-normal text-help-ink placeholder:text-help-muted focus-visible:border-maple focus-visible:outline-2 focus-visible:outline-maple/20 aria-[invalid=true]:border-maple";
const fieldLabel = "flex flex-col gap-2 text-[14px] leading-[22px] font-medium";
const fieldError = "mt-2 text-[13px] leading-5 text-maple";
const link = "font-medium underline underline-offset-2";

/**
 * "Find your order" on the Return & Exchange frame. The store cannot look orders up, so the order number and
 * the email it was placed with go to the care team as a Return & Exchange enquiry; a phone number gets the
 * care team's number to call instead.
 */
export function ReturnLookupForm({ care }: { care: CareContact }) {
  const id = useId();
  const sender = useRef<ReturnType<typeof createEnquirySender> | null>(null);
  const [state, setState] = useState<State>({ status: "idle" });
  const invalid = (field: "order" | "contact") => state.status === "invalid" && state.field === field;
  const described = (field: "order" | "contact") => (invalid(field) ? `${id}-${field}-error` : undefined);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.status === "sending") return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const request = returnRequest({ order: String(values.get("order") ?? ""), contact: String(values.get("contact") ?? "") });
    if (request.kind === "invalid") {
      setState({ status: "invalid", field: request.field, message: request.message });
      form.querySelector<HTMLInputElement>(`[name="${request.field}"]`)?.focus();
      return;
    }
    if (request.kind === "phone") return setState({ status: "phone", order: request.order });
    setState({ status: "sending" });
    try {
      sender.current ??= createEnquirySender();
      const receipt = await sender.current(request.enquiry);
      setState({ status: "sent", order: request.order, email: request.email, reference: receipt.reference });
    } catch {
      setState({ status: "failed" });
    }
  }

  return (
    <form
      data-return-lookup
      noValidate
      onSubmit={event => void submit(event)}
      onChange={() => { if (state.status === "invalid" || state.status === "phone" || state.status === "failed") setState({ status: "idle" }); }}
      aria-labelledby={`${id}-title`}
      className="flex w-full max-w-[560px] flex-col gap-5 rounded-[8px] border border-help-rule bg-white px-[19px] py-[31px] lg:px-[35px]"
    >
      <h2 id={`${id}-title`} className="text-[28px] leading-[43px] font-medium">Find your order</h2>
      <div>
        <label className={fieldLabel}>
          Order number
          <input
            className={control} name="order" placeholder="e.g. #1001" autoComplete="off" spellCheck={false} maxLength={40} required
            aria-invalid={invalid("order") || undefined} aria-describedby={described("order")}
          />
        </label>
        {invalid("order") && state.status === "invalid" && <p id={`${id}-order-error`} className={fieldError}>{state.message}</p>}
      </div>
      <div>
        <label className={fieldLabel}>
          Email or phone number
          <input
            className={control} name="contact" placeholder="Used when placing your order" autoComplete="email" spellCheck={false} maxLength={254} required
            aria-invalid={invalid("contact") || undefined} aria-describedby={described("contact")}
          />
        </label>
        {invalid("contact") && state.status === "invalid" && <p id={`${id}-contact-error`} className={fieldError}>{state.message}</p>}
      </div>
      <button
        type="submit"
        data-fill-button=""
        disabled={state.status === "sending"}
        aria-busy={state.status === "sending" || undefined}
        className="w-full cursor-pointer rounded-[4px] border-0 bg-maple py-[15px] text-center text-[14px] leading-[22px] font-medium text-white uppercase after:ml-[7px] after:content-['→'] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maple disabled:cursor-wait disabled:opacity-80"
      >
        {state.status === "sending" ? "Sending" : "Find your order"}
      </button>
      {state.status === "phone" && (
        <p role="alert" className="text-[14px] leading-[22px] text-help-ink">
          To find your order online we need the email you ordered with. Or call us on{" "}
          <a href={`tel:${care.phone}`} className={link}>{care.phoneLabel}</a> and quote order {state.order}.
        </p>
      )}
      {state.status === "failed" && (
        <p role="alert" className="text-[14px] leading-[22px] text-help-ink">
          Your request could not be saved just now. Please try again, or write to{" "}
          <a href={`mailto:${care.email}`} className={link}>{care.email}</a> or call{" "}
          <a href={`tel:${care.phone}`} className={link}>{care.phoneLabel}</a>.
        </p>
      )}
      <div>
        {/* Always present, so a screen reader announces the confirmation when it arrives. */}
        <div role="status" className="text-[14px] leading-[22px] text-help-ink">
          {state.status === "sent" && (
            <div className="mb-4 rounded-[4px] bg-help-page px-4 py-3">
              <p className="font-medium text-maple">Thank you. Your request is with our care team.</p>
              <p className="mt-1">They will look up order {state.order} and reply to {state.email} about your return or exchange.</p>
              <p className="mt-1 text-[13px] leading-5 text-help-muted">Reference: {state.reference}</p>
            </div>
          )}
        </div>
        <p data-return-note className="text-[13px] leading-5 text-help-muted">You can find your order number in your confirmation email.</p>
        {/* The returns page's standing notice, kept from the old form: sending is not an approval. */}
        <p className="mt-1 text-[13px] leading-5 text-help-muted">This form saves an enquiry; it does not automatically approve a return or issue a refund.</p>
      </div>
    </form>
  );
}
