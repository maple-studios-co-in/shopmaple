/**
 * The homepage's motion, attached after hydration (components/home-effects-island.tsx) as its own
 * chunk, so none of it weighs on first load. Everything it touches is complete server markup that
 * reads well without it, and it reads and writes that markup only through `data-*` hooks:
 *
 *   [data-stage]         the Nimbus/Terra stage: a [data-stage-slide] and [data-stage-backdrop] per
 *                        collection, a [data-stage-dot] button each whose ring fills (a CSS animation of `--stage-interval`), and the
 *                        [data-stage-next] arrow whose ring fills alongside; when the ring closes the next
 *                        slide fades in. With a mouse the arrow is the pointer over the photo.
 *   [data-typed]         the statement band's closing words: typed, held, erased and typed again
 *   [data-flipbook]      the editorial photo: its [data-flip-frame] pictures cut every 800 ms, on and
 *                        on, while it is in view
 *   [data-reveal]        an element that fades in once it scrolls into view (`data-revealed`)
 *   [data-ambient-film]  the testimonial's film (components/ambient-film.tsx): muted and looping while at least a quarter
 *                        of it is in view, paused otherwise
 *   [data-marquee]       the Social Proof row: its [data-marquee-track]'s drift eases to rest under the mouse or
 *                        keyboard focus and back when they leave (`data-marquee-eased` while this is in charge)
 *
 * Under reduced motion nothing moves: every element keeps its finished, server-drawn state, and the
 * stage's numbers still switch collections.
 */

/** How long one picture of the editorial flipbook stays, as in the reference recording. */
export const flipIntervalMs = 800;
const typeMs = 75;
const accentTypeMs = 95;
const eraseMs = 32;
const holdMs = 2400;
const restMs = 550;

/** The three runs of the typed clause: plain words, the script accent, then whatever follows it. */
export type TypedRuns = { before: string; accent: string; after: string };

/** How much of each run shows once `count` characters of the clause are typed. */
export function typedSlice(runs: TypedRuns, count: number): TypedRuns {
  const before = [...runs.before], accent = [...runs.accent], after = [...runs.after];
  const take = (chars: string[], from: number) => chars.slice(0, Math.max(0, Math.min(chars.length, count - from))).join("");
  return {
    before: take(before, 0),
    accent: take(accent, before.length),
    after: take(after, before.length + accent.length),
  };
}

const reducedMotion = () => typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Calls `onChange` with whether `element` is at least `ratio` in view; without IntersectionObserver it counts as always in view. */
function watchVisibility(element: Element, ratio: number, onChange: (visible: boolean) => void) {
  if (typeof IntersectionObserver !== "function") { onChange(true); return () => {}; }
  const observer = new IntersectionObserver((entries) => {
    const entry = entries[entries.length - 1];
    if (entry) onChange(entry.isIntersecting && entry.intersectionRatio >= ratio);
  }, { threshold: [0, ratio] });
  observer.observe(element);
  return () => observer.disconnect();
}

export function mountStage(root: HTMLElement, reduced = reducedMotion()): () => void {
  const slides = [...root.querySelectorAll<HTMLElement>("[data-stage-slide]")];
  const backdrops = [...root.querySelectorAll<HTMLElement>("[data-stage-backdrop]")];
  const dots = [...root.querySelectorAll<HTMLButtonElement>("[data-stage-dot]")];
  const next = root.querySelector<HTMLButtonElement>("[data-stage-next]");
  const frame = root.querySelector<HTMLElement>("[data-stage-frame]") ?? root;
  if (slides.length < 2) return () => {};
  let index = Math.max(0, slides.findIndex((slide) => slide.hasAttribute("data-active")));
  let focused = false, visible = false;
  const holds = () => {
    root.toggleAttribute("data-stage-paused", reduced || focused || !visible || document.hidden);
  };
  // The arrow's ring starts afresh with every collection, in step with the number's.
  const restartArrow = () => {
    const ring = next?.querySelector<SVGElement>("[data-next-progress]");
    if (!ring) return;
    ring.style.animation = "none";
    void ring.getBoundingClientRect();
    ring.style.animation = "";
  };
  const show = (to: number) => {
    index = (to + slides.length) % slides.length;
    slides.forEach((slide, i) => {
      const current = i === index;
      slide.toggleAttribute("data-active", current);
      slide.toggleAttribute("inert", !current);
      if (current) slide.removeAttribute("aria-hidden"); else slide.setAttribute("aria-hidden", "true");
    });
    backdrops.forEach((backdrop, i) => backdrop.toggleAttribute("data-active", i === index));
    dots.forEach((dot, i) => {
      if (i === index) dot.setAttribute("aria-current", "true"); else dot.removeAttribute("aria-current");
    });
    restartArrow();
  };
  const onClick = (event: Event) => {
    const from = event.target instanceof Element ? event.target : null;
    const dot = from?.closest<HTMLButtonElement>("[data-stage-dot]");
    if (dot && dots.includes(dot)) return show(dots.indexOf(dot));
    if (next && from?.closest("[data-stage-next]") === next) return show(index + 1);
    // While the arrow is the pointer, a press anywhere on the photo (not on a link) is a press on it.
    if (frame.hasAttribute("data-pointer-in") && !from?.closest("a, button")) show(index + 1);
  };

  // With a mouse the arrow is the pointer over the photo, as in the owner's reference: it appears where the
  // mouse comes in, follows it closely (scrolling too), steps aside over links and numbers, and fades out
  // where it is when the mouse leaves, then goes back to its resting place unseen. Touch is left alone: there
  // it rests at its edge, a plain button.
  type Point = { x: number; y: number };
  let frameId = 0, inside = false;
  let client: Point = { x: 0, y: 0 }, at: Point = client, target: Point = client;
  let settle: ReturnType<typeof setTimeout> | undefined;
  const place = () => {
    next?.style.setProperty("--next-x", `${at.x}px`);
    next?.style.setProperty("--next-y", `${at.y}px`);
  };
  const glide = () => {
    at = { x: at.x + (target.x - at.x) * 0.35, y: at.y + (target.y - at.y) * 0.35 };
    const near = Math.abs(target.x - at.x) < 0.5 && Math.abs(target.y - at.y) < 0.5;
    if (near) at = target;
    place();
    frameId = near ? 0 : requestAnimationFrame(glide);
  };
  const aim = () => {
    const box = frame.getBoundingClientRect();
    target = { x: client.x - box.left, y: client.y - box.top };
    if (!frameId) frameId = requestAnimationFrame(glide);
  };
  const onMove = (event: PointerEvent) => {
    if (event.pointerType === "touch" || !next) return;
    client = { x: event.clientX, y: event.clientY };
    clearTimeout(settle);
    if (!frame.hasAttribute("data-following")) {
      const box = frame.getBoundingClientRect();
      at = target = { x: client.x - box.left, y: client.y - box.top };
      place();
      frame.setAttribute("data-following", "");
    }
    inside = true;
    frame.setAttribute("data-pointer-in", "");
    frame.toggleAttribute("data-next-aside", event.target instanceof Element && event.target.closest("a, [data-stage-dot]") !== null);
    aim();
  };
  const onLeave = () => {
    if (!inside) return;
    inside = false;
    frame.removeAttribute("data-pointer-in");
    frame.removeAttribute("data-next-aside");
    settle = setTimeout(() => {
      cancelAnimationFrame(frameId);
      frameId = 0;
      frame.removeAttribute("data-following");
    }, 400);
  };
  // Scrolling under a still mouse moves the photo, not the pointer: the arrow stays under the pointer.
  const onScroll = () => {
    if (!inside) return;
    const box = frame.getBoundingClientRect();
    if (client.x < box.left || client.x > box.right || client.y < box.top || client.y > box.bottom) onLeave();
    else aim();
  };
  if (!reduced && next) {
    frame.addEventListener("pointermove", onMove);
    frame.addEventListener("pointerleave", onLeave);
    window.addEventListener("scroll", onScroll, { passive: true });
  }
  // The ring on the current number is a CSS animation; when it closes, the next collection takes the stage.
  const onRingEnd = (event: AnimationEvent) => {
    if (reduced || event.animationName !== "stage-ring") return;
    const dot = event.target instanceof Element ? event.target.closest("[data-stage-dot]") : null;
    if (dot && dot === dots[index]) show(index + 1);
  };
  // Keyboard focus holds the stage (a shopper reading or about to press Explore); a mouse click on a
  // number does not, so the collections carry on from the one chosen.
  const keyboardFocus = () => {
    try { return root.querySelector(":focus-visible") !== null; } catch { return root.contains(document.activeElement); }
  };
  const onFocusIn = () => { focused = keyboardFocus(); holds(); };
  const onFocusOut = (event: FocusEvent) => {
    if (!(event.relatedTarget instanceof Node) || !root.contains(event.relatedTarget)) { focused = false; holds(); }
  };
  const onPage = () => holds();
  const stopWatching = watchVisibility(root, 0.35, (seen) => { visible = seen; holds(); });
  root.addEventListener("click", onClick);
  root.addEventListener("animationend", onRingEnd);
  root.addEventListener("focusin", onFocusIn);
  root.addEventListener("focusout", onFocusOut);
  document.addEventListener("visibilitychange", onPage);
  show(index);
  holds();
  root.setAttribute("data-stage-ready", "");
  return () => {
    stopWatching();
    cancelAnimationFrame(frameId);
    clearTimeout(settle);
    root.removeEventListener("click", onClick);
    root.removeEventListener("animationend", onRingEnd);
    root.removeEventListener("focusin", onFocusIn);
    root.removeEventListener("focusout", onFocusOut);
    frame.removeEventListener("pointermove", onMove);
    frame.removeEventListener("pointerleave", onLeave);
    window.removeEventListener("scroll", onScroll);
    document.removeEventListener("visibilitychange", onPage);
    frame.removeAttribute("data-following");
    frame.removeAttribute("data-pointer-in");
    frame.removeAttribute("data-next-aside");
    root.removeAttribute("data-stage-ready");
    root.removeAttribute("data-stage-paused");
  };
}

export function mountTyped(host: HTMLElement): () => void {
  const live = host.querySelector<HTMLElement>("[data-typed-live]");
  if (!live) return () => {};
  const runs: TypedRuns = {
    before: host.dataset.typedBefore ?? "",
    accent: host.dataset.typedAccent ?? "",
    after: host.dataset.typedAfter ?? "",
  };
  const total = [...runs.before].length + [...runs.accent].length + [...runs.after].length;
  const accentFrom = [...runs.before].length, accentTo = accentFrom + [...runs.accent].length;
  let count = total, erasing = false, visible = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const draw = () => {
    const shown = typedSlice(runs, count);
    const accent = document.createElement("em");
    accent.setAttribute("data-statement-accent", "");
    accent.textContent = shown.accent;
    live.replaceChildren(document.createTextNode(shown.before), ...(shown.accent ? [accent] : []), document.createTextNode(shown.after));
  };
  const step = () => {
    if (!visible) return;
    let wait: number;
    if (erasing) {
      count -= 1;
      if (count <= 0) { count = 0; erasing = false; wait = restMs; } else wait = eraseMs;
    } else {
      count += 1;
      if (count >= total) { count = total; erasing = true; wait = holdMs; } else wait = count > accentFrom && count <= accentTo ? accentTypeMs : typeMs;
    }
    draw();
    timer = setTimeout(step, wait);
  };
  const stopWatching = watchVisibility(host, 0.5, (seen) => {
    const was = visible;
    visible = seen;
    if (seen && !was) {
      clearTimeout(timer);
      // Each time the band comes into view the clause is typed afresh.
      count = 0; erasing = false; draw();
      timer = setTimeout(step, restMs);
    } else if (!seen) clearTimeout(timer);
  });
  host.setAttribute("data-typing", "");
  return () => {
    stopWatching();
    clearTimeout(timer);
    count = total;
    draw();
    host.removeAttribute("data-typing");
  };
}

/** The flipbook cuts to its next picture every 800 ms, on and on, while it is in view, pointed at or not. */
export function mountFlipbook(root: HTMLElement): () => void {
  const frames = [...root.querySelectorAll<HTMLElement>("[data-flip-frame]")];
  if (frames.length < 2) return () => {};
  let index = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  const show = (next: number) => {
    index = next % frames.length;
    frames.forEach((frame, i) => frame.toggleAttribute("data-active", i === index));
  };
  const stopWatching = watchVisibility(root, 0.25, (seen) => {
    if (seen && !timer) timer = setInterval(() => show(index + 1), flipIntervalMs);
    if (!seen && timer) { clearInterval(timer); timer = undefined; }
  });
  return () => {
    stopWatching();
    clearInterval(timer);
    show(0);
  };
}

/** How long the drifting row takes to come to rest under the pointer, and to gather its full speed again. */
export const marqueeStopMs = 650;
export const marqueeStartMs = 1100;
/** Slowing: most of the speed goes at once, the last of it softly (close to the site's cubic-bezier(.22,1,.36,1)). */
const easeOut = (p: number) => 1 - (1 - p) ** 4;
/** Gathering speed: gently away from rest and gently into the drift. */
const easeInOut = (p: number) => (1 - Math.cos(Math.PI * p)) / 2;

/**
 * The Social Proof row (owner, 10 Nov 2026): the mouse over it, or keyboard focus inside it, holds it. Its drift is a
 * CSS animation; this eases that animation's speed to rest and back (the playback rate keeps the row where it is,
 * so nothing jumps), where the stylesheet alone would stop it dead. A finger is left alone, as the row is swiped
 * past on the way down the page. Without a drift to ease (reduced motion) the stylesheet stays in charge.
 */
export function mountMarquee(root: HTMLElement, reduced = reducedMotion()): () => void {
  const drift = reduced ? undefined : root.querySelector<HTMLElement>("[data-marquee-track]")?.getAnimations?.()[0];
  if (!drift) return () => {};
  const view = root.ownerDocument;
  let pointer = false, focused = false, frameId = 0;
  let tween: { from: number; to: number; ms: number; start?: number } | undefined;
  const setRate = (rate: number) => { drift.playbackRate = rate; };
  const step = (now: number) => {
    frameId = 0;
    if (!tween) return;
    tween.start ??= now;
    const progress = Math.min(1, (now - tween.start) / tween.ms);
    const eased = tween.to < tween.from ? easeOut(progress) : easeInOut(progress);
    setRate(progress < 1 ? tween.from + (tween.to - tween.from) * eased : tween.to);
    if (progress < 1) frameId = requestAnimationFrame(step);
    else tween = undefined;
  };
  const aim = () => {
    const to = pointer || focused ? 0 : 1;
    if (tween ? tween.to === to : drift.playbackRate === to) return;
    const from = drift.playbackRate;
    // A change of mind halfway carries on from the speed the row has, over the part of the way that is left.
    tween = { from, to, ms: Math.max(1, (to === 0 ? marqueeStopMs : marqueeStartMs) * Math.abs(to - from)) };
    if (!frameId) frameId = requestAnimationFrame(step);
  };
  const keyboardFocus = () => {
    try { return root.querySelector(":focus-visible") !== null; } catch { return root.contains(view.activeElement); }
  };
  const onEnter = (event: Event) => {
    if ((event as PointerEvent).pointerType === "touch") return;
    pointer = true;
    aim();
  };
  const onLeave = (event: Event) => {
    if ((event as PointerEvent).pointerType === "touch") return;
    pointer = false;
    aim();
  };
  const onFocusIn = () => { focused = keyboardFocus(); aim(); };
  const onFocusOut = (event: FocusEvent) => {
    if (!(event.relatedTarget instanceof Node) || !root.contains(event.relatedTarget)) { focused = false; aim(); }
  };
  // Already under the mouse as this loads: the stylesheet has it held, so it stays held as the stylesheet steps aside.
  try { pointer = root.matches(":hover"); } catch { pointer = false; }
  focused = keyboardFocus();
  if (pointer || focused) setRate(0);
  root.addEventListener("pointerenter", onEnter);
  root.addEventListener("pointerleave", onLeave);
  root.addEventListener("focusin", onFocusIn);
  root.addEventListener("focusout", onFocusOut);
  root.setAttribute("data-marquee-eased", "");
  return () => {
    cancelAnimationFrame(frameId);
    root.removeEventListener("pointerenter", onEnter);
    root.removeEventListener("pointerleave", onLeave);
    root.removeEventListener("focusin", onFocusIn);
    root.removeEventListener("focusout", onFocusOut);
    root.removeAttribute("data-marquee-eased");
    setRate(1);
  };
}

export function mountReveal(element: HTMLElement): () => void {
  const stopWatching = watchVisibility(element, 0.2, (seen) => { if (seen) element.setAttribute("data-revealed", ""); });
  return () => { stopWatching(); element.setAttribute("data-revealed", ""); };
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

/** Attaches every homepage effect found under `root`; returns one function that detaches them all. */
export function mountHomeEffects(root: ParentNode = document): () => void {
  const reduced = reducedMotion();
  const stops: (() => void)[] = [];
  for (const stage of root.querySelectorAll<HTMLElement>("[data-stage]")) stops.push(mountStage(stage, reduced));
  for (const film of root.querySelectorAll<HTMLVideoElement>("video[data-ambient-film]")) stops.push(mountAmbientFilm(film));
  if (!reduced) {
    for (const host of root.querySelectorAll<HTMLElement>("[data-typed]")) stops.push(mountTyped(host));
    for (const book of root.querySelectorAll<HTMLElement>("[data-flipbook]")) stops.push(mountFlipbook(book));
    for (const element of root.querySelectorAll<HTMLElement>("[data-reveal]")) stops.push(mountReveal(element));
    for (const row of root.querySelectorAll<HTMLElement>("[data-marquee]")) stops.push(mountMarquee(row));
  }
  const html = document.documentElement;
  html.setAttribute("data-home-effects", reduced ? "still" : "live");
  return () => {
    stops.forEach((stop) => stop());
    html.removeAttribute("data-home-effects");
  };
}
