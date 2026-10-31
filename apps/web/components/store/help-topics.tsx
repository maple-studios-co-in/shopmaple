"use client";
import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Headset, Plus } from "lucide-react";
import { shopFile } from "@/lib/format";
import { cn } from "@/lib/utils";

export type HelpCategory = {
  key?: string;
  title: string;
  subtitle: string;
  icon: string;
  questions: {
    key?: string;
    question: string;
    answer: string;
  }[];
};

const focusRing = "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand";

/**
 * "Browse from category" ("Maple Website review"): the category list beside the selected
 * category's questions. Below 990 px a category opens its questions in a full-screen dialog.
 */
export function HelpTopics({ categories }: { categories: HelpCategory[] }) {
  const [active, setActive] = useState<string | number>(categories[0]?.key ?? 0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      const update = () => setMobile(window.innerWidth <= 990);
      update();
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }
    const viewport = window.matchMedia("(max-width: 990px)");
    const update = () => setMobile(viewport.matches);
    update();
    viewport.addEventListener?.("change", update);
    return () => viewport.removeEventListener?.("change", update);
  }, []);
  useEffect(() => {
    if (!mobileOpen) return;
    dialog.current?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileOpen]);
  const id = useId();
  const activeIndex = typeof active === "string"
    ? categories.findIndex(category => category.key === active)
    : active;
  const selectedIndex = activeIndex < 0 ? 0 : activeIndex;
  const category = categories[selectedIndex];
  if (!category) return null;
  const answers = (
    <>
      <div key={category.key ?? category.title} className="grid">
        {category.questions.map((item) => (
          <details key={item.key ?? item.question} className="group border-0 border-b border-solid border-sand">
            <summary className={cn("flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-5 py-3 text-ui font-medium text-espresso marker:hidden [&::-webkit-details-marker]:hidden", focusRing)}>
              {item.question}
              <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-full border border-solid border-sand text-brand">
                <Plus className="size-4 transition-transform group-open:rotate-45 motion-reduce:transition-none" />
              </span>
            </summary>
            <p className="pb-4 text-ui leading-[1.7] whitespace-pre-line text-taupe">{item.answer}</p>
          </details>
        ))}
      </div>
      <div data-help-support className="mt-6 flex flex-wrap items-center gap-4 rounded-xl bg-cream p-4 sm:flex-nowrap">
        <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-full bg-white text-brand">
          <Headset className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <strong className="block text-card font-semibold text-espresso">Still need help?</strong>
          <p className="mt-0.5 text-meta text-[#5f584f]">
            Account sign-in and order tracking are not available on this
            storefront yet. Contact support for help with an existing order.
          </p>
        </div>
        <a href="mailto:contact@maplefurnishers.com"
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-sm border border-solid border-brand bg-white px-4 text-meta font-semibold whitespace-nowrap text-brand no-underline transition-colors hover:bg-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand max-sm:w-full max-sm:justify-center">
          Contact Support <ArrowRight aria-hidden="true" className="size-4" />
        </a>
      </div>
    </>
  );
  return (
    <div className="grid overflow-hidden rounded-2xl border border-solid border-sand bg-white min-[991px]:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)]">
      <div data-help-categories aria-label="Help categories" className="flex flex-col bg-linen min-[991px]:border-0 min-[991px]:border-r min-[991px]:border-solid min-[991px]:border-sand">
        {categories.map((item, index) => {
          const selected = selectedIndex === index;
          return (
            <button
              key={item.key ?? item.title}
              type="button"
              data-active={selected}
              aria-pressed={selected}
              aria-controls={`${id}-${mobile || mobileOpen ? "dialog" : "answers"}`}
              aria-haspopup={mobile || mobileOpen ? "dialog" : undefined}
              aria-expanded={mobile || mobileOpen ? mobileOpen && selected : undefined}
              onClick={() => {
                setActive(item.key ?? index);
                if (mobile) setMobileOpen(true);
              }}
              className={cn(
                "flex w-full cursor-pointer items-center gap-3 border-0 border-b border-solid border-sand px-5 py-4 text-left transition-colors last:border-b-0",
                focusRing,
                selected ? "bg-cream text-brand min-[991px]:shadow-[inset_-3px_0_0_var(--color-brand)]" : "bg-transparent text-espresso hover:bg-cream/60",
              )}
            >
              <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-white">
                <Image src={shopFile(item.icon)} alt="" width={26} height={26} className="size-[26px]" />
              </span>
              <span className="min-w-0 flex-1">
                <strong className="block text-card leading-[1.3] font-semibold">{item.title}</strong>
                <span className="mt-0.5 block text-label text-[#5f584f]">{item.subtitle}</span>
              </span>
              <span aria-hidden="true" className={cn("grid size-7 shrink-0 place-items-center rounded-full border border-solid", selected ? "border-brand bg-brand text-white" : "border-sand bg-white text-brand")}>
                <ArrowRight className="size-3.5" />
              </span>
            </button>
          );
        })}
      </div>
      <div
        id={`${id}-answers`}
        data-help-answers
        role="region"
        aria-label={category.title}
        className="min-w-0 px-6 py-3 pb-6 max-[991px]:hidden lg:px-8"
      >
        {answers}
      </div>
      <dialog
        id={`${id}-dialog`}
        ref={dialog}
        data-help-dialog
        aria-label={category.title}
        onClose={() => setMobileOpen(false)}
        className="fixed inset-0 m-0 h-full max-h-none w-full max-w-none border-0 bg-white p-0 text-espresso backdrop:bg-espresso/40"
      >
        <button
          data-help-back
          type="button"
          onClick={() => dialog.current?.close()}
          className={cn("sticky top-0 z-[1] flex min-h-[60px] w-full cursor-pointer items-center gap-2.5 border-0 border-b border-solid border-sand bg-white px-[18px] text-price font-medium text-espresso", focusRing)}
        >
          <ArrowLeft aria-hidden="true" className="size-5" /> Back to categories
        </button>
        <div className="px-[18px] pb-6">
          <h3 className="pt-5 pb-2 font-serif text-h4 text-brand">{category.title}</h3>
          {answers}
        </div>
      </dialog>
    </div>
  );
}
