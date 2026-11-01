"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { cx } from "@/lib/cx";

export type HelpCategory = {
  key?: string;
  title: string;
  subtitle: string;
  questions: {
    key?: string;
    question: string;
    answer: string;
  }[];
};

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";
const supportLink = "text-brand no-underline hover:underline " + focusRing;

/**
 * "How can we help?" ("Maple / PDF Review / Help Center"): the topic buttons beside the selected
 * topic's questions, the first one open. `aside` sits under the topics. Below 990 px a topic opens
 * its questions in a full-screen dialog.
 */
export function HelpTopics({ categories, aside }: { categories: HelpCategory[]; aside?: ReactNode }) {
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
      <div key={category.key ?? category.title} className="flex flex-col gap-3">
        {category.questions.map((item, index) => (
          <details key={item.key ?? item.question} open={item.key ? item.key === "q1" : index === 0} className="group rounded-[8px] bg-white p-6 max-[750px]:p-5">
            <summary className={cx("cursor-pointer list-none text-subhead font-bold text-espresso marker:hidden after:ml-3 after:content-['+'] group-open:after:content-['−'] max-[750px]:text-price [&::-webkit-details-marker]:hidden", focusRing)}>
              <span data-help-question>{item.question}</span>
            </summary>
            <p className="mt-4 text-price leading-[1.45] whitespace-pre-line text-taupe max-[750px]:text-ui">{item.answer}</p>
          </details>
        ))}
      </div>
      <p data-help-support className="mt-3 text-price leading-[1.45] text-brand [overflow-wrap:anywhere]">
        Still need help?
        <a href="tel:+918796130252" className={cx("ml-2", supportLink)}>+91 87961 30252</a>
        <span aria-hidden="true" className="mx-2">·</span>
        <a href="mailto:contact@maplefurnishers.com" className={supportLink}>contact@maplefurnishers.com</a>
        <span data-help-notice className="mt-1 block text-ui text-taupe">
          Account sign-in and order tracking are not available on this
          storefront yet. Contact support for help with an existing order.
        </span>
      </p>
    </>
  );
  return (
    <div className="grid items-start gap-8 min-[991px]:grid-cols-[290px_minmax(0,1fr)] max-[750px]:gap-6">
      <div className="flex flex-col gap-6">
        <div data-help-categories aria-label="Help categories" className="flex flex-col gap-3 bg-cream p-6 max-[750px]:p-4">
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
                className={cx(
                  "w-full cursor-pointer rounded-[6px] border border-solid bg-white p-[14px] text-center font-body text-ui leading-[1.45] font-bold text-brand transition-colors hover:border-brand",
                  focusRing,
                  selected ? "border-brand shadow-[inset_0_0_0_1px_var(--color-brand)]" : "border-sand",
                )}
              >
                {item.title}
              </button>
            );
          })}
        </div>
        {aside}
      </div>
      <div
        id={`${id}-answers`}
        data-help-answers
        role="region"
        aria-label={category.title}
        className="min-w-0 max-[990px]:hidden"
      >
        {answers}
      </div>
      <dialog
        id={`${id}-dialog`}
        ref={dialog}
        data-help-dialog
        aria-label={category.title}
        onClose={() => setMobileOpen(false)}
        className="fixed inset-0 m-0 h-full max-h-none w-full max-w-none border-0 bg-linen p-0 font-body text-espresso backdrop:bg-espresso/40"
      >
        <button
          data-help-back
          type="button"
          onClick={() => dialog.current?.close()}
          className={cx("sticky top-0 z-[1] flex min-h-[60px] w-full cursor-pointer items-center gap-2.5 border-0 border-b border-solid border-sand bg-white px-4 text-price font-bold text-espresso", "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand")}
        >
          <ArrowLeft aria-hidden="true" className="size-5" /> Back to categories
        </button>
        <div className="px-4 pb-6">
          <h3 className="pt-5 font-serif text-h3 font-bold text-espresso">{category.title}</h3>
          <p className="pt-1 pb-4 text-ui text-taupe">{category.subtitle}</p>
          {answers}
        </div>
      </dialog>
    </div>
  );
}
