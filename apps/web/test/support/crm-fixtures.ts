import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { act } from "react";

export function installDom() {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost:3000/admin" });
  Object.assign(globalThis, {
    window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    KeyboardEvent: dom.window.KeyboardEvent, MouseEvent: dom.window.MouseEvent, IS_REACT_ACT_ENVIRONMENT: true,
    requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0),
    cancelAnimationFrame: (id: number) => clearTimeout(id),
  });
  return { dom, container: dom.window.document.getElementById("root")! };
}
export async function setValue(dom: JSDOM, element: Element | null, value: string, event: "input" | "change" = "input") {
  assert.ok(element, "Missing form control");
  await act(async () => {
    // Set through the prototype so React's value tracker notices the change, as a user's keystroke would.
    const proto = element instanceof dom.window.HTMLTextAreaElement ? dom.window.HTMLTextAreaElement.prototype : element instanceof dom.window.HTMLSelectElement ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(element, value);
    element.dispatchEvent(new dom.window.Event(event, { bubbles: true }));
  });
}
export type Transport = (path: string, options?: RequestInit) => Response | Promise<Response> | undefined;
export function fakeFetch(handler: Transport) {
  return async (url: string | URL | Request, options?: RequestInit) => {
    const path = String(url);
    const result = await handler(path, options);
    if (result) return result;
    throw new Error(`Unhandled request ${options?.method ?? "GET"} ${path}`);
  };
}
