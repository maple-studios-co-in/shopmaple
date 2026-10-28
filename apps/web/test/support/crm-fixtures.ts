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
export const session = { user: { id: "c000000000000000000000009", email: "staff@example.invalid", role: "editor" as const, canManageEnquiries: true }, csrfToken: "a".repeat(64) };
export const staffA = { id: "c000000000000000000000001", email: "priya.menon@example.invalid" };
export const contactId = "ct_00000000-0000-4000-8000-0000000000aa";
export const enquiryId = (n: number) => `enq_00000000-0000-4000-8000-00000000000${n}`;
export const summary = (n: number, extra: Record<string, unknown> = {}) => ({
  id: enquiryId(n), kind: "contact", status: "new", version: 0, assignedToId: null, contactId, name: `Customer ${n}`, product: "Nimbus sofa", createdAt: "2030-01-07T09:00:00.000Z", ...extra,
});
export const detailOf = (row: ReturnType<typeof summary>, extra: Record<string, unknown> = {}) => ({
  ...row, email: "customer@example.invalid", phone: "+91 98765 43210", message: "Hello", lostReason: null,
  context: { product: row.product, variant: "", sku: "", pincode: "" }, reviews: [], ...extra,
});
export const task = (id: string, extra: Record<string, unknown> = {}) => ({
  id, enquiryId: enquiryId(1) as string | null, contactId: null as string | null, title: "Send quote", dueOn: "2030-01-01", assigneeId: staffA.id as string | null, note: "", done: false, completedAt: null as string | null, version: 0, createdAt: "2030-01-01T00:00:00.000Z", ...extra,
});
export const empty = { items: [], nextCursor: null };
export function makeButton(container: HTMLElement) {
  return (text: string) => {
    const found = [...container.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent?.trim() === text);
    assert.ok(found, `Missing button ${text}`);
    return found;
  };
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
