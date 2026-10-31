import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { renderToStaticMarkup } from "react-dom/server";
import { BlogIndex } from "../components/blog-index";
import { BlogArticle } from "../components/blog-article";
import { PolicyArticle } from "../components/policy-page";
import { Modal } from "../components/modal";
import NotFound from "../app/not-found";
import ErrorPage from "../app/error";
import CartPage from "../app/cart/page";
import { ShopProvider } from "../components/shop-provider";
import * as returnsRoute from "../app/pages/returns/page";
import { resolveEditorialContent } from "../lib/editorial-content-defaults";

// The blog, policy, returns, 404, error and cart pages moved from hand-written CSS onto utilities
// with no visual change. Their legacy class names are gone (the rules that styled them were
// deleted), and tests reach the markup through data hooks.
const legacyClasses = new Set([
  "blog-index", "blog-index-grid", "blog-index-card", "blog-index-image", "blog-index-copy",
  "editorial-page", "breadcrumbs", "store-prose", "empty-state", "button", "full-width",
  "page-section", "cart-page", "modal", "modal-heading", "cart-drawer", "wishlist-drawer", "icon-button",
  "content-page", "content-page-copy", "content-page-banner", "home-container",
]);
const documentFor = (element: Parameters<typeof renderToStaticMarkup>[0]) => new JSDOM(renderToStaticMarkup(element)).window.document;
const legacyIn = (doc: Document) => [...doc.querySelectorAll("[class]")]
  .flatMap((element) => [...element.classList])
  .filter((name) => legacyClasses.has(name));
const { blogs, policies } = resolveEditorialContent();
const blog = blogs.find((item) => item.handle === "recent-stories")!;

test("the blog index lists every story newest first through data hooks", () => {
  const doc = documentFor(<BlogIndex blog={blog.handle} title={blog.title} articles={blog.articles} />);
  const index = doc.querySelector("[data-blog-index]")!;
  assert.ok(index.hasAttribute("data-store"));
  assert.equal(index.querySelector("h1")?.textContent, blog.title);
  const cards = [...index.querySelectorAll("[data-blog-card]")];
  assert.equal(cards.length, blog.articles.length);
  const dates = cards.map((card) => blog.articles.find((article) => card.querySelector(`a[href="/blogs/${blog.handle}/${article.handle}"]`))!.publishedAt);
  assert.deepEqual(dates, [...dates].sort((a, b) => (Date.parse(b ?? "") || 0) - (Date.parse(a ?? "") || 0)));
  for (const card of cards) {
    const title = card.querySelector("h2 a")!;
    assert.match(title.getAttribute("href")!, new RegExp(`^/blogs/${blog.handle}/`));
    assert.equal(card.querySelector(`a[aria-label="Read ${title.textContent}"]`)?.getAttribute("href"), title.getAttribute("href"));
  }
  assert.deepEqual(legacyIn(doc), []);
  const empty = documentFor(<BlogIndex blog={blog.handle} title={blog.title} articles={[]} />);
  assert.equal(empty.querySelectorAll("[data-blog-card]").length, 0);
  assert.match(empty.querySelector("[data-blog-index]")!.textContent!, /No articles published yet\./);
});

test("articles and policies keep their breadcrumbs and bodies under data hooks", () => {
  const post = blog.articles.find((article) => article.handle === "how-to-measure-furniture-before-ordering-online")!;
  const article = documentFor(<BlogArticle blog={blog.handle} record={blog} article={post.handle} post={post} />);
  const page = article.querySelector("[data-article-page]")!;
  assert.ok(page.hasAttribute("data-store"));
  assert.deepEqual([...page.querySelectorAll("[data-breadcrumb] a")].map((link) => link.getAttribute("href")), ["/", `/blogs/${blog.handle}`]);
  assert.equal(page.querySelector("h1")?.textContent, post.title);
  assert.ok(page.querySelector("[data-article-body]")!.textContent!.length > 0);
  assert.deepEqual(legacyIn(article), []);

  const policy = policies["privacy-policy"]!;
  const doc = documentFor(<PolicyArticle policy={policy} />);
  const root = doc.querySelector("[data-policy-page]")!;
  assert.ok(root.hasAttribute("data-store"));
  assert.deepEqual([...root.querySelectorAll("[data-breadcrumb] a")].map((link) => link.getAttribute("href")), ["/"]);
  assert.equal(root.querySelector("[data-breadcrumb] span")?.textContent, policy.title);
  assert.equal(root.querySelector("h1")?.textContent, policy.title);
  assert.ok(root.querySelector("[data-policy-body]")!.textContent!.length > 0);
  assert.deepEqual(legacyIn(doc), []);
});

test("the returns, 404, error and cart pages and the dialog shell carry data hooks, not legacy classes", async () => {
  const returns = documentFor(await returnsRoute.default());
  const page = returns.querySelector("[data-returns-page]")!;
  assert.ok(page.hasAttribute("data-store"));
  assert.equal(page.querySelector("h1")?.textContent, "Return & Exchange");
  assert.equal(page.querySelectorAll("form").length, 1);
  // The enquiry form itself is the shared contact form, which keeps its own legacy rules.
  page.querySelector("form")!.remove();
  assert.deepEqual(legacyIn(returns), []);

  const missing = documentFor(<NotFound />);
  assert.ok(missing.querySelector("[data-store][data-empty-state]"));
  assert.equal(missing.querySelector("[data-empty-state] a")?.getAttribute("href"), "/collections/all");
  assert.deepEqual(legacyIn(missing), []);

  const failed = documentFor(<ErrorPage reset={() => {}} />);
  assert.ok(failed.querySelector("[data-store][data-empty-state]"));
  assert.equal(failed.querySelector("[data-empty-state] button")?.textContent, "Try again");
  assert.deepEqual(legacyIn(failed), []);

  const cart = documentFor(<ShopProvider><CartPage /></ShopProvider>);
  assert.ok(cart.querySelector("[data-store][data-cart-page]"));
  assert.equal(cart.querySelector("[data-cart-page] h1")?.textContent, "Your cart");
  assert.deepEqual(legacyIn(cart), []);

  for (const drawer of [false, true]) {
    const dialog = documentFor(<Modal open={false} onClose={() => {}} title="Your cart (0)" drawer={drawer}><p>Body</p></Modal>);
    assert.equal(dialog.querySelector("dialog[data-store]")?.getAttribute("data-modal"), drawer ? "drawer" : "panel");
    assert.equal(dialog.querySelector("[data-modal-heading] h2")?.textContent, "Your cart (0)");
    assert.ok(dialog.querySelector('[data-modal-heading] button[aria-label="Close Your cart (0)"]'));
    assert.deepEqual(legacyIn(dialog), []);
  }
});
