"use client";

import { useState, type FormEvent } from "react";
import { useEnquiry } from "@/components/use-enquiry";
import { ArrowRight } from "lucide-react";

export function HomeProjectForm() {
  const enquiry = useEnquiry();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void enquiry.submit({kind: "project", name: String(data.get("name") ?? ""), email: String(data.get("email") ?? ""), phone: String(data.get("phone") ?? ""), message: String(data.get("message") ?? ""), context: {product:"",variant:"",sku:"",pincode:""}});
  }
  return (
    <form className="home-project-form" onSubmit={submit} onChange={enquiry.clear}>
      <div className="home-form-pair">
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
            required
            placeholder="Email *"
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
          rows={6}
          maxLength={5000}
        />
      </label>
      <button className="button" type="submit" disabled={enquiry.pending}>
        {enquiry.pending ? "Saving…" : "Submit"}
      </button>
      {enquiry.message && <p role={enquiry.failed ? "alert" : "status"} className="home-preview-detail">{enquiry.message}</p>}
    </form>
  );
}

export function HomeNewsletterForm() {
  const [continueSignup, setContinueSignup] = useState(false);
  return (
    <form
      className="home-newsletter-form"
      onSubmit={(event) => {
        event.preventDefault();
        setContinueSignup(true);
      }}
    >
      <div>
        <label className="sr-only" htmlFor="home-newsletter-email">
          Email
        </label>
        <input
          id="home-newsletter-email"
          type="email"
          name="email"
          autoComplete="email"
          placeholder="Email"
          required
        />
        <button className="button" type="submit">
          Subscribe
        </button>
      </div>
      <p className="home-preview-detail">
        Newsletter signup is not available yet.
      </p>
      {continueSignup && (
        <p role="status">
          <a href="/pages/contact">
            Contact <ArrowRight size={16} />
          </a>
          <span className="home-preview-detail">
            {" "}
            Your email has not been submitted.
          </span>
        </p>
      )}
    </form>
  );
}
