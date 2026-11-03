/**
 * Buttons that fill from the pointer, after the owner's reference (the Athora theme's Add to cart, 3 November
 * 2026). When a mouse comes into a button, a circle in a tone of the button's own colour (its ::before, in
 * styles/button-fill.css) grows on a spring from that very point until it covers the button, and shrinks back
 * there when the mouse leaves; meanwhile the button leans up to 6px toward the pointer.
 *
 * This module only measures. It sets --fill-x, --fill-y and --fill-scale where the pointer came in,
 * --magnet-x and --magnet-y as it moves, and [data-fill-on] while it is inside; CSS does all the moving, on
 * the compositor. One set of listeners on the document serves every button, including ones drawn later.
 * Touch is left alone, and under reduced motion it does not start, leaving the plain hover colours.
 */

/** Every button that fills: the classic `.button`, and anything marked `data-fill-button` ("outline", "light"). */
export const fillButtonSelector = ".button, [data-fill-button]";
/** Half the 20px circle that the CSS scales up. */
const circleRadius = 10;
/** How far the button leans toward the pointer, at most, each way. */
const maxLean = 6;

/** The circle's scale for it to reach the farthest corner of the button from (x, y). */
export function coverScale(box: { width: number; height: number }, x: number, y: number) {
  return Math.max(
    Math.hypot(x, y), Math.hypot(box.width - x, y),
    Math.hypot(x, box.height - y), Math.hypot(box.width - x, box.height - y),
  ) / circleRadius;
}

/** How far the button leans toward the pointer: in proportion to its distance from the centre, at most 6px. */
export function magnetOffset(box: { left: number; top: number; width: number; height: number }, clientX: number, clientY: number) {
  const lean = (offset: number, half: number) => Math.max(-maxLean, Math.min(maxLean, (offset / half) * maxLean));
  return {
    x: lean(clientX - box.left - box.width / 2, box.width / 2),
    y: lean(clientY - box.top - box.height / 2, box.height / 2),
  };
}

const reducedMotion = () => typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function mountButtonEffects(root: Document = document, reduced = reducedMotion()): () => void {
  if (reduced) return () => {};
  const buttonAt = (node: EventTarget | null) => (node instanceof Element ? node.closest<HTMLElement>(fillButtonSelector) : null);
  const usable = (button: HTMLElement | null): button is HTMLElement => button !== null && !button.matches(":disabled, [aria-disabled='true']");
  // Moving between a button's own children fires over/out too; only crossing its edge counts.
  const crossing = (button: HTMLElement, event: PointerEvent) => !(event.relatedTarget instanceof Node && button.contains(event.relatedTarget));

  const onOver = (event: PointerEvent) => {
    const button = buttonAt(event.target);
    if (event.pointerType === "touch" || !usable(button) || !crossing(button, event)) return;
    const box = button.getBoundingClientRect();
    const x = event.clientX - box.left, y = event.clientY - box.top;
    button.style.setProperty("--fill-x", `${x}px`);
    button.style.setProperty("--fill-y", `${y}px`);
    button.style.setProperty("--fill-scale", coverScale(box, x, y).toFixed(3));
    button.setAttribute("data-fill-on", "");
  };
  const onMove = (event: PointerEvent) => {
    const button = buttonAt(event.target);
    if (event.pointerType === "touch" || !usable(button) || !button.hasAttribute("data-fill-on")) return;
    const lean = magnetOffset(button.getBoundingClientRect(), event.clientX, event.clientY);
    button.style.setProperty("--magnet-x", `${lean.x}px`);
    button.style.setProperty("--magnet-y", `${lean.y}px`);
  };
  const onOut = (event: PointerEvent) => {
    const button = buttonAt(event.target);
    if (!button || !button.hasAttribute("data-fill-on") || !crossing(button, event)) return;
    button.removeAttribute("data-fill-on");
    button.style.setProperty("--magnet-x", "0px");
    button.style.setProperty("--magnet-y", "0px");
  };

  root.addEventListener("pointerover", onOver);
  root.addEventListener("pointermove", onMove);
  root.addEventListener("pointerout", onOut);
  root.documentElement.setAttribute("data-button-fill", "");
  return () => {
    root.removeEventListener("pointerover", onOver);
    root.removeEventListener("pointermove", onMove);
    root.removeEventListener("pointerout", onOut);
    root.documentElement.removeAttribute("data-button-fill");
  };
}
