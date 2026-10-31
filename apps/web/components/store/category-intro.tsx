"use client";
import { useId, useState } from "react";

/**
 * The category's introduction, folded after 200 characters. With `heading` it opens the page with
 * the category's name as the one h1 (no hero card on show); without it, the hero carries the h1 and
 * this is the text alone, after the product rows.
 */
export function CategoryIntro({ title, description, heading = true }: { title: string; description: string; heading?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const content = description.replace(/\s+/g, " ").trim();
  const collapsible = content.length > 200;
  return (
    <section data-category-intro data-category-section="intro" aria-label={heading ? undefined : `About ${title}`} className="mx-auto flex w-full max-w-[1440px] flex-col items-start gap-5 p-16 max-[1024px]:px-8 max-[1024px]:py-12 max-[750px]:gap-4 max-[750px]:px-5 max-[750px]:py-10">
      {heading && <h1 className="m-0 font-serif text-h1 font-bold text-espresso max-[750px]:text-title">{title}</h1>}
      <p id={id} className="m-0 max-w-[760px] text-lead text-taupe max-[750px]:text-card">
        {expanded || !collapsible ? content : `${content.slice(0, 197)}...`}
      </p>
      {collapsible && (
        <button
          type="button"
          aria-controls={id}
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
          className="-mt-2 cursor-pointer border-0 bg-transparent p-1 font-body text-ui font-bold text-brand underline underline-offset-4 hover:text-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          {expanded ? "Read less" : "Read more"}
        </button>
      )}
    </section>
  );
}
