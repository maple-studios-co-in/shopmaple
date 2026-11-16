import { z } from "zod";

/**
 * The checks every enquiry form runs before it sends, so a visitor learns which box is wrong and how to put it right
 * (QA report, 16 Nov 2026: a bad value only ever drew "Please check your details and try again", the browser's own email
 * check passed "name@site" which the enquiry service then refused, and a name of digits or a phone of letters went
 * through). A required box must be filled; an optional one is checked only once something is in it.
 */
export type EnquiryField = "name" | "email" | "phone" | "message";
export type EnquiryValues = Record<EnquiryField, string>;
export type EnquiryErrors = Partial<Record<EnquiryField, string>>;
export type EnquiryRules = {
  name?: "required" | "optional";
  phone?: "required" | "optional";
  message?: "required" | "optional";
  /** What to ask for when a required message is empty ("Please tell us about your project."). */
  messagePrompt?: string;
};

/** The order the boxes sit in on every form: the first one with a problem takes the focus. */
export const enquiryFields: readonly EnquiryField[] = ["name", "email", "phone", "message"];

/** The enquiry service's own email check (packages/contracts), so nothing that passes here is refused there. */
const emailSchema = z.email().max(254);
/** Letters in any script, with the spaces, dots, apostrophes and hyphens names carry ("Dr. A. D'Souza-Rao"). */
const nameShape = /^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u;
/** Digits with the usual separators, and a leading + for a country code. */
const phoneShape = /^\+?[\d\s().-]+$/;

/**
 * A phone number of the right length: an Indian number is ten digits (mobiles start 6 to 9, landlines carry their area
 * code), optionally after 0 or 91; a number given with a + and another country code has 8 to 15 digits in all.
 */
export function isPhoneNumber(value: string): boolean {
  const trimmed = value.trim();
  if (!phoneShape.test(trimmed)) return false;
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) return digits.startsWith("91") ? /^91[1-9]\d{9}$/.test(digits) : digits.length >= 8 && digits.length <= 15;
  return /^(?:0|91)?[1-9]\d{9}$/.test(digits);
}

export function checkEnquiry(values: EnquiryValues, rules: EnquiryRules): EnquiryErrors {
  const errors: EnquiryErrors = {};
  const name = values.name.trim(), email = values.email.trim(), phone = values.phone.trim(), message = values.message.trim();

  if (!name) { if (rules.name === "required") errors.name = "Please enter your name."; }
  else if (!nameShape.test(name)) errors.name = "Please use letters only for your name.";
  else if (name.replace(/[^\p{L}]/gu, "").length < 2) errors.name = "Please enter your full name.";

  if (!email) errors.email = "Please enter your email address.";
  else if (!emailSchema.safeParse(email).success) errors.email = "Please enter a complete email address, like name@example.com.";

  if (!phone) { if (rules.phone === "required") errors.phone = "Please enter your phone number."; }
  else if (!phoneShape.test(phone)) errors.phone = "Please use digits only for your phone number.";
  else if (!isPhoneNumber(phone)) errors.phone = "Please enter a 10-digit phone number, or add your country code with +.";

  if (rules.message === "required") {
    if (!message) errors.message = rules.messagePrompt ?? "Please write your message.";
    else if (!/[\p{L}\p{N}]/u.test(message)) errors.message = "Please write your message in words.";
  }
  return errors;
}
