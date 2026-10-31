import { cardEnvelope } from "./support/catalogue-fixtures";
import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { DesktopNavigation, MobileNavigation } from "../components/navigation";
import { customChrome } from "./support/site-chrome-fixture";
const dom = new JSDOM('<div id="root"></div>', {
  url: "http://localhost:3000",
});
Object.assign(globalThis, {
  window: dom.window,
  self: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true,
  requestAnimationFrame: (fn: () => void) => setTimeout(fn, 0),
});
Object.assign(dom.window, {
  matchMedia: () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }),
});
dom.window.HTMLElement.prototype.scrollTo = () => {};
dom.window.HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
dom.window.HTMLDialogElement.prototype.close = function () {
  this.open = false;
};
async function frame() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
}
test("renamed desktop menu retains preset artwork, stable selection and Escape focus while links follow CMS", async () => {
  const root = createRoot(document.getElementById("root")!);
  const value = customChrome();
  try {
    await act(async () =>
      root.render(<DesktopNavigation {...{ siteChrome: value }} />),
    );
    const trigger = document.querySelector<HTMLButtonElement>(
      "[data-menu-trigger]",
    )!;
    assert.equal(trigger.textContent, "Lounge");
    await act(async () => trigger.click());
    assert.match(
      document.querySelector("[data-mega-feature] img")!.getAttribute("src")!,
      /engaged_5/,
    );
    assert.equal(
      document.querySelector("[data-mega-feature] a")?.getAttribute("href"),
      "/collections/all",
    );
    assert.equal(
      document.querySelector("[data-mega-grid] a")?.textContent,
      "New seating",
    );
    assert.equal(document.querySelectorAll("[data-mega-grid] a").length, 1);
    const discovery = document.querySelector<HTMLAnchorElement>(
      "[data-mega-discovery] a",
    )!;
    assert.equal(discovery.textContent?.trim(), "Made for youAsk us");
    const url = new URL(discovery.href);
    assert.equal(url.searchParams.get("product"), "A & B? #é");
    assert.equal(url.searchParams.size, 1);
    assert.equal(url.hash, "");
    value.navigation[0]!.label = "Relax";
    await act(async () =>
      root.render(
        <DesktopNavigation {...{ siteChrome: structuredClone(value) }} />,
      ),
    );
    assert.equal(
      document
        .querySelector("[data-menu-trigger]")
        ?.getAttribute("aria-expanded"),
      "true",
    );
    assert.equal(
      document.querySelector("[data-mega] h2")?.textContent,
      "Relax",
    );
    const link = document.querySelector<HTMLAnchorElement>("[data-mega] a")!;
    await act(async () => {
      link.focus();
      link.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
        }),
      );
    });
    assert.equal(document.querySelector("[data-mega]"), null);
    assert.equal(document.activeElement, trigger);
  } finally {
    await act(async () => root.unmount());
  }
});
test("mobile preset keeps current featured selection after rename and Back restores the stable category focus", async () => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const handle = String(input).split("/").at(-1)!;
    const result = cardEnvelope(handle, handle);
    result.product.pricePaise = 432100;
    return Response.json(result);
  };
  const root = createRoot(document.getElementById("root")!);
  const value = customChrome();
  try {
    await act(async () =>
      root.render(
        <MobileNavigation {...{ siteChrome: value }} open onClose={() => {}} />,
      ),
    );
    assert.deepEqual(
      [...document.querySelectorAll("[data-drawer-main] > *")].map(
        (e) => e.textContent,
      ),
      ["Lounge"],
    );
    assert.deepEqual(
      [...document.querySelectorAll("[data-drawer-quick-links] a")].map((e) =>
        e.textContent?.trim(),
      ),
      ["My picks"],
    );
    await act(async () =>
      document
        .querySelector<HTMLButtonElement>("[data-drawer-main] button")!
        .click(),
    );
    await frame();
    assert.equal(
      document.activeElement?.getAttribute("aria-label"),
      "Back from Lounge",
    );
    assert.deepEqual(
      [...document.querySelectorAll("[data-menu-product]")].map((e) =>
        e.getAttribute("href"),
      ),
      ["/products/morik-media-unit", "/products/zylen-media-unit"],
    );
    assert.match(
      document.querySelector("[data-menu-product]")!.textContent!,
      /4,321/,
    );
    value.navigation[0]!.label = "Relax";
    await act(async () =>
      root.render(
        <MobileNavigation
          {...{ siteChrome: structuredClone(value) }}
          open
          onClose={() => {}}
        />,
      ),
    );
    assert.equal(
      document
        .querySelector("[data-drawer-submenu]")
        ?.getAttribute("aria-label"),
      "Relax",
    );
    await act(async () =>
      document.querySelector<HTMLButtonElement>("[data-drawer-back]")!.click(),
    );
    await frame();
    assert.equal(document.activeElement?.textContent, "Relax");
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = oldFetch;
  }
});
for (const mode of ["desktop", "mobile"] as const) {
  test(`${mode} removes empty groups and recovers focus when published content disables the open category`, async () => {
    const root = createRoot(document.getElementById("root")!);
    const value = customChrome();
    const original = globalThis.fetch;
    globalThis.fetch = async () => new Response(null, { status: 404 });
    const render = async () =>
      act(async () =>
        root.render(
          mode === "desktop" ? (
            <DesktopNavigation siteChrome={structuredClone(value)} />
          ) : (
            <MobileNavigation
              siteChrome={structuredClone(value)}
              open
              onClose={() => {}}
            />
          ),
        ),
      );
    try {
      await render();
      await act(async () =>
        document
          .querySelector<HTMLButtonElement>(
            mode === "desktop"
              ? "[data-menu-trigger]"
              : "[data-drawer-main] button",
          )!
          .click(),
      );
      await frame();
      const target = document.querySelector<HTMLAnchorElement>(
        mode === "desktop" ? "[data-mega] a" : "[data-drawer-submenu] a",
      )!;
      await act(async () => target.focus());
      value.navigation[0]!.enabled = false;
      await render();
      await frame();
      assert.equal(
        !!document.querySelector(
          "[data-mega],[data-drawer-submenu],[data-drawer-back]",
        ),
        false,
      );
      assert.equal(
        !!document.querySelector(
          mode === "desktop"
            ? 'nav[aria-label="Main navigation"]'
            : 'nav[aria-label="Furniture categories"]',
        ),
        false,
        "all-hidden categories must not emit an empty nav",
      );
      if (mode === "mobile")
        assert.equal(
          document.activeElement?.getAttribute("aria-label"),
          "Close navigation",
        );
      value.navigation[0]!.enabled = true;
      value.navigation[0]!.columns[0]!.links.forEach(
        (link) => (link.enabled = false),
      );
      await render();
      assert.equal(
        !!document.querySelector(
          "[data-menu-trigger],[data-drawer-main] button",
        ),
        false,
        "no empty submenu trigger",
      );
      assert.equal(
        document
          .querySelector(
            mode === "desktop" ? "[data-desktop-nav] a" : "[data-drawer-main] a",
          )
          ?.getAttribute("href"),
        "/collections/all",
      );
    } finally {
      await act(async () => root.unmount());
      globalThis.fetch = original;
    }
  });
}
test("renamed enquiry links expose the edited label instead of the old default accessible name", async () => {
  const root = createRoot(document.getElementById("root")!);
  const value = customChrome();
  value.desktopDiscovery[0]!.enquirySubject = "Custom furniture";
  try {
    await act(async () =>
      root.render(<DesktopNavigation siteChrome={value} />),
    );
    await act(async () =>
      document.querySelector<HTMLButtonElement>("[data-menu-trigger]")!.click(),
    );
    assert.equal(
      document
        .querySelector("[data-mega-discovery] a")
        ?.getAttribute("aria-label"),
      null,
    );
  } finally {
    await act(async () => root.unmount());
  }
});
