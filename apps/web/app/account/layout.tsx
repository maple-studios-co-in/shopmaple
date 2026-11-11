import type { ReactNode } from "react";
// The account pages' own sheet (Figma 392:1255, 392:1338, 392:1432; owner's spec, 10 Nov 2026), shared by the sign-in
// pages (392:1652, 392:1697). Checkout loads it too.
import "@/styles/account.css";

/** Each group draws its own frame: the signed-in pages wear the minimal shell, the sign-in pages their full-screen split. */
export default function AccountLayout({ children }: { children: ReactNode }) {
  return children;
}
