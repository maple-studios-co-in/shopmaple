"use client";
import Link from "next/link";
import { useId, useMemo, useRef, useState, type FormEvent } from "react";
import { accountPhoneSchema, accountProfileUpdateSchema, type AccountCustomer, type AccountProfileUpdate } from "@shopmaple/contracts/account";
import { AccountRequestError, createAccountClient } from "@/lib/account/client";
import { displayPhone } from "@/lib/account/format";
import { createPreviewTransport } from "@/lib/account/preview";

type FieldName = "name" | "phone";
const signInAgain = "/account/login?next=%2Faccount%2Fdetails";

/** The customer's name and mobile number (owner's spec, 10 Nov 2026). The sign-in email is shown, never edited here. */
export function AccountDetailsForm({ customer, preview = false }: { customer: AccountCustomer; preview?: boolean }) {
  const id = useId();
  const client = useMemo(() => createAccountClient(preview ? createPreviewTransport() : undefined), [preview]);
  const [saved, setSaved] = useState(customer);
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [status, setStatus] = useState<{ tone: "ok" | "problem"; text: string; signIn?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const form = useRef<HTMLFormElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Read the named controls directly so the same code runs in browsers and DOM test runners.
    const value = (field: FieldName) => {
      const control = event.currentTarget.elements.namedItem(field) as { value?: unknown } | null;
      return typeof control?.value === "string" ? control.value.trim() : "";
    };
    const name = value("name");
    const phone = value("phone");
    const found: Partial<Record<FieldName, string>> = {};
    if (name.length > 120) found.name = "Shorten the name to 120 characters.";
    const parsedPhone = phone ? accountPhoneSchema.safeParse(phone) : null;
    if (parsedPhone && !parsedPhone.success) found.phone = "Enter a 10-digit mobile number, such as 98765 43210.";
    setErrors(found);
    if (found.name || found.phone) {
      setStatus(null);
      form.current?.querySelector<HTMLElement>(`[name="${found.name ? "name" : "phone"}"]`)?.focus();
      return;
    }
    // Only what changed is sent; an emptied field is cleared (null), never sent blank.
    const update: AccountProfileUpdate = {};
    const nextName = name || null;
    const nextPhone = parsedPhone?.success ? parsedPhone.data : null;
    if (nextName !== saved.name) update.name = nextName;
    if (nextPhone !== saved.phone) update.phone = nextPhone;
    if (Object.keys(update).length === 0) {
      setStatus({ tone: "ok", text: "No changes to save." });
      return;
    }
    const checked = accountProfileUpdateSchema.safeParse(update);
    if (!checked.success) {
      setStatus({ tone: "problem", text: "Check your name and try again." });
      return;
    }
    setBusy(true);
    try {
      setSaved(await client.updateProfile(update));
      setStatus({ tone: "ok", text: "Your details are saved." });
    } catch (failure) {
      const code = failure instanceof AccountRequestError ? failure.code : "";
      setStatus(code === "ACCOUNT_AUTH_REQUIRED"
        ? { tone: "problem", text: "You’ve been signed out.", signIn: true }
        : { tone: "problem", text: "We couldn’t save your details just now. Please try again in a moment." });
    } finally {
      setBusy(false);
    }
  }
  const control = (field: FieldName, hint?: string) => ({
    id: `${id}-${field}`,
    name: field,
    "aria-invalid": errors[field] ? (true as const) : undefined,
    "aria-describedby": [hint, errors[field] ? `${id}-${field}-error` : ""].filter(Boolean).join(" ") || undefined,
  });
  return (
    <form ref={form} className="account-card account-form" onSubmit={(event) => void submit(event)} noValidate aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="account-card-title">Your details</h2>
      <div className="account-fields">
        <div className="account-field">
          <label className="account-label" htmlFor={`${id}-name`}>Full name</label>
          <input className="account-input" {...control("name")} autoComplete="name" maxLength={160} defaultValue={saved.name ?? ""} />
          {errors.name ? <p id={`${id}-name-error`} className="account-field-error">{errors.name}</p> : null}
        </div>
        <div className="account-field">
          <label className="account-label" htmlFor={`${id}-phone`}>Mobile number</label>
          <input className="account-input" {...control("phone", `${id}-phone-hint`)} type="tel" inputMode="tel" autoComplete="tel" maxLength={24}
            placeholder="+91 mobile number" defaultValue={saved.phone ? displayPhone(saved.phone) : ""} />
          <p id={`${id}-phone-hint`} className="account-hint">For delivery coordination and order updates.</p>
          {errors.phone ? <p id={`${id}-phone-error`} className="account-field-error">{errors.phone}</p> : null}
        </div>
        <div className="account-field account-field-wide">
          <p className="account-label">Email address</p>
          <p className="account-readonly">{saved.email}</p>
          <p className="account-hint">You sign in with this email, so it stays as it is. Orders placed with it appear in your account.</p>
        </div>
      </div>
      {status ? (
        <p className="account-status-line" data-tone={status.tone} role={status.tone === "problem" ? "alert" : "status"}>
          {status.text}
          {status.signIn ? <> <Link className="account-text-link" href={signInAgain}>Sign in again</Link></> : null}
        </p>
      ) : null}
      <div className="account-buttons">
        <button type="submit" className="account-cta" data-fill-button="" disabled={busy}>{busy ? "Saving…" : "Save details"}</button>
      </div>
    </form>
  );
}
