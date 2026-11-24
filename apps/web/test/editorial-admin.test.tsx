import assert from "node:assert/strict";
import { test } from "node:test";
import { storefrontContentSchema, type StorefrontContent } from "@shopmaple/contracts";
import { defaultStorefrontContent } from "../lib/content-defaults";
import * as admin from "../lib/editorial-admin";
import { resolveEditorialContent } from "../lib/editorial-content-defaults";
import { resolveSiteChrome } from "../lib/site-chrome-defaults";

// Policies, blogs and articles: add, edit, hide, restore, duplicate, move and delete (owner, 24 Nov 2026).
const fresh = () => structuredClone(defaultStorefrontContent) as StorefrontContent;
const valid = (content: StorefrontContent, what: string) => {
  const result = storefrontContentSchema.safeParse(content);
  assert.ok(result.success, `${what}: ${result.success ? "" : result.error.issues.map(issue => `${issue.path.join(".")} ${issue.message}`).join("; ")}`);
};
const footer = (content: StorefrontContent) => resolveSiteChrome(content.siteChrome).footer.policyLinks;
const ok = <T extends object>(result: admin.EditResult<T>) => { assert.ok(result.ok, result.ok ? "" : result.error); return result; };
const link = (href: string, words: string) => ({ tag: "p", children: [{ tag: "a", href, children: [words] }] });
/** A Pages page whose text links to `href`. */
const page = (href: string) => ({ slug: "care-guide", title: "Care guide", description: "", body: "", banner: null, content: [link(href, "read more")] });

test("addresses come from titles, and a taken address gets the next free number", () => {
  assert.equal(admin.slugify("Return & Exchange Policy"), "return-and-exchange-policy");
  assert.equal(admin.slugify("  Délivery — FAQs!  "), "delivery-faqs");
  assert.equal(admin.slugify("a".repeat(90), 80).length, 80);
  assert.equal(admin.uniqueSlug("warranty", new Set(["warranty", "warranty-2"])), "warranty-3");
  assert.equal(admin.uniqueSlug("", new Set()), "untitled");
});

test("a new policy can join the footer, and its address must be free", () => {
  const result = ok(admin.addPolicy(fresh(), { title: "Warranty Policy", slug: "warranty-policy", footer: true }));
  const policy = admin.policyView(result.content, "warranty-policy")!;
  assert.deepEqual([policy.title, policy.imported, policy.content], ["Warranty Policy", false, []]);
  assert.deepEqual(footer(result.content).at(-1), { id: "policy-warranty-policy", label: "Warranty Policy", href: "/policies/warranty-policy", enabled: true });
  valid(result.content, "a new policy");
  assert.equal(admin.policyList(result.content).length, 5, "listed after the imported four");
  for (const [slug, title, error] of [["privacy-policy", "Privacy", /already uses/], ["Bad Address", "Bad", /lowercase/], ["blank", " ", /title/]] as const)
    assert.match((admin.addPolicy(result.content, { title, slug, footer: false }) as { error: string }).error, error);
  const room = admin.footerRoom(result.content);
  assert.equal(room, admin.footerPolicyLinkLimit - 5);
});

test("hiding an imported policy turns its footer link off, and showing it again needs no draft entry", () => {
  const hidden = admin.setPolicyHidden(fresh(), "privacy-policy", true);
  assert.deepEqual(hidden.editorialContent?.policies.map(item => [item.slug, item.hidden]), [["privacy-policy", true]]);
  assert.equal(footer(hidden).find(item => item.href === "/policies/privacy-policy")?.enabled, false, "publishing would refuse a link to a hidden page");
  assert.equal(Object.hasOwn(resolveEditorialContent(hidden.editorialContent).policies, "privacy-policy"), false, "off the site");
  valid(hidden, "a hidden policy");
  const shown = admin.setPolicyHidden(hidden, "privacy-policy", false);
  assert.deepEqual(shown.editorialContent?.policies, [], "an original, shown policy carries no entry");
  assert.equal(footer(shown).find(item => item.href === "/policies/privacy-policy")?.enabled, true);
});

test("an edited imported policy can be restored, and only policies staff added can be deleted", () => {
  let content = admin.updatePolicy(fresh(), "refund-policy", { title: "Refunds", seoDescription: "How refunds work." });
  assert.equal(admin.policyView(content, "refund-policy")!.edited, true);
  content = admin.updatePolicy(content, "refund-policy", { seoDescription: "  " });
  assert.equal("seoDescription" in content.editorialContent!.policies[0]!, false, "blank optional words are not stored");
  content = admin.restorePolicy(content, "refund-policy");
  assert.deepEqual(content.editorialContent?.policies, []);
  assert.equal(admin.deletePolicy(content, "refund-policy"), content, "imported policies are hidden, never deleted");
  content = ok(admin.addPolicy(content, { title: "Warranty", slug: "warranty", footer: true })).content;
  content = admin.deletePolicy(content, "warranty");
  assert.equal(admin.policyView(content, "warranty"), undefined);
  assert.equal(footer(content).some(item => item.href === "/policies/warranty"), false, "its footer link goes with it");
  valid(content, "after deleting");
});

test("a policy's footer link words, and a new address, follow staff's choice; links to it move too", () => {
  let content = ok(admin.addPolicy(fresh(), { title: "Warranty", slug: "warranty", footer: false })).content;
  assert.equal(admin.footerLink(content, "warranty"), undefined);
  content = admin.addFooterLink(content, "warranty", "Warranty");
  content = admin.setFooterLabel(content, "warranty", "Our warranty");
  assert.equal(admin.footerLink(content, "warranty")?.label, "Our warranty");
  content = { ...content, pages: [page("/policies/warranty#cover")] } as StorefrontContent;
  valid(content, "a page linking to the policy");
  assert.deepEqual(admin.textLinksTo(content, ["/policies/warranty"]), ["the page “Care guide”"]);
  const moved = ok(admin.movePolicy(content, "warranty", "guarantee")).content;
  assert.equal(admin.footerLink(moved, "guarantee")?.label, "Our warranty");
  assert.deepEqual(moved.pages[0]!.content, [link("/policies/guarantee#cover", "read more")], "the page's link keeps its #part");
  valid(moved, "after the move");
  assert.match((admin.movePolicy(moved, "privacy-policy", "privacy") as { error: string }).error, /keep their address/);
  content = admin.removeFooterLink(moved, "guarantee");
  assert.equal(admin.footerLink(content, "guarantee"), undefined);
});

test("blogs: new ones, renaming the originals, hiding with their articles, and deleting only when empty", () => {
  let content = ok(admin.addBlog(fresh(), { title: "Care guides", handle: "care-guides", description: "Looking after wood." })).content;
  assert.deepEqual(admin.blogView(content, "care-guides"), { handle: "care-guides", title: "Care guides", description: "Looking after wood.", imported: false, edited: false, articles: 0 });
  content = admin.updateBlog(content, "news", { title: "Maple news" });
  assert.equal(admin.blogView(content, "news")!.edited, true);
  content = ok(admin.addArticle(content, { blog: "care-guides", title: "Oiling teak", handle: "oiling-teak" })).content;
  assert.match((admin.deleteBlog(content, "care-guides") as { error: string }).error, /Move its article/);
  const hidden = admin.setBlogHidden(content, "care-guides", true);
  assert.equal(resolveEditorialContent(hidden.editorialContent, hidden.authoredArticles, undefined, { preview: true }).blogs.some(blog => blog.handle === "care-guides"), false);
  const moved = ok(admin.moveBlog(content, "care-guides", "care")).content;
  assert.ok(admin.articleView(moved, "care/oiling-teak"), "its articles move with it");
  const emptied = admin.deleteArticle(moved, "care/oiling-teak");
  content = ok(admin.deleteBlog(emptied, "care")).content;
  assert.equal(admin.blogView(content, "care"), undefined);
  assert.match((admin.deleteBlog(content, "news") as { error: string }).error, /hidden, not deleted/);
  content = admin.restoreBlog(content, "news");
  assert.equal(admin.blogView(content, "news")!.title, "News");
  valid(content, "after the blog changes");
});

test("articles: write, edit, hide, duplicate, move and delete; imported ones are hidden or restored", () => {
  let content = ok(admin.addArticle(fresh(), { blog: "news", title: "A room for reading", handle: "a-room-for-reading" })).content;
  assert.match((admin.addArticle(content, { blog: "recent-stories", title: "Taken", handle: "how-to-measure-furniture-before-ordering-online" }) as { error: string }).error, /imported article/);
  assert.match((admin.addArticle(content, { blog: "news", title: "Again", handle: "a-room-for-reading" }) as { error: string }).error, /already uses/);
  content = admin.updateArticle(content, "news/a-room-for-reading", { content: [{ tag: "p", children: ["Light, a chair and a lamp."] }], excerpt: "Reading corners.", author: "Maple team" });
  assert.equal(admin.articleList(content)[0]!.id, "news/a-room-for-reading", "not yet published comes first");
  valid(content, "a new article");

  const copy = ok(admin.duplicateArticle(content, "recent-stories/standard-dining-table-size-guide-for-indian-homes"));
  const duplicate = admin.articleView(copy.content, copy.id)!;
  assert.deepEqual([duplicate.kind, duplicate.hidden, duplicate.handle], ["authored", true, "standard-dining-table-size-guide-for-indian-homes-copy"], "a copy waits hidden");
  valid(copy.content, "a copied imported article");

  content = admin.setArticleHidden(copy.content, "recent-stories/how-to-measure-furniture-before-ordering-online", true);
  assert.equal(admin.articleView(content, "recent-stories/how-to-measure-furniture-before-ordering-online")!.hidden, true);
  assert.equal(content.editorialContent!.articles.length, 1);
  content = admin.restoreArticle(content, "recent-stories/how-to-measure-furniture-before-ordering-online");
  assert.equal(content.editorialContent!.articles.length, 0, "back to the original");

  content = { ...content, authoredArticles: content.authoredArticles!.map(article => article.handle === "a-room-for-reading" ? { ...article, publishedAt: "2026-11-20T10:00:00.000Z" } : article) };
  const moved = ok(admin.moveArticle(content, "news/a-room-for-reading", { blog: "buying-guidelines", handle: "reading-corners" }));
  const view = admin.articleView(moved.content, moved.id)!;
  assert.deepEqual([moved.id, view.publishedAt], ["buying-guidelines/reading-corners", null], "dated again at its new address");
  content = admin.deleteArticle(moved.content, moved.id);
  assert.equal(admin.articleView(content, moved.id), undefined);
  assert.equal(admin.deleteArticle(content, "recent-stories/how-to-measure-furniture-before-ordering-online"), content, "imported articles are never deleted");
  valid(content, "after the article changes");
});

test("an article written in blocks opens as rich text and keeps rich text once changed", () => {
  const content = { ...fresh(), authoredArticles: [{ blog: "news", handle: "old-style", title: "Old style", excerpt: "", blocks: [
    { id: "a", type: "heading", level: 2, text: "Before" }, { id: "b", type: "paragraph", text: "Written in blocks." },
  ] }] } as StorefrontContent;
  const view = admin.articleView(content, "news/old-style")!;
  assert.equal(view.legacy, true);
  assert.deepEqual(view.content, [{ tag: "h2", children: ["Before"] }, { tag: "p", children: ["Written in blocks."] }]);
  const edited = admin.updateArticle(content, "news/old-style", { content: [...view.content, { tag: "p", children: ["Now rich text."] }] });
  assert.equal("blocks" in edited.authoredArticles![0]!, false);
  assert.equal(admin.articleView(edited, "news/old-style")!.legacy, false);
  valid(edited, "a converted article");
});

test("hiding a page linked from the menu turns that link off; text links are named for staff to change", () => {
  let content = fresh();
  const before = admin.chromeLinksTo(content, ["/blogs/recent-stories"]);
  const chrome = resolveSiteChrome(content.siteChrome);
  chrome.utilityLinks = [...chrome.utilityLinks.slice(0, 5), { id: "stories", label: "Stories", href: "/blogs/recent-stories", enabled: true }];
  content = { ...content, siteChrome: chrome, pages: [page("/blogs/recent-stories")] } as StorefrontContent;
  assert.equal(admin.chromeLinksTo(content, ["/blogs/recent-stories"]), before + 1);
  const hidden = admin.setBlogHidden(content, "recent-stories", true);
  assert.equal(hidden.siteChrome!.utilityLinks.find(item => item.id === "stories")?.enabled, false);
  const enabled = (value: StorefrontContent) => JSON.stringify(value.siteChrome).match(/"href":"\/blogs\/recent-stories[^"]*","enabled":true/g)?.length ?? 0;
  assert.equal(enabled(hidden), 0, "no menu or footer link to the hidden blog stays on");
  assert.deepEqual(admin.textLinksTo(hidden, ["/blogs/recent-stories"]), ["the page “Care guide”"]);
  assert.equal(admin.setBlogHidden(hidden, "recent-stories", false).siteChrome!.utilityLinks.find(item => item.id === "stories")?.enabled, true);
});
