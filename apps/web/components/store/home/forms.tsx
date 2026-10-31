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
    <form data-project-form className="grid gap-4 font-body" onSubmit={submit} onChange={enquiry.clear}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label>
          <span className="sr-only">Name</span>
          <input
            name="name"
            autoComplete="name"
            placeholder="Your name"
            maxLength={100}
            className="h-[50px] w-full rounded-sm border border-solid border-sand bg-white px-3.5 text-ui text-espresso placeholder:text-taupe focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
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
            className="h-[50px] w-full rounded-sm border border-solid border-sand bg-white px-3.5 text-ui text-espresso placeholder:text-taupe focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
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
          className="h-[50px] w-full rounded-sm border border-solid border-sand bg-white px-3.5 text-ui text-espresso placeholder:text-taupe focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
        />
      </label>
      <label>
        <span className="sr-only">Tell us about your project</span>
        <textarea
          name="message"
          placeholder="Tell us about your project"
          rows={1}
          maxLength={5000}
          className="h-[50px] min-h-[50px] w-full resize-y rounded-sm border border-solid border-sand bg-white px-3.5 py-3.5 text-ui text-espresso placeholder:text-taupe focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
        />
      </label>
      <p className="text-label text-taupe">Your information stays with us.</p>
      <button type="submit" disabled={enquiry.pending}
        className="inline-flex w-[190px] cursor-pointer items-center justify-center rounded-sm border-0 bg-brand p-3.5 text-ui font-bold text-white hover:bg-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-60">
        {enquiry.pending ? "Saving…" : "Send enquiry →"}
      </button>
      {enquiry.message && <p data-preview-detail role={enquiry.failed ? "alert" : "status"} className="text-meta text-taupe">{enquiry.message}</p>}
    </form>
  );
}

/** The newsletter form's two looks: the current panel (product page) and the homepage band. */
const newsletterLooks = {
  panel: {
    form: "grid gap-2 font-body",
    row: "flex",
    placeholder: "Email",
    input: "h-12 min-w-0 flex-1 rounded-l-md border-0 bg-white px-4 text-ui text-espresso placeholder:text-taupe focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white",
    button: "h-12 cursor-pointer rounded-r-md border border-solid border-white bg-brand px-5 text-ui font-semibold text-white hover:bg-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
    label: "Subscribe",
    note: "text-label text-white/80",
  },
  band: {
    form: "grid gap-3.5 font-body",
    row: "flex gap-3 max-[750px]:flex-col",
    placeholder: "Your email address",
    input: "h-[50px] min-w-0 flex-1 rounded-sm border border-solid border-sand bg-white px-3.5 text-ui text-espresso placeholder:text-taupe focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
    button: "h-[50px] w-[180px] cursor-pointer rounded-sm border border-solid border-sand bg-white px-3.5 text-ui font-bold text-brand hover:bg-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white max-[750px]:w-full",
    label: "Subscribe →",
    note: "text-label text-[#e9d4ca]",
  },
} as const;

export function HomeNewsletterForm({ look = "panel" }: { look?: keyof typeof newsletterLooks } = {}) {
  const styles = newsletterLooks[look];
  const [continueSignup, setContinueSignup] = useState(false);
  return (
    <form
      data-newsletter-form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        setContinueSignup(true);
      }}
    >
      <div className={styles.row}>
        <label className="sr-only" htmlFor="home-newsletter-email">
          Email
        </label>
        <input
          id="home-newsletter-email"
          type="email"
          name="email"
          autoComplete="email"
          placeholder={styles.placeholder}
          required
          className={styles.input}
        />
        <button type="submit" className={styles.button}>
          {styles.label}
        </button>
      </div>
      <p data-preview-detail className={styles.note}>
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
