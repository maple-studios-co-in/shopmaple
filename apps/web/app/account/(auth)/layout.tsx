import type { ReactNode } from "react";
// Sign-in, sign-up and the password reset (Figma 392:1652, 392:1697): a full-screen split with no store header.
import "@/styles/account-auth.css";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return children;
}
