const clamp = (value: number) => Math.min(100, Math.max(0, value));

/**
 * Makes the before/after card the server drew draggable. The card keeps its divider in the
 * `--compare-pos` custom property (a static 50/50 split without this script); the pointer sets it
 * from the card's own width, and the grip, once tabbable, takes the arrow keys, Home and End.
 * Nothing is eased, so reduced-motion preferences have nothing to switch off. Returns the undo.
 */
export function attachCompare(card: HTMLElement): () => void {
  const grip = card.querySelector<HTMLElement>('[role="slider"]');
  if (!grip) return () => {};
  const start = Number(grip.getAttribute("aria-valuenow"));
  let value = Number.isFinite(start) ? clamp(start) : 50;
  let pressed = false;
  const set = (percent: number) => {
    value = clamp(Math.round(percent * 10) / 10);
    card.style.setProperty("--compare-pos", `${value}%`);
    grip.setAttribute("aria-valuenow", String(Math.round(value)));
  };
  const follow = (clientX: number) => {
    const box = card.getBoundingClientRect();
    if (box.width > 0) set((clientX - box.left) / box.width * 100);
  };
  const down = (event: PointerEvent) => {
    if (event.button !== 0) return;
    // A thumb that lands on the picture is most likely scrolling the page; only the grip starts a touch drag.
    if (event.pointerType === "touch" && !(event.target instanceof Node && grip.contains(event.target))) return;
    pressed = true;
    try { card.setPointerCapture(event.pointerId); } catch { /* a pointer that cannot be captured still drags while over the card */ }
    follow(event.clientX);
  };
  const move = (event: PointerEvent) => { if (pressed) follow(event.clientX); };
  const release = () => { pressed = false; };
  const steps: Record<string, () => number> = {
    ArrowLeft: () => value - 5, ArrowDown: () => value - 5, ArrowRight: () => value + 5, ArrowUp: () => value + 5, Home: () => 0, End: () => 100,
  };
  const press = (event: KeyboardEvent) => {
    const next = steps[event.key];
    if (!next) return;
    event.preventDefault();
    set(next());
  };
  card.addEventListener("pointerdown", down);
  card.addEventListener("pointermove", move);
  card.addEventListener("pointerup", release);
  card.addEventListener("pointercancel", release);
  grip.addEventListener("keydown", press);
  grip.tabIndex = 0;
  card.setAttribute("data-compare-live", "");
  return () => {
    card.removeEventListener("pointerdown", down);
    card.removeEventListener("pointermove", move);
    card.removeEventListener("pointerup", release);
    card.removeEventListener("pointercancel", release);
    grip.removeEventListener("keydown", press);
    grip.removeAttribute("tabindex");
    card.removeAttribute("data-compare-live");
  };
}
