import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import type { StorefrontContent } from "@shopmaple/contracts";
import { AdminDashboard } from "../components/admin/dashboard";
const dom = new JSDOM('<div id="root"></div>', {
  url: "http://localhost:3000/admin",
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true,
});
const initialContent: StorefrontContent = {
  schemaVersion: 1,
  landingPages: [],
  homeSections: [
    { key: "hero", enabled: true },
    { key: "categories", enabled: true },
  ],
  homeCopy: {
    categoryHeading: "Shop by category",
    bestsellersHeading: "Bestsellers",
    socialHeading: "Social proof",
    ticker: "Original ticker",
    testimonialHeading: "Loved by customers",
    testimonialSubheading: "Original feedback",
  },
  campaigns: [
    {
      key: "landing-announcement",
      artwork: null,
      label: "Original label",
      headline: ["Original headline"],
      supporting: "Original supporting",
      offer: ["Original offer"],
      eligibility: "Selected pieces",
      cta: "Explore",
      href: "/collections/all",
    },
  ],
  instagramPosts: [
    {
      href: "https://www.instagram.com/p/OriginalPost/",
      src: "/media/original.webp",
      alt: "Original chair",
    },
  ],
  pages: [],
  motion: { autoplaySocial: true, autoplayCities: true, revealSections: false },
};
const staff = (role: "editor" | "publisher" = "editor") => ({
  user: { id: "staff-one", email: "editor@example.test", role },
  csrfToken: "a".repeat(64),
});
const doc = (version = 4) => ({
  version,
  draft: structuredClone(initialContent),
  publishedVersion: 3,
  updatedAt: "2026-10-26T12:00:00Z",
});
const container = document.getElementById("root")!;
function button(name: string) {
  const found = [
    ...container.querySelectorAll<HTMLButtonElement>("button"),
  ].find((b) => b.textContent === name);
  assert.ok(found, `Missing ${name} button`);
  return found;
}
async function fill(label: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(
    `:is(input,textarea)[aria-label="${label}"]`,
  )!;
  assert.ok(input, `Missing ${label} input`);
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      input.tagName === "TEXTAREA"
        ? dom.window.HTMLTextAreaElement.prototype
        : dom.window.HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, value);
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    input.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  });
}
async function submit() {
  await act(async () => {
    container
      .querySelector("form")!
      .dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      );
  });
}
test("unauthenticated visitors see login and cannot edit draft content", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(<AdminDashboard initialContent={initialContent} />),
    );
    assert.ok(
      container.querySelector('input[type="password"]'),
      "Staff login must be available",
    );
    assert.equal(container.querySelector('button[data-action="save"]'), null);
    assert.equal(dom.window.localStorage.length, 0);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previous;
  }
});
test("failed login stays on the login form with a safe actionable error", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async (url) =>
    String(url).endsWith("/session")
      ? Response.json({}, { status: 401 })
      : Response.json({ message: "private database failure" }, { status: 401 });
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(<AdminDashboard initialContent={initialContent} />),
    );
    await fill("Email", "editor@example.test");
    await fill("Password", "test-password");
    await submit();
    assert.match(
      container.querySelector('[role="alert"]')?.textContent ?? "",
      /email or password/i,
    );
    assert.doesNotMatch(container.textContent!, /private database failure/);
    assert.equal(button("Sign in").disabled, false);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previous;
  }
});

async function click(name: string) {
  await act(async () => button(name).click());
}
test("editors reorder and hide sections, change copy and save an unpublished draft", async () => {
  const previous = globalThis.fetch;
  const mutations: { url: string; body: any; csrf: string | null }[] = [];
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith("/session")) return Response.json(staff());
    if (options?.method === "PUT") {
      const body = JSON.parse(String(options.body));
      mutations.push({
        url: String(url),
        body,
        csrf: new Headers(options.headers).get("X-CSRF-Token"),
      });
      return Response.json({ ...doc(5), draft: body.content });
    }
    return Response.json(doc());
  };
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(<AdminDashboard initialContent={initialContent} />),
    );
    await click("Homepage");
    const move = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Move Hero down"]',
    );
    assert.ok(move, "Homepage sections need reorder controls");
    await act(async () => move.click());
    const toggle = container.querySelector<HTMLInputElement>(
      'input[aria-label="Show Hero"]',
    )!;
    await act(async () => toggle.click());
    await fill("Category heading", "Furniture for every room");
    await click("Save draft");
    assert.equal(mutations.length, 1);
    assert.equal(mutations[0]!.url, "/api/admin/content");
    assert.equal(mutations[0]!.csrf, "a".repeat(64));
    assert.equal(mutations[0]!.body.expectedVersion, 4);
    assert.deepEqual(mutations[0]!.body.content.homeSections, [
      { key: "categories", enabled: true },
      { key: "hero", enabled: false },
    ]);
    assert.equal(
      mutations[0]!.body.content.homeCopy.categoryHeading,
      "Furniture for every room",
    );
    assert.match(container.textContent!, /Draft saved/);
    assert.equal(
      [...container.querySelectorAll("button")].some(
        (b) => b.textContent === "Publish draft",
      ),
      false,
    );
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previous;
  }
});
test("publishers explicitly publish and restore history as a draft without auto-publishing", async () => {
  const previous = globalThis.fetch;
  const writes: { url: string; body: any }[] = [];
  globalThis.fetch = async (url, options) => {
    const path = String(url);
    if (path.endsWith("/session")) return Response.json(staff("publisher"));
    if (path.endsWith("/revisions"))
      return Response.json({
        revisions: [
          {
            id: "revision-four",
            version: 4,
            action: "save",
            actorEmail: "editor@example.test",
            createdAt: "2026-10-26T12:00:00Z",
          },
        ],
      });
    if (options?.method === "POST") {
      writes.push({ url: path, body: JSON.parse(String(options.body)) });
      return Response.json({
        ...doc(writes.length === 1 ? 5 : 6),
        publishedVersion: 5,
      });
    }
    return Response.json(doc());
  };
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(<AdminDashboard initialContent={initialContent} />),
    );
    await click("Publish draft");
    assert.deepEqual(writes, [
      { url: "/api/admin/content/publish", body: { expectedVersion: 4 } },
    ]);
    await click("History");
    await click("Restore version 4");
    assert.deepEqual(writes[1], {
      url: "/api/admin/content/rollback",
      body: { expectedVersion: 5, revisionId: "revision-four" },
    });
    assert.equal(writes.length, 2);
    assert.match(container.textContent!, /Restored.*draft/i);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previous;
  }
});
test("version conflicts preserve local edits and require explicit reload before another save", async () => {
  const previous = globalThis.fetch;
  let gets = 0;
  let puts = 0;
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith("/session")) return Response.json(staff());
    if (options?.method === "PUT") {
      puts++;
      return Response.json({ code: "VERSION_CONFLICT" }, { status: 409 });
    }
    gets++;
    return Response.json({
      ...doc(gets === 1 ? 4 : 8),
      draft: {
        ...initialContent,
        homeCopy: {
          ...initialContent.homeCopy,
          categoryHeading:
            gets === 1 ? "Shop by category" : "Saved by another editor",
        },
      },
    });
  };
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(<AdminDashboard initialContent={initialContent} />),
    );
    await click("Homepage");
    await fill("Category heading", "My unsaved heading");
    await click("Save draft");
    assert.match(
      container.querySelector('[role="alert"]')?.textContent ?? "",
      /another editor/i,
    );
    assert.equal(
      (
        container.querySelector(
          '[aria-label="Category heading"]',
        ) as HTMLInputElement
      ).value,
      "My unsaved heading",
    );
    assert.equal(button("Save draft").disabled, true);
    await click("Reload latest draft");
    assert.equal(
      (
        container.querySelector(
          '[aria-label="Category heading"]',
        ) as HTMLInputElement
      ).value,
      "Saved by another editor",
    );
    assert.equal(puts, 1);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previous;
  }
});
test("an expired session removes draft controls and asks for sign in", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async (url, options) =>
    String(url).endsWith("/session")
      ? Response.json(staff())
      : options?.method === "PUT"
        ? Response.json({}, { status: 401 })
        : Response.json(doc());
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(<AdminDashboard initialContent={initialContent} />),
    );
    await click("Homepage");
    await fill("Category heading", "Unsaved");
    await click("Save draft");
    assert.ok(container.querySelector('input[type="password"]'));
    assert.match(container.textContent!, /session.*expired/i);
    assert.equal(
      container.querySelector('[aria-label="Category heading"]'),
      null,
    );
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previous;
  }
});
test("campaign, Instagram and page forms preserve typed edits and escape their local preview", async () => {
  const previous = globalThis.fetch;
  let saved: any;
  globalThis.fetch = async (url, options) =>
    String(url).endsWith("/session")
      ? Response.json(staff("publisher"))
      : options?.method === "PUT"
        ? ((saved = JSON.parse(String(options.body)).content),
          Response.json({ ...doc(5), draft: saved }))
        : Response.json(doc());
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(<AdminDashboard initialContent={initialContent} />),
    );
    await click("Campaigns");
    await fill("Campaign headline", "Make room\nFor something special");
    await fill("Campaign button label", "Find your furniture");
    assert.match(
      container.querySelector('[aria-label="Campaign preview"]')?.textContent ??
        "",
      /Make room/,
    );
    assert.equal(button("Publish draft").disabled, true);
    await click("Instagram");
    await fill("Post 1 alt text", "A handcrafted oak chair");
    await click("Add Instagram post");
    await fill("Post 2 link", "https://www.instagram.com/p/NewPost/");
    await fill("Post 2 image", "/media/new-post.webp");
    await fill("Post 2 alt text", "New furniture collection");
    await click("Pages");
    await click("Add page");
    await fill("Page title", "Craft stories");
    await fill("Page slug", "craft-stories");
    await fill("Page description", "How furniture is crafted");
    await fill("Page body", "<script>unsafe()</script>\nCrafted with care.");
    await click("Add page banner");
    await fill("Desktop image", "/media/craft.webp");
    await fill("Mobile image", "/media/craft-mobile.webp");
    await fill("Banner alt text", "Our furniture workshop");
    await fill("Banner link", "/collections/all");
    await fill("Banner button label", "Explore furniture");
    const preview = container.querySelector('[aria-label="Page preview"]')!;
    assert.match(preview.textContent!, /<script>unsafe\(\)<\/script>/);
    assert.equal(preview.querySelector("script"), null);
    await click("Save draft");
    assert.deepEqual(saved.campaigns[0].headline, [
      "Make room",
      "For something special",
    ]);
    assert.equal(saved.campaigns[0].cta, "Find your furniture");
    assert.equal(saved.instagramPosts.length, 2);
    assert.equal(saved.instagramPosts[0].alt, "A handcrafted oak chair");
    assert.equal(saved.pages[0].slug, "craft-stories");
    assert.equal(saved.pages[0].banner.mobileImage, "/media/craft-mobile.webp");
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previous;
  }
});
test("invalid media cannot be saved and draft editors can remove posts and pages", async () => {
  const previous = globalThis.fetch;
  let writes = 0;
  let saved: any;
  globalThis.fetch = async (url, options) =>
    String(url).endsWith("/session")
      ? Response.json(staff())
      : options?.method === "PUT"
        ? (writes++,
          (saved = JSON.parse(String(options.body)).content),
          Response.json({ ...doc(5), draft: saved }))
        : Response.json({
            ...doc(),
            draft: {
              ...initialContent,
              instagramPosts: [
                ...initialContent.instagramPosts,
                {
                  href: "https://www.instagram.com/p/SecondPost/",
                  src: "/media/second.webp",
                  alt: "Second photo",
                },
              ],
              pages: [
                {
                  slug: "craft-story",
                  title: "Craft story",
                  description: "",
                  body: "A story",
                  banner: null,
                },
              ],
            },
          });
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(<AdminDashboard initialContent={initialContent} />),
    );
    await click("Instagram");
    await fill("Post 1 image", "https://unapproved.example/image.jpg");
    await click("Save draft");
    assert.equal(writes, 0);
    assert.match(
      container.querySelector('[role="alert"]')?.textContent ?? "",
      /approved/i,
    );
    await fill("Post 1 image", "/media/valid.webp");
    await click("Remove post 2");
    await click("Pages");
    await click("Remove page");
    await click("Save draft");
    assert.equal(writes, 1);
    assert.equal(saved.instagramPosts.length, 1);
    assert.deepEqual(saved.pages, []);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previous;
  }
});
test("a failed content read cannot become a default-content write, and retry recovers", async () => {
  const previous = globalThis.fetch;
  let reads = 0;
  globalThis.fetch = async (url) =>
    String(url).endsWith("/session")
      ? Response.json(staff())
      : ++reads === 1
        ? Response.json({}, { status: 503 })
        : Response.json(doc());
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(<AdminDashboard initialContent={initialContent} />),
    );
    assert.equal(button("Save draft").disabled, true);
    assert.match(container.textContent!, /couldn't load/i);
    await click("Retry loading draft");
    await click("Homepage");
    assert.equal(
      (
        container.querySelector(
          '[aria-label="Category heading"]',
        ) as HTMLInputElement
      ).value,
      "Shop by category",
    );
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previous;
  }
});
test("signing out sends CSRF and removes all authenticated editor content", async () => {
  const previous = globalThis.fetch;
  let logoutCsrf: string | null = null;
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith("/session")) return Response.json(staff());
    if (String(url).endsWith("/logout")) {
      logoutCsrf = new Headers(options?.headers).get("X-CSRF-Token");
      return new Response(null, { status: 204 });
    }
    return Response.json(doc());
  };
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(<AdminDashboard initialContent={initialContent} />),
    );
    await click("Sign out");
    assert.equal(logoutCsrf, "a".repeat(64));
    assert.ok(container.querySelector('input[type="password"]'));
    assert.equal(
      container.querySelector('nav[aria-label="Content sections"]'),
      null,
    );
    assert.equal(dom.window.localStorage.length, 0);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previous;
  }
});

test("malformed successful session replies fail closed with a usable login form", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({
      user: { id: "staff-one", email: "editor@example.test", role: "owner" },
      csrfToken: "a".repeat(64),
    });
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(<AdminDashboard initialContent={initialContent} />),
    );
    assert.ok(
      container.querySelector('input[type="password"]'),
      "An invalid session must not expose editor controls",
    );
    assert.match(
      container.querySelector('[role="alert"]')?.textContent ?? "",
      /session|sign in/i,
    );
    assert.equal(
      container.querySelector('nav[aria-label="Content sections"]'),
      null,
    );
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previous;
  }
});
test("malformed successful login replies stay signed out and clear the password", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async (url) =>
    String(url).endsWith("/session")
      ? Response.json({}, { status: 401 })
      : Response.json({
          user: {
            id: "staff-one",
            email: "editor@example.test",
            role: "editor",
          },
          csrfToken: "invalid",
        });
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(<AdminDashboard initialContent={initialContent} />),
    );
    await fill("Email", "editor@example.test");
    await fill("Password", "example-test-password");
    await submit();
    const password = container.querySelector<HTMLInputElement>(
      'input[type="password"]',
    );
    assert.ok(password, "Malformed login must not open the editor");
    assert.equal(password.value, "");
    assert.match(
      container.querySelector('[role="alert"]')?.textContent ?? "",
      /sign in|session/i,
    );
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previous;
  }
});
test("inconsistent document versions and invalid timestamps cannot become editable drafts", async () => {
  const previous = globalThis.fetch;
  try {
    for (const invalid of [
      { ...doc(), publishedVersion: 5 },
      { ...doc(), publishedVersion: -1 },
      { ...doc(), updatedAt: { time: "invalid" } },
    ]) {
      globalThis.fetch = async (url) =>
        String(url).endsWith("/session")
          ? Response.json(staff())
          : Response.json(invalid);
      const root = createRoot(container);
      try {
        await act(async () =>
          root.render(<AdminDashboard initialContent={initialContent} />),
        );
        assert.equal(button("Save draft").disabled, true);
        assert.ok(
          container.querySelector('nav[aria-label="Content sections"]') ===
            null,
          "Invalid document must not expose editable fields",
        );
        assert.match(container.textContent!, /couldn't load/i);
      } finally {
        await act(async () => root.unmount());
      }
    }
  } finally {
    globalThis.fetch = previous;
  }
});

test("stalled session reads time out and leave an actionable sign-in form", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const previous = globalThis.fetch;
  let signal: AbortSignal | null | undefined;
  globalThis.fetch = async (_url, options) => {
    signal = options?.signal;
    return new Promise<Response>((_resolve, reject) =>
      signal?.addEventListener(
        "abort",
        () => reject(new DOMException("Aborted", "AbortError")),
        { once: true },
      ),
    );
  };
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(<AdminDashboard initialContent={initialContent} />),
    );
    await act(async () => t.mock.timers.tick(15_000));
    assert.match(
      container.querySelector('[role="alert"]')?.textContent ?? "",
      /timed out/i,
    );
    assert.ok(container.querySelector('input[type="password"]'));
    assert.equal(signal?.aborted, true);
    assert.equal(button("Sign in").disabled, false);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previous;
    t.mock.timers.reset();
  }
});
test("a timed-out save preserves unsaved text and can be retried", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const previous = globalThis.fetch;
  let writes = 0;
  let saved: any;
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith("/session")) return Response.json(staff());
    if (options?.method === "PUT") {
      writes++;
      if (writes === 1)
        return new Promise<Response>((_resolve, reject) =>
          options.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          ),
        );
      saved = JSON.parse(String(options.body)).content;
      return Response.json({ ...doc(5), draft: saved });
    }
    return Response.json(doc());
  };
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(<AdminDashboard initialContent={initialContent} />),
    );
    await click("Homepage");
    await fill("Category heading", "My carefully edited draft");
    await click("Save draft");
    assert.equal(button("Save draft").disabled, true);
    await act(async () => t.mock.timers.tick(15_000));
    assert.match(
      container.querySelector('[role="alert"]')?.textContent ?? "",
      /timed out/i,
    );
    assert.equal(
      (
        container.querySelector(
          '[aria-label="Category heading"]',
        ) as HTMLInputElement
      ).value,
      "My carefully edited draft",
    );
    assert.equal(button("Save draft").disabled, false);
    await click("Save draft");
    assert.equal(saved.homeCopy.categoryHeading, "My carefully edited draft");
    assert.match(container.textContent!, /Draft saved/);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previous;
    t.mock.timers.reset();
  }
});
test("the timeout covers response body delivery and unmount cancels pending work", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const previous = globalThis.fetch;
  let signal: AbortSignal | null | undefined;
  globalThis.fetch = async (_url, options) => {
    signal = options?.signal;
    return new Response(
      new ReadableStream({
        start(controller) {
          signal?.addEventListener(
            "abort",
            () => controller.error(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        },
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  };
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(<AdminDashboard initialContent={initialContent} />),
    );
    await act(async () => t.mock.timers.tick(15_000));
    assert.match(
      container.querySelector('[role="alert"]')?.textContent ?? "",
      /timed out/i,
    );
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previous;
    t.mock.timers.reset();
  }
});
test("finished requests clear their deadlines and unmount aborts a pending request", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const previous = globalThis.fetch;
  const signals: AbortSignal[] = [];
  globalThis.fetch = async (url, options) => {
    if (options?.signal) signals.push(options.signal);
    return String(url).endsWith("/session")
      ? Response.json(staff())
      : Response.json(doc());
  };
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(<AdminDashboard initialContent={initialContent} />),
    );
    await act(async () => t.mock.timers.tick(30_000));
    assert.equal(
      signals.length,
      2,
      "Both session and draft requests must be cancellable",
    );
    assert.ok(
      signals.every((signal) => !signal.aborted),
      "Completed requests must not be cancelled by leftover deadline timers",
    );
  } finally {
    await act(async () => root.unmount());
  }
  let pendingSignal: AbortSignal | null | undefined;
  globalThis.fetch = async (_url, options) => {
    pendingSignal = options?.signal;
    return new Promise<Response>((_resolve, reject) =>
      pendingSignal?.addEventListener(
        "abort",
        () => reject(new DOMException("Aborted", "AbortError")),
        { once: true },
      ),
    );
  };
  const pendingRoot = createRoot(container);
  try {
    await act(async () =>
      pendingRoot.render(<AdminDashboard initialContent={initialContent} />),
    );
    await act(async () => pendingRoot.unmount());
    assert.equal(
      pendingSignal?.aborted,
      true,
      "Leaving admin must cancel pending requests",
    );
  } finally {
    globalThis.fetch = previous;
    t.mock.timers.reset();
  }
});

test("logout succeeds when the transport exposes an empty stream for HTTP 204", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/session")) return Response.json(staff());
    if (String(url).endsWith("/logout")) {
      // Model the browser/proxy response, which can expose an empty stream.
      const response = new Response("");
      Object.defineProperty(response, "status", { value: 204 });
      return response;
    }
    return Response.json(doc());
  };
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(<AdminDashboard initialContent={initialContent} />),
    );
    await click("Sign out");
    assert.ok(
      container.querySelector('input[type="password"]'),
      "A successful 204 logout must return to the login form",
    );
    assert.ok(
      !container.querySelector('[role="alert"]'),
      "Successful logout must not show a network error",
    );
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previous;
  }
});

test("publisher sees media and category controls but enquiry inbox needs its own capability", async () => {
  const previous = globalThis.fetch;
  for (const allowed of [false, true]) {
    globalThis.fetch = async (url) =>
      String(url).endsWith("/session")
        ? Response.json({
            ...staff("publisher"),
            user: { ...staff("publisher").user, canManageEnquiries: allowed },
          })
        : String(url).endsWith("/media")
          ? Response.json({ assets: [], nextCursor: null })
          : Response.json(doc());
    const root = createRoot(container);
    try {
      await act(async () =>
        root.render(<AdminDashboard initialContent={initialContent} />),
      );
      assert.ok(button("Category pages"));
      assert.ok(button("Media"));
      assert.equal(
        [...container.querySelectorAll("button")].some(
          (b) => b.textContent === "Enquiries",
        ),
        allowed,
      );
      await click("Category pages");
      assert.ok(container.querySelector('input[value="Sofas"]'));
    } finally {
      await act(async () => root.unmount());
    }
  }
  globalThis.fetch = previous;
});

test("campaign editor lets staff select artwork without changing campaign copy", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async (url) =>
    String(url).endsWith("/session")
      ? Response.json(staff("publisher"))
      : Response.json(doc());
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(<AdminDashboard initialContent={initialContent} />),
    );
    await click("Campaigns");
    await click("Replace campaign artwork");
    assert.ok(container.textContent?.includes("Campaign desktop artwork"));
    assert.ok(container.textContent?.includes("Campaign mobile artwork"));
    assert.equal(
      container.querySelector('textarea[aria-label="Campaign headline"]')
        ?.textContent,
      "Original headline",
    );
    await click("Restore original campaign artwork");
    assert.equal(
      container.textContent?.includes("Campaign desktop artwork"),
      false,
    );
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previous;
  }
});

test("section reveal preference can be edited and saved without publishing", async () => {
  const previous = globalThis.fetch;
  const writes: { url: string; body: any }[] = [];
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith("/session")) return Response.json(staff());
    if (options?.method === "PUT") {
      const body = JSON.parse(String(options.body));
      writes.push({url: String(url), body});
      return Response.json({...doc(5), draft: body.content});
    }
    return Response.json(doc());
  };
  const root = createRoot(container);
  try {
    await act(async () => root.render(<AdminDashboard initialContent={initialContent} />));
    await click("Homepage");
    const label = [...container.querySelectorAll("label")].find(label => label.textContent?.includes("Section reveal effects"));
    const input = label?.querySelector("input");
    assert.ok(input);
    await act(async () => input.click());
    assert.equal(input.checked, true, "Publisher should be able to choose section reveals");
    await click("Save draft");
    assert.equal(writes.length, 1);
    assert.equal(writes[0]!.url, "/api/admin/content");
    assert.equal(writes[0]!.body.content.motion.revealSections, true);
    assert.equal(writes[0]!.body.content.motion.autoplaySocial, true);
    assert.equal(writes[0]!.body.expectedVersion, 4);
  } finally {await act(async () => root.unmount()); globalThis.fetch = previous;}
});

test("authorised enquiry staff can use the inbox when the content draft is unavailable", async () => {
  const previous = globalThis.fetch;
  const row = { id: "enq_00000000-0000-4000-8000-000000000001", kind: "contact", status: "new", version: 0, assignedToId: null, contactId: null, name: "Synthetic", product: "", createdAt: "2026-10-26T00:00:00.000Z" };
  try {
    for (const failure of ["unavailable", "malformed"]) {
      let recovered = false;
      globalThis.fetch = async (url) => {
        const path = String(url);
        if (path.endsWith("/session")) return Response.json({ ...staff("publisher"), user: { ...staff("publisher").user, canManageEnquiries: true } });
        if (path === "/api/admin/enquiries") return Response.json({ items: [row], nextCursor: null });
        if (path === "/api/admin/content") return recovered ? Response.json(doc()) : failure === "unavailable" ? Response.json({}, { status: 503 }) : Response.json({ ...doc(), publishedVersion: 99 });
        throw Error(`Unexpected request: ${path}`);
      };
      const root = createRoot(container);
      try {
        await act(async () => root.render(<AdminDashboard initialContent={initialContent} />));
        assert.equal(button("Save draft").disabled, true);
        assert.equal(button("Publish draft").disabled, true);
        await click("Enquiries");
        assert.ok(container.querySelector('[aria-label="Customer enquiries"]'), "A content failure must not hide the separately protected inbox");
        assert.ok(container.textContent!.includes(row.id));
        assert.equal(button("Open enquiry").disabled, false);
        await click("Overview");
        recovered = true;
        await click("Retry loading draft");
        await click("Homepage");
        assert.equal(container.querySelector<HTMLInputElement>('[aria-label="Category heading"]')?.value, "Shop by category");
      } finally { await act(async () => root.unmount()); }
    }
  } finally { globalThis.fetch = previous; }
});

test("unavailable content cannot expose enquiries without capability or bypass inbox denials", async () => {
  const previous = globalThis.fetch;
  try {
    for (const allowed of [false, true]) {
      for (const status of [403, 401]) {
        let enquiryReads = 0;
        globalThis.fetch = async (url) => {
          const path = String(url);
          if (path.endsWith("/session")) return Response.json({ ...staff("publisher"), user: { ...staff("publisher").user, canManageEnquiries: allowed } });
          if (path === "/api/admin/content") return Response.json({}, { status: 503 });
          if (path === "/api/admin/enquiries") { enquiryReads++; return Response.json({}, { status }); }
          throw Error(`Unexpected request: ${path}`);
        };
        const root = createRoot(container);
        try {
          await act(async () => root.render(<AdminDashboard initialContent={initialContent} />));
          if (!allowed) {
            assert.equal([...container.querySelectorAll("button")].some(item => item.textContent === "Enquiries"), false);
            assert.equal(enquiryReads, 0);
          } else {
            await click("Enquiries");
            assert.equal(enquiryReads, 1);
            if (status === 401) assert.ok(container.querySelector('input[type="password"]'));
            else assert.match(container.textContent!, /does not have access to customer enquiries/i);
            assert.equal([...container.querySelectorAll("button")].some(item => item.textContent === "Open enquiry"), false);
          }
        } finally { await act(async () => root.unmount()); }
      }
    }
  } finally { globalThis.fetch = previous; }
});

test("a draft read aborted by StrictMode's first mount is not reported and does not leave the editor busy", async () => {
  const previous = globalThis.fetch;
  const root = createRoot(container);
  const reads: string[] = [];
  let contentReads = 0;
  globalThis.fetch = async (input, init) => {
    const path = String(input);
    // The surviving draft read is slow, so the aborted one finishes first.
    const slow = path === "/api/admin/content" && ++contentReads === 2;
    await new Promise((resolve) => setTimeout(resolve, slow ? 90 : 5));
    if (init?.signal?.aborted) {
      reads.push(`aborted ${path}`);
      throw new dom.window.DOMException("The operation was aborted.", "AbortError");
    }
    reads.push(`ok ${path}`);
    if (path === "/api/admin/session") return Response.json(staff("publisher"));
    if (path === "/api/admin/content") return Response.json(doc());
    assert.fail(`Unexpected request ${path}`);
  };
  try {
    await act(async () => root.render(<React.StrictMode><AdminDashboard initialContent={initialContent} /></React.StrictMode>));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
    assert.ok(reads.some((entry) => entry.startsWith("aborted /api/admin/content")), "The first draft read was aborted");
    assert.equal(reads.includes("ok /api/admin/content"), false, "The surviving read is still running");
    assert.ok(container.querySelector('[aria-busy="true"]'), "While the surviving read runs the editor shows its loading state");
    assert.equal([...container.querySelectorAll("button")].some((b) => b.textContent === "Retry loading draft"), false, "The aborted read must not clear busy and expose the unavailable state while a read is still running");
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 120)); });
    assert.ok(reads.some((entry) => entry.startsWith("aborted /api/admin/content")), "StrictMode's first draft read was aborted by the hook");
    assert.ok(reads.includes("ok /api/admin/content"), "The second draft read completed");
    assert.equal(container.querySelector('[role="alert"]'), null, "An aborted first read is never shown as a failure");
    assert.equal(button("Preview draft").disabled, false, "The editor is not left busy by the aborted read's cleanup");
    assert.ok(container.querySelector('button[data-action="save"]'), "The draft editor is usable");
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previous;
  }
});
