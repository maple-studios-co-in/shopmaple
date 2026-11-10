import type { CSSProperties, ReactNode } from "react";

/**
 * A row that drifts left on its own, without end, its items staying sharp and slipping out of sight at the
 * section's margins. It is CSS alone (the row twice over, sliding by half its width), so nothing loads for it. The
 * pointer or keyboard focus on the row holds it: at once from the stylesheet, and once the homepage's effects have
 * loaded it eases to a stop and back into its drift instead (lib/home-effects.ts). There is no pause button (owner,
 * 10 Nov 2026), and under reduced motion it is a plain row that scrolls. The second copy is hidden from assistive
 * technology and from the tab order.
 */
export function HomeMarquee({ label, className = "", seconds, autoplay = true, items }: {
  label: string;
  className?: string;
  /** How long one full pass of the row takes. */
  seconds: number;
  autoplay?: boolean;
  /** The row's items; `copy` is true for the hidden second pass. */
  items: (copy: boolean) => ReactNode;
}) {
  return (
    <div className={`home-marquee ${className}`} role="group" aria-roledescription="carousel" aria-label={label} data-marquee={autoplay ? "" : undefined}>
      <div className="home-marquee-viewport" data-marquee-viewport tabIndex={0} aria-label={label}>
        <div className="home-marquee-track" data-marquee-track style={{ "--marquee-duration": `${seconds}s` } as CSSProperties}>
          <div className="home-marquee-group" data-marquee-group>{items(false)}</div>
          {autoplay && <div className="home-marquee-group" data-marquee-group data-marquee-copy aria-hidden="true">{items(true)}</div>}
        </div>
      </div>
    </div>
  );
}
