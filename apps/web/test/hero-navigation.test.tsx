import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { renderToStaticMarkup } from "react-dom/server";
import { Hero } from "../components/hero";

function destinations() {
  const { document } = new JSDOM(renderToStaticMarkup(<Hero />)).window;
  return [...document.querySelectorAll<HTMLAnchorElement>("[data-hero-tiles] a")].map((link) => ({
    category: link.querySelector("h3")?.textContent,
    href: link.getAttribute("href"),
  }));
}

test("bed discovery retains its collection destination", () => {
  assert.deepEqual(destinations().find((link) => link.category === "Beds"), {
    category: "Beds", href: "/collections/beds",
  });
});

test("hero category discovery opens the corresponding editorial category page", () => {
  assert.deepEqual(destinations().filter((link) => link.category !== "Beds"), [
    { category: "Sofas", href: "/pages/sofas" },
    { category: "Chairs", href: "/pages/chairs" },
    { category: "Tables", href: "/pages/tables" },
  ]);
});
