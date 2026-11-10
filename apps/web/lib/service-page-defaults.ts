import type { ServicePagesContent } from "@shopmaple/contracts";
import { defaultBulkPage } from "./bulk-enquiry-defaults";
import { defaultContactPage } from "./contact-page-content";

/** Original rendered copy; images, routes, contact destinations and operations stay fixed. */
export const defaultServicePages: ServicePagesContent = {
  // The contact page's redesign (Figma 298:511; owner, 10 Nov 2026); lib/contact-page-content.ts keeps the original copy.
  contact: defaultContactPage,
  // The Bulk Enquiry redesign (Figma 298:924; owner, 10 Nov 2026); lib/bulk-enquiry-defaults.ts keeps the original copy.
  bulk: defaultBulkPage,
  returns: {
    title: "Return & Exchange",
    heading: "Return & Exchange",
    // The Return & Exchange frame (Figma 150:3952): its line under the title and its link to the refund policy.
    policyLabel: "Read the Refund Policy",
    intro: "Enter your order number and the email you ordered with, and our care team will get back to you about a return or exchange.",
  },
};

export function resolveServicePages(value?: ServicePagesContent): ServicePagesContent {
  return structuredClone(value ?? defaultServicePages);
}
