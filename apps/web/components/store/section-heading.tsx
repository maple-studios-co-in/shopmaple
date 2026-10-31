import { cx } from "@/lib/cx";

/** The design's eyebrow: 12 px bold burgundy capitals ("OUR PROMISE", the footer's "SHOP"). */
export const eyebrow = "font-body text-label font-bold text-brand uppercase";

/**
 * A section's eyebrow and serif title ("OUR PROMISE / Every piece. Every time." in the
 * "Maple / PDF Review / UI Components" frame): 40 px Newsreader bold, 29 px under 750 px. Pass `id`
 * so the section can name itself with `aria-labelledby`.
 */
export function SectionHeading({ eyebrow: label, title, id, level = 2, className }: {
  eyebrow: string;
  title: string;
  id?: string;
  level?: 2 | 3;
  className?: string;
}) {
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <div data-store className={cx("flex flex-col gap-6 font-body max-[750px]:gap-3", className)}>
      <p data-section-eyebrow className={eyebrow}>{label}</p>
      <Heading id={id} className="font-serif text-display font-bold text-espresso max-[750px]:text-h2">
        {title}
      </Heading>
    </div>
  );
}
