import { JSDOM } from "jsdom";

/**
 * A jsdom window with the browser APIs Radix, cmdk, vaul and sonner touch that jsdom lacks.
 * Each stand-in does the least that lets the real component logic run: no layout, no
 * pointer capture, a media query that never matches (desktop width).
 */
export function installUiDom(url = "http://localhost:3000/admin") {
  const dom = new JSDOM('<div id="root"></div>', { url, pretendToBeVisual: true });
  const win = dom.window as unknown as Window & typeof globalThis;
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  const proto = win.HTMLElement.prototype as HTMLElement & Record<string, unknown>;
  proto.scrollIntoView ??= function scrollIntoView() {};
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => {};
  proto.releasePointerCapture ??= () => {};
  win.matchMedia ??= ((query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })) as typeof win.matchMedia;
  const PointerEventShim = win.PointerEvent ?? class PointerEvent extends win.MouseEvent {
    pointerId: number;
    pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
      this.pointerType = init.pointerType ?? "mouse";
    }
  };
  Object.assign(win, { ResizeObserver: win.ResizeObserver ?? ResizeObserverStub, PointerEvent: PointerEventShim });
  // Element and event constructors (HTMLFormElement, SVGElement, CustomEvent ...) that
  // primitives construct or check with instanceof. Node's own Event and CustomEvent are
  // replaced too: jsdom only dispatches events created from its own classes.
  for (const name of Object.getOwnPropertyNames(win)) {
    if (/^(HTML|SVG)\w*Element$|^\w*Event$|^(DocumentFragment|Range|NodeFilter|DOMRect)$/.test(name) && (!(name in globalThis) || name === "Event" || name === "CustomEvent"))
      Object.assign(globalThis, { [name]: (win as unknown as Record<string, unknown>)[name] });
  }
  Object.assign(globalThis, {
    window: win,
    document: win.document,
    HTMLElement: win.HTMLElement,
    Element: win.Element,
    Node: win.Node,
    MutationObserver: win.MutationObserver,
    ResizeObserver: win.ResizeObserver,
    KeyboardEvent: win.KeyboardEvent,
    MouseEvent: win.MouseEvent,
    PointerEvent: PointerEventShim,
    FocusEvent: win.FocusEvent,
    getComputedStyle: win.getComputedStyle.bind(win),
    requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(() => callback(Date.now()), 0) as unknown as number,
    cancelAnimationFrame: (handle: number) => clearTimeout(handle),
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  return dom;
}

/** Presses a key on an element the way a browser does: keydown, then keyup. */
export function press(element: Element, key: string, init: KeyboardEventInit = {}) {
  const view = element.ownerDocument.defaultView!;
  element.dispatchEvent(new view.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }));
  element.dispatchEvent(new view.KeyboardEvent("keyup", { key, bubbles: true, cancelable: true, ...init }));
}

/** A primary-button pointer press (Radix menus and selects open on pointerdown, not click). */
export function pointerDown(element: Element) {
  const view = element.ownerDocument.defaultView as Window & typeof globalThis;
  element.dispatchEvent(new view.PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0, ctrlKey: false, pointerType: "mouse" }));
}
