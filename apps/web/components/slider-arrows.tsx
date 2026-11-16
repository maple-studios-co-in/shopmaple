import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Previous and next buttons for a homepage slider (QA report, 16 Nov 2026: the dots were the only way to change slide).
 * Real buttons in the server markup; the slider's lazy script (lib/slider-behaviour.ts) makes them work, wrapping round
 * at either end, and the stylesheet keeps them hidden until it has.
 */
export function SliderArrows({ count, ...props }: { count: number } & React.ComponentProps<"div">) {
  if (count < 2) return null;
  return (
    <div className="slider-arrows" {...props}>
      <button type="button" data-slider-prev aria-label="Previous slide"><ChevronLeft aria-hidden size={18} strokeWidth={1.75} /></button>
      <button type="button" data-slider-next aria-label="Next slide"><ChevronRight aria-hidden size={18} strokeWidth={1.75} /></button>
    </div>
  );
}
