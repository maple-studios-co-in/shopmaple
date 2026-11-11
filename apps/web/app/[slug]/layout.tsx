import type { ReactNode } from "react";
// The contact page's own sheet (Figma 298:511, owner 10 Nov 2026); the staff preview frame loads it too.
import "@/styles/contact-page.css";
// And the Bulk Enquiry page's (Figma 298:924, owner 10 Nov 2026).
import "@/styles/bulk-enquiry.css";

export default function ServicePageLayout({ children }: { children: ReactNode }) {
  return children;
}
