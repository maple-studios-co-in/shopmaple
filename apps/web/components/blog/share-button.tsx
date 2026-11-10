"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Share (Figma 268:4858, 268:4867): the phone's own share sheet where there is one, otherwise the article's address is
 * copied and the button says so for a moment. Nothing is sent anywhere by the store.
 */
export function BlogShareButton({ title, url, icon, className }: { title: string; url: string; icon: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  async function share() {
    const { navigator } = window;
    if (typeof navigator.share === "function") {
      try { await navigator.share({ title, url }); } catch { /* The visitor closed the sheet. */ }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch { /* No clipboard here: the address bar still has it. */ }
  }
  return (
    <button type="button" data-share-native className={className} onClick={share}>
      {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size design icon */}
      <img src={icon} alt="" width={16} height={16} />
      <span aria-live="polite">{copied ? "Link copied" : "Share"}</span>
    </button>
  );
}
