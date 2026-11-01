"use client";

import { useEffect, useState } from "react";
import type { HeadingOutline } from "@/components/store-content";

/**
 * The policy's "On this page" list. Beside the text on wide screens it stays in view and marks the
 * section being read; on narrow screens it folds behind a button above the text.
 */
export function PolicyContents({ entries }: { entries: HeadingOutline["entries"] }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<string>();

  useEffect(() => {
    const headings = entries.map(entry => document.getElementById(entry.id)).filter(heading => heading !== null);
    if (!headings.length || typeof IntersectionObserver === "undefined") return;
    // The section being read is the last heading that has passed the top third of the window.
    const observer = new IntersectionObserver(() => {
      const passed = headings.filter(heading => heading.getBoundingClientRect().top < window.innerHeight / 3);
      setCurrent((passed.at(-1) ?? headings[0])?.id);
    }, { rootMargin: "0px 0px -66% 0px" });
    headings.forEach(heading => observer.observe(heading));
    return () => observer.disconnect();
  }, [entries]);

  if (!entries.length) return null;
  return (
    <nav className="policy-contents" aria-label="On this page" data-open={open}>
      <p className="policy-contents-title" aria-hidden="true">On this page</p>
      <button type="button" className="policy-contents-toggle" aria-expanded={open} aria-controls="policy-contents-list" onClick={() => setOpen(!open)}>
        On this page
        <span aria-hidden="true" />
      </button>
      <ol id="policy-contents-list">
        {entries.map(entry => (
          <li key={entry.id} data-level={entry.level}>
            <a href={`#${entry.id}`} aria-current={entry.id === current ? "location" : undefined} onClick={() => setOpen(false)}>
              {entry.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
