"use client";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { cx } from "@/lib/cx";
import { defaultSiteChrome } from "@/lib/site-chrome-defaults";
import { useEnquiry } from "@/components/use-enquiry";
import { ProductImage } from "./product-image";

// The frame's illustrative samples (Figma 44:479 / 46:630); the final cloths and polishes are confirmed with the quote.
const fabrics = [["Ivory", "#e5dfd2"], ["Oatmeal", "#c1ac8b"], ["Taupe", "#96877d"], ["Olive", "#7e8067"], ["Terracotta", "#b37359"], ["Charcoal", "#51504d"]] as const;
const polishes = [["Natural", "#c4a175"], ["Walnut", "#846044"], ["Espresso", "#4d342a"], ["Black", "#302e2c"]] as const;

const input = "h-[50px] w-full rounded-[8px] border border-solid border-[#dfd7d1] bg-white px-3 text-[16px] text-[#1c1c1c] placeholder:text-[#9b918b] focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-maple lg:h-11 lg:text-[13px]";
const label = "text-[12px] leading-[17px] font-medium text-[#534d49]";

/**
 * Maple's WhatsApp chat with a message ready. Drawn with the store default, so the server and the first client render
 * agree; on the click it takes the number the page's own WhatsApp button uses, which staff may have changed.
 */
function whatsapp(text: string, live = false) {
  const shown = live ? document.querySelector<HTMLAnchorElement>("a.whatsapp-support")?.href : undefined;
  const base = shown?.startsWith("https://wa.me/") ? shown.split("?")[0] : `https://wa.me/${defaultSiteChrome.whatsapp.phone.replace(/^\+/, "")}`;
  return `${base}?text=${encodeURIComponent(text)}`;
}

/** One numbered step; the frame words some differently on phones (46:630) than on desktop (44:479). */
function Step({ number, phone, desktop, picked, lede, children }: { number: string; phone: string; desktop: string; picked?: string | null; lede?: [string, string]; children: ReactNode }) {
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-3.5 border-0 p-0 lg:gap-2.5">
      <legend className="contents">
        <span className="flex w-full items-center justify-between gap-3">
          <span className="text-[17px] leading-[25px] font-semibold text-[#1c1c1c] lg:text-[16px] lg:leading-[22px]">
            {number}&nbsp;&nbsp;<span className="lg:hidden">{phone}</span><span className="hidden lg:inline">{desktop}</span>
          </span>
          {picked && <span data-picked className="text-[12px] leading-[17px] font-medium text-maple lg:text-[13px]">{picked}</span>}
        </span>
      </legend>
      {lede && <p className={cx("m-0 text-[14px] leading-5 text-[#756d68] lg:text-[13px] lg:leading-[18px]", !lede[1] && "lg:hidden")}><span className="lg:hidden">{lede[0]}</span><span className="hidden lg:inline">{lede[1]}</span></p>}
      {children}
    </fieldset>
  );
}

/** A sample to choose: a radio under the colour, with the frame's woven or grained texture, a ring and a tick once chosen. */
function Swatch({ name, value, colour, texture, onPick }: { name: string; value: string; colour: string; texture: string; onPick: (value: string) => void }) {
  return (
    <label className="group flex min-w-0 cursor-pointer flex-col gap-[7px] lg:gap-1.5">
      <input type="radio" name={name} value={value} onChange={() => onPick(value)} className="peer sr-only" />
      <span aria-hidden="true" className="relative block h-14 w-full overflow-hidden rounded-[7px] bg-cover peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-maple group-has-[:checked]:shadow-[inset_0_0_0_2px_#80241c] lg:h-12"
        style={{ backgroundColor: colour, backgroundImage: `url(/product-page/customise/${texture}.svg)`, backgroundSize: "100% 100%" }}>
        <span className="absolute top-[5px] right-[5px] hidden size-5 place-items-center rounded-full bg-maple text-[12px] leading-none font-semibold text-white group-has-[:checked]:grid">✓</span>
      </span>
      <span className="text-[13px] leading-[19px] font-medium text-[#534d49] lg:text-[12px] lg:leading-[17px]">{value}</span>
    </label>
  );
}

/**
 * "Customisation available" (Figma 44:479 desktop, 46:630 phone): the piece's fabric and wood polish chosen from samples,
 * an idea of the visitor's own, and where to send the quote. On a desktop it is a two-panel dialog, the piece and the
 * live selection beside the form; on a phone it fills the screen, with the "Get a quote" bar fixed at the bottom while
 * the rest scrolls. The request goes to the store's enquiries, with the piece as context, like the page's other forms;
 * reference photos go to the team on WhatsApp, as the store keeps no uploads from visitors.
 */
export function CustomiseQuote({ open, onClose, product, variant }: {
  open: boolean;
  onClose: () => void;
  product: { title: string; image?: string; collection?: string };
  variant?: { title: string; sku: string | null };
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const enquiry = useEnquiry();
  const [fabric, setFabric] = useState<string | null>(null);
  const [polish, setPolish] = useState<string | null>(null);
  useEffect(() => {
    const element = dialog.current;
    if (open && !element?.open) element?.showModal?.();
    if (!open && element?.open) element.close?.();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);
  const sent = Boolean(enquiry.message) && !enquiry.failed;
  const short = product.title.split(/\s+/)[0] ?? product.title;
  const shareText = `Hello Maple, here are reference photos for a customised ${product.title}${fabric ? `, fabric ${fabric}` : ""}${polish ? `, wood polish ${polish}` : ""}.`;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const idea = String(form.get("idea") ?? "").trim();
    void enquiry.submit({
      kind: "project",
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      phone: String(form.get("phone") ?? "").trim() ? `+91 ${String(form.get("phone")).trim()}` : "",
      message: ["Customisation quote request", `Fabric: ${fabric ?? "Not chosen"}`, `Wood polish: ${polish ?? "Not chosen"}`, ...(idea ? [`Their idea: ${idea}`] : [])].join("\n"),
      context: { product: product.title, variant: variant?.title ?? "", sku: variant?.sku ?? "", pincode: "" },
    });
  }
  const close = (extra = "") => (
    <button type="button" onClick={onClose} aria-label="Close customisation" className={cx("grid shrink-0 cursor-pointer place-items-center rounded-full border-0 bg-[#f7f4f1] p-0 hover:bg-[#efe8e3] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maple", extra)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size design icon */}
      <img src="/product-page/customise/close.svg" alt="" width={24} height={24} className="size-6" />
    </button>
  );
  const selection = (
    <>
      <span>Fabric</span><span data-selection-fabric className="font-medium text-maple">{fabric ?? "Not chosen yet"}</span>
      <span>Wood polish</span><span data-selection-polish className="font-medium text-maple">{polish ?? "Not chosen yet"}</span>
    </>
  );
  return (
    <dialog ref={dialog} data-store data-customise aria-labelledby="customise-title" onClose={onClose}
      onClick={(event) => { if (event.target === dialog.current) onClose(); }}
      className="m-0 h-[100dvh] max-h-none w-full max-w-none overflow-hidden border-0 bg-white p-0 font-text text-[#1c1c1c] backdrop:bg-[#17171175] lg:m-auto lg:h-[min(950px,calc(100dvh-48px))] lg:w-[min(1152px,calc(100vw-48px))] lg:rounded-[20px] lg:shadow-[0_16px_60px_rgb(31_18_13/0.18)]">
      <form onSubmit={submit} onChange={enquiry.clear} className="flex h-full min-h-0 flex-col lg:grid lg:grid-cols-[344px_minmax(0,1fr)]">
        {/* Desktop: the piece and the live selection (44:480). */}
        <aside className="hidden min-h-0 flex-col gap-6 overflow-y-auto bg-[#f7f3ee] p-8 lg:flex">
          <p className="m-0 text-[11px] leading-[15px] font-semibold tracking-[1.8px] text-maple">MADE AROUND YOU</p>
          <h2 id="customise-title" className="m-0 text-[38px] leading-[43px] font-medium text-maple">Make it unmistakably yours.</h2>
          <p className="m-0 text-[15px] leading-[21px] text-[#756d68]">Your fabric. Your finish.<br />A piece that feels like you.</p>
          <span className="relative block h-[350px] min-h-[140px] w-full overflow-hidden rounded-[12px] bg-cream [&_img]:object-cover">
            <ProductImage src={product.image} alt={product.title} fill sizes="280px" />
          </span>
          <div className="flex flex-col gap-[5px]">
            <p className="m-0 font-heading text-[21px] leading-[29px] font-medium">{product.title}</p>
            {product.collection && <p className="m-0 text-[12px] leading-[17px] text-[#756d68]">{product.collection}</p>}
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-y-2.5 border-0 border-t border-solid border-[#e9e3de] pt-2.5 text-[13px] leading-[18px] text-[#756d68]">{selection}</div>
          <p className="m-0 text-[12px] leading-[17px] text-[#756d68]">Final samples and availability will be confirmed with your quote.</p>
        </aside>
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Phone: the fixed top bar (46:631). */}
          <header className="flex h-16 shrink-0 items-center justify-between bg-white pr-3 pl-5 lg:hidden">
            <p className="m-0 text-[16px] leading-[23px] font-semibold">Customise your {short}</p>
            {close("size-11")}
          </header>
          <div data-customise-scroll className="flex min-h-0 flex-1 flex-col gap-7 overflow-y-auto overscroll-contain px-5 pt-5 pb-8 lg:gap-7 lg:p-9 lg:pb-4">
            {sent ? (
              <div data-customise-sent role="status" className="flex flex-1 flex-col items-start justify-center gap-4">
                <p className="m-0 font-heading text-[26px] leading-9 font-medium">Thank you. Your request is with us.</p>
                <p className="m-0 max-w-[520px] text-[15px] leading-[22px] text-[#756d68]">The Maple team will contact you about your {product.title} and confirm finishes, pricing and lead time. {enquiry.message.replace("Your enquiry has been saved. ", "")}</p>
                <button type="button" onClick={onClose} className="h-12 cursor-pointer rounded-full border-0 bg-maple px-8 text-[15px] font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maple">Done</button>
              </div>
            ) : (
              <>
                <div className="hidden items-start justify-between gap-6 lg:flex">
                  <div className="flex flex-col gap-1">
                    <p className="m-0 font-heading text-[26px] leading-9 font-medium">A few choices. All yours.</p>
                    <p className="m-0 text-[14px] leading-5 text-[#756d68]">Select your favourites, or share a completely different idea.</p>
                  </div>
                  {close("size-8")}
                </div>
                {/* Phone: the introduction and the piece with its live selection (46:637, 46:641). */}
                <div className="flex flex-col gap-3 lg:hidden">
                  <p className="m-0 text-[10px] leading-[15px] font-semibold tracking-[1.5px] text-maple">MADE AROUND YOU</p>
                  <p className="m-0 font-heading text-[31px] leading-[37px] font-medium text-maple">Make it unmistakably yours.</p>
                  <p className="m-0 text-[14px] leading-5 text-[#756d68]">Choose your finishes, or share an idea of your own.</p>
                </div>
                <div className="flex items-center gap-3.5 rounded-[12px] bg-[#f7f3ee] p-3 lg:hidden">
                  <span className="relative block h-[95px] w-[76px] shrink-0 overflow-hidden rounded-[6px] bg-cream [&_img]:object-cover">
                    <ProductImage src={product.image} alt="" fill sizes="76px" />
                  </span>
                  <span className="grid min-w-0 grid-cols-[auto_1fr] gap-x-1.5 gap-y-2 text-[12px] leading-[17px] text-[#756d68]">
                    <span className="col-span-2 text-[16px] leading-[23px] font-medium text-[#1c1c1c]">{product.title}</span>
                    {selection}
                  </span>
                </div>
                <Step number="01" phone="Fabric" desktop="Choose your fabric" picked={fabric}>
                  <div role="radiogroup" aria-label="Fabric" className="grid grid-cols-3 gap-2.5 lg:grid-cols-6 lg:gap-[12.8px]">
                    {fabrics.map(([value, colour]) => <Swatch key={value} name="fabric" value={value} colour={colour} texture="fabric-texture" onPick={setFabric} />)}
                  </div>
                </Step>
                <Step number="02" phone="Wood polish" desktop="Choose your wood polish" picked={polish}>
                  <div role="radiogroup" aria-label="Wood polish" className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-4">
                    {polishes.map(([value, colour]) => <Swatch key={value} name="polish" value={value} colour={colour} texture="polish-texture" onPick={setPolish} />)}
                  </div>
                  <p className="m-0 text-[12px] leading-[17px] text-[#756d68] lg:hidden">Final samples and availability are confirmed with your quote.</p>
                </Step>
                <span aria-hidden="true" className="block h-px shrink-0 bg-[#e9e3de] lg:hidden" />
                <Step number="03" phone="Something else in mind?" desktop="Couldn’t find your match?" lede={["Couldn’t find your match? Tell us what you’d love us to create.", "Have something else in mind? Tell us about it."]}>
                  <label className="block">
                    <span className="sr-only">Your idea (optional)</span>
                    <textarea name="idea" maxLength={1500} placeholder="A different fabric, a particular finish, or a detail you’d love us to create…"
                      className="block h-[100px] w-full resize-none rounded-[8px] border border-solid border-[#dfd7d1] bg-white p-3.5 text-[15px] leading-[22px] text-[#1c1c1c] placeholder:text-[#9b918b] focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-maple lg:h-[72px] lg:text-[14px] lg:leading-5" />
                  </label>
                  <div data-reference-images className="flex flex-col items-center gap-2 rounded-[10px] border border-dashed border-[#d8cec6] bg-[#faf8f5] p-4 text-center lg:flex-row lg:gap-3.5 lg:rounded-[8px] lg:p-3 lg:text-left">
                    {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size design icon */}
                    <img src="/product-page/customise/upload.svg" alt="" width={24} height={24} className="size-6 shrink-0" />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-[14px] leading-5 font-semibold text-maple lg:text-[13px] lg:leading-[18px]">Add reference images</span>
                      <span className="text-[12px] leading-[17px] text-[#756d68] lg:text-[11px] lg:leading-[15px]">Send up to 3 photos to the Maple team on WhatsApp, with this piece named.</span>
                    </span>
                    <a href={whatsapp(shareText)} onClick={(event) => { event.currentTarget.href = whatsapp(shareText, true); }} target="_blank" rel="noopener noreferrer"
                      className="w-full shrink-0 rounded-[22px] border border-solid border-[#d8cec6] bg-white p-3 text-center text-[14px] leading-5 font-medium text-maple no-underline hover:bg-[#f7f4f1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maple lg:w-[140px] lg:rounded-[18px] lg:p-2 lg:text-[12px] lg:leading-[17px]">
                      Share on WhatsApp
                    </a>
                  </div>
                </Step>
                <Step number="04" phone="Get your personal quote" desktop="Where should we send your quote?" lede={["How can the Maple team reach you?", ""]}>
                  <div className="grid gap-3.5 lg:grid-cols-3">
                    <label className="flex flex-col gap-1.5"><span className={label}>Your name *</span>
                      <input name="name" required autoComplete="name" maxLength={100} placeholder="Full name" className={input} /></label>
                    <label className="flex flex-col gap-1.5"><span className={label}>WhatsApp / phone *</span>
                      <span className="relative block">
                        <span aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[16px] text-[#9b918b] lg:text-[13px]">+91</span>
                        <input name="phone" type="tel" required inputMode="tel" autoComplete="tel-national" maxLength={20} pattern="[0-9 ]{10,14}" placeholder="Mobile number" aria-label="WhatsApp or phone number, after +91" className={cx(input, "pl-12 lg:pl-10")} />
                      </span></label>
                    <label className="flex flex-col gap-1.5"><span className={label}>Email *</span>
                      <input name="email" type="email" required autoComplete="email" autoCapitalize="off" spellCheck={false} maxLength={254} placeholder="you@example.com" className={input} /></label>
                  </div>
                  <p className="m-0 text-[12px] leading-[17px] text-[#756d68] lg:hidden">We’ll only use these details to discuss your customisation request.</p>
                </Step>
              </>
            )}
          </div>
          {!sent && (
            // Phone: fixed at the bottom while the rest scrolls (46:777); desktop: the form's foot (44:648).
            <footer data-customise-footer className="flex shrink-0 flex-col items-center gap-2 border-0 border-t border-solid border-[#e9e3de] bg-white px-5 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] lg:border-t-0 lg:px-9 lg:pt-2 lg:pb-8">
              {enquiry.failed && <p role="alert" className="m-0 text-[13px] text-maple">{enquiry.message}</p>}
              <button type="submit" data-quote-submit disabled={enquiry.pending}
                className="flex h-[50px] w-full cursor-pointer items-center justify-center gap-3 rounded-full border-0 bg-maple text-[16px] leading-[22px] font-semibold text-white disabled:cursor-wait disabled:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maple lg:h-[54px]">
                {enquiry.pending ? "Sending…" : <>Get a quote <span aria-hidden="true" className="text-[18px] font-normal">→</span></>}
              </button>
              <p className="m-0 text-center text-[11px] leading-4 text-[#756d68] lg:text-[12px] lg:leading-[17px]">No commitment yet. We’ll contact you about your request and confirm finishes, pricing and lead time.</p>
            </footer>
          )}
        </div>
      </form>
    </dialog>
  );
}
