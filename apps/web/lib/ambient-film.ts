/**
 * Short films that play on their own, muted and looping, while they are on screen: the homepage testimonial
 * (components/ambient-film.tsx, attached with the rest of lib/home-effects.ts) and the Nimbus and Terra openings
 * (components/collection-landing-client.tsx; owner, 12 Nov 2026). Kept apart from the homepage's other motion so a
 * collection page loads only this.
 */

/** Calls `onChange` with whether `element` is at least `ratio` in view; without IntersectionObserver it counts as always in view. */
export function watchVisibility(element: Element, ratio: number, onChange: (visible: boolean) => void) {
  if (typeof IntersectionObserver !== "function") { onChange(true); return () => {}; }
  const observer = new IntersectionObserver((entries) => {
    const entry = entries[entries.length - 1];
    if (entry) onChange(entry.isIntersecting && entry.intersectionRatio >= ratio);
  }, { threshold: [0, ratio] });
  observer.observe(element);
  return () => observer.disconnect();
}

/**
 * Plays `player` muted while a quarter of it is in view and pauses it otherwise. Under reduced motion it never starts, and
 * asking for less motion mid-film brings the poster back rather than leaving a frame.
 */
export function mountAmbientFilm(player: HTMLVideoElement): () => void {
  const reduced = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  let visible = false;
  const update = () => {
    if (visible && !reduced?.matches) { player.muted = true; void player.play()?.catch(() => {}); return; }
    if (player.paused) return;
    player.pause();
    if (reduced?.matches) player.load();
  };
  const stopWatching = watchVisibility(player, 0.25, (seen) => { visible = seen; update(); });
  reduced?.addEventListener?.("change", update);
  return () => { stopWatching(); reduced?.removeEventListener?.("change", update); };
}
