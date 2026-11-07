import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";

export type Browser = {
  /** Videos that play() was called on since the last reset, by element. */
  playing(): HTMLVideoElement[];
  /** Turns the reduced-motion preference on or off and fires the media query's change event. */
  reduce(value: boolean): Promise<void>;
  motionListeners(): number;
  unmount(): Promise<void>;
  /** Gives a slider track a layout: jsdom has none. Returns the scrollTo calls the slider made. */
  layout(track: HTMLElement, width: number): { left: number }[];
  scrollTo(track: HTMLElement, left: number): Promise<void>;
  fire(target: Element, type: string, init?: EventInit): Promise<void>;
  click(target: Element): Promise<void>;
  focus(target: HTMLElement): Promise<void>;
};

/**
 * Mounts server-built markup the way the browser would run it (real components, a real jsdom
 * document) and waits for the lazy slider behaviour to attach. Only the browser's media element,
 * layout and prefers-reduced-motion boundaries are simulated.
 */
export async function inBrowser(node: ReactNode, options: { reduced?: boolean; island?: string | null }, check: (browser: Browser, document: Document) => Promise<void>) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "http://localhost" });
  const globals = { self: dom.window, window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true };
  const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.assign(globalThis, globals);
  let reduced = options.reduced ?? false, listeners = 0;
  const motion = new dom.window.EventTarget();
  const add = motion.addEventListener.bind(motion), remove = motion.removeEventListener.bind(motion);
  motion.addEventListener = (...args: Parameters<EventTarget["addEventListener"]>) => { listeners += 1; add(...args); };
  motion.removeEventListener = (...args: Parameters<EventTarget["removeEventListener"]>) => { listeners -= 1; remove(...args); };
  Object.defineProperty(motion, "matches", { get: () => reduced });
  Object.defineProperty(dom.window, "matchMedia", { value: () => motion });
  const paused = new WeakMap<HTMLMediaElement, boolean>();
  let played: HTMLVideoElement[] = [];
  Object.defineProperties(dom.window.HTMLMediaElement.prototype, {
    paused: { get(this: HTMLMediaElement) { return paused.get(this) ?? true; } },
    play: { value(this: HTMLVideoElement) { played.push(this); paused.set(this, false); return Promise.resolve(); } },
    pause: { value(this: HTMLMediaElement) { paused.set(this, true); } },
  });
  const root = createRoot(dom.window.document.getElementById("root")!);
  let mounted = true;
  const tick = () => act(async () => { await new Promise(resolve => setImmediate(resolve)); });
  const dispatch = (target: Element, event: Event) => act(async () => { target.dispatchEvent(event); });
  try {
    await act(async () => root.render(node));
    if (options.island !== null) {
      const selector = `[data-slider="${options.island ?? ""}"]`;
      for (let i = 0; i < 400 && !dom.window.document.querySelector(`${options.island ? selector : "[data-slider]"}[data-slider-ready]`); i++) await tick();
    }
    await check({
      playing: () => played,
      reduce: async value => act(async () => { reduced = value; motion.dispatchEvent(new dom.window.Event("change")); }),
      motionListeners: () => listeners,
      unmount: async () => { await act(async () => root.unmount()); mounted = false; },
      layout: (track, width) => {
        const list: { left: number }[] = [];
        Object.defineProperty(track, "clientWidth", { configurable: true, value: width });
        Object.assign(track, { scrollTo: (arg: ScrollToOptions) => { list.push({ left: arg.left ?? 0 }); } });
        return list;
      },
      scrollTo: async (track, left) => {
        track.scrollLeft = left;
        await dispatch(track, new dom.window.Event("scroll"));
      },
      fire: async (target, type, init) => dispatch(target, new dom.window.Event(type, { bubbles: !/^(pointerenter|pointerleave|mouseenter|mouseleave)$/.test(type), ...init })),
      click: async target => act(async () => { (target as HTMLElement).click(); }),
      focus: async target => act(async () => { target.focus(); }),
    }, dom.window.document);
  } finally {
    if (mounted) await act(async () => root.unmount());
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as Record<string, unknown>)[key];
    }
    dom.window.close();
  }
}
