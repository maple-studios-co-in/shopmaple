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
    <form data-project-form className="grid gap-3.5 font-body" onSubmit={submit} onChange={enquiry.clear}>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <label>
          <span className="sr-only">Name</span>
          <input
            name="name"
            autoComplete="name"
            placeholder="Your name"
            maxLength={100}
            className="h-12 w-full rounded-md border border-solid border-sand bg-white px-4 text-ui text-espresso placeholder:text-taupe focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
          />
        </label>
        <label>
          <span className="sr-only">Email (required)</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="Email address *"
            maxLength={254}
            className="h-12 w-full rounded-md border border-solid border-sand bg-white px-4 text-ui text-espresso placeholder:text-taupe focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
          />
        </label>
      </div>
      <label>
        <span className="sr-only">Phone</span>
        <input
          name="phone"
          type="tel"
          autoComplete="tel"
          placeholder="Phone number"
          maxLength={30}
          className="h-12 w-full rounded-md border border-solid border-sand bg-white px-4 text-ui text-espresso placeholder:text-taupe focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
        />
      </label>
      <label>
        <span className="sr-only">Tell us about your project</span>
        <textarea
          name="message"
          placeholder="Tell us about your project"
          rows={4}
          maxLength={5000}
          className="w-full rounded-md border border-solid border-sand bg-white px-4 text-ui text-espresso placeholder:text-taupe focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand h-auto min-h-24 resize-y py-3"
        />
      </label>
      <p className="text-label text-taupe">Your information stays with us.</p>
      <button type="submit" disabled={enquiry.pending}
        className="inline-flex h-12 w-fit cursor-pointer items-center gap-2 rounded-md border-0 bg-brand px-10 text-ui font-bold text-white hover:bg-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-60">
        {enquiry.pending ? "Saving…" : "Send enquiry →"}
      </button>
      {enquiry.message && <p data-preview-detail role={enquiry.failed ? "alert" : "status"} className="text-meta text-taupe">{enquiry.message}</p>}
    </form>
  );
}

export function HomeNewsletterForm() {
  const [continueSignup, setContinueSignup] = useState(false);
  return (
    <form
      data-newsletter-form
      className="grid gap-2 font-body"
      onSubmit={(event) => {
        event.preventDefault();
        setContinueSignup(true);
      }}
    >
      <div className="flex">
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
          className="h-12 min-w-0 flex-1 rounded-l-md border-0 bg-white px-4 text-ui text-espresso placeholder:text-taupe focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white"
        />
        <button type="submit" className="h-12 cursor-pointer rounded-r-md border border-solid border-white bg-brand px-5 text-ui font-semibold text-white hover:bg-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
          Subscribe
        </button>
      </div>
      <p data-preview-detail className="text-label text-white/80">
        Newsletter signup is not available yet.
      </p>
      {continueSignup && (
        <p role="status" className="text-meta [&_a]:inline-flex [&_a]:items-center [&_a]:gap-1 [&_a]:font-semibold [&_a]:text-white [&_a]:underline">
          <a href="/pages/contact">
            Contact <ArrowRight size={16} />
          </a>
          <span data-preview-detail className="text-white/80">
            {" "}
            Your email has not been submitted.
          </span>
        </p>
      )}
    </form>
  );
}
