"use client";
import { useId, useState } from "react";

/** The category's name (the page's one h1) and its introduction, folded after 200 characters. */
export function CategoryIntro({ title, description }: { title: string; description: string }) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const content = description.replace(/\s+/g, " ").trim();
  const collapsible = content.length > 200;
  return (
    <section data-category-intro data-category-section="intro" className="mx-auto grid w-full max-w-[880px] justify-items-center gap-3 px-4 pt-10 pb-2 text-center md:px-8 md:pt-14">
      <h1 className="m-0 font-serif text-title font-medium text-espresso md:text-h1">{title}</h1>
      <p id={id} className="m-0 text-card text-[#5e574f] md:text-lead">
        {expanded || !collapsible ? content : `${content.slice(0, 197)}...`}
      </p>
      {collapsible && (
        <button
          type="button"
          aria-controls={id}
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
          className="cursor-pointer border-0 bg-transparent p-1 font-body text-ui font-bold text-brand underline underline-offset-4 hover:text-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          {expanded ? "Read less" : "Read more"}
        </button>
      )}
    </section>
  );
}
