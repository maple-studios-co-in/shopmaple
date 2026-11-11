"use client";
import Link from "next/link";
import { useId, useMemo, useRef, useState, type FormEvent } from "react";
import {
  accountPasswordSchema,
  accountPhoneSchema,
  accountProfileUpdateSchema,
  passwordMaxLength,
  passwordMinLength,
  signInCodeLength,
  signInCodeSchema,
  signInCodeTtlMinutes,
  type AccountCustomer,
  type AccountProfileUpdate,
} from "@shopmaple/contracts/account";
import { codeProblems, failureCode, passwordRule, unreachable, useCodeSender } from "@/components/account/auth/auth-forms";
import { AccountRequestError, createAccountClient } from "@/lib/account/client";
import { displayPhone } from "@/lib/account/format";
import { createPreviewTransport } from "@/lib/account/preview";

type FieldName = "firstName" | "lastName" | "phone";
const signInAgain = "/account/login?next=%2Faccount%2Fdetails";
/** The account keeps one name; the form asks for it as first and last (Figma 392:1585): the first word, then the rest. */
export function splitName(name: string | null) {
  const words = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  return { first: words[0] ?? "", last: words.slice(1).join(" ") };
}
/** Read the named controls directly so the same code runs in browsers and DOM test runners. */
const valueOf = (form: HTMLFormElement, name: string) => {
  const control = form.elements.namedItem(name) as { value?: unknown } | null;
  return typeof control?.value === "string" ? control.value.trim() : "";
};

/**
 * "Your details" (Figma 392:1585 "Edit Account"): first and last name, the sign-in email (shown, never edited: orders are
 * found by the email they were placed with), the mobile number, and "Password & security", whose "Change password" emails
 * a code to the sign-in address and takes a new password with it, as "Forgot password?" does. Only what changed is saved.
 */
export function AccountDetailsForm({ customer, preview = false, resendCooldownMs = 30_000 }: {
  customer: AccountCustomer;
  preview?: boolean;
  resendCooldownMs?: number;
}) {
  const id = useId();
  const client = useMemo(() => createAccountClient(preview ? createPreviewTransport() : undefined), [preview]);
  const [saved, setSaved] = useState(customer);
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [status, setStatus] = useState<{ tone: "ok" | "problem"; text: string; signIn?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const name = splitName(saved.name);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = event.currentTarget;
    const first = valueOf(target, "firstName");
    const last = valueOf(target, "lastName");
    const phone = valueOf(target, "phone");
    const full = [first, last].filter(Boolean).join(" ");
    const found: Partial<Record<FieldName, string>> = {};
    if (full.length > 120) found[last ? "lastName" : "firstName"] = "Shorten your name to 120 characters in all.";
    const parsedPhone = phone ? accountPhoneSchema.safeParse(phone) : null;
    if (parsedPhone && !parsedPhone.success) found.phone = "Enter a 10-digit mobile number, such as 98765 43210.";
    setErrors(found);
    const firstProblem = (["firstName", "lastName", "phone"] as const).find((field) => found[field]);
    if (firstProblem) {
      setStatus(null);
      form.current?.querySelector<HTMLElement>(`[name="${firstProblem}"]`)?.focus();
      return;
    }
    // Only what changed is sent; an emptied name or number is cleared (null), never sent blank.
    const update: AccountProfileUpdate = {};
    const nextName = full || null;
    const nextPhone = parsedPhone?.success ? parsedPhone.data : null;
    if (nextName !== saved.name) update.name = nextName;
    if (nextPhone !== saved.phone) update.phone = nextPhone;
    if (Object.keys(update).length === 0) {
      setStatus({ tone: "ok", text: "No changes to save." });
      return;
    }
    if (!accountProfileUpdateSchema.safeParse(update).success) {
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
  /** "Cancel": the saved details again, as the page opened. */
  function cancel() {
    form.current?.reset();
    setErrors({});
    setStatus(null);
  }
  const control = (field: FieldName, hint?: string) => ({
    id: `${id}-${field}`,
    name: field,
    "aria-invalid": errors[field] ? (true as const) : undefined,
    "aria-describedby": [hint, errors[field] ? `${id}-${field}-error` : ""].filter(Boolean).join(" ") || undefined,
  });
  const error = (field: FieldName) => (errors[field] ? <p id={`${id}-${field}-error`} className="account-field-error">{errors[field]}</p> : null);
  return (
    <div className="account-details">
      {/* The same saved details fill the fields again after a save: the form is drawn afresh for them. */}
      <form key={`${saved.name ?? ""}|${saved.phone ?? ""}`} id={`${id}-form`} ref={form} className="account-details-form" onSubmit={(event) => void submit(event)} noValidate
        aria-label="Your details">
        <div className="account-details-names">
          <div className="account-field">
            <label className="account-label" htmlFor={`${id}-firstName`}>First name</label>
            <input className="account-input" {...control("firstName")} autoComplete="given-name" maxLength={60} defaultValue={name.first} />
            {error("firstName")}
          </div>
          <div className="account-field">
            <label className="account-label" htmlFor={`${id}-lastName`}>Last name</label>
            <input className="account-input" {...control("lastName")} autoComplete="family-name" maxLength={60} defaultValue={name.last} />
            {error("lastName")}
          </div>
        </div>
        <div className="account-field">
          <label className="account-label" htmlFor={`${id}-email`}>Email address</label>
          <input className="account-input" id={`${id}-email`} type="email" value={saved.email} readOnly aria-describedby={`${id}-note`} />
        </div>
        <div className="account-field">
          <label className="account-label" htmlFor={`${id}-phone`}>Mobile number</label>
          <input className="account-input" {...control("phone", `${id}-note`)} type="tel" inputMode="tel" autoComplete="tel" maxLength={24}
            placeholder="+91 mobile number" defaultValue={saved.phone ? displayPhone(saved.phone) : ""} />
          {error("phone")}
        </div>
        <p id={`${id}-note`} className="account-details-note">You sign in with this email, so it stays as it is. Your mobile number is for delivery updates.</p>
      </form>
      <hr className="account-details-rule" />
      <PasswordSection email={saved.email} client={client} resendCooldownMs={resendCooldownMs} />
      {status ? (
        <p className="account-status-line" data-tone={status.tone} role={status.tone === "problem" ? "alert" : "status"}>
          {status.text}
          {status.signIn ? <> <Link className="account-text-link" href={signInAgain}>Sign in again</Link></> : null}
        </p>
      ) : null}
      <div className="account-buttons account-details-save">
        <button type="submit" form={`${id}-form`} className="account-cta" data-fill-button="" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
        <button type="button" className="account-cta" data-variant="quiet" data-fill-button="outline" disabled={busy} onClick={cancel}>Cancel</button>
      </div>
    </div>
  );
}

type Client = ReturnType<typeof createAccountClient>;
/**
 * "Password & security": "Change password" sends a code to the sign-in email; the code and a new password then set it,
 * and every other device is signed out (the API's reset). Signed in here, the customer stays signed in.
 */
function PasswordSection({ email, client, resendCooldownMs }: { email: string; client: Client; resendCooldownMs: number }) {
  const id = useId();
  const sender = useCodeSender(client, "reset", resendCooldownMs);
  const [step, setStep] = useState<"idle" | "code" | "done">("idle");
  const [problem, setProblem] = useState<{ field: "code" | "password"; message: string } | null>(null);
  const [exhausted, setExhausted] = useState(false);
  const [busy, setBusy] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const changeRef = useRef<HTMLButtonElement>(null);

  async function start() {
    setProblem(null);
    setExhausted(false);
    await sender.send(email);
    setStep("code");
    setTimeout(() => codeRef.current?.focus(), 0);
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (exhausted) return;
    const target = event.currentTarget;
    const code = signInCodeSchema.safeParse(valueOf(target, "code"));
    if (!code.success) {
      setProblem({ field: "code", message: `Enter the ${signInCodeLength}-digit code from the email.` });
      codeRef.current?.focus();
      return;
    }
    const password = (target.elements.namedItem("password") as HTMLInputElement | null)?.value ?? "";
    if (!accountPasswordSchema.safeParse(password).success) {
      setProblem({ field: "password", message: `Choose a new password: ${passwordRule.toLowerCase()}` });
      passwordRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      await client.verifySignIn(email, code.data, { password });
      setProblem(null);
      setStep("done");
      setTimeout(() => changeRef.current?.focus(), 0);
    } catch (failure) {
      const reason = failureCode(failure);
      setExhausted(reason === "TOO_MANY_ATTEMPTS");
      setProblem({ field: "code", message: codeProblems[reason] ?? unreachable });
      codeRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }
  const described = (field: "code" | "password", hint: string) =>
    [hint, problem?.field === field ? `${id}-${field}-error` : ""].filter(Boolean).join(" ");
  return (
    <section className="account-password" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="account-password-title">Password &amp; security</h2>
      <p className="account-password-lead">Keep your account secure with a unique password.</p>
      {step === "code" ? (
        <form className="account-password-form" onSubmit={(event) => void save(event)} noValidate aria-labelledby={`${id}-title`}>
          <p id={`${id}-sent`} className="account-password-lead" role="status">
            {`We’ve sent a ${signInCodeLength}-digit code to ${email}. Enter it with your new password; it works for ${signInCodeTtlMinutes} minutes.`}
          </p>
          <div className="account-field">
            <label className="account-label" htmlFor={`${id}-code`}>{`${signInCodeLength}-digit code`}</label>
            <input ref={codeRef} id={`${id}-code`} name="code" className="account-input account-code-input" type="text" inputMode="numeric" autoComplete="one-time-code"
              maxLength={16} placeholder="123456" aria-invalid={problem?.field === "code" ? true : undefined} aria-describedby={described("code", `${id}-sent`)} />
            {problem?.field === "code" ? <p id={`${id}-code-error`} className="account-field-error" role="alert">{problem.message}</p> : null}
          </div>
          <div className="account-field">
            <label className="account-label" htmlFor={`${id}-password`}>New password</label>
            <input ref={passwordRef} id={`${id}-password`} name="password" className="account-input" type="password" autoComplete="new-password"
              minLength={passwordMinLength} maxLength={passwordMaxLength} aria-invalid={problem?.field === "password" ? true : undefined}
              aria-describedby={described("password", `${id}-rule`)} />
            <p id={`${id}-rule`} className="account-hint">{passwordRule}</p>
            {problem?.field === "password" ? <p id={`${id}-password-error`} className="account-field-error" role="alert">{problem.message}</p> : null}
          </div>
          <div className="account-buttons">
            <button type="submit" className="account-cta" data-fill-button="" disabled={busy || exhausted}>{busy ? "Saving…" : "Save new password"}</button>
            <button type="button" className="account-cta" data-variant="quiet" data-fill-button="outline" disabled={busy}
              onClick={() => { setProblem(null); setStep("idle"); setTimeout(() => changeRef.current?.focus(), 0); }}>
              Keep my password
            </button>
          </div>
          <p className="account-password-resend">
            <button type="button" className="account-text-link" disabled={busy || sender.sending || sender.coolingDown}
              onClick={() => void sender.send(email).then(() => { setProblem(null); setExhausted(false); codeRef.current?.focus(); })}>
              {sender.coolingDown ? "Send a new code (in a moment)" : "Send a new code"}
            </button>
          </p>
        </form>
      ) : (
        <>
          {step === "done" ? (
            <p className="account-status-line" data-tone="ok" role="status">Your password is changed. You’re still signed in here; other devices were signed out.</p>
          ) : null}
          <button ref={changeRef} type="button" className="account-cta account-password-change" data-variant="quiet" data-fill-button="outline"
            disabled={sender.sending} onClick={() => void start()}>
            {sender.sending ? "Sending a code…" : "Change password"}
          </button>
        </>
      )}
    </section>
  );
}
