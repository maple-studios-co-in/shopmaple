// Radix primitives call a few browser globals directly (getComputedStyle in Presence, which
// backs Collapsible, Dialog, Sheet and Tooltip). Each test file builds its own JSDOM window
// after this runs, so the stand-in forwards to the window the element belongs to.
if (typeof globalThis.getComputedStyle !== "function") {
  globalThis.getComputedStyle = ((element: Element, pseudo?: string | null) =>
    element.ownerDocument.defaultView!.getComputedStyle(element, pseudo)) as typeof getComputedStyle;
}
// Collapsible measures its content on the next frame; a test that installs its own frame
// clock later simply replaces these.
if (typeof globalThis.requestAnimationFrame !== "function") {
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 0) as unknown as number);
  globalThis.cancelAnimationFrame = ((handle: number) => clearTimeout(handle)) as typeof cancelAnimationFrame;
}
// Overlays (menus, popovers, dialogs) dispatch CustomEvent/FocusEvent instances and measure with
// ResizeObserver. jsdom only dispatches its own event classes, so these globals resolve to the
// current test window's constructors; a test that assigns its own value replaces the lookup.
for (const name of ["Event", "CustomEvent", "KeyboardEvent", "MouseEvent", "FocusEvent", "PointerEvent", "ResizeObserver", "MutationObserver", "NodeFilter", "DocumentFragment", "HTMLFormElement", "HTMLInputElement", "SVGElement", "Node", "Element"] as const) {
  const native = (globalThis as Record<string, unknown>)[name];
  Object.defineProperty(globalThis, name, {
    configurable: true,
    get() {
      const view = (globalThis as unknown as { window?: Record<string, unknown> }).window;
      if (name === "ResizeObserver") return view?.ResizeObserver ?? class { observe() {} unobserve() {} disconnect() {} };
      if (name === "PointerEvent") return view?.PointerEvent ?? view?.MouseEvent ?? native;
      return view?.[name] ?? native;
    },
    set(value) { Object.defineProperty(globalThis, name, { configurable: true, writable: true, value }); },
  });
}
