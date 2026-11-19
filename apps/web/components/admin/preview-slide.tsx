"use client";
import { createContext, useContext } from "react";
import type { PreviewSlider } from "@/lib/live-preview";

/**
 * Tells the live preview which slide a slider's editor has open (owner, 19 Nov 2026), so the page shows that slide and
 * holds it while it is edited; `null` lets the slider run again. Without a live preview it does nothing.
 */
export const PreviewSlideContext = createContext<(slider: PreviewSlider, index: number | null) => void>(() => {});
export const usePreviewSlide = () => useContext(PreviewSlideContext);
