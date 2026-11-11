"use client";
import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { addressInputSchema, maxAddresses, type AccountAddress, type AddressUpdate } from "@shopmaple/contracts/account";
import { indiaStates } from "@/app/checkout/india-states";
import { AccountRequestError, createAccountClient } from "@/lib/account/client";
import { displayPhone } from "@/lib/account/format";
import { createPreviewTransport } from "@/lib/account/preview";
import { addressLines, Lines } from "./account-parts";

type FieldName = "name" | "line1" | "line2" | "city" | "state" | "pin" | "phone";
/** In the order the form asks them, so the first problem is the first one focused. */
const fieldOrder: FieldName[] = ["name", "phone", "line1", "line2", "city", "pin", "state"];
const problems: Record<FieldName, string> = {
  name: "Enter the name of the person receiving the delivery.",
  line1: "Enter the house number, building and street.",
  line2: "Shorten the apartment or landmark line.",
  city: "Enter the city.",
  state: "Choose the state.",
  pin: "Enter the 6-digit PIN code.",
  phone: "Enter a 10-digit mobile number.",
};
type Editing = { kind: "new" } | { kind: "edit"; address: AccountAddress } | null;
const signInAgain = "/account/login?next=%2Faccount%2Faddresses";
/** A named control's value, read directly so the same code runs in browsers and DOM test runners. */
const valueOf = (form: HTMLFormElement, name: string) => {
  const control = form.elements.namedItem(name) as { value?: unknown } | null;
  return typeof control?.value === "string" ? control.value : "";
};

/** Saved delivery addresses (owner's spec, 10 Nov 2026; no frame, drawn to the account pages' system): add, edit, remove
 * and choose the default, which checkout fills in. At most ten. */
export function AddressBook({ initial, preview = false }: { initial: AccountAddress[]; preview?: boolean }) {
  const id = useId();
  const client = useMemo(() => createAccountClient(preview ? createPreviewTransport() : undefined), [preview]);
  const [addresses, setAddresses] = useState(initial);
  const [editing, setEditing] = useState<Editing>(initial.length === 0 ? { kind: "new" } : null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ tone: "ok" | "problem"; text: string; signIn?: boolean } | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const focusForm = useRef(false);
  // A form the customer opened starts at its first field.
  useEffect(() => {
    if (!focusForm.current || !editing) return;
    focusForm.current = false;
    form.current?.querySelector<HTMLInputElement>('[name="name"]')?.focus();
  }, [editing]);

  function fail(failure: unknown) {
    const code = failure instanceof AccountRequestError ? failure.code : "";
    if (code === "ACCOUNT_AUTH_REQUIRED") setStatus({ tone: "problem", text: "You’ve been signed out.", signIn: true });
    else if (code === "ADDRESS_LIMIT") setStatus({ tone: "problem", text: `You can save up to ${maxAddresses} addresses. Remove one to add another.` });
    else if (code === "ADDRESS_NOT_FOUND") setStatus({ tone: "problem", text: "That address was already removed. Refresh the page to see your saved addresses." });
    else setStatus({ tone: "problem", text: "We couldn’t save that just now. Please try again in a moment." });
  }
  function open(next: Editing) {
    setEditing(next);
    setErrors({});
    setStatus(null);
    setRemoving(null);
    focusForm.current = true;
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const target = event.currentTarget;
    const wantsDefault = (target.elements.namedItem("isDefault") as HTMLInputElement | null)?.checked === true;
    const parsed = addressInputSchema.safeParse({ ...Object.fromEntries(fieldOrder.map((name) => [name, valueOf(target, name)])), ...(wantsDefault ? { isDefault: true } : {}) });
    if (!parsed.success) {
      const found: Partial<Record<FieldName, string>> = {};
      for (const issue of parsed.error.issues) {
        const name = issue.path[0] as FieldName;
        if (fieldOrder.includes(name)) found[name] = problems[name];
      }
      setErrors(found);
      const first = fieldOrder.find((name) => found[name]);
      if (first) form.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      if (editing.kind === "new") {
        const result = await client.addAddress(parsed.data);
        setAddresses(result.addresses);
      } else {
        const before = editing.address;
        const changes = Object.fromEntries(fieldOrder.filter((name) => parsed.data[name] !== before[name]).map((name) => [name, parsed.data[name]])) as AddressUpdate;
        if (parsed.data.isDefault && !before.isDefault) changes.isDefault = true;
        if (Object.keys(changes).length > 0) setAddresses((await client.updateAddress(before.id, changes)).addresses);
      }
      setEditing(null);
      setStatus({ tone: "ok", text: "Address saved." });
    } catch (failure) {
      fail(failure);
    } finally {
      setBusy(false);
    }
  }
  async function makeDefault(address: AccountAddress) {
    setBusy(true);
    setStatus(null);
    try {
      setAddresses((await client.updateAddress(address.id, { isDefault: true })).addresses);
      setStatus({ tone: "ok", text: "Default address changed." });
    } catch (failure) {
      fail(failure);
    } finally {
      setBusy(false);
    }
  }
  async function remove(address: AccountAddress) {
    setBusy(true);
    setStatus(null);
    try {
      setAddresses(await client.deleteAddress(address.id));
      setRemoving(null);
      setStatus({ tone: "ok", text: "Address removed." });
      addButton.current?.focus();
    } catch (failure) {
      fail(failure);
    } finally {
      setBusy(false);
    }
  }

  const draft = editing?.kind === "edit" ? editing.address : null;
  const field = (name: FieldName, label: string, input: ReactNode) => (
    <div className="account-field" data-field={name}>
      <label className="account-label" htmlFor={`${id}-${name}`}>{label}</label>
      {input}
      {errors[name] ? <p id={`${id}-${name}-error`} className="account-field-error">{errors[name]}</p> : null}
    </div>
  );
  const control = (name: FieldName) => ({
    id: `${id}-${name}`,
    name,
    "aria-invalid": errors[name] ? (true as const) : undefined,
    "aria-describedby": errors[name] ? `${id}-${name}-error` : undefined,
  });
  return (
    <>
      {status ? (
        <p className="account-status-line" data-tone={status.tone} role={status.tone === "problem" ? "alert" : "status"}>
          {status.text}
          {status.signIn ? <> <Link className="account-text-link" href={signInAgain}>Sign in again</Link></> : null}
        </p>
      ) : null}
      {addresses.length > 0 ? (
        <ul className="account-address-list">
          {addresses.map((address) => (
            <li key={address.id} className="account-panel account-address" data-address={address.id}>
              <div className="account-address-head">
                <p className="account-panel-title">{address.name}</p>
                {address.isDefault ? <span className="account-status" data-status="default">Default</span> : null}
              </div>
              <Lines className="account-panel-text" lines={[...addressLines(address), displayPhone(address.phone)]} />
              {removing === address.id ? (
                <div className="account-confirm" role="group" aria-labelledby={`${id}-remove-${address.id}`}>
                  <p id={`${id}-remove-${address.id}`} className="account-confirm-text">Remove this address?</p>
                  <div className="account-buttons">
                    <button type="button" className="account-cta" data-fill-button="" disabled={busy} onClick={() => void remove(address)}>Remove address</button>
                    <button type="button" className="account-cta" data-variant="quiet" data-fill-button="outline" onClick={() => setRemoving(null)}>Keep it</button>
                  </div>
                </div>
              ) : (
                <div className="account-address-actions">
                  <button type="button" className="account-text-link" onClick={() => open({ kind: "edit", address })}>
                    Edit<span className="sr-only">{` ${address.line1}`}</span>
                  </button>
                  <button type="button" className="account-text-link" onClick={() => { setRemoving(address.id); setStatus(null); }}>
                    Remove<span className="sr-only">{` ${address.line1}`}</span>
                  </button>
                  {address.isDefault ? null : (
                    <button type="button" className="account-text-link" disabled={busy} onClick={() => void makeDefault(address)}>
                      Make default<span className="sr-only">{` ${address.line1}`}</span>
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {editing ? (
        <form key={draft?.id ?? "new"} ref={form} className="account-card account-form" onSubmit={(event) => void save(event)} noValidate aria-labelledby={`${id}-form-title`}>
          <h2 id={`${id}-form-title`} className="account-card-title">{editing.kind === "new" ? "Add an address" : "Edit address"}</h2>
          <div className="account-fields">
            {field("name", "Full name", <input className="account-input" {...control("name")} autoComplete="shipping name" maxLength={120} defaultValue={draft?.name} />)}
            {field("phone", "Mobile number", <input className="account-input" {...control("phone")} type="tel" inputMode="tel" autoComplete="shipping tel-national" maxLength={24}
              placeholder="+91 mobile number" defaultValue={draft ? displayPhone(draft.phone) : undefined} />)}
            <div className="account-field-wide">
              {field("line1", "Street address", <input className="account-input" {...control("line1")} autoComplete="shipping address-line1" maxLength={200}
                placeholder="House number, building and street" defaultValue={draft?.line1} />)}
            </div>
            <div className="account-field-wide">
              {field("line2", "Apartment / landmark (optional)", <input className="account-input" {...control("line2")} autoComplete="shipping address-line2" maxLength={200}
                defaultValue={draft?.line2} />)}
            </div>
            {field("city", "City", <input className="account-input" {...control("city")} autoComplete="shipping address-level2" maxLength={100} defaultValue={draft?.city} />)}
            {field("pin", "PIN code", <input className="account-input" {...control("pin")} inputMode="numeric" autoComplete="shipping postal-code" maxLength={6}
              placeholder="6-digit PIN" defaultValue={draft?.pin} />)}
            {field("state", "State", (
              <select className="account-input account-select" {...control("state")} autoComplete="shipping address-level1" defaultValue={draft?.state ?? ""}>
                <option value="" disabled>Select state</option>
                {indiaStates.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
              </select>
            ))}
          </div>
          {draft?.isDefault ? null : (
            <label className="account-check">
              <input type="checkbox" name="isDefault" defaultChecked={addresses.length === 0} />
              Make this my default address
            </label>
          )}
          <div className="account-buttons">
            <button type="submit" className="account-cta" data-fill-button="" disabled={busy}>{busy ? "Saving…" : "Save address"}</button>
            {addresses.length > 0 ? (
              <button type="button" className="account-cta" data-variant="quiet" data-fill-button="outline" onClick={() => { setEditing(null); setErrors({}); }}>Cancel</button>
            ) : null}
          </div>
        </form>
      ) : addresses.length >= maxAddresses ? (
        <p className="account-muted">{`You can save up to ${maxAddresses} addresses. Remove one to add another.`}</p>
      ) : (
        <button ref={addButton} type="button" className="account-cta" data-variant="quiet" data-fill-button="outline" onClick={() => open({ kind: "new" })}>Add an address</button>
      )}
    </>
  );
}
