"use client";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Plus, X } from "lucide-react";
import { acceptPhotos, createReviewSender, encodePhoto } from "@/lib/review-client";
import { cx } from "@/lib/cx";
import { ProductImage } from "./product-image";

export type ReviewPiece = { handle: string; title: string; image?: string; collection?: string; variantId?: string };

const labelText = "font-heading text-[13px] leading-[19px] font-medium text-[#292622]";
const note = "text-[12px] leading-[17px] text-[#77716c]";
// 16px text keeps a phone from zooming in on focus; the placeholder stays at the frame's 14px.
const box = "block w-full rounded-[4px] border border-solid border-[#ddd7d0] bg-[#faf8f5] px-3.5 py-3 font-text text-[16px] leading-5 text-[#292622] placeholder:text-[14px] placeholder:text-[#77716c] focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-maple lg:text-[14px]";
const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maple";

/** A photo chosen for the review, with the address its thumbnail draws from. */
type Chosen = { file: File; preview: string };

/**
 * "Make yourself heard." (Figma 180:566 desktop, 180:603 phone): a dialog over the product page, the piece beside the form on
 * a computer and the form alone on a phone. What the customer writes goes to the store's /api/reviews, on to Keeri, and
 * appears on the page only once approved, as the thank-you says. The frame draws no chosen photos or sent state, so the
 * thumbnails and the thank-you are made from its own type and colours.
 */
export function ReviewDialog({ open, onClose, piece, chosen, encode = encodePhoto }: {
  open: boolean;
  onClose: () => void;
  piece: ReviewPiece;
  /** A rating chosen before the form opened (a star in the reviews band); each new choice is applied once, as it opens. */
  chosen?: { rating: number } | null;
  /** Makes a chosen photo small enough to send. */
  encode?: (file: File) => Promise<string>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const firstStar = useRef<HTMLInputElement>(null);
  const sender = useRef<ReturnType<typeof createReviewSender> | null>(null);
  const [rating, setRating] = useState(chosen?.rating ?? 0);
  const [hovered, setHovered] = useState(0);
  const [ratingMissing, setRatingMissing] = useState(false);
  useEffect(() => {
    if (!open || !chosen) return;
    setRating(chosen.rating);
    setRatingMissing(false);
  }, [open, chosen]);
  const [photos, setPhotos] = useState<Chosen[]>([]);
  const [photoProblem, setPhotoProblem] = useState("");
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState("");
  const [sent, setSent] = useState(false);
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
  // Thumbnails hold their photo in memory until they are removed or the form leaves the page.
  const shown = useRef(photos);
  shown.current = photos;
  useEffect(() => () => { for (const photo of shown.current) URL.revokeObjectURL(photo.preview); }, []);

  // A sent review's thank-you does not outlast its closing: the form opens fresh for the next one.
  const close = () => { setSent(false); onClose(); };

  function choosePhotos(event: ChangeEvent<HTMLInputElement>) {
    const picked = [...(event.currentTarget.files ?? [])];
    const { photos: accepted, problem } = acceptPhotos(photos.map((photo) => photo.file), picked);
    const added = accepted.slice(photos.length).map((file) => ({ file, preview: URL.createObjectURL(file) }));
    setPhotos([...photos, ...added]);
    setPhotoProblem(problem);
    event.currentTarget.value = "";
  }
  function removePhoto(chosen: Chosen) {
    URL.revokeObjectURL(chosen.preview);
    setPhotos(photos.filter((photo) => photo !== chosen));
    setPhotoProblem("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!rating) {
      setRatingMissing(true);
      firstStar.current?.focus?.();
      return;
    }
    const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) ?? "");
    setPending(true);
    setFailure("");
    try {
      const encoded: string[] = [];
      for (const photo of photos) {
        try { encoded.push(await encode(photo.file)); }
        catch { throw new Error(`We couldn’t read ${photo.file.name}. Please remove it or choose another photo.`); }
      }
      sender.current ??= createReviewSender();
      await sender.current({
        handle: piece.handle,
        ...(piece.variantId ? { variantId: piece.variantId } : {}),
        rating,
        title: value("title"),
        body: value("body").replace(/\r\n?/g, "\n"),
        displayName: value("displayName"),
        email: value("email"),
        photos: encoded,
      });
      for (const photo of photos) URL.revokeObjectURL(photo.preview);
      setPhotos([]);
      setRating(0);
      setSent(true);
    } catch (error) {
      setFailure(error instanceof Error && !error.message.startsWith("[") ? error.message : "Please check your details and try again.");
    } finally { setPending(false); }
  }

  return (
    <dialog ref={dialog} data-store data-review-dialog aria-labelledby="review-title" onClose={close}
      onClick={(event) => { if (event.target === dialog.current) close(); }}
      className="m-auto max-h-[100dvh] w-full max-w-none overflow-y-auto overscroll-contain rounded-[12px] border-0 bg-white p-0 font-text text-[#292622] backdrop:bg-[#17171175] sm:max-h-[calc(100dvh-32px)] sm:w-[620px] sm:max-w-[calc(100vw-32px)] lg:max-h-[calc(100dvh-48px)] lg:w-[960px] lg:shadow-[0_16px_60px_rgb(31_18_13/0.18)]">
      <div className="lg:grid lg:grid-cols-[340px_620px]">
        {/* Desktop only: the piece the review is about (180:567). */}
        <aside data-review-piece className="hidden flex-col gap-6 bg-[#f4efe8] px-7 py-8 lg:flex">
          {/* eslint-disable-next-line @next/next/no-img-element -- the brand's own logo artwork, at a fixed size */}
          <img src="/media/footer/maple-logo.webp" alt="Maple Furnishers" width={150} height={70} className="h-[70px] w-[150px]" />
          <span className="relative block h-[370px] w-full overflow-hidden rounded-[4px] border border-solid border-[#ddd7d0] bg-cream [&_img]:object-cover">
            <ProductImage src={piece.image} alt={piece.title} fill sizes="284px" />
          </span>
          {piece.collection && <p data-review-collection className="m-0 font-heading text-[11px] leading-4 font-medium text-maple uppercase">The {piece.collection} Collection</p>}
          <p data-review-product className="m-0 font-heading text-[30px] leading-[44px] font-medium text-maple">{piece.title}</p>
          <p className="m-0 text-[17px] leading-[25px] text-[#77716c]">A quiet statement. A warmer corner.</p>
          <p className="m-0 text-[15px] leading-[22px] text-[#77716c]">Your experience helps someone find their perfect piece.</p>
        </aside>
        <div className="flex min-w-0 flex-col gap-[18px] px-6 pt-6 pb-7 lg:px-9">
          <button type="button" data-review-close onClick={close} className={cx("ml-auto cursor-pointer rounded-[2px] border-0 bg-transparent p-0 font-heading text-[12px] leading-[17px] font-medium whitespace-pre-wrap text-[#77716c] hover:text-maple", focusRing)}>
            CLOSE  ×
          </button>
          <h2 id="review-title" className="m-0 text-[28px] leading-[41px] text-maple lg:text-[36px] lg:leading-[52px]">Make yourself heard.</h2>
          {sent ? (
            <div data-review-sent role="status" className="flex flex-col items-start gap-[18px]">
              <p className="m-0 text-[16px] leading-[23px] text-[#77716c]">Thank you. Your review of the {piece.title} is with the Maple team, and it will appear on this page once it has been approved.</p>
              <button type="button" data-review-done onClick={close} className={cx("w-full cursor-pointer rounded-[4px] border-0 bg-maple py-3.5 text-center font-heading text-[14px] leading-5 font-medium text-white hover:bg-[#6d1e17]", focusRing)}>DONE</button>
            </div>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-[18px]">
              <p className="m-0 text-[16px] leading-[23px] text-[#77716c]">Share your experience with the {piece.title}.</p>
              <fieldset>
                <legend className={labelText}>Your rating *</legend>
                <div className="mt-[18px] flex h-[51px] items-center gap-4" onMouseLeave={() => setHovered(0)}>
                  {[1, 2, 3, 4, 5].map((value) => (
                    <label key={value} className="relative grid size-[35px] cursor-pointer place-items-center" onMouseEnter={() => setHovered(value)}>
                      <input ref={value === 1 ? firstStar : undefined} type="radio" name="rating" value={value} checked={rating === value} aria-label={`${value} ${value === 1 ? "star" : "stars"}`}
                        onChange={() => { setRating(value); setRatingMissing(false); }}
                        className="peer absolute inset-0 m-0 cursor-pointer opacity-0" />
                      <svg data-review-star data-filled={String(value <= (hovered || rating))} aria-hidden="true" viewBox="0 0 24 24" fill={value <= (hovered || rating) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.25" strokeLinejoin="miter"
                        className="size-[35px] rounded-[2px] text-maple peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-maple">
                        <path d="m12 2.6 2.75 6.25 6.8.7-5.1 4.55 1.45 6.7L12 17.35 6.1 20.8l1.45-6.7-5.1-4.55 6.8-.7z" />
                      </svg>
                    </label>
                  ))}
                </div>
                {ratingMissing && <p data-review-rating-error role="alert" className="m-0 mt-1 text-[12px] leading-[17px] text-maple">Please choose a rating.</p>}
              </fieldset>
              <label className="flex flex-col gap-[7px]">
                <span className={labelText}>Review title *</span>
                <input name="title" required maxLength={120} autoComplete="off" placeholder="Give your review a short title" className={box} />
              </label>
              <label className="flex flex-col gap-[7px]">
                <span className={labelText}>Your review *</span>
                <textarea name="body" required maxLength={2000} placeholder="How does it look and feel in your space?" className={cx(box, "max-h-60 min-h-20 resize-none [field-sizing:content]")} />
              </label>
              <div data-review-photos className="flex flex-col gap-1.5 rounded-[4px] border border-solid border-[#ddd7d0] px-4 py-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-maple">
                <label className="flex cursor-pointer flex-col gap-1.5">
                  <span className="inline-flex items-center gap-2 font-heading text-[14px] leading-5 font-medium text-maple">
                    <Plus aria-hidden="true" strokeWidth={1.75} className="size-[14px]" />Add photos (optional)
                  </span>
                  <span className={note}>Up to 5 photos · JPG or PNG · 10 MB each</span>
                  <input type="file" multiple accept="image/jpeg,image/png" onChange={choosePhotos} className="sr-only" />
                </label>
                {photos.length > 0 && (
                  <ul className="mt-1.5 flex flex-wrap gap-2">
                    {photos.map((photo, index) => (
                      <li key={photo.preview + index} data-review-photo className="relative size-14 overflow-hidden rounded-[4px] border border-solid border-[#ddd7d0]">
                        {/* eslint-disable-next-line @next/next/no-img-element -- a local preview of the customer's own file */}
                        <img src={photo.preview} alt={`Your photo ${index + 1}`} className="size-full object-cover" />
                        <button type="button" aria-label={`Remove photo ${index + 1}`} onClick={() => removePhoto(photo)}
                          className={cx("absolute top-0.5 right-0.5 grid size-[18px] cursor-pointer place-items-center rounded-full border-0 bg-white/90 p-0 text-[#292622]", focusRing)}>
                          <X aria-hidden="true" strokeWidth={2} className="size-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {photoProblem && <p data-review-photo-problem role="alert" className="m-0 text-[12px] leading-[17px] text-maple">{photoProblem}</p>}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex min-w-0 flex-col gap-[7px]">
                  <span className={labelText}>Display name *</span>
                  <input name="displayName" required maxLength={60} autoComplete="name" placeholder="Your name" className={box} />
                </label>
                <label className="flex min-w-0 flex-col gap-[7px]">
                  <span className={labelText}>Email address *</span>
                  <input name="email" type="email" required maxLength={254} autoComplete="email" autoCapitalize="off" spellCheck={false} placeholder="you@example.com" className={box} />
                </label>
              </div>
              <p className={cx("m-0", note)}>Your email stays private. Your name and review may appear on the product page.</p>
              {failure && <p data-review-error role="alert" className="m-0 text-[13px] leading-[19px] text-maple">{failure}</p>}
              <button type="submit" data-review-submit disabled={pending} onClick={() => { if (!rating) setRatingMissing(true); }}
                className={cx("w-full cursor-pointer rounded-[4px] border-0 bg-maple py-3.5 text-center font-heading text-[14px] leading-5 font-medium whitespace-pre-wrap text-white hover:bg-[#6d1e17] disabled:cursor-wait disabled:opacity-70", focusRing)}>
                {pending ? "SENDING…" : "SUBMIT REVIEW  →"}
              </button>
            </form>
          )}
        </div>
      </div>
    </dialog>
  );
}
