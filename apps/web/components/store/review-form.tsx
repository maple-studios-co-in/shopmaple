"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import type { ReviewInvitation } from "@shopmaple/contracts/reviews";

const field = "w-full rounded-[10px] border border-solid border-[#d9d2ca] bg-white px-4 py-3 font-product text-[16px] text-black focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-maple";
const label = "grid gap-2 text-[14px] font-medium";
const ratingWords = ["Poor", "Fair", "Good", "Very good", "Excellent"];

/** The buyer's review of one delivered piece. Opened only through their emailed link; staff approve it before it shows. */
export function ReviewForm({ token, invitation }: { token: string; invitation: ReviewInvitation }) {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");
  const piece = invitation.variantTitle ? `${invitation.productTitle}, ${invitation.variantTitle}` : invitation.productTitle;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "sending") return;
    const data = new FormData(event.currentTarget);
    const rating = Number(data.get("rating"));
    if (!rating) { setError("Please choose a star rating."); return; }
    const value = (name: string) => String(data.get(name) ?? "").trim();
    setState("sending");
    setError("");
    try {
      const response = await fetch("/api/reviews", {
        method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, rating, title: value("title"), body: value("body"), displayName: value("displayName"), city: value("city") }),
      });
      if (response.ok) { setState("sent"); return; }
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      setError(response.status === 400 ? "Check each field: a title, a review of at least 10 characters and your name are needed."
        : body?.message ?? "We couldn't send your review. Please try again.");
    } catch {
      setError("We couldn't send your review. Check your connection and try again.");
    }
    setState("idle");
  }

  if (state === "sent")
    return (
      <div data-review-thanks role="status" className="grid gap-4">
        <p className="m-0 text-[20px] leading-[1.4] font-medium">Thank you for reviewing the {piece}.</p>
        <p className="m-0 text-[16px] leading-[1.6]">We read every review before it appears on the product page, usually within two working days.</p>
        {invitation.productHandle && <Link href={`/products/${invitation.productHandle}`} className="text-[14px] text-maple underline underline-offset-2">Back to the {invitation.productTitle}</Link>}
      </div>
    );
  return (
    <form data-review-form noValidate onSubmit={submit} className="grid gap-6">
      <p className="m-0 text-[16px] leading-[1.6]">Your review of the <strong className="font-medium">{piece}</strong>. Only the name and city you enter here are shown with it.</p>
      <fieldset className="m-0 grid gap-3 border-0 p-0">
        <legend className="mb-3 p-0 text-[14px] font-medium">Your rating</legend>
        {/* Reversed in the markup so a checked or hovered star also lights every star before it (sibling selectors run forwards). */}
        <div className="flex flex-row-reverse justify-end gap-1">
          {[5, 4, 3, 2, 1].map((n) => (
            <label key={n} className="peer group cursor-pointer hover:[&_svg]:fill-[#FFB74A] has-checked:[&_svg]:fill-[#FFB74A] peer-hover:[&_svg]:fill-[#FFB74A] peer-has-checked:[&_svg]:fill-[#FFB74A]">
              <input type="radio" name="rating" value={n} className="sr-only" />
              <span className="sr-only">{n} {n === 1 ? "star" : "stars"}: {ratingWords[n - 1]}</span>
              <svg aria-hidden="true" viewBox="0 0 15 15" className="size-9 fill-[#e8e1d9] group-has-focus-visible:outline-2 group-has-focus-visible:outline-maple"><path d="M7.5 0 9.586 5.273 15 5.73l-4.125 3.715L12.135 15 7.5 12.023 2.865 15l1.26-5.555L0 5.729l5.414-.456z" /></svg>
            </label>
          ))}
        </div>
      </fieldset>
      <label className={label}>Title<input name="title" required minLength={2} maxLength={120} placeholder="Sum it up in a few words" className={field} /></label>
      <label className={label}>Your review<textarea name="body" required minLength={10} maxLength={2000} rows={6} placeholder="How does it look, feel and hold up at home?" className={field} /></label>
      <div className="grid gap-6 md:grid-cols-2">
        <label className={label}>Name shown<input name="displayName" required minLength={2} maxLength={60} autoComplete="given-name" className={field} /></label>
        <label className={label}>City (optional)<input name="city" maxLength={60} autoComplete="address-level2" className={field} /></label>
      </div>
      {error && <p role="alert" className="m-0 rounded-[10px] bg-[rgba(128,36,28,0.08)] px-4 py-3 text-[14px] text-maple">{error}</p>}
      <button type="submit" disabled={state === "sending"} className="inline-flex h-[50px] w-fit cursor-pointer items-center justify-center rounded-[30px] border-0 bg-maple px-8 text-[14px] font-medium text-white hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maple">
        {state === "sending" ? "Sending" : "Send review"}
      </button>
    </form>
  );
}
