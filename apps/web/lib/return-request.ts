import { z } from "zod";
import type { EnquiryInput } from "@shopmaple/contracts";

export type ReturnRequest =
  | { kind: "send"; order: string; email: string; enquiry: EnquiryInput }
  | { kind: "phone"; order: string }
  | { kind: "invalid"; field: "order" | "contact"; message: string };

export const orderMessage = "Enter your order number, for example #1001.";
export const contactMessage = "Enter the email or phone number you used for your order.";

const orderPattern = /^[a-z0-9][a-z0-9-]{0,29}$/i;
const phonePattern = /^\+?[\d\s()-]+$/;
const email = z.email().max(254);

/**
 * "Find your order" on the Return & Exchange page (Figma 150:3952). The store has no order lookup, so an
 * order number and email become an enquiry for the care team, saved as the old returns form saved it.
 * Enquiries are keyed by email, so a phone number is answered with the number to call instead.
 */
export function returnRequest(input: { order: string; contact: string }): ReturnRequest {
  const typed = input.order.trim().replace(/^#/, "");
  if (!orderPattern.test(typed)) return { kind: "invalid", field: "order", message: orderMessage };
  const order = /^\d+$/.test(typed) || input.order.trim().startsWith("#") ? `#${typed}` : typed;
  const contact = input.contact.trim();
  if (contact.includes("@")) {
    if (!email.safeParse(contact).success) return { kind: "invalid", field: "contact", message: contactMessage };
    return {
      kind: "send",
      order,
      email: contact,
      enquiry: {
        kind: "contact",
        name: "",
        email: contact,
        phone: "",
        message: `Return or exchange request for order ${order}.`,
        context: { product: "Return & Exchange", variant: "", sku: "", pincode: "" },
      },
    };
  }
  const digits = contact.replace(/\D/g, "");
  if (phonePattern.test(contact) && digits.length >= 7 && digits.length <= 15) return { kind: "phone", order };
  return { kind: "invalid", field: "contact", message: contactMessage };
}
