import { z } from "zod";
import { checkoutAddressSchema } from "./checkout";

/**
 * Customer accounts: sign-in with a password (Figma 392:1652) or an emailed one-time code, which also confirms the email
 * at sign-up (392:1697) and resets a forgotten password; the account overview, order history and saved addresses
 * (owner's spec, 10–11 Nov 2026). JSON under `/api/account`.
 *
 * Import this module by its subpath, `@shopmaple/contracts/account`. It is deliberately NOT re-exported from the package
 * index, which ships in the homepage's JavaScript, whose budget is full.
 *
 * Errors use the API's usual body, `{ code, message }`. Branch on `code`; the message is a fixed sentence.
 */

// ---------------------------------------------------------------------------------------------------------------------
// Limits and names shared by the API and the account pages
// ---------------------------------------------------------------------------------------------------------------------

/** The emailed code: six digits, valid for ten minutes, single use, at most five tries. */
export const signInCodeLength = 6;
export const signInCodeTtlMinutes = 10;
export const signInMaxAttempts = 5;
/** A password (Figma 392:1697: "At least 8 characters, including a number"), at most 128 characters. */
export const passwordMinLength = 8;
export const passwordMaxLength = 128;
/** A session lasts 30 days from sign-in; signing in again replaces it. */
export const accountSessionDays = 30;
/** Saved delivery addresses per customer. */
export const maxAddresses = 10;

/** The session cookie: `__Host-maple_account` in production (HTTPS), `maple_account` in development. HttpOnly, SameSite=Lax, Path=/. */
export function accountCookieName(secure: boolean) {
  return secure ? "__Host-maple_account" : "maple_account";
}

/** Error codes the account API answers with, beside the API-wide ones (INVALID_INPUT, INVALID_JSON, ORIGIN_REJECTED,
 * NOT_FOUND, REQUEST_TOO_LARGE, SERVER_ERROR). With accounts switched off every `/api/account` route is a 404 NOT_FOUND. */
export const accountErrorCodes = [
  /** 401: no valid session (missing, forged, expired or signed out). */
  "ACCOUNT_AUTH_REQUIRED",
  /** 400 from verify: wrong code, or no code is waiting for this email. */
  "CODE_INVALID",
  /** 400 from verify: the latest code is older than ten minutes. */
  "CODE_EXPIRED",
  /** 400 from verify: five wrong tries on this code, or too many failed tries from this network or for this email
   * recently; ask for a new code or try later. Also from password sign-in, after too many wrong passwords. */
  "TOO_MANY_ATTEMPTS",
  /** 400 from password sign-in: the email and password don't match, or the account has no password yet. */
  "CREDENTIALS_INVALID",
  /** 404: no such order for this customer. Another customer's order answers the same. */
  "ORDER_NOT_FOUND",
  /** 404: no such address for this customer. Another customer's address answers the same. */
  "ADDRESS_NOT_FOUND",
  /** 409: already ten saved addresses. */
  "ADDRESS_LIMIT",
] as const;
export type AccountErrorCode = (typeof accountErrorCodes)[number];
export const signInVerifyErrorCodes = ["CODE_INVALID", "CODE_EXPIRED", "TOO_MANY_ATTEMPTS"] as const satisfies readonly AccountErrorCode[];
export type SignInVerifyErrorCode = (typeof signInVerifyErrorCodes)[number];
export const passwordSignInErrorCodes = ["CREDENTIALS_INVALID", "TOO_MANY_ATTEMPTS"] as const satisfies readonly AccountErrorCode[];
export type PasswordSignInErrorCode = (typeof passwordSignInErrorCodes)[number];
export const accountErrorSchema = z.object({ code: z.string().min(1).max(64), message: z.string().max(500) }).strict();
export type AccountError = z.infer<typeof accountErrorSchema>;

// ---------------------------------------------------------------------------------------------------------------------
// Input fields
// ---------------------------------------------------------------------------------------------------------------------

const unsafe = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
const text = (max: number) => z.string().trim().min(1).max(max).refine((value) => !unsafe.test(value), "Remove control characters");
const optionalText = (max: number) => z.string().trim().max(max).refine((value) => !unsafe.test(value), "Remove control characters");

/** Lowercased and trimmed: the key the checkout snapshot and the account share. */
export const accountEmailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());

/** The emailed code as typed or pasted: spaces and dashes are ignored, then exactly six digits. */
export const signInCodeSchema = z
  .string()
  .max(32)
  .transform((value) => value.replace(/[\s-]/g, ""))
  .pipe(z.string().regex(/^[0-9]{6}$/));

/** An Indian mobile number, stored as +91 and ten digits (the checkout snapshot's form). Spaces, dashes, brackets and a
 * leading 0, 91 or +91 are accepted. */
export const accountPhoneSchema = z
  .string()
  .max(24)
  .transform((value) => value.replace(/[\s().-]/g, ""))
  .pipe(z.string().regex(/^(?:\+91|91|0)?[6-9][0-9]{9}$/))
  .transform((value) => "+91" + value.slice(-10));

/** A new password: 8 to 128 characters with at least one digit. Never trimmed: spaces are part of a password. */
export const accountPasswordSchema = z
  .string()
  .min(passwordMinLength)
  .max(passwordMaxLength)
  .regex(/[0-9]/, "Include at least one number");

/** A customer's name as the sign-up form joins first and last name. */
export const accountNameSchema = text(120);

/** A GST state code as checkout uses it (e.g. "27" for Maharashtra), and a six-digit PIN. */
export const addressStateSchema = checkoutAddressSchema.shape.stateCode;
export const addressPinSchema = checkoutAddressSchema.shape.pincode;

// ---------------------------------------------------------------------------------------------------------------------
// Sign-in
// ---------------------------------------------------------------------------------------------------------------------

/** POST /api/account/sign-in/start → always 202 `{ ok: true }`, whether or not the email has an account or a limit was
 * hit. A code is emailed when the limits allow (per email and network 3 per 15 minutes; per email 10 per day; per network
 * 10 per hour; store-wide 300 per hour). It also sets an HttpOnly sign-in cookie (`__Host-maple_signin` in production,
 * `maple_signin` in development, ten minutes) that binds the code to this browser: verify must come from the same
 * browser, with cookies sent (same-origin fetches send them by default). */
/** Why a code is asked for. It only changes the email's wording: the code works the same for each. */
export const signInPurposes = ["sign-in", "sign-up", "reset"] as const;
export type SignInPurpose = (typeof signInPurposes)[number];
export const signInStartRequestSchema = z.object({ email: accountEmailSchema, purpose: z.enum(signInPurposes).optional() }).strict();
export const signInStartResponseSchema = z.object({ ok: z.literal(true) }).strict();

/** POST /api/account/sign-in/verify → 200 `{ customer }` and the session cookie, or 400 with a SignInVerifyErrorCode.
 * The first successful sign-in creates the account. Orders placed as a guest with this email appear once they are paid.
 * Sign-up (Figma 392:1697) and "Forgot password?" end here: the code proves the email is theirs, and `password` then
 * becomes the account's password (replacing any old one). `name` is kept only while the account has none. A password
 * that breaks the rules is refused (400 INVALID_INPUT) before the code is looked at, so it does not spend a try. */
export const signInVerifyRequestSchema = z
  .object({ email: accountEmailSchema, code: signInCodeSchema, password: accountPasswordSchema.optional(), name: accountNameSchema.optional() })
  .strict();

/** POST /api/account/sign-in/password (Figma 392:1652) → 200 `{ customer }` and the session cookie, or 400
 * CREDENTIALS_INVALID (the same for an unknown email, a wrong password or an account without one) or TOO_MANY_ATTEMPTS
 * (20 failed tries from a network in an hour, or 10 for an email in a day; "Forgot password?" still works). Any password
 * an account might hold is accepted here; the rules apply when one is set. */
export const passwordSignInRequestSchema = z
  .object({ email: accountEmailSchema, password: z.string().min(1).max(passwordMaxLength) })
  .strict();

/** The signed-in customer. `email` is the normalised sign-in address and cannot be changed. */
export const accountCustomerSchema = z
  .object({ name: z.string().max(120).nullable(), email: z.string().max(254), phone: z.string().max(16).nullable() })
  .strict();
export const signInVerifyResponseSchema = z.object({ customer: accountCustomerSchema }).strict();

// POST /api/account/sign-out → 204, signed in or not; clears the cookie.

// ---------------------------------------------------------------------------------------------------------------------
// Addresses
// ---------------------------------------------------------------------------------------------------------------------

/** An address's own name: "Home", "Studio" (Figma 392:1527), at most this long. */
export const addressLabelMaxLength = 40;
const addressFields = {
  /** What the customer calls the place ("Home", "Studio"); "" when they gave none. */
  label: optionalText(addressLabelMaxLength),
  /** Who receives the delivery. */
  name: text(120),
  line1: text(200),
  line2: optionalText(200),
  city: text(100),
  state: addressStateSchema,
  pin: addressPinSchema,
  phone: accountPhoneSchema,
};

/** POST /api/account/addresses → 201 AddressMutationResponse, or 409 ADDRESS_LIMIT at ten. The first address is always
 * the default; `isDefault: true` makes a later one the default. `label` may be left out (it then reads as none), and the
 * web leaves it out when the customer gives none, because an API from before addresses had names refuses a `label` key. */
export const addressInputSchema = z
  .object({ ...addressFields, label: addressFields.label.default(""), line2: addressFields.line2.default(""), isDefault: z.boolean().optional() })
  .strict();

/** PATCH /api/account/addresses/:id → 200 AddressMutationResponse. Send only what changes. `isDefault: true` makes it the
 * default (the old default stops being one); there is no switching the default off, only choosing another. `label: ""`
 * clears a name, which only an address that has one (so only the API that stores them) is ever sent. */
export const addressUpdateSchema = z
  .object({
    label: addressFields.label.optional(),
    name: addressFields.name.optional(),
    line1: addressFields.line1.optional(),
    line2: addressFields.line2.optional(),
    city: addressFields.city.optional(),
    state: addressFields.state.optional(),
    pin: addressFields.pin.optional(),
    phone: addressFields.phone.optional(),
    isDefault: z.literal(true).optional(),
  })
  .strict()
  .refine((update) => Object.keys(update).length > 0, "Nothing to change");

/**
 * A saved address. `state` is the GST state code; `label` and `line2` are "" when there is none.
 *
 * Release the API (with migration 20261111150000_customer_address_labels) and the web together. While customer accounts
 * are off nothing reads or writes addresses, so the order does not matter. With accounts on, in a gap between the two:
 * - web first is safe except for names: an API from before addresses had names leaves `label` out of its answers, which
 *   reads here as none, and an address added or edited without a name saves, since the web then sends no `label`.
 *   Giving a place a name is refused (that API's request schemas are strict) until the API is deployed.
 * - API first is not safe: the old web's address schema is strict too and refuses the `label` the new API answers with,
 *   so its address pages and overview fail, and checkout stops filling in the address, until the web is deployed.
 */
export const accountAddressSchema = z
  .object({
    id: z.uuid(),
    label: z.string().max(addressLabelMaxLength).default(""),
    name: z.string().max(120),
    line1: z.string().max(200),
    line2: z.string().max(200),
    city: z.string().max(100),
    state: z.string().regex(/^[0-9]{2}$/),
    pin: z.string().regex(/^[0-9]{6}$/),
    phone: z.string().max(16),
    isDefault: z.boolean(),
  })
  .strict();

/** GET /api/account/addresses → the customer's addresses, the default first, then the most recently changed. */
export const addressListResponseSchema = z.object({ addresses: z.array(accountAddressSchema).max(maxAddresses) }).strict();
/** POST and PATCH answer with the address and the whole list, since a default change moves the flag on another row. */
export const addressMutationResponseSchema = z
  .object({ address: accountAddressSchema, addresses: z.array(accountAddressSchema).max(maxAddresses) })
  .strict();
// DELETE /api/account/addresses/:id → 200 AddressListResponse (the next most recent address becomes the default when the
// default is deleted), or 404 ADDRESS_NOT_FOUND.

// ---------------------------------------------------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------------------------------------------------

/** Maple's own order number, "MF-" plus a number from 10001 up, assigned once when the payment is captured. */
export function formatOrderNumber(sequence: number) {
  return `MF-${sequence}`;
}
/** Reads "MF-10482", "mf-10482" or "10482" (as typed in a search box or an address); null for anything else. */
export function parseOrderNumber(raw: string): number | null {
  const match = /^(?:MF-)?([1-9][0-9]{0,9})$/i.exec(raw.trim());
  if (!match) return null;
  const sequence = Number(match[1]);
  // The column is a PostgreSQL integer.
  return sequence <= 2_147_483_647 ? sequence : null;
}
export const orderNumberSchema = z.string().regex(/^MF-[1-9][0-9]{0,9}$/);

/** `confirmed`: Keeri accepted the order. `confirming`: paid, and the team is confirming it (or reviewing it by hand).
 * `cancelled`: none yet; kept for later. `delivered`: reserved for when delivery is tracked; never sent yet. */
export const orderStatuses = ["confirmed", "confirming", "cancelled", "delivered"] as const;
export type OrderStatus = (typeof orderStatuses)[number];
export const orderStatusLabels = {
  confirmed: "Confirmed",
  confirming: "Confirming",
  cancelled: "Cancelled",
  delivered: "Delivered",
} as const satisfies Record<OrderStatus, string>;
/** How the order list's tabs group statuses. */
export const orderStatusTabs = {
  inProgress: ["confirmed", "confirming"],
  delivered: ["delivered"],
  cancelled: ["cancelled"],
} as const satisfies Record<string, readonly OrderStatus[]>;

const money = z.number().int().min(0).max(2_147_483_647);
const dateTime = z.iso.datetime({ offset: true });
/** A calendar day in India (YYYY-MM-DD). */
const day = z.iso.date();
const imageUrl = z.url().max(4096).nullable();

export const orderItemPreviewSchema = z
  .object({ title: z.string().max(500), variant: z.string().max(300), imageUrl })
  .strict();

/** One row of the order list. `placedAt` is when the payment was captured. `itemCount` counts pieces (quantities). */
export const orderSummarySchema = z
  .object({
    number: orderNumberSchema,
    placedAt: dateTime,
    status: z.enum(orderStatuses),
    statusLabel: z.string().min(1).max(60),
    itemCount: z.number().int().min(1).max(1000),
    totalPaise: money,
    firstItem: orderItemPreviewSchema,
  })
  .strict();

export const orderJourneyKeys = ["confirmed", "preparing", "dispatched", "delivered"] as const;
/** One step of the order journey. Today only Confirmed can be done (with `at`, when it was confirmed); while the order
 * is being confirmed it is `current`. Preparing, Dispatched and Delivered stay `upcoming` until staff status exists;
 * Delivered goes with the order's `estimate`. */
export const orderJourneyStepSchema = z
  .object({
    key: z.enum(orderJourneyKeys),
    label: z.string().min(1).max(60),
    state: z.enum(["done", "current", "upcoming"]),
    at: dateTime.nullable(),
  })
  .strict();

export const orderDetailSchema = z
  .object({
    ...orderSummarySchema.shape,
    items: z
      .array(
        z
          .object({ title: z.string().max(500), variant: z.string().max(300), quantity: z.number().int().min(1).max(20), linePaise: money, imageUrl })
          .strict(),
      )
      .min(1)
      .max(50),
    /** The delivery address frozen at checkout; `state` is the GST state code. `phone` arrives MASKED by the server, ready
     * to show as-is: "+91 ••••• •3210" (U+2022 bullets, ordinary spaces, last four digits). Do not mask it again. */
    delivery: z
      .object({
        name: z.string().max(120),
        line1: z.string().max(200),
        line2: z.string().max(200),
        city: z.string().max(100),
        state: z.string().regex(/^[0-9]{2}$/),
        pin: z.string().regex(/^[0-9]{6}$/),
        phone: z.string().max(16),
      })
      .strict(),
    /** `taxIncluded`: the GST amount is already inside the subtotal (it is not added to the total). */
    totals: z
      .object({ subtotalPaise: money, deliveryPaise: money, taxPaise: money, totalPaise: money, taxIncluded: z.boolean() })
      .strict(),
    /** `reference` is Razorpay's payment id, safe to show. The method (UPI, card) is never stored. */
    payment: z.object({ label: z.literal("Paid online"), reference: z.string().min(1).max(100) }).strict(),
    /** The delivery window in India's calendar, from the made-to-order lead time and the courier's estimate counted from
     * `placedAt`; null when either is unknown. */
    estimate: z.object({ from: day, to: day }).strict().nullable(),
    /** Always the four steps, in order: confirmed, preparing, dispatched, delivered. */
    journey: z
      .array(orderJourneyStepSchema)
      .length(4)
      .refine((steps) => steps.every((step, index) => step.key === orderJourneyKeys[index]), "Steps out of order"),
  })
  .strict();

/** GET /api/account/orders → paid orders placed with the account's email, newest first (at most 200). */
export const orderListResponseSchema = z.object({ orders: z.array(orderSummarySchema).max(200) }).strict();
// GET /api/account/orders/:number ("MF-10482" or "10482") → OrderDetail, or 404 ORDER_NOT_FOUND.

// ---------------------------------------------------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------------------------------------------------

/** GET /api/account → the overview, or 401 ACCOUNT_AUTH_REQUIRED. */
export const accountOverviewResponseSchema = z
  .object({
    customer: accountCustomerSchema,
    counts: z.object({ orders: z.number().int().min(0), addresses: z.number().int().min(0).max(maxAddresses) }).strict(),
    latestOrder: orderSummarySchema.nullable(),
    defaultAddress: accountAddressSchema.nullable(),
  })
  .strict();

/** PATCH /api/account → 200 `{ customer }`. Send only what changes; null clears a field. The email is read-only. */
export const accountProfileUpdateSchema = z
  .object({ name: text(120).nullable().optional(), phone: accountPhoneSchema.nullable().optional() })
  .strict();
export const accountProfileResponseSchema = z.object({ customer: accountCustomerSchema }).strict();

// ---------------------------------------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------------------------------------

export type SignInStartRequest = z.input<typeof signInStartRequestSchema>;
export type SignInVerifyRequest = z.input<typeof signInVerifyRequestSchema>;
export type PasswordSignInRequest = z.input<typeof passwordSignInRequestSchema>;
export type AccountCustomer = z.infer<typeof accountCustomerSchema>;
export type SignInVerifyResponse = z.infer<typeof signInVerifyResponseSchema>;
export type AccountOverview = z.infer<typeof accountOverviewResponseSchema>;
export type AccountProfileUpdate = z.input<typeof accountProfileUpdateSchema>;
export type AccountAddress = z.infer<typeof accountAddressSchema>;
export type AddressInput = z.input<typeof addressInputSchema>;
export type AddressUpdate = z.input<typeof addressUpdateSchema>;
export type AddressListResponse = z.infer<typeof addressListResponseSchema>;
export type AddressMutationResponse = z.infer<typeof addressMutationResponseSchema>;
export type OrderItemPreview = z.infer<typeof orderItemPreviewSchema>;
export type OrderSummary = z.infer<typeof orderSummarySchema>;
export type OrderJourneyStep = z.infer<typeof orderJourneyStepSchema>;
export type OrderDetail = z.infer<typeof orderDetailSchema>;
export type OrderListResponse = z.infer<typeof orderListResponseSchema>;
