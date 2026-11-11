"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type InputHTMLAttributes, type RefObject } from "react";
import {
  accountEmailSchema,
  accountPasswordSchema,
  passwordMaxLength,
  passwordMinLength,
  signInCodeLength,
  signInCodeSchema,
  signInCodeTtlMinutes,
  type SignInPurpose,
} from "@shopmaple/contracts/account";
import { AccountRequestError, createAccountClient, type AccountClient } from "@/lib/account/client";
import { authHref, safeAuthNext } from "@/lib/account/next-path";
import { createPreviewTransport } from "@/lib/account/preview";

/**
 * The sign-in pages' forms (owner's spec, 11 Nov 2026): password sign-in (Figma 392:1652), sign-up (392:1697) and the
 * password reset drawn to them. Sign-up and the reset finish with a code emailed to the address, which proves it is
 * theirs before the password is kept: orders are found by email, so an unproven address must never see them. Asking for
 * a code always reads the same, so these pages never tell whether an address has an account.
 */
type Problem = { field: string; message: string } | null;
const passwordRule = `At least ${passwordMinLength} characters, including a number.`;
const emailProblem = "Enter a valid email address, such as name@example.com.";
const unreachable = "We couldn’t reach Maple just now. Please try again in a moment.";
const codeProblems: Record<string, string> = {
  CODE_INVALID: "That code isn’t right. Check the latest email from us and try again.",
  CODE_EXPIRED: `That code has expired: codes last ${signInCodeTtlMinutes} minutes. Send a new code and try again.`,
  TOO_MANY_ATTEMPTS: "Too many tries with that code. Send a new code to try again.",
};
const failureCode = (failure: unknown) => (failure instanceof AccountRequestError ? failure.code : "");

function useAccountClient(preview: boolean) {
  return useMemo(() => createAccountClient(preview ? createPreviewTransport() : undefined), [preview]);
}
/** Signed in: on to where the visitor was going (the preview stays in the preview). */
function useFinish(next: string, preview: boolean) {
  const router = useRouter();
  return () => {
    router.replace(preview ? "/account?preview=design" : safeAuthNext(next));
    router.refresh();
  };
}
/** Sends a code (the same on the page whatever happened) and holds back another for a short while: the API sends only
 * three per address in fifteen minutes. */
function useCodeSender(client: AccountClient, purpose: SignInPurpose, cooldownMs: number) {
  const [sentAt, setSentAt] = useState(0);
  const [coolingDown, setCoolingDown] = useState(false);
  const [sending, setSending] = useState(false);
  useEffect(() => {
    if (!sentAt) return;
    if (cooldownMs <= 0) {
      setCoolingDown(false);
      return;
    }
    setCoolingDown(true);
    const timer = setTimeout(() => setCoolingDown(false), cooldownMs);
    return () => clearTimeout(timer);
  }, [sentAt, cooldownMs]);
  async function send(email: string) {
    setSending(true);
    try {
      await client.startSignIn(email, purpose);
    } catch {
      /* A limit or an outage must look like a sent code. */
    } finally {
      setSending(false);
    }
    setSentAt(Date.now());
  }
  return { send, coolingDown, sending };
}
/** Moves focus once the step it names has drawn. */
function useFocusAfterRender() {
  const pending = useRef<RefObject<HTMLInputElement | null> | null>(null);
  useEffect(() => {
    const target = pending.current?.current;
    pending.current = null;
    target?.focus();
  });
  return (ref: RefObject<HTMLInputElement | null>) => {
    pending.current = ref;
  };
}

/** One labelled field (Figma "Maple / Forms / Input"). A hint drawn elsewhere in the form is named by `hintId`. */
function TextField({
  label, error, hintId, inputRef, ...input
}: { label: string; error?: string; hintId?: string; inputRef?: RefObject<HTMLInputElement | null> } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  const described = [hintId ?? "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div className="account-field">
      <label className="account-label" htmlFor={id}>{label}</label>
      <input ref={inputRef} id={id} className="account-input" aria-invalid={error ? true : undefined} aria-describedby={described} {...input} />
      {error ? <p id={`${id}-error`} className="account-field-error" role="alert">{error}</p> : null}
    </div>
  );
}
const problemFor = (problem: Problem, field: string) => (problem?.field === field ? problem.message : undefined);

/** The code step of sign-up and of the reset: what was sent, the code, and a way to send another or start again. */
function CodeLinks({ busy, coolingDown, onResend, onBack, backLabel }: { busy: boolean; coolingDown: boolean; onResend: () => void; onBack: () => void; backLabel: string }) {
  return (
    <p className="auth-switch auth-code-links">
      <button type="button" className="auth-link-button" disabled={busy || coolingDown} onClick={onResend}>
        {coolingDown ? "Send a new code (in a moment)" : "Send a new code"}
      </button>
      <button type="button" className="auth-link-button" disabled={busy} onClick={onBack}>{backLabel}</button>
    </p>
  );
}

// ---- Login (Figma 392:1652) ------------------------------------------------------------------------------------------

export function LoginForm({ next, preview = false }: { next: string; preview?: boolean }) {
  const id = useId();
  const client = useAccountClient(preview);
  const finish = useFinish(next, preview);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [problem, setProblem] = useState<Problem>(null);
  const [busy, setBusy] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const address = accountEmailSchema.safeParse(email);
    if (!address.success) {
      setProblem({ field: "email", message: emailProblem });
      emailRef.current?.focus();
      return;
    }
    if (!password) {
      setProblem({ field: "password", message: "Enter your password." });
      passwordRef.current?.focus();
      return;
    }
    setProblem(null);
    setBusy(true);
    try {
      await client.passwordSignIn(address.data, password);
      finish();
    } catch (failure) {
      const code = failureCode(failure);
      setProblem({
        field: "password",
        message:
          code === "CREDENTIALS_INVALID"
            ? "That email and password don’t match. Try again, or reset your password."
            : code === "TOO_MANY_ATTEMPTS"
              ? "Too many tries. Reset your password with an emailed code, or try again later."
              : unreachable,
      });
      setBusy(false);
      passwordRef.current?.focus();
    }
  }

  return (
    <form className="auth-form" onSubmit={(event) => void submit(event)} noValidate aria-labelledby={`${id}-title`}>
      <h1 id={`${id}-title`} className="auth-title">Welcome back.</h1>
      <p className="auth-lead">Sign in to your own corner of Maple.</p>
      <TextField label="Email address" name="email" type="email" autoComplete="email" autoCapitalize="off" spellCheck={false} inputMode="email"
        maxLength={254} placeholder="you@example.com" value={email} inputRef={emailRef} error={problemFor(problem, "email")}
        onChange={(event) => { setEmail(event.currentTarget.value); if (problem) setProblem(null); }} />
      <TextField label="Password" name="password" type="password" autoComplete="current-password" maxLength={passwordMaxLength}
        placeholder="Enter your password" value={password} inputRef={passwordRef} error={problemFor(problem, "password")}
        onChange={(event) => { setPassword(event.currentTarget.value); if (problem) setProblem(null); }} />
      <Link className="auth-forgot" href={authHref("forgot-password", next, preview)}>Forgot password?</Link>
      <button type="submit" className="account-cta" data-fill-button="" data-width="full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      <p className="auth-switch">New to Maple?&nbsp; <Link href={authHref("sign-up", next, preview)}>Create an account</Link></p>
    </form>
  );
}

// ---- Sign-up (Figma 392:1697), then the emailed code -------------------------------------------------------------------

export function SignUpForm({ next, preview = false, resendCooldownMs = 30_000 }: { next: string; preview?: boolean; resendCooldownMs?: number }) {
  const id = useId();
  const client = useAccountClient(preview);
  const finish = useFinish(next, preview);
  const sender = useCodeSender(client, "sign-up", resendCooldownMs);
  const focusNext = useFocusAfterRender();
  const [step, setStep] = useState<"details" | "code">("details");
  const [fields, setFields] = useState({ firstName: "", lastName: "", email: "", password: "" });
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [problem, setProblem] = useState<Problem>(null);
  const [exhausted, setExhausted] = useState(false);
  const [busy, setBusy] = useState(false);
  const refs = {
    firstName: useRef<HTMLInputElement>(null),
    email: useRef<HTMLInputElement>(null),
    password: useRef<HTMLInputElement>(null),
    code: useRef<HTMLInputElement>(null),
  };
  const edit = (key: keyof typeof fields) => (event: { currentTarget: HTMLInputElement }) => {
    const value = event.currentTarget.value;
    setFields((current) => ({ ...current, [key]: value }));
    if (problem) setProblem(null);
  };
  const name = [fields.firstName.trim(), fields.lastName.trim()].filter(Boolean).join(" ");

  async function submitDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const address = accountEmailSchema.safeParse(fields.email);
    const found: Problem =
      !fields.firstName.trim() ? { field: "firstName", message: "Enter your first name." }
        : !address.success ? { field: "email", message: emailProblem }
          : !accountPasswordSchema.safeParse(fields.password).success ? { field: "password", message: `Choose a password: ${passwordRule.toLowerCase()}` }
            : null;
    if (found || !address.success) {
      setProblem(found);
      refs[(found?.field ?? "email") as "firstName" | "email" | "password"].current?.focus();
      return;
    }
    setProblem(null);
    setBusy(true);
    await sender.send(address.data);
    setBusy(false);
    setSentTo(address.data);
    setCode("");
    setExhausted(false);
    setStep("code");
    focusNext(refs.code);
  }
  async function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (exhausted) return;
    const parsed = signInCodeSchema.safeParse(code);
    if (!parsed.success) {
      setProblem({ field: "code", message: `Enter the ${signInCodeLength}-digit code from the email.` });
      refs.code.current?.focus();
      return;
    }
    setBusy(true);
    try {
      await client.verifySignIn(sentTo, parsed.data, { password: fields.password, name: name.slice(0, 120) });
      finish();
    } catch (failure) {
      const code = failureCode(failure);
      setExhausted(code === "TOO_MANY_ATTEMPTS");
      setProblem({ field: "code", message: codeProblems[code] ?? unreachable });
      setBusy(false);
      refs.code.current?.focus();
    }
  }

  if (step === "code")
    return (
      <form className="auth-form" onSubmit={(event) => void submitCode(event)} noValidate aria-labelledby={`${id}-title`}>
        <h1 id={`${id}-title`} className="auth-title">Check your email.</h1>
        <p id={`${id}-sent`} className="auth-lead" data-sign-in-sent="">
          {`We’ve sent a ${signInCodeLength}-digit code to ${sentTo}. Enter it to finish creating your account. It works for ${signInCodeTtlMinutes} minutes; if it hasn’t arrived in a minute, check your spam folder.`}
        </p>
        <TextField label={`${signInCodeLength}-digit code`} name="code" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={16}
          placeholder="123456" value={code} inputRef={refs.code} hintId={`${id}-sent`} error={problemFor(problem, "code")} className="account-input account-code-input"
          onChange={(event) => { setCode(event.currentTarget.value); if (problem && !exhausted) setProblem(null); }} />
        <button type="submit" className="account-cta" data-fill-button="" data-width="full" disabled={busy || exhausted}>{busy ? "Checking…" : "Create account"}</button>
        <CodeLinks busy={busy || sender.sending} coolingDown={sender.coolingDown} backLabel="Change your details"
          onResend={() => { void sender.send(sentTo).then(() => { setProblem(null); setExhausted(false); setCode(""); focusNext(refs.code); }); }}
          onBack={() => { setProblem(null); setStep("details"); focusNext(refs.email); }} />
      </form>
    );

  return (
    <form className="auth-form" onSubmit={(event) => void submitDetails(event)} noValidate aria-labelledby={`${id}-title`}>
      <h1 id={`${id}-title`} className="auth-title">Create your account</h1>
      <p className="auth-lead">Your Maple story starts here.</p>
      <div className="auth-names">
        <TextField label="First name" name="firstName" autoComplete="given-name" maxLength={60} placeholder="First name" value={fields.firstName}
          inputRef={refs.firstName} error={problemFor(problem, "firstName")} onChange={edit("firstName")} />
        <TextField label="Last name" name="lastName" autoComplete="family-name" maxLength={60} placeholder="Last name" value={fields.lastName}
          onChange={edit("lastName")} />
      </div>
      <TextField label="Email address" name="email" type="email" autoComplete="email" autoCapitalize="off" spellCheck={false} inputMode="email"
        maxLength={254} placeholder="you@example.com" value={fields.email} inputRef={refs.email} error={problemFor(problem, "email")} onChange={edit("email")} />
      <TextField label="Password" name="password" type="password" autoComplete="new-password" maxLength={passwordMaxLength} minLength={passwordMinLength}
        placeholder="Create a password" value={fields.password} inputRef={refs.password} hintId={`${id}-rule`} error={problemFor(problem, "password")}
        onChange={edit("password")} />
      <p id={`${id}-rule`} className="auth-hint">{passwordRule}</p>
      <button type="submit" className="account-cta" data-fill-button="" data-width="full" disabled={busy}>{busy ? "Sending your code…" : "Create account"}</button>
      <p className="auth-terms">
        By joining, you agree to our <Link href="/policies/terms-of-service">Terms</Link> &amp; <Link href="/policies/privacy-policy">Privacy Policy</Link>.
      </p>
      <p className="auth-switch" data-tone="ink">Already have an account?&nbsp; <Link href={authHref("login", next, preview)}>Sign in</Link></p>
    </form>
  );
}

// ---- "Forgot password?": the email, then the code with a new password ---------------------------------------------------

export function ForgotPasswordForm({ next, preview = false, resendCooldownMs = 30_000 }: { next: string; preview?: boolean; resendCooldownMs?: number }) {
  const id = useId();
  const client = useAccountClient(preview);
  const finish = useFinish(next, preview);
  const sender = useCodeSender(client, "reset", resendCooldownMs);
  const focusNext = useFocusAfterRender();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [problem, setProblem] = useState<Problem>(null);
  const [exhausted, setExhausted] = useState(false);
  const [busy, setBusy] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  async function submitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const address = accountEmailSchema.safeParse(email);
    if (!address.success) {
      setProblem({ field: "email", message: emailProblem });
      emailRef.current?.focus();
      return;
    }
    setProblem(null);
    setBusy(true);
    await sender.send(address.data);
    setBusy(false);
    setSentTo(address.data);
    setCode("");
    setExhausted(false);
    setStep("code");
    focusNext(codeRef);
  }
  async function submitReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (exhausted) return;
    const parsed = signInCodeSchema.safeParse(code);
    if (!parsed.success) {
      setProblem({ field: "code", message: `Enter the ${signInCodeLength}-digit code from the email.` });
      codeRef.current?.focus();
      return;
    }
    if (!accountPasswordSchema.safeParse(password).success) {
      setProblem({ field: "password", message: `Choose a new password: ${passwordRule.toLowerCase()}` });
      passwordRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      await client.verifySignIn(sentTo, parsed.data, { password });
      finish();
    } catch (failure) {
      const code = failureCode(failure);
      setExhausted(code === "TOO_MANY_ATTEMPTS");
      setProblem({ field: "code", message: codeProblems[code] ?? unreachable });
      setBusy(false);
      codeRef.current?.focus();
    }
  }

  if (step === "code")
    return (
      <form className="auth-form" onSubmit={(event) => void submitReset(event)} noValidate aria-labelledby={`${id}-title`}>
        <h1 id={`${id}-title`} className="auth-title">Check your email.</h1>
        <p id={`${id}-sent`} className="auth-lead" data-sign-in-sent="">
          {`We’ve sent a ${signInCodeLength}-digit code to ${sentTo}. Enter it with a new password. It works for ${signInCodeTtlMinutes} minutes; if it hasn’t arrived in a minute, check your spam folder.`}
        </p>
        <TextField label={`${signInCodeLength}-digit code`} name="code" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={16}
          placeholder="123456" value={code} inputRef={codeRef} hintId={`${id}-sent`} error={problemFor(problem, "code")} className="account-input account-code-input"
          onChange={(event) => { setCode(event.currentTarget.value); if (problem && !exhausted) setProblem(null); }} />
        <TextField label="New password" name="password" type="password" autoComplete="new-password" maxLength={passwordMaxLength} minLength={passwordMinLength}
          placeholder="Create a password" value={password} inputRef={passwordRef} hintId={`${id}-rule`} error={problemFor(problem, "password")}
          onChange={(event) => { setPassword(event.currentTarget.value); if (problem?.field === "password") setProblem(null); }} />
        <p id={`${id}-rule`} className="auth-hint">{passwordRule}</p>
        <button type="submit" className="account-cta" data-fill-button="" data-width="full" disabled={busy || exhausted}>{busy ? "Saving…" : "Reset password"}</button>
        <CodeLinks busy={busy || sender.sending} coolingDown={sender.coolingDown} backLabel="Use a different email"
          onResend={() => { void sender.send(sentTo).then(() => { setProblem(null); setExhausted(false); setCode(""); focusNext(codeRef); }); }}
          onBack={() => { setProblem(null); setStep("email"); focusNext(emailRef); }} />
      </form>
    );

  return (
    <form className="auth-form" onSubmit={(event) => void submitEmail(event)} noValidate aria-labelledby={`${id}-title`}>
      <h1 id={`${id}-title`} className="auth-title">Reset your password.</h1>
      <p className="auth-lead">{`Enter your email and we’ll send a ${signInCodeLength}-digit code to set a new password.`}</p>
      <TextField label="Email address" name="email" type="email" autoComplete="email" autoCapitalize="off" spellCheck={false} inputMode="email"
        maxLength={254} placeholder="you@example.com" value={email} inputRef={emailRef} error={problemFor(problem, "email")}
        onChange={(event) => { setEmail(event.currentTarget.value); if (problem) setProblem(null); }} />
      <button type="submit" className="account-cta" data-fill-button="" data-width="full" disabled={busy}>{busy ? "Sending…" : "Send code"}</button>
      <p className="auth-switch">Remembered it?&nbsp; <Link href={authHref("login", next, preview)}>Sign in</Link></p>
    </form>
  );
}
