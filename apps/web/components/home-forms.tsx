"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight } from "lucide-react";

export function HomeProjectForm() {
  function openEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const body = `Name: ${data.get("name")}\nEmail: ${data.get("email")}\nPhone: ${data.get("phone")}\n\nProject details:\n${data.get("message")}`;
    window.location.href = `mailto:contact@maplefurnishers.com?subject=${encodeURIComponent("Furniture project enquiry")}&body=${encodeURIComponent(body)}`;
  }
  return (
    <form className="home-project-form" onSubmit={openEmail}>
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
      <button className="button" type="submit">
        Submit
      </button>
      <p className="home-preview-detail">
        Opens your email app with your enquiry. Send the email to
        contact@maplefurnishers.com to reach our team.
      </p>
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
        Complete your subscription on our live store.
      </p>
      {continueSignup && (
        <p role="status">
          <a href="https://shop.maplefurnishers.com/#shopify-section-template--20718709178557__section_kffDfT">
            Continue to newsletter signup <ArrowRight size={16} />
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
