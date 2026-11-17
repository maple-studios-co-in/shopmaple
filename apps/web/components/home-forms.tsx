"use client";

import type { FormEvent } from "react";
import { SiteWord, useSiteWordPlaceholder } from "@/components/site-words";
import { useEnquiry } from "@/components/use-enquiry";
import { ArrowRight } from "lucide-react";

/** `card` is the homepage look (one-line message box, "Send enquiry"); the default is the original form. */
export function HomeProjectForm({ card = false }: { card?: boolean } = {}) {
  const enquiry = useEnquiry();
  const box = {
    name: useSiteWordPlaceholder("home.projectForm.name"), email: useSiteWordPlaceholder("home.projectForm.email"),
    phone: useSiteWordPlaceholder("home.projectForm.phone"), message: useSiteWordPlaceholder("home.projectForm.message"),
  };
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void enquiry.submit({kind: "project", name: String(data.get("name") ?? ""), email: String(data.get("email") ?? ""), phone: String(data.get("phone") ?? ""), message: String(data.get("message") ?? ""), context: {product:"",variant:"",sku:"",pincode:""}});
  }
  return (
    <form className="home-project-form" {...(card ? { "data-project-card": "" } : {})} onSubmit={submit} onChange={enquiry.clear}>
      <div className="home-form-pair">
        <label>
          <span className="sr-only">Name</span>
          <input
            name="name"
            autoComplete="name"
            {...box.name}
            maxLength={100}
          />
        </label>
        <label>
          <span className="sr-only">Email (required)</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            {...box.email}
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
          {...box.phone}
          maxLength={30}
        />
      </label>
      <label>
        <span className="sr-only">Tell us about your project</span>
        <textarea
          name="message"
          {...box.message}
          rows={6}
          maxLength={5000}
        />
      </label>
      <button className="button" type="submit" disabled={enquiry.pending}>
        {enquiry.pending ? "Saving…" : card ? <><SiteWord k="home.projectForm.send" /> <ArrowRight size={14} aria-hidden /></> : "Submit"}
      </button>
      {enquiry.message && <p role={enquiry.failed ? "alert" : "status"} className="home-preview-detail">{enquiry.message}</p>}
    </form>
  );
}

/** An email for the newsletter list: kept with the enquiries, where staff can filter the admin's inbox to "Newsletter". */
export function HomeNewsletterForm() {
  const enquiry = useEnquiry();
  const emailBox = useSiteWordPlaceholder("home.newsletter.email");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") ?? "");
    void enquiry.submit({ kind: "newsletter", name: "", email, phone: "", message: "", context: { product: "", variant: "", sku: "", pincode: "" } });
  }
  return (
    <form className="home-newsletter-form" onSubmit={submit} onChange={enquiry.clear}>
      <div>
        <label className="sr-only" htmlFor="home-newsletter-email">
          Email address
        </label>
        <input
          id="home-newsletter-email"
          type="email"
          name="email"
          autoComplete="email"
          autoCapitalize="off"
          spellCheck={false}
          {...emailBox}
          maxLength={254}
          required
        />
        <button className="button" type="submit" disabled={enquiry.pending}>
          {enquiry.pending ? "Adding…" : <SiteWord k="home.newsletter.subscribe" />}
        </button>
      </div>
      {enquiry.message && (enquiry.failed
        ? <p role="alert"><SiteWord k="home.newsletter.failed" /></p>
        : <p role="status"><SiteWord k="home.newsletter.thanks" /></p>)}
    </form>
  );
}
