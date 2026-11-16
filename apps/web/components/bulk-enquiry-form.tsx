"use client";
import { useEffect, useId, useRef, type FormEvent, type InputHTMLAttributes, type ReactNode } from "react";
import { SiteWord, useSiteWord, useSiteWordPlaceholder } from "@/components/site-words";
import { ArrowRight } from "lucide-react";
import type { EnquiryContext } from "@/lib/enquiry-context";
import { useEnquiry } from "@/components/use-enquiry";
import { useEnquiryValidation } from "@/components/enquiry-validation";

export type BulkProposalCopy = { formHeading: string; note: string; cta: string; referencesTitle: string; referencesNote: string };

const projectTypes = ["Home or residence", "Hospitality", "Workspace or office", "Retail or showroom", "Designer or architect project", "Other"];
const timelines = ["Within a month", "1–3 months", "3–6 months", "More than 6 months", "Not sure yet"];
const details = [["Company / studio", "company"], ["Project type", "projectType"], ["Project city", "city"], ["Approximate quantity", "quantity"], ["Target delivery", "timeline"]] as const;

/** The enquiry service takes a name, email, phone and message: the project's details become the message's first lines. */
function proposal(form: HTMLFormElement) {
  const value = (name: string) => {
    const field = form.elements.namedItem(name);
    return field && "value" in field ? String(field.value).trim() : "";
  };
  const lines = details.map(([label, name]) => [label, value(name)] as const).filter(([, text]) => text).map(([label, text]) => `${label}: ${text}`);
  return { name: value("name"), email: value("email"), phone: value("phone"), message: [lines.join("\n"), value("message")].filter(Boolean).join("\n\n") };
}

function Label({ text, required }: { text: ReactNode; required?: boolean }) {
  return <span className="bulk-field-label" data-field-label>{text}{required && <span aria-hidden="true"> *</span>}</span>;
}
/** `error` is the box's problem, shown under it once a send was tried (components/enquiry-validation.tsx). */
function TextField({ label, required, error, ...input }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; error?: ReactNode }) {
  return <label className="bulk-field"><Label text={label} required={required} /><input {...input} required={required} />{error}</label>;
}
function Choice({ label, name, placeholder, options, required, error, ...select }: {
  label: ReactNode; name: string; placeholder: string; options: string[]; required?: boolean; error?: ReactNode;
  "aria-invalid"?: true; "aria-describedby"?: string;
}) {
  return (
    <label className="bulk-field">
      <Label text={label} required={required} />
      <select name={name} required={required} defaultValue="" {...select}>
        <option value="">{placeholder}</option>
        {options.map(option => <option key={option} value={option}>{option}</option>)}
      </select>
      {error}
    </label>
  );
}

/**
 * "Request a project proposal" (Figma 298:1033, owner 10 Nov 2026), sent as a bulk enquiry like the old form. Plans and
 * references can't travel with an enquiry, so their box opens an email to the bulk desk instead of a file picker.
 */
export function BulkProposalForm({ copy, email, context }: { copy: BulkProposalCopy; email: string; context: EnquiryContext }) {
  const id = useId();
  const enquiry = useEnquiry();
  const check = useEnquiryValidation(
    { name: "required", phone: "required", message: "required", messagePrompt: "Please describe what you need: the pieces, sizes or finishes." },
    { projectType: "Please choose the type of project.", city: "Please enter the project's city." },
  );
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!check.check(event.currentTarget)) return;
    void enquiry.submit({ kind: "bulk", ...proposal(event.currentTarget), context });
  }
  const box = {
    name: useSiteWordPlaceholder("bulk.form.namePlaceholder"), company: useSiteWordPlaceholder("bulk.form.companyPlaceholder"),
    email: useSiteWordPlaceholder("bulk.form.emailPlaceholder"), phone: useSiteWordPlaceholder("bulk.form.phonePlaceholder"),
    city: useSiteWordPlaceholder("bulk.form.cityPlaceholder"), quantity: useSiteWordPlaceholder("bulk.form.quantityPlaceholder"),
    requirements: useSiteWordPlaceholder("bulk.form.requirementsPlaceholder"),
  };
  const selectType = useSiteWord("bulk.form.typePlaceholder"), selectDelivery = useSiteWord("bulk.form.deliveryPlaceholder");
  return (
    <form className="bulk-form" onSubmit={submit} onChange={event => { enquiry.clear(); check.onChange(event); }} aria-labelledby={`${id}-title`} noValidate>
      <h3 className="bulk-form-title" id={`${id}-title`}>{copy.formHeading}</h3>
      {(context.product || context.pincode) && (
        <p className="bulk-form-context" data-bulk-context>
          {context.product && <span><SiteWord k="bulk.form.about" /> <strong>{context.product}</strong>{context.variant && ` · ${context.variant}`}</span>}
          {context.pincode && <span><SiteWord k="bulk.form.pincode" /> {context.pincode}</span>}
        </p>
      )}
      <div className="bulk-form-fields">
        <TextField label={<SiteWord k="bulk.form.nameLabel" />} name="name" autoComplete="name" {...box.name} maxLength={100} required {...check.field("name")} error={check.message("name")} />
        <TextField label={<SiteWord k="bulk.form.companyLabel" />} name="company" autoComplete="organization" {...box.company} maxLength={120} />
        <TextField label={<SiteWord k="bulk.form.emailLabel" />} name="email" type="email" autoComplete="email" autoCapitalize="off" spellCheck={false} {...box.email} maxLength={254} required {...check.field("email")} error={check.message("email")} />
        <TextField label={<SiteWord k="bulk.form.phoneLabel" />} name="phone" type="tel" autoComplete="tel" {...box.phone} maxLength={30} required {...check.field("phone")} error={check.message("phone")} />
        <Choice label={<SiteWord k="bulk.form.typeLabel" />} name="projectType" placeholder={selectType} options={projectTypes} required {...check.field("projectType")} error={check.message("projectType")} />
        <TextField label={<SiteWord k="bulk.form.cityLabel" />} name="city" autoComplete="address-level2" {...box.city} maxLength={120} required {...check.field("city")} error={check.message("city")} />
        <TextField label={<SiteWord k="bulk.form.quantityLabel" />} name="quantity" {...box.quantity} maxLength={60} />
        <Choice label={<SiteWord k="bulk.form.deliveryLabel" />} name="timeline" placeholder={selectDelivery} options={timelines} />
        <label className="bulk-field" data-wide="">
          <Label text={<SiteWord k="bulk.form.requirementsLabel" />} required />
          <textarea name="message" rows={5} maxLength={4000} required {...box.requirements} {...check.field("message")} />
          {check.message("message")}
        </label>
      </div>
      <a className="bulk-references" data-bulk-references href={`mailto:${email}?subject=${encodeURIComponent("Project references")}`} aria-describedby={`${id}-mail`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- the design's 28px line icon */}
        <img src="/media/bulk-enquiry/upload.svg" width={28} height={28} alt="" />
        <span className="bulk-references-text"><strong>{copy.referencesTitle}</strong><span>{copy.referencesNote}</span></span>
      </a>
      <span id={`${id}-mail`} hidden>Opens an email to {email} for your files</span>
      <p className="bulk-form-note" data-bulk-form-note>{copy.note}</p>
      <button className="bulk-button bulk-form-submit" type="submit" disabled={enquiry.pending} data-fill-button="">
        <span>{enquiry.pending ? "Sending…" : copy.cta}</span> <ArrowRight aria-hidden="true" strokeWidth={1.5} />
      </button>
      {enquiry.message && (
        <p role={enquiry.failed ? "alert" : "status"} className="bulk-form-status" data-failed={enquiry.failed ? "" : undefined}>{enquiry.message}</p>
      )}
    </form>
  );
}

/**
 * The page's frame. Regions further down rise into place once as they arrive (restrained, on the site's ease); content is
 * never hidden outside that short animation, nor for anyone who prefers reduced motion.
 */
export function BulkPageFrame({ children }: { children: ReactNode }) {
  const frame = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = frame.current;
    if (!root || typeof IntersectionObserver !== "function" || typeof root.animate !== "function" || typeof window.matchMedia !== "function") return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduce.matches) return;
    const pending = new Set([...root.querySelectorAll<HTMLElement>("[data-reveal]")].filter(node => node.getBoundingClientRect().top >= window.innerHeight));
    const running = new Map<Element, Animation>();
    const observer = new IntersectionObserver(entries => {
      entries.filter(entry => entry.isIntersecting && pending.delete(entry.target as HTMLElement)).forEach((entry, index) => {
        observer.unobserve(entry.target);
        if (entry.target.contains(document.activeElement)) return;
        const animation = entry.target.animate(
          [{ opacity: 0, transform: "translateY(18px)" }, { opacity: 1, transform: "translateY(0)" }],
          { duration: 900, delay: index * 90, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "backwards" },
        );
        running.set(entry.target, animation);
        animation.finished.then(() => running.delete(entry.target), () => running.delete(entry.target));
      });
    });
    pending.forEach(node => observer.observe(node));
    const stop = () => { observer.disconnect(); pending.clear(); running.forEach(animation => animation.cancel()); running.clear(); };
    const onPreference = () => { if (reduce.matches) stop(); };
    const onFocus = (event: FocusEvent) => running.forEach((animation, node) => {
      if (node.contains(event.target as Node)) { animation.cancel(); running.delete(node); }
    });
    reduce.addEventListener("change", onPreference);
    root.addEventListener("focusin", onFocus);
    return () => { stop(); reduce.removeEventListener("change", onPreference); root.removeEventListener("focusin", onFocus); };
  }, []);
  return <div ref={frame} className="bulk-page" data-bulk-page="" data-store="">{children}</div>;
}
