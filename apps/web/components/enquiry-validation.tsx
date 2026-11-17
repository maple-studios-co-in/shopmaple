"use client";
import { useCallback, useId, useRef, useState, type FormEvent } from "react";
import { checkEnquiry, enquiryFields, type EnquiryRules, type EnquiryValues } from "@/lib/enquiry-validation";

type Errors = Record<string, string>;

/** A box's value as the form holds it now (read from the form itself, as the forms' own senders do). */
const valueOf = (form: HTMLFormElement, name: string) => {
  const field = form.elements.namedItem(name);
  return field && "value" in field ? String(field.value) : "";
};
const read = (form: HTMLFormElement): EnquiryValues =>
  ({ name: valueOf(form, "name"), email: valueOf(form, "email"), phone: valueOf(form, "phone"), message: valueOf(form, "message") });

/**
 * A form's checks before it sends (lib/enquiry-validation.ts): `check` reads the boxes, writes each problem under its
 * box and moves the focus to the first one on the page; a box marked wrong updates as it is corrected. Forms set
 * `noValidate`, so every box speaks with these words rather than the browser's, which also passed half an email address.
 *
 * `required` names a form's other boxes that must be filled, with what to say when one is empty
 * ({ city: "Please enter the project's city." }).
 */
export function useEnquiryValidation(rules: EnquiryRules, required: Readonly<Record<string, string>> = {}) {
  const id = useId();
  const [errors, setErrors] = useState<Errors>({});
  const tried = useRef(false);
  const errorId = (name: string) => `${id}-${name}-error`;

  function find(form: HTMLFormElement): Errors {
    const found: Errors = { ...checkEnquiry(read(form), rules) };
    for (const [name, text] of Object.entries(required)) if (!valueOf(form, name).trim()) found[name] = text;
    return found;
  }

  /** The trimmed values when every box is right; otherwise null, with the problems shown and the first box focused. */
  function check(form: HTMLFormElement): EnquiryValues | null {
    tried.current = true;
    const found = find(form);
    setErrors(found);
    // The first box on the page with a problem (read by name, so a form from any window works alike).
    const first = [...form.elements].find(element => {
      const name = (element as { name?: unknown }).name;
      return typeof name === "string" && Boolean(found[name]);
    }) as HTMLElement | undefined;
    if (!first) {
      const values = read(form);
      return Object.fromEntries(enquiryFields.map(name => [name, values[name].trim()])) as EnquiryValues;
    }
    first.focus();
    return null;
  }

  /** Once a send was tried, a box already marked wrong clears or updates as it is typed in (a box never turns red mid-word). */
  function onChange(event: FormEvent<HTMLFormElement>) {
    const name = (event.target as { name?: unknown }).name;
    if (!tried.current || typeof name !== "string" || !name) return;
    const now = find(event.currentTarget)[name];
    setErrors(previous => {
      if (!previous[name] || previous[name] === now) return previous;
      const next = { ...previous };
      if (now) next[name] = now; else delete next[name];
      return next;
    });
  }

  /** The box's state for assistive technology: wrong, and described by its message. */
  const field = (name: string) => errors[name]
    ? { "aria-invalid": true as const, "aria-describedby": errorId(name) }
    : {};

  /**
   * The problem under a box. It sits inside the box's label on most forms, so it is left out of the label's name and
   * reached as the box's description instead (screen readers say it once, after "invalid").
   */
  const message = (name: string) => {
    const text = errors[name];
    return text ? <span className="enquiry-field-error" id={errorId(name)} data-field-error={name} aria-hidden="true">{text}</span> : null;
  };

  /** A sent form starts afresh: no marks, and nothing re-checked until the next send. Stable, for effects to depend on. */
  const reset = useCallback(() => {
    tried.current = false;
    setErrors(previous => (Object.keys(previous).length ? {} : previous));
  }, []);

  return { check, onChange, field, message, errors, reset };
}
