"use client";
import { useEffect, useRef, useState } from "react";
import { readingSection } from "@/lib/policy-outline";

type Entry = { id: string; number: string; title: string };

const label = "text-[11px] leading-[17px] font-bold text-help-muted uppercase";

/**
 * "On this page" (frames 150:2588 and 150:4278). On desktop a list beside the policy that stays in view and
 * marks the section being read; on mobile "Jump to a section ↓", which opens the same list and closes once a
 * section is chosen. Each entry is a plain link to its section, so the list works before the script loads.
 */
export function PolicyContents({ sections }: { sections: readonly Entry[] }) {
  const [reading, setReading] = useState(0);
  const menu = useRef<HTMLDetailsElement>(null);
  const ids = sections.map(section => section.id).join(" ");

  useEffect(() => {
    const targets = ids.split(" ").map(id => document.getElementById(id));
    let frame = 0;
    const measure = () => {
      frame = 0;
      const tops = targets.map(target => target?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY);
      const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      setReading(Math.max(0, readingSection(tops, Math.min(window.innerHeight * 0.3, 240), atEnd)));
    };
    const schedule = () => { frame ||= requestAnimationFrame(measure); };
    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [ids]);

  if (sections.length === 0) return null;
  const entries = (size: string, onChoose?: () => void) => sections.map((section, index) => (
    <li key={section.id}>
      <a
        href={`#${section.id}`}
        aria-current={index === reading ? "location" : undefined}
        onClick={() => { setReading(index); onChoose?.(); }}
        className={`grid grid-cols-[auto_minmax(0,1fr)] gap-x-[10px] text-help-muted transition-colors hover:text-maple aria-[current=location]:text-maple ${size}`}
      >
        <span data-number className="tabular-nums">{section.number}</span> <span data-title>{section.title}</span>
      </a>
    </li>
  ));

  return (
    <>
      <nav aria-label="On this page" data-policy-contents="list" className="hidden lg:sticky lg:top-8 lg:block lg:self-start">
        <p className={label}>On this page</p>
        <ol className="mt-[14px] flex flex-col gap-[14px]">{entries("text-[13px] leading-5")}</ol>
      </nav>
      <nav aria-label="On this page" data-policy-contents="menu" className="lg:hidden">
        <p className={label}>On this page</p>
        <details ref={menu} className="group mt-[14px]">
          {/* The arrow points down while closed and turns up once open (owner, 10 Nov 2026). */}
          <summary className="flex w-fit cursor-pointer list-none items-center text-[16px] leading-[25px] font-medium text-maple after:ml-[13px] after:inline-block after:content-['↓'] after:transition-transform after:duration-500 after:ease-[cubic-bezier(.22,1,.36,1)] group-open:after:rotate-180 motion-reduce:after:transition-none [&::-webkit-details-marker]:hidden">
            Jump to a section
          </summary>
          <ol className="mt-3 flex flex-col gap-2.5 border-l border-help-rule pl-4">
            {entries("py-0.5 text-[14px] leading-[22px]", () => { if (menu.current) menu.current.open = false; })}
          </ol>
        </details>
      </nav>
    </>
  );
}
