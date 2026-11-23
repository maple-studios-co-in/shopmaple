import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { installUiDom } from "./support/ui-dom";

// Settings, Banner sizes (owner, 23 Nov 2026): "allow only specific banner dimensions which we select there only that
// will be uploaded on the media; if anybody tries any other dimension then it will give an alert". A publisher keeps the
// list and turns the rule on; everybody else sees it; the media library follows it at once.
const dom = installUiDom("http://localhost:3000");
const { createRoot } = await import("react-dom/client");
const { BannerSizesPanel } = await import("../components/admin/banner-sizes-panel");
const { forgetMediaUploadRules, useMediaUploadRules } = await import("../components/admin/media-upload-rules");

const publisher = { user: { id: "staff-p", email: "publisher@example.invalid", role: "publisher" as const }, csrfToken: "b".repeat(64) };
const editor = { user: { id: "staff-e", email: "editor@example.invalid", role: "editor" as const }, csrfToken: "c".repeat(64) };
const none = { rules: { restrictSizes: false, sizes: [] }, updatedAt: null, updatedBy: null };
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 25)); });
const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>("[data-banner-sizes] button")].find((b) => b.textContent?.trim() === text);
const listed = () => [...document.querySelectorAll<HTMLElement>("[data-banner-sizes] [data-allowed-size]")].map((row) => row.dataset.allowedSize);
const rule = () => document.querySelector<HTMLButtonElement>("[data-banner-sizes] button[role=switch]")!;
const field = (label: string) => {
  const found = [...document.querySelectorAll<HTMLLabelElement>("[data-banner-sizes] label")].find((node) => node.textContent?.startsWith(label));
  return document.getElementById(found!.htmlFor) as HTMLInputElement;
};
function type(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
}
/** Shows what the media library's upload controls now hold, as they read it from the shared rules. */
function Probe() {
  const state = useMediaUploadRules();
  return <output data-probe>{state ? `${state.rules.restrictSizes ? "on" : "off"}:${state.rules.sizes.map((size) => `${size.width}x${size.height}`).join(",")}` : "unread"}</output>;
}
async function render(session: typeof publisher | typeof editor, transport: typeof fetch, onExpired = () => {}) {
  forgetMediaUploadRules();
  const previous = globalThis.fetch; globalThis.fetch = transport;
  const container = document.getElementById("root")!; const root = createRoot(container);
  await act(async () => root.render(<><BannerSizesPanel session={session} onExpired={onExpired} /><Probe /></>));
  await settle();
  return { dispose: async () => { await act(async () => root.unmount()); globalThis.fetch = previous; forgetMediaUploadRules(); } };
}

test("a publisher lists the sizes, turns the rule on and saves it, and the media library follows at once", async () => {
  const puts: RequestInit[] = [];
  const ui = await render(publisher, async (_url, init) => {
    if (init?.method === "PUT") {
      puts.push(init);
      const { rules } = JSON.parse(String(init.body));
      return Response.json({ rules, updatedAt: "2026-11-23T06:30:00.000Z", updatedBy: "Priya Menon" });
    }
    return Response.json(none);
  });
  try {
    assert.equal(rule().getAttribute("aria-checked"), "false", "off until a publisher turns it on: every size, as before");
    assert.ok(document.querySelector("[data-empty-sizes]"));
    type(field("Width"), "2784"); type(field("Height"), "400"); type(field("What it is for"), "Collection banner");
    await act(async () => button("Add size")!.click());
    assert.deepEqual(listed(), ["2784x400"]);
    assert.equal(field("Width").value, "", "the form empties for the next size");
    const suggestion = [...document.querySelectorAll<HTMLButtonElement>("[data-banner-sizes] button[aria-pressed]")].find((b) => b.textContent?.startsWith("500 × 500"))!;
    await act(async () => suggestion.click());
    assert.deepEqual(listed(), ["2784x400", "500x500"]);
    const banner = [...document.querySelectorAll<HTMLButtonElement>("[data-banner-sizes] button[aria-pressed]")].find((b) => b.textContent?.startsWith("2784 × 400"))!;
    assert.equal(banner.disabled, true, "a size already listed is not offered again");
    await act(async () => rule().click());
    assert.equal(rule().getAttribute("aria-checked"), "true");
    await act(async () => button("Save changes")!.click());
    await settle();
    assert.equal(puts.length, 1);
    assert.equal(new Headers(puts[0]!.headers).get("X-CSRF-Token"), publisher.csrfToken);
    assert.deepEqual(JSON.parse(String(puts[0]!.body)), { rules: { restrictSizes: true, sizes: [{ width: 2784, height: 400, label: "Collection banner" }, { width: 500, height: 500, label: "Campaign banner, phones" }], maxImageBytes: 5 * 1024 * 1024 } });
    assert.match(document.querySelector("[data-banner-sizes] [role=status]")?.textContent ?? "", /Saved\. From now on only these 2 sizes can be uploaded, in files up to 5 MB\./);
    assert.match(document.querySelector("[data-settings-saved]")?.textContent ?? "", /Last changed by Priya Menon on/);
    assert.equal(document.querySelector("[data-probe]")?.textContent, "on:2784x400,500x500", "upload controls follow the saved rules without a reload");
    assert.equal(button("Save changes")!.disabled, true, "nothing left to save");
  } finally { await ui.dispose(); }
});

test("a size must be whole pixels, listed once and small enough to upload, and the rule never stays on with an empty list", async () => {
  const ui = await render(publisher, async (_url, init) => init?.method === "PUT"
    ? Response.json({ code: "SETTINGS_INVALID", message: "Each size can be listed once" }, { status: 400 })
    : Response.json(none));
  try {
    const alert = () => document.querySelector("[data-banner-sizes] p[role=alert]")?.textContent ?? "";
    type(field("Width"), "wide"); type(field("Height"), "400");
    await act(async () => button("Add size")!.click());
    assert.match(alert(), /whole pixels/);
    type(field("Width"), "6000"); type(field("Height"), "5000");
    await act(async () => button("Add size")!.click());
    assert.match(alert(), /24 million pixels/);
    type(field("Width"), "1920"); type(field("Height"), "640");
    await act(async () => button("Add size")!.click());
    type(field("Width"), "1920"); type(field("Height"), "640");
    await act(async () => button("Add size")!.click());
    assert.match(alert(), /1920 × 640 px is already on the list/);
    assert.deepEqual(listed(), ["1920x640"]);
    await act(async () => rule().click());
    await act(async () => [...document.querySelectorAll<HTMLButtonElement>("[data-banner-sizes] [data-allowed-size] button")][0]!.click());
    assert.deepEqual(listed(), []);
    assert.equal(rule().getAttribute("aria-checked"), "false", "removing the last size turns the rule off");
    type(field("Width"), "1900"); type(field("Height"), "350");
    await act(async () => button("Add size")!.click());
    await act(async () => button("Save changes")!.click());
    await settle();
    assert.match(document.querySelector("[data-banner-sizes] [data-notice=error]")?.textContent ?? "", /Each size can be listed once/, "the server's reason is shown");
  } finally { await ui.dispose(); }
});

test("an editor sees the rules but cannot change them", async () => {
  const ui = await render(editor, async () => Response.json({ rules: { restrictSizes: true, sizes: [{ width: 2784, height: 400, label: "Collection banner" }] }, updatedAt: "2026-11-23T06:30:00.000Z", updatedBy: "Priya Menon" }));
  try {
    assert.deepEqual(listed(), ["2784x400"]);
    assert.equal(rule().disabled, true);
    assert.equal(rule().getAttribute("aria-checked"), "true");
    assert.equal(document.querySelector("[data-banner-sizes] form"), null, "no form to add a size");
    assert.equal(button("Save changes"), undefined);
    assert.equal([...document.querySelectorAll("[data-banner-sizes] [data-allowed-size] button")].length, 0, "no Remove buttons");
    assert.match(document.querySelector("[data-banner-sizes] [role=note]")?.textContent ?? "", /Only a publisher can change these rules/);
    const fileSizes = [...document.querySelectorAll<HTMLInputElement>("[data-banner-sizes] [data-file-size] input")];
    assert.equal(fileSizes.length, 4);
    assert.ok(fileSizes.every((box) => box.disabled), "nor the largest file");
  } finally { await ui.dispose(); }
});

test("the largest picture file is 5 MB until a publisher chooses another, each choice with the upload speed it needs", async () => {
  const puts: RequestInit[] = [];
  const ui = await render(publisher, async (_url, init) => {
    if (init?.method === "PUT") { puts.push(init); return Response.json({ ...JSON.parse(String(init.body)), updatedAt: "2026-11-23T07:00:00.000Z", updatedBy: "Priya Menon" }); }
    return Response.json(none);
  });
  try {
    const choices = [...document.querySelectorAll<HTMLElement>("[data-banner-sizes] [data-file-size]")];
    assert.deepEqual(choices.map((choice) => choice.dataset.fileSize), ["1048576", "2097152", "5242880", "8388608"]);
    assert.equal(choices.find((choice) => choice.querySelector("input")!.checked)?.dataset.fileSize, "5242880", "5 MB to begin with (owner, 23 Nov 2026)");
    assert.match(choices[2]!.textContent ?? "", /5 MB \(recommended\)Needs an upload speed of about 2\.8 Mbit\/s/);
    assert.match(choices[3]!.textContent ?? "", /8 MB \(the most the server takes\)/);
    await act(async () => choices[1]!.querySelector("input")!.click());
    await act(async () => button("Save changes")!.click());
    await settle();
    assert.equal(JSON.parse(String(puts[0]!.body)).rules.maxImageBytes, 2 * 1024 * 1024);
    assert.match(document.querySelector("[data-banner-sizes] [role=status]")?.textContent ?? "", /Saved\. Pictures of any size can be uploaded, in files up to 2 MB\./);
    assert.equal(document.querySelector("[data-probe]")?.textContent, "off:", "the upload controls follow");
  } finally { await ui.dispose(); }
});

test("an ended session signs staff out, and rules that could not be read can be asked for again", async () => {
  let expired = 0;
  const ui = await render(editor, async () => Response.json({ code: "ADMIN_AUTH_REQUIRED" }, { status: 401 }), () => { expired++; });
  try { assert.equal(expired, 1); } finally { await ui.dispose(); }
  let attempts = 0;
  const retry = await render(editor, async () => (++attempts === 1 ? Response.json({ code: "SERVER_ERROR" }, { status: 500 }) : Response.json(none)));
  try {
    assert.match(document.querySelector("[data-notice=error]")?.textContent ?? "", /couldn't load the banner sizes/);
    await act(async () => [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "Retry")!.click());
    await settle();
    assert.ok(rule(), "the screen appears once the rules are read");
  } finally { await retry.dispose(); }
});
