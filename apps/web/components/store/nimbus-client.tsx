"use client";

import { useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useEnquiry } from "@/components/use-enquiry";

/** The Nimbus room carousel: one room at a time, with previous, next and per-room controls. */
export function NimbusSlideshow({
  slides,
}: {
  slides: { key?: string; desktop: string; mobile: string; alt: string }[];
}) {
  const [index, setIndex] = useState(0);
  const slide = slides[index]!;
  const control = "grid h-11 w-11 cursor-pointer place-items-center [border:0] bg-transparent text-brand";
  return (
    <section
      data-store
      data-nimbus-region="rooms-slideshow"
      aria-label="Nimbus rooms"
      aria-roledescription="carousel"
    >
      <picture className="block w-full">
        <source media="(max-width: 749px)" srcSet={slide.mobile} />
        <img
          src={slide.desktop}
          alt={slide.alt}
          loading="lazy"
          className="block h-[65svh] min-h-[400px] w-full object-cover max-[749px]:h-auto max-[749px]:min-h-0"
        />
      </picture>
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {slide.alt} — {index + 1} / {slides.length}
      </span>
      <div className="flex justify-center gap-[6px] p-3">
        <button
          type="button"
          className={control}
          onClick={() => setIndex((index + slides.length - 1) % slides.length)}
          aria-label="Previous room"
        >
          <ArrowLeft size={18} />
        </button>
        {slides.map((item, i) => (
          <button
            key={item.key ?? item.alt}
            type="button"
            className={control}
            onClick={() => setIndex(i)}
            aria-label={`Show ${item.alt}`}
            aria-pressed={i === index}
          >
            <span className={`h-2 w-2 rounded-[50%] ${i === index ? "bg-brand" : "bg-[#741a1466]"}`} />
          </button>
        ))}
        <button
          type="button"
          className={control}
          onClick={() => setIndex((index + 1) % slides.length)}
          aria-label="Next room"
        >
          <ArrowRight size={18} />
        </button>
      </div>
    </section>
  );
}

const field = "w-full rounded-none border border-[#292d2866] bg-transparent p-[14px] text-[#292d28]";

/** The Nimbus project enquiry: saves a "project" enquiry through the shared enquiry client. */
export function NimbusProjectForm() {
  const enquiry = useEnquiry();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void enquiry.submit({kind: "project", name: String(data.get("name") ?? ""), email: String(data.get("email") ?? ""), phone: String(data.get("phone") ?? ""), message: String(data.get("message") ?? ""), context: {product:"",variant:"",sku:"",pincode:""}});
  }
  return (
    <form data-nimbus-project-form className="flex flex-col gap-4" onSubmit={submit} onChange={enquiry.clear}>
      <div className="grid grid-cols-[1fr_1fr] gap-4 max-[749px]:grid-cols-[1fr]">
        <label>
          <span className="sr-only">Name</span>
          <input
            name="name"
            autoComplete="name"
            placeholder="Name"
            maxLength={100}
            className={`${field} min-h-11 placeholder:text-ink-soft`}
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
            className={`${field} min-h-11 placeholder:text-ink-soft`}
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
          className={`${field} min-h-11 placeholder:text-ink-soft`}
        />
      </label>
      <label>
        <span className="sr-only">Tell us about your project</span>
        <textarea
          name="message"
          placeholder="Tell us about your project"
          rows={6}
          maxLength={5000}
          className={`${field} block resize-y placeholder:text-[#757575]`}
        />
      </label>
      <button
        className="inline-flex min-h-12 items-center justify-center gap-3 self-start border border-brand bg-brand px-6 py-[13px] font-medium text-white no-underline transition-[background,color] duration-150 hover:bg-[#571710]"
        type="submit"
        disabled={enquiry.pending}
      >
        {enquiry.pending ? "Saving…" : "Submit"}
      </button>
      {enquiry.message && <p role={enquiry.failed ? "alert" : "status"} className="m-0 text-[16px] leading-[1.5] opacity-75">{enquiry.message}</p>}
    </form>
  );
}
