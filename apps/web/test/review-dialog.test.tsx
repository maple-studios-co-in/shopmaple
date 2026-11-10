import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { acceptPhotos, createReviewSender, maxPhotoBytes, reviewFailureMessage } from "../lib/review-client";
import { ProductReviews } from "../components/store/product-reviews";
import { ReviewDialog } from "../components/store/review-dialog";

// "Make yourself heard." (Figma 180:566 desktop, 180:603 phone): Write a review opens this form on the page, and what the
// customer sends goes to the store's own /api/reviews, which passes it on to Keeri.
const dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost:3000/products/nola-accent-chair" });
const dialogPrototype = dom.window.HTMLDialogElement.prototype as unknown as { showModal(): void; close(): void; open: boolean };
dialogPrototype.showModal = function showModal(this: HTMLDialogElement) { this.setAttribute("open", ""); };
dialogPrototype.close = function close(this: HTMLDialogElement) { this.removeAttribute("open"); this.dispatchEvent(new dom.window.Event("close")); };
Object.assign(globalThis, {
  window: dom.window, self: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, HTMLDialogElement: dom.window.HTMLDialogElement,
  FormData: dom.window.FormData, File: dom.window.File, IS_REACT_ACT_ENVIRONMENT: true,
});

const piece = { handle: "nola-accent-chair", title: "Nola Accent Chair", image: "https://example.com/nola.jpg", collection: "Accent Chairs", variantId: "walnut" };
type Sent = { url: string; init: RequestInit };

async function mount(element: React.ReactNode, run: (host: HTMLElement) => Promise<void> | void) {
  const host = document.getElementById("root")!;
  const root = createRoot(host);
  const router = { push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} };
  await act(async () => root.render(<AppRouterContext.Provider value={router as never}>{element}</AppRouterContext.Provider>));
  try { await run(host); } finally { await act(async () => root.unmount()); }
}

async function withFetch(respond: (sent: Sent) => Response | Promise<Response>, run: (sent: Sent[]) => Promise<void>) {
  const previous = globalThis.fetch, sent: Sent[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => { const call = { url: String(url), init }; sent.push(call); return respond(call); }) as typeof fetch;
  try { await run(sent); } finally { globalThis.fetch = previous; }
}

const received = () => Response.json({ status: "received" }, { status: 201 });
const text = (node: Element | null | undefined) => (node?.textContent ?? "").replace(/\s+/g, " ").trim();
function setValue(field: HTMLInputElement | HTMLTextAreaElement, value: string) { field.value = value; }
function fill(host: HTMLElement, values: Partial<Record<"title" | "body" | "displayName" | "email", string>> = {}) {
  const dialog = host.querySelector("[data-review-dialog]")!;
  setValue(dialog.querySelector<HTMLInputElement>('input[name="title"]')!, values.title ?? "Beautiful chair");
  setValue(dialog.querySelector<HTMLTextAreaElement>('textarea[name="body"]')!, values.body ?? "It looks wonderful by the window.");
  setValue(dialog.querySelector<HTMLInputElement>('input[name="displayName"]')!, values.displayName ?? "Anushka");
  setValue(dialog.querySelector<HTMLInputElement>('input[name="email"]')!, values.email ?? "Reader@Example.Invalid");
}
const star = (host: HTMLElement, value: number) => host.querySelector<HTMLInputElement>(`input[name="rating"][value="${value}"]`)!;
const submit = (host: HTMLElement) => act(async () => host.querySelector<HTMLFormElement>("[data-review-dialog] form")!.requestSubmit());

test("Write a review opens the form on the page, while without script the link still leads to the team", async () => {
  await mount(<ProductReviews rating={null} writeHref="/contact?product=Nola" piece={piece} />, async (host) => {
    const write = host.querySelector<HTMLAnchorElement>("a[data-write-review]")!;
    assert.equal(write.getAttribute("href"), "/contact?product=Nola", "the no-script fallback stays");
    assert.equal(host.querySelector("[data-review-dialog]"), null, "the form joins the page on the first click");
    let followed = true;
    await act(async () => {
      const click = new dom.window.MouseEvent("click", { bubbles: true, cancelable: true });
      write.dispatchEvent(click);
      followed = !click.defaultPrevented;
    });
    assert.equal(followed, false, "the click stays on the page");
    const dialog = host.querySelector<HTMLDialogElement>("dialog[data-review-dialog]")!;
    assert.equal(dialog.hasAttribute("open"), true);
    assert.equal(dialog.hasAttribute("data-store"), true, "it uses the storefront's scoped base");
  });
});

test("before the first review, a star opens the form with that many stars chosen, and closing it returns to that star", async () => {
  await mount(<ProductReviews rating={null} writeHref="/contact?product=Nola" piece={piece} />, async (host) => {
    const stars = [...host.querySelectorAll<HTMLButtonElement>("[data-reviews-empty] button[data-rate-star]")];
    assert.equal(stars.length, 5);
    assert.equal(host.querySelector("[data-review-dialog]"), null, "nothing is loaded until a star or the link is chosen");
    await act(async () => stars[3]!.click());
    const dialog = host.querySelector<HTMLDialogElement>("dialog[data-review-dialog]")!;
    assert.equal(dialog.hasAttribute("open"), true);
    assert.equal(star(host, 4).checked, true, "four stars chosen, as tapped");
    assert.equal(dialog.querySelectorAll('[data-review-star][data-filled="true"]').length, 4);
    await act(async () => host.querySelector<HTMLButtonElement>("[data-review-close]")!.click());
    assert.equal(document.activeElement, stars[3], "focus returns to the star that opened it");
    await act(async () => stars[1]!.click());
    assert.equal(star(host, 2).checked, true, "a different star changes the rating the form opens with");
    await act(async () => host.querySelector<HTMLButtonElement>("[data-review-close]")!.click());
    await act(async () => host.querySelector<HTMLAnchorElement>("a[data-write-review]")!.click());
    assert.equal(star(host, 2).checked, true, "Write the first review keeps what was chosen");
  });
});

test("without a form behind the band there are no stars to tap: the link alone leads to the team", async () => {
  await mount(<ProductReviews rating={null} writeHref="/contact" />, (host) => {
    assert.ok(host.querySelector("[data-reviews-empty] a[data-write-review]"));
    assert.equal(host.querySelector("[data-rate-star]"), null);
  });
});

test("a piece's page can still draw the band with no form behind it: the link is a plain link", async () => {
  await mount(<ProductReviews rating={null} writeHref="/contact" />, async (host) => {
    const write = host.querySelector<HTMLAnchorElement>("a[data-write-review]")!;
    const click = new dom.window.MouseEvent("click", { bubbles: true, cancelable: true });
    click.preventDefault = click.preventDefault.bind(click);
    await act(async () => { write.addEventListener("click", (event) => event.preventDefault(), { once: true }); write.dispatchEvent(click); });
    assert.equal(host.querySelector("[data-review-dialog]"), null);
  });
});

test("the form follows the frame: the piece beside it, and every label, hint and placeholder as drawn", async () => {
  await mount(<ReviewDialog open onClose={() => {}} piece={piece} />, (host) => {
    const dialog = host.querySelector<HTMLElement>("dialog[data-review-dialog]")!;
    assert.equal(dialog.getAttribute("aria-labelledby"), dialog.querySelector("h2")!.id, "the heading names the dialog");
    const aside = dialog.querySelector<HTMLElement>("[data-review-piece]")!;
    assert.equal(aside.querySelector('img[alt="Maple Furnishers"]')?.getAttribute("src"), "/media/footer/maple-logo.webp", "the brand's own logo artwork");
    assert.match(aside.querySelector('img[alt="Nola Accent Chair"]')!.getAttribute("src")!, /nola\.jpg/);
    const collection = aside.querySelector("[data-review-collection]")!;
    assert.equal(text(collection), "The Accent Chairs Collection", "written plainly for screen readers");
    assert.match(collection.className, /\buppercase\b/, "and drawn in capitals, as in the frame");
    assert.equal(text(aside.querySelector("[data-review-product]")), "Nola Accent Chair");
    assert.ok(text(aside).includes("A quiet statement. A warmer corner."));
    assert.ok(text(aside).includes("Your experience helps someone find their perfect piece."));
    assert.equal(text(dialog.querySelector("h2")), "Make yourself heard.");
    assert.ok(text(dialog).includes("Share your experience with the Nola Accent Chair."));
    assert.match(text(dialog.querySelector("[data-review-close]")), /^CLOSE\s*×$/);
    assert.equal(text(dialog.querySelector("legend")), "Your rating *");
    assert.deepEqual([...dialog.querySelectorAll<HTMLInputElement>('input[name="rating"]')].map((input) => [input.value, input.type]), [1, 2, 3, 4, 5].map((value) => [String(value), "radio"]));
    const field = (name: string) => dialog.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`)!;
    assert.deepEqual([field("title").placeholder, field("title").required, field("title").maxLength], ["Give your review a short title", true, 120]);
    assert.deepEqual([field("body").placeholder, field("body").required, field("body").maxLength], ["How does it look and feel in your space?", true, 2000]);
    assert.deepEqual([field("displayName").placeholder, field("displayName").required, field("displayName").maxLength], ["Your name", true, 60]);
    assert.deepEqual([field("email").placeholder, field("email").required, (field("email") as HTMLInputElement).type], ["you@example.com", true, "email"]);
    assert.deepEqual([...dialog.querySelectorAll("label > span:first-child")].map(text).filter((label) => label.endsWith("*")), ["Review title *", "Your review *", "Display name *", "Email address *"]);
    const photos = dialog.querySelector<HTMLElement>("[data-review-photos]")!;
    assert.ok(text(photos).includes("Add photos (optional)"));
    assert.ok(text(photos).includes("Up to 5 photos · JPG or PNG · 10 MB each"));
    const input = photos.querySelector<HTMLInputElement>('input[type="file"]')!;
    assert.equal(input.multiple, true);
    assert.equal(input.accept, "image/jpeg,image/png");
    assert.ok(text(dialog).includes("Your email stays private. Your name and review may appear on the product page."));
    assert.match(text(dialog.querySelector("[data-review-submit]")), /^SUBMIT REVIEW\s*→$/);
  });
});

test("a piece with no collection leaves that line out rather than inventing one", async () => {
  await mount(<ReviewDialog open onClose={() => {}} piece={{ ...piece, collection: undefined }} />, (host) => {
    assert.equal(host.querySelector("[data-review-collection]"), null);
  });
});

test("the stars show the choice, and the form will not send without one", async () => {
  await withFetch(received, async (sent) => {
    await mount(<ReviewDialog open onClose={() => {}} piece={piece} />, async (host) => {
      fill(host);
      await submit(host);
      assert.equal(sent.length, 0, "no rating, no request");
      assert.equal(text(host.querySelector("[data-review-rating-error]")), "Please choose a rating.");
      await act(async () => star(host, 4).click());
      const filled = [...host.querySelectorAll<HTMLElement>("[data-review-star]")].map((node) => node.dataset.filled);
      assert.deepEqual(filled, ["true", "true", "true", "true", "false"]);
      assert.equal(host.querySelector("[data-review-rating-error]"), null, "choosing a star clears the message");
    });
  });
});

test("a finished form goes to the store's /api/reviews with the piece named, then says thank you", async () => {
  await withFetch(received, async (sent) => {
    await mount(<ReviewDialog open onClose={() => {}} piece={piece} />, async (host) => {
      fill(host, { title: "  Beautiful chair  " });
      await act(async () => star(host, 5).click());
      await submit(host);
      assert.equal(sent.length, 1);
      assert.equal(sent[0]!.url, "/api/reviews");
      assert.equal(sent[0]!.init.method, "POST");
      const headers = sent[0]!.init.headers as Record<string, string>;
      assert.equal(headers["Content-Type"], "application/json");
      assert.match(headers["Idempotency-Key"]!, /^[0-9a-f-]{36}$/);
      assert.deepEqual(JSON.parse(String(sent[0]!.init.body)), {
        handle: "nola-accent-chair", variantId: "walnut", rating: 5, title: "Beautiful chair", body: "It looks wonderful by the window.",
        displayName: "Anushka", email: "reader@example.invalid", photos: [],
      });
      const thanks = host.querySelector("[data-review-sent]")!;
      assert.equal(thanks.getAttribute("role"), "status");
      assert.ok(text(thanks).includes("Nola Accent Chair"));
      assert.ok(text(thanks).includes("once it has been approved"), "it says plainly that the review is not live yet");
      assert.equal(host.querySelector("[data-review-submit]"), null);
    });
  });
});

test("when sending fails the words stay, the message says what to do, and an unchanged retry keeps its key", async () => {
  let reply: () => Response = () => new Response(null, { status: 503 });
  await withFetch(() => reply(), async (sent) => {
    await mount(<ReviewDialog open onClose={() => {}} piece={piece} />, async (host) => {
      fill(host);
      await act(async () => star(host, 3).click());
      await submit(host);
      assert.equal(sent.length, 1);
      const alert = host.querySelector('[data-review-error][role="alert"]')!;
      assert.match(text(alert), /could not be sent/i);
      assert.equal(host.querySelector<HTMLInputElement>('input[name="title"]')!.value, "Beautiful chair", "the customer's words are still there");
      assert.equal(star(host, 3).checked, true);
      reply = received;
      await submit(host);
      assert.equal(sent.length, 2);
      const key = (call: Sent) => (call.init.headers as Record<string, string>)["Idempotency-Key"];
      assert.equal(key(sent[1]!), key(sent[0]!), "the same form, the same key");
      assert.ok(host.querySelector("[data-review-sent]"));
    });
  });
});

test("the failure messages are the store's own, never a raw response", () => {
  assert.match(reviewFailureMessage(429), /too many/i);
  assert.match(reviewFailureMessage(400), /check your details/i);
  assert.match(reviewFailureMessage(413), /photos/i);
  assert.match(reviewFailureMessage(500), /could not be sent/i);
});

test("the sender keeps one key per form and treats a lost connection as unconfirmed", async () => {
  const keys: string[] = [];
  const send = createReviewSender((async (_url: string, init: RequestInit) => {
    keys.push((init.headers as Record<string, string>)["Idempotency-Key"]!);
    if (keys.length === 1) throw new Error("connection lost");
    return received();
  }) as typeof fetch);
  const input = { handle: "nola", rating: 5, title: "A", body: "B", displayName: "C", email: "c@example.invalid", photos: [] };
  await assert.rejects(send(input), /could not confirm/i);
  await send(input);
  await send({ ...input, body: "Changed" });
  assert.equal(keys[0], keys[1], "a retry after a lost response reuses the key");
  assert.notEqual(keys[1], keys[2], "an edited review is a new review");
});

const photoFile = (name: string, type = "image/jpeg", size = 1024) => {
  const file = new dom.window.File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file as unknown as File;
};

test("photos: JPG and PNG only, 10 MB each, five at most, each problem said in words", () => {
  assert.equal(maxPhotoBytes, 10 * 1024 * 1024);
  const one = photoFile("one.jpg");
  assert.deepEqual(acceptPhotos([], [one]), { photos: [one], problem: "" });
  const gif = acceptPhotos([one], [photoFile("two.gif", "image/gif")]);
  assert.deepEqual(gif.photos, [one], "a GIF is left out");
  assert.match(gif.problem, /JPG or PNG/);
  const heavy = acceptPhotos([], [photoFile("big.png", "image/png", maxPhotoBytes + 1)]);
  assert.deepEqual(heavy.photos, []);
  assert.match(heavy.problem, /10 MB/);
  assert.equal(acceptPhotos([], [photoFile("edge.png", "image/png", maxPhotoBytes)]).photos.length, 1, "exactly 10 MB is allowed");
  const many = acceptPhotos([], Array.from({ length: 7 }, (_, index) => photoFile(`p${index}.jpg`)));
  assert.equal(many.photos.length, 5);
  assert.match(many.problem, /up to 5/i);
});

test("chosen photos show as thumbnails that can be removed, and go with the review once made small", async () => {
  const pick = async (host: HTMLElement, files: File[]) => {
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", { configurable: true, value: files });
    await act(async () => input.dispatchEvent(new dom.window.Event("change", { bubbles: true })));
  };
  const encoded: string[] = [];
  const encode = async (file: File) => { encoded.push(file.name); return Buffer.from(file.name).toString("base64"); };
  const previous = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
  URL.createObjectURL = (() => "blob:preview") as typeof URL.createObjectURL;
  URL.revokeObjectURL = (() => {}) as typeof URL.revokeObjectURL;
  try {
    await withFetch(received, async (sent) => {
      await mount(<ReviewDialog open onClose={() => {}} piece={piece} encode={encode} />, async (host) => {
        await pick(host, [photoFile("room.jpg"), photoFile("corner.png", "image/png")]);
        assert.deepEqual([...host.querySelectorAll<HTMLImageElement>("[data-review-photo] img")].map((image) => image.getAttribute("src")), ["blob:preview", "blob:preview"]);
        await pick(host, [photoFile("clip.gif", "image/gif")]);
        assert.match(text(host.querySelector("[data-review-photo-problem]")), /JPG or PNG/);
        assert.equal(host.querySelectorAll("[data-review-photo]").length, 2, "the two good photos stay");
        await act(async () => host.querySelector<HTMLButtonElement>("[data-review-photo] button")!.click());
        assert.equal(host.querySelectorAll("[data-review-photo]").length, 1, "the first is removed");
        fill(host);
        await act(async () => star(host, 5).click());
        await submit(host);
        assert.deepEqual(encoded, ["corner.png"]);
        assert.deepEqual(JSON.parse(String(sent[0]!.init.body)).photos, [Buffer.from("corner.png").toString("base64")]);
      });
    });
  } finally { URL.createObjectURL = previous.create; URL.revokeObjectURL = previous.revoke; }
});

test("a photo that cannot be read stops the send and names the photo", async () => {
  const previous = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
  URL.createObjectURL = (() => "blob:preview") as typeof URL.createObjectURL;
  URL.revokeObjectURL = (() => {}) as typeof URL.revokeObjectURL;
  try {
    await withFetch(received, async (sent) => {
      await mount(<ReviewDialog open onClose={() => {}} piece={piece} encode={async () => { throw new Error("broken"); }} />, async (host) => {
        const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
        Object.defineProperty(input, "files", { configurable: true, value: [photoFile("broken.jpg")] });
        await act(async () => input.dispatchEvent(new dom.window.Event("change", { bubbles: true })));
        fill(host);
        await act(async () => star(host, 5).click());
        await submit(host);
        assert.equal(sent.length, 0);
        assert.match(text(host.querySelector("[data-review-error]")), /broken\.jpg/);
      });
    });
  } finally { URL.createObjectURL = previous.create; URL.revokeObjectURL = previous.revoke; }
});

test("CLOSE, the backdrop and Escape all close the form, and reopening after a sent review starts afresh", async () => {
  await withFetch(received, async () => {
    await mount(<ProductReviews rating={null} writeHref="/contact" piece={piece} />, async (host) => {
      const write = host.querySelector<HTMLAnchorElement>("a[data-write-review]")!;
      const dialog = () => host.querySelector<HTMLDialogElement>("dialog[data-review-dialog]")!;
      await act(async () => write.click());
      assert.equal(dialog().hasAttribute("open"), true);
      await act(async () => host.querySelector<HTMLButtonElement>("[data-review-close]")!.click());
      assert.equal(dialog().hasAttribute("open"), false, "CLOSE closes it");
      assert.equal(document.activeElement, write, "focus returns to the link that opened it");
      await act(async () => write.click());
      await act(async () => dialog().dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })));
      assert.equal(dialog().hasAttribute("open"), false, "the backdrop closes it");
      await act(async () => write.click());
      await act(async () => dialog().dispatchEvent(new dom.window.Event("close")));
      assert.equal(dialog().hasAttribute("open"), false, "Escape (the dialog's own close) closes it");
      assert.equal(document.body.style.overflow, "", "the page scrolls again");
      await act(async () => write.click());
      assert.equal(document.body.style.overflow, "hidden", "the page behind holds still while it is open");
      fill(host);
      await act(async () => star(host, 5).click());
      await submit(host);
      assert.ok(host.querySelector("[data-review-sent]"));
      await act(async () => host.querySelector<HTMLButtonElement>("[data-review-done]")!.click());
      await act(async () => write.click());
      assert.equal(host.querySelector("[data-review-sent]"), null, "a fresh form");
      assert.equal(host.querySelector<HTMLInputElement>('input[name="title"]')!.value, "");
      assert.equal(star(host, 5).checked, false);
    });
  });
});
