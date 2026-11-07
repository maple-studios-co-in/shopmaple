import type { CSSProperties, ReactNode } from "react";

/**
 * A row that drifts left on its own, without end, its items staying sharp and slipping out of sight at the
 * section's margins. It is CSS alone (the row twice over, sliding by half its width), so nothing loads for it: hovering
 * or focusing the row holds it, its pause switch stops it until switched back, and under reduced motion it
 * is a plain row that scrolls. The second copy is hidden from assistive technology and from the tab order.
 * `toggle={false}` leaves the switch out, for a row the owner wants held by hover and focus alone.
 */
export function HomeMarquee({ label, className = "", seconds, autoplay = true, toggle = true, items }: {
  label: string;
  className?: string;
  toggle?: boolean;
  /** How long one full pass of the row takes. */
  seconds: number;
  autoplay?: boolean;
  /** The row's items; `copy` is true for the hidden second pass. */
  items: (copy: boolean) => ReactNode;
}) {
  return (
    <div className={`home-marquee ${className}`} role="group" aria-roledescription="carousel" aria-label={label} data-marquee={autoplay ? "" : undefined}>
      {autoplay && toggle && (
        <label className="home-marquee-toggle" data-marquee-toggle>
          <input type="checkbox" data-marquee-pause />
          <span className="sr-only">Pause {label}</span>
        </label>
      )}
      <div className="home-marquee-viewport" data-marquee-viewport tabIndex={0} aria-label={label}>
        <div className="home-marquee-track" style={{ "--marquee-duration": `${seconds}s` } as CSSProperties}>
          <div className="home-marquee-group" data-marquee-group>{items(false)}</div>
          {autoplay && <div className="home-marquee-group" data-marquee-group data-marquee-copy aria-hidden="true">{items(true)}</div>}
        </div>
      </div>
    </div>
  );
}
