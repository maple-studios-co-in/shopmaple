/**
 * A film's phone cut (owner, 12 Nov 2026): every film slot (a hero video slide, the homepage testimonial, the Nimbus and
 * Terra collection films) may have a `mobileSrc` beside its `src`, for example a 9:16 version of a square film. Screens up
 * to 749px wide play the phone cut, as pictures show their phone crop and the collection openings their portrait clip.
 */
export const phoneFilmQuery = "(max-width: 749px)";

/**
 * The address attributes of a film's `<video>` in server markup. Without a phone cut the film keeps its address in `src`,
 * exactly as before. With one, neither cut is in `src`: `chooseFilmSource` picks one once script runs, so a phone never
 * starts loading the wide film nor a computer the phone one. Until then, and without script, the poster shows.
 */
export function filmSourceProps(src: string, mobileSrc?: string): { src: string } | { "data-film-src": string; "data-film-mobile-src": string } {
  return mobileSrc ? { "data-film-src": src, "data-film-mobile-src": mobileSrc } : { src };
}

/**
 * Gives a film drawn with `filmSourceProps` the cut for this screen, chosen once as it is attached (like the collection
 * openings' clips). A film with only `src` is left as it is.
 */
export function chooseFilmSource(video: HTMLVideoElement): void {
  const main = video.getAttribute("data-film-src");
  if (!main) return;
  const phone = video.getAttribute("data-film-mobile-src");
  const source = phone && window.matchMedia?.(phoneFilmQuery).matches === true ? phone : main;
  if (video.getAttribute("src") !== source) video.setAttribute("src", source);
}
