import type { ReactNode } from "react";
// Our Story's own sheet (Figma 293:1093, owner 10 Nov 2026); the staff preview frame loads it too.
import "@/styles/our-story.css";

export default function OurStoryLayout({ children }: { children: ReactNode }) {
  return children;
}
