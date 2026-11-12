/**
 * A short film that plays on its own, muted and looping, while it is on screen (owner, 12 Nov 2026: the homepage
 * testimonial). It is server markup with its poster and fixed proportions, so nothing moves when it loads; until it is
 * scrolled to, only the film's opening bytes load. Playing and pausing is attached after hydration with the rest of the
 * homepage's motion (`mountAmbientFilm` in lib/home-effects.ts), so none of it weighs on first load. Visitors who ask for
 * reduced motion see the poster and the film never starts; without script the poster shows as well.
 */
export function AmbientFilm({ src, poster, label, className, width, height }: {
  src: string; poster?: string; label: string; className?: string; width: number; height: number;
}) {
  return <video className={className} src={src} poster={poster} width={width} height={height} muted loop playsInline preload="metadata"
    aria-label={label} data-ambient-film="" />;
}
