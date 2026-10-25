"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Plus } from "lucide-react";
import { shopFile } from "@/lib/format";

export type EnquiryContext = {
  product: string;
  variant: string;
  sku: string;
  pincode: string;
};

export function ContactForm({
  bulk = false,
  context,
}: {
  bulk?: boolean;
  context: EnquiryContext;
}) {
  const id = useId();
  function openEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = [
      `Name: ${form.get("name") ?? ""}`,
      `Email: ${form.get("email") ?? ""}`,
      `Phone: ${form.get("phone") ?? ""}`,
      ...(context.product
        ? [
            `Product: ${context.product}`,
            `Variant: ${context.variant}`,
            `SKU: ${context.sku}`,
          ]
        : []),
      ...(context.pincode ? [`Delivery pincode: ${context.pincode}`] : []),
      "",
      bulk
        ? "I would like a proposal for my furniture project."
        : "Project details:",
      String(form.get("message") ?? ""),
    ].join("\n");
    const subject = context.product
      ? `Enquiry: ${context.product}`
      : bulk
        ? "Bulk furniture project enquiry"
        : "Furniture enquiry";
    const recipient = bulk
      ? "aayushi@maplefurnishers.com"
      : "contact@maplefurnishers.com";
    window.location.href = `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }
  return (
    <form
      className={`cp-form ${bulk ? "cp-form-bulk" : ""}`}
      onSubmit={openEmail}
      aria-describedby={`${id}-email-note`}
    >
      {(context.product || context.pincode) && (
        <div className="cp-enquiry-context">
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
          <span className="sr-only">
            {bulk ? "Full Name (required)" : "Name"}
          </span>
          <input
            name="name"
            autoComplete="name"
            placeholder={bulk ? "Full Name" : "Name"}
            required={bulk}
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
            placeholder={bulk ? "Email Address" : "Email *"}
            required
            maxLength={254}
          />
        </label>
      </div>
      <label>
        <span className="sr-only">
          {bulk ? "Phone Number (required)" : "Phone"}
        </span>
        <input
          name="phone"
          type="tel"
          autoComplete="tel"
          placeholder={bulk ? "Phone Number" : "Phone"}
          required={bulk}
          maxLength={30}
        />
      </label>
      {!bulk && (
        <label>
          <span className="sr-only">Tell us about your project</span>
          <textarea
            name="message"
            placeholder="Tell us about your project"
            rows={10}
            maxLength={5000}
          />
        </label>
      )}
      <button className="button" type="submit">
        {bulk ? "Request Proposal" : "Submit"}
      </button>
      <p id={`${id}-email-note`} className="cp-email-note">
        Opens your email app. Send your enquiry there to reach our team.
      </p>
    </form>
  );
}

type HelpCategory = {
  title: string;
  subtitle: string;
  icon: string;
  questions: { question: string; answer: string }[];
};
export function ContactHelp({ categories }: { categories: HelpCategory[] }) {
  const [active, setActive] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!mobileOpen) return;
    dialog.current?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileOpen]);
  const id = useId();
  const category = categories[active];
  if (!category) return null;
  const answers = (
    <>
      <div key={category.title}>
        {category.questions.map((item) => (
          <details key={item.question} className="cp-faq">
            <summary>
              {item.question}
              <Plus size={20} aria-hidden="true" />
            </summary>
            <p>{item.answer}</p>
          </details>
        ))}
      </div>
      <p className="cp-account-note">
        For existing orders and account services, visit{" "}
        <a href="https://shop.maplefurnishers.com/account">
          your account on our live store
        </a>{" "}
        or <a href="mailto:contact@maplefurnishers.com">contact our team</a>.
      </p>
    </>
  );
  return (
    <div className="cp-help">
      <div className="cp-help-categories" aria-label="Help categories">
        {categories.map((item, index) => (
          <button
            key={item.title}
            type="button"
            aria-pressed={active === index}
            aria-controls={`${id}-answers`}
            className={active === index ? "is-active" : ""}
            onClick={() => {
              setActive(index);
              if (window.matchMedia("(max-width: 990px)").matches)
                setMobileOpen(true);
            }}
          >
            <Image src={shopFile(item.icon)} alt="" width={52} height={52} />
            <span>
              <strong>{item.title}</strong>
              <span>{item.subtitle}</span>
            </span>
            <ArrowRight size={20} aria-hidden="true" />
          </button>
        ))}
      </div>
      <div
        id={`${id}-answers`}
        className="cp-help-answers"
        role="region"
        aria-label={category.title}
      >
        {answers}
      </div>
      <dialog
        ref={dialog}
        className="cp-help-dialog"
        aria-label={category.title}
        onClose={() => setMobileOpen(false)}
      >
        <button
          className="cp-help-back"
          type="button"
          onClick={() => dialog.current?.close()}
        >
          <ArrowLeft size={20} /> Back to categories
        </button>
        {answers}
      </dialog>
    </div>
  );
}
