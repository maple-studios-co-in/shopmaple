"use client";
import type { FormEvent } from "react";
import { useEnquiry } from "@/components/use-enquiry";
import { cx } from "@/lib/cx";
import { Modal } from "./modal";

// The buy box's own type and colours: rounded fields on white, the burgundy pill to send.
const label = "grid gap-1.5 text-[13px] leading-[1.4] font-medium text-[#1c1c1c]";
const field = "block h-[46px] w-full rounded-[10px] border border-solid border-maple/15 bg-white px-4 font-[inherit] text-[15px] text-black placeholder:text-[#8a8580] focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-maple";
const send = "inline-flex h-[50px] cursor-pointer items-center justify-center rounded-[30px] border-0 bg-maple px-8 text-[14px] leading-[1.2] font-medium text-white transition-colors hover:bg-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maple disabled:cursor-not-allowed disabled:opacity-60";

type Piece = { title: string; handle: string; variant: string; sku: string };

/**
 * A product page's custom request: another fabric, finish or size of the piece being viewed. It is saved as a
 * "custom" enquiry with the piece and the chosen finish; staff price it and reply. No payment is taken here.
 */
export function CustomRequest({ open, onClose, piece }: { open: boolean; onClose: () => void; piece: Piece }) {
  const enquiry = useEnquiry();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) ?? "").trim();
    void enquiry.submit({
      kind: "custom",
      name: value("name"),
      email: value("email"),
      phone: value("phone"),
      message: value("message"),
      context: {
        product: piece.title, handle: piece.handle, variant: piece.variant, sku: piece.sku, pincode: value("pincode"),
        fabric: value("fabric"), finish: value("finish"), size: value("size"), quantity: Number(value("quantity")) || 1,
      },
    });
  }
  return (
    <Modal open={open} onClose={onClose} title="Request a customisation">
      <form onSubmit={submit} onChange={enquiry.clear} className="grid gap-4 font-product text-black">
        <p data-custom-piece className="m-0 grid gap-0.5 rounded-[10px] bg-maple/6 px-4 py-3 text-[14px] leading-[1.5] text-maple">
          <strong className="font-medium">{piece.title}</strong>
          {(piece.variant || piece.sku) && <span className="text-[13px] text-[#5e574f]">{[piece.variant && `Chosen finish: ${piece.variant}`, piece.sku && `SKU ${piece.sku}`].filter(Boolean).join(" · ")}</span>}
        </p>
        <p className="m-0 text-[14px] leading-[1.6] text-[#4b4b4b]">Tell us what you would like changed. Our team will price it and get back to you. No payment is taken now.</p>
        <div className="grid gap-3.5 sm:grid-cols-2">
          <label className={label}><span>Fabric</span><input name="fabric" maxLength={200} placeholder="e.g. Olive boucle" className={field} /></label>
          <label className={label}><span>Finish</span><input name="finish" maxLength={200} defaultValue={piece.variant} className={field} /></label>
          <label className={label}><span>Size or dimensions</span><input name="size" maxLength={200} placeholder="e.g. Seat width 60 cm" className={field} /></label>
          <div className="grid grid-cols-2 gap-3.5">
            <label className={label}><span>Quantity</span><input name="quantity" type="number" inputMode="numeric" min={1} max={999} step={1} defaultValue={1} required className={field} /></label>
            <label className={label}><span>Delivery pincode</span><input name="pincode" inputMode="numeric" autoComplete="postal-code" pattern="[1-9][0-9]{5}" maxLength={6} placeholder="Optional" className={field} /></label>
          </div>
        </div>
        <label className={label}><span>Notes</span><textarea name="message" maxLength={5000} placeholder="Anything else: arm height, cushion firmness, a photo you can share later" className={cx(field, "h-[96px] resize-y py-3")} /></label>
        <div className="grid gap-3.5 sm:grid-cols-3">
          <label className={label}><span>Name</span><input name="name" autoComplete="name" maxLength={100} required className={field} /></label>
          <label className={label}><span>Phone</span><input name="phone" type="tel" autoComplete="tel" maxLength={30} required className={field} /></label>
          <label className={label}><span>Email</span><input name="email" type="email" autoComplete="email" autoCapitalize="off" spellCheck={false} maxLength={254} required className={field} /></label>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <button type="submit" disabled={enquiry.pending} className={send}>{enquiry.pending ? "Sending…" : "Send request"}</button>
          <p role={enquiry.failed ? "alert" : "status"} className={cx("m-0 text-[14px] empty:hidden", enquiry.failed ? "text-maple" : "text-[#2f6b32]")}>{enquiry.message}</p>
        </div>
      </form>
    </Modal>
  );
}
