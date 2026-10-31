"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { iconButton, panelTitle } from "./current-look";

// The dialog shell: a centred panel, or a full-height drawer on the right (the cart).
const panel = "max-h-[90dvh] w-[min(600px,calc(100%-32px))] border border-rule";
// Opened from a redesigned page (the product zoom), the title keeps that page's typeface, weight
// and line height at the panel's size, as it did before; elsewhere (the cart) it is the serif.
const pageType =
  "[[data-store]_dialog_&]:[font-family:inherit] [[data-store]_dialog_&]:[font-weight:inherit] [[data-store]_dialog_&]:[line-height:inherit]";
const drawerPanel = "fixed inset-y-0 right-0 left-auto m-0 h-[100dvh] max-h-[100dvh] w-[min(540px,100%)] border-0 overscroll-contain";
export function Modal({
  open,
  onClose,
  title,
  children,
  drawer = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  drawer?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog?.open) dialog?.showModal();
    if (!open && dialog?.open) dialog.close();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);
  return (
    <dialog
      ref={ref}
      data-store
      data-modal={drawer ? "drawer" : "panel"}
      className={`${drawer ? drawerPanel : panel} overflow-auto bg-paper p-7 text-ink backdrop:bg-[#17171175] max-[701px]:p-5`}
      aria-label={title}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) {
          const r = ref.current.getBoundingClientRect();
          if (
            event.clientX < r.left ||
            event.clientX > r.right ||
            event.clientY < r.top ||
            event.clientY > r.bottom
          )
            onClose();
        }
      }}
    >
      <div data-modal-heading className="mb-6 flex items-center justify-between gap-5">
        <h2 className={`${panelTitle} max-[701px]:text-[26px] ${pageType}`}>{title}</h2>
        <button
          className={`${iconButton} flex-none`}
          onClick={onClose}
          aria-label={"Close " + title}
        >
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
