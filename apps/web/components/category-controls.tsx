"use client";

import { useId, useState } from "react";

export function CategoryIntroduction({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const content = description.replace(/\s+/g, " ").trim();
  const collapsible = content.length > 200;
  return (
    <section className="landing-intro">
      <h1>{title}</h1>
      <p id={id}>{expanded || !collapsible ? content : `${content.slice(0, 197)}...`}</p>
      {collapsible && (
        <button
          type="button"
          aria-controls={id}
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Read Less" : "Read More"}
        </button>
      )}
    </section>
  );
}
