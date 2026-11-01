/**
 * Everything a homepage slider does with script. The slides, dots and the scroll-snap track are server
 * markup that already works without it (swipe, scroll, read); this file is loaded after hydration
 * (components/slider-island.tsx) so none of it weighs on first load. It reads and writes the markup only
 * through `data-*` hooks:
 *
 *   [data-slider]              the root; `data-slider-autoplay="ms"` turns autoplay on, `data-slider-ready` is set once attached
 *   [data-slider-track]        the scroll-snap row;  [data-slider-slide] one slide, `data-active` on the current one
 *   [data-slider-dot]          a button per slide, `aria-current="true"` on the current one
 *   [data-slider-toggle]       a button that opens and closes its slide's detail panel (`.is-open` on the slide)
 *   [data-slider-focus-opens]  opens its slide's panel when focused
 *
 * Videos play only while their slide is current, muted and looping, and never under reduced motion.
 */
export function mountSlider(root: HTMLElement): () => void {
  const track = root.querySelector<HTMLElement>("[data-slider-track]");
  const slides = [...root.querySelectorAll<HTMLElement>("[data-slider-slide]")];
  const dots = [...root.querySelectorAll<HTMLElement>("[data-slider-dot]")];
  const interval = Number(root.dataset.sliderAutoplay) || 0;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  let index = Math.max(0, slides.findIndex(slide => slide.hasAttribute("data-active")));
  let timer: ReturnType<typeof setTimeout> | undefined;
  let settle: ReturnType<typeof setTimeout> | undefined;
  let target: number | null = null;
  let held = false;

  const schedule = () => {
    clearTimeout(timer);
    if (!interval || slides.length < 2 || held || reduced?.matches) return;
    timer = setTimeout(() => go((index + 1) % slides.length), interval);
  };
  const show = () => {
    slides.forEach((slide, i) => {
      slide.toggleAttribute("data-active", i === index);
      for (const video of slide.querySelectorAll("video")) {
        if (i === index && !reduced?.matches) { video.muted = true; void video.play()?.catch(() => {}); }
        else if (!video.paused) video.pause();
      }
    });
    dots.forEach((dot, i) => { if (i === index) dot.setAttribute("aria-current", "true"); else dot.removeAttribute("aria-current"); });
  };
  function go(next: number) {
    index = next;
    target = next;
    // A smooth scroll passes through the slides between; the current one only changes where it lands.
    clearTimeout(settle);
    settle = setTimeout(() => { target = null; }, 800);
    show();
    track?.scrollTo?.({ left: next * track.clientWidth, behavior: reduced?.matches ? "auto" : "smooth" });
    schedule();
  }
  const onScroll = () => {
    const width = track?.clientWidth;
    if (!track || !width) return;
    const seen = Math.round(track.scrollLeft / width);
    if (target !== null) { if (seen !== target) return; target = null; }
    if (seen !== index && slides[seen]) { index = seen; show(); schedule(); }
  };
  const open = (card: Element | null, value: boolean) => {
    if (!card) return;
    card.classList.toggle("is-open", value);
    const toggle = card.querySelector<HTMLElement>("[data-slider-toggle]");
    toggle?.setAttribute("aria-expanded", String(value));
    const label = value ? toggle?.dataset.labelOpen : toggle?.dataset.labelClosed;
    if (label) toggle?.setAttribute("aria-label", label);
  };
  const onClick = (event: Event) => {
    const from = event.target instanceof Element ? event.target : null;
    const dot = from?.closest("[data-slider-dot]");
    if (dot && dots.includes(dot as HTMLElement)) return go(dots.indexOf(dot as HTMLElement));
    const toggle = from?.closest("[data-slider-toggle]");
    if (toggle) { const card = toggle.closest("[data-slider-slide]"); open(card, !card?.classList.contains("is-open")); }
  };
  const onEnter = () => { held = true; schedule(); };
  const onLeave = () => { held = false; schedule(); };
  const onFocusIn = (event: Event) => {
    const from = event.target instanceof Element ? event.target : null;
    held = true;
    clearTimeout(timer);
    const slide = from?.closest<HTMLElement>("[data-slider-slide]");
    if (from?.closest("[data-slider-focus-opens]")) open(slide ?? null, true);
    const at = slide ? slides.indexOf(slide) : -1;
    if (at >= 0 && at !== index) go(at);
  };
  const onFocusOut = (event: Event) => {
    const next = (event as FocusEvent).relatedTarget;
    if (!(next instanceof Node) || !root.contains(next)) onLeave();
  };
  const onMotion = () => { show(); schedule(); };

  track?.addEventListener("scroll", onScroll, { passive: true });
  root.addEventListener("click", onClick);
  root.addEventListener("pointerenter", onEnter);
  root.addEventListener("pointerleave", onLeave);
  root.addEventListener("focusin", onFocusIn);
  root.addEventListener("focusout", onFocusOut);
  reduced?.addEventListener?.("change", onMotion);
  show();
  schedule();
  root.setAttribute("data-slider-ready", "");
  return () => {
    clearTimeout(timer);
    clearTimeout(settle);
    track?.removeEventListener("scroll", onScroll);
    root.removeEventListener("click", onClick);
    root.removeEventListener("pointerenter", onEnter);
    root.removeEventListener("pointerleave", onLeave);
    root.removeEventListener("focusin", onFocusIn);
    root.removeEventListener("focusout", onFocusOut);
    reduced?.removeEventListener?.("change", onMotion);
    root.removeAttribute("data-slider-ready");
  };
}
