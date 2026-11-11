import type { ReactNode } from "react";
// The WhatsApp preview's own sheet, loaded here so the page module stays importable by the tests.
import "@/styles/whatsapp-preview.css";

export default function WhatsAppPreviewLayout({ children }: { children: ReactNode }) {
  return children;
}
