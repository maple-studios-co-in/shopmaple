"use client";
import { useState } from "react";
import { authoredArticlesSchema, blogHandles, contentImageSchema, type AuthoredArticle } from "@shopmaple/contracts";
import { AuthoredArticleBody } from "@/components/authored-article-body";
import type { StaffSession } from "./dashboard";
import { Field } from "./field";
import { AuthoredBlockFields, newAuthoredBlock } from "./authored-block-fields";
import { MediaPicker } from "./media-picker";

const identity = (article: AuthoredArticle) => `${article.blog}/${article.handle}`;
const blogLabels: Record<AuthoredArticle["blog"], string> = { news: "News", "buying-guidelines": "Buying guidelines", "life-culture": "Life & culture", "recent-stories": "Recent stories" };
function previewImage(src: string) {
  const match = /^\/media\/uploads\/([a-f0-9]{64})\.webp$/.exec(src);
  return match ? `/api/admin/media/${match[1]}/preview` : src;
}
export function AuthoredArticleFields({ value, onChange, session, onExpired }: {
  value?: AuthoredArticle[]; onChange: (value: AuthoredArticle[]) => void; session: StaffSession; onExpired: () => void;
}) {
  const articles = value ?? [];
  const [selected, setSelected] = useState("");
  const [creating, setCreating] = useState(false);
  const [blog, setBlog] = useState<AuthoredArticle["blog"]>("news");
  const [handle, setHandle] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [removing, setRemoving] = useState(false);
  const article = articles.find(item => identity(item) === selected) ?? articles[0];
  function update(patch: Partial<AuthoredArticle>) {
    if (article) onChange(articles.map(item => identity(item) === identity(article) ? { ...item, ...patch } : item));
  }
  function addArticle() {
    const next: AuthoredArticle = { blog, handle, title, excerpt: "", blocks: [newAuthoredBlock("paragraph")] };
    // Validate the new identity and staff title without requiring unfinished local
    // bodies to be valid. This temporary body is never stored; Save draft still
    // validates every actual block through the complete storefront schema.
    const validation = authoredArticlesSchema.safeParse([{ ...next, blocks: [{ ...next.blocks[0], text: title }] }]);
    if (!validation.success) { setError(validation.error.issues.map(issue => issue.message).join(". ")); return; }
    if (articles.some(item => identity(item) === identity(next))) { setError("Article routes must be unique"); return; }
    if (articles.length >= 20) { setError("Use at most 20 authored articles"); return; }
    onChange([...articles, next]); setSelected(identity(next)); setCreating(false); setRemoving(false); setError(""); setHandle(""); setTitle("");
  }
  return <section className="admin-authored-articles" aria-label="New articles editor" onKeyDown={event => {
    if (event.key === "Enter" && event.target instanceof window.HTMLInputElement && event.target.type === "text") event.preventDefault();
  }}>
    <h2>Write new articles</h2>
    <p>Create articles with text, headings, lists, quotations, links and images. Save draft and Publish draft apply to the whole storefront. Nothing here becomes public until an administrator publishes the draft.</p>
    <p>Publication dates are assigned on first publication. An article address stays fixed; remove and recreate the article to use a different address.</p>
    <button type="button" disabled={articles.length >= 20 || creating} onClick={() => { setCreating(true); setError(""); setRemoving(false); }}>New article</button>
    <small>{articles.length} of 20 articles</small>
    {creating && <div aria-label="New article details" className="admin-fields">
      <label className="admin-field"><span>New article blog</span><select aria-label="New article blog" value={blog} onChange={event => setBlog(event.target.value as AuthoredArticle["blog"])}>{blogHandles.map(item => <option key={item} value={item}>{blogLabels[item]}</option>)}</select></label>
      <Field label="New article slug" value={handle} maxLength={120} onChange={setHandle} />
      <p>Use lowercase letters, numbers and single hyphens. Preview address: /blogs/{blog}/{handle || "your-slug"}</p>
      <Field label="New article title" value={title} maxLength={300} onChange={setTitle} />
      {error && <p role="alert">{error}</p>}
      <button type="button" onClick={addArticle}>Add article to draft</button>
      <button type="button" onClick={() => { setCreating(false); setError(""); }}>Cancel new article</button>
    </div>}
    {article && <>
      <label className="admin-field"><span>Authored article</span><select aria-label="Authored article" value={identity(article)} onChange={event => { setSelected(event.target.value); setRemoving(false); }}>{articles.map(item => <option key={identity(item)} value={identity(item)}>{item.title || "Untitled article"} · {blogLabels[item.blog]}</option>)}</select></label>
      <p>Address: /blogs/{identity(article)}</p>
      <p>{article.publishedAt ? `First published: ${article.publishedAt}` : "Not published yet"}</p>
      <div className="admin-editor-preview" key={identity(article)}>
        <div className="admin-fields">
          <Field label="Authored article title" value={article.title} maxLength={300} onChange={title => update({ title })} />
          <Field label="Authored article excerpt" value={article.excerpt} maxLength={2000} multiline onChange={excerpt => update({ excerpt })} />
          <MediaPicker label="Article cover" value={article.cover?.src ?? ""} session={session} onExpired={onExpired} onChange={src => update({ cover: src ? { src, alt: article.cover?.alt ?? "" } : null })} />
          {article.cover && <Field label="Cover image description" value={article.cover.alt} maxLength={200} onChange={alt => update({ cover: { ...article.cover!, alt } })} />}
          <AuthoredBlockFields value={article.blocks} onChange={blocks => update({ blocks })} session={session} onExpired={onExpired} />
          <div className="admin-delete"><button type="button" onClick={() => setRemoving(true)}>Remove article</button>
            {removing && <div role="alert"><p>Remove “{article.title}” and all its blocks from this draft? This takes effect publicly only when the whole draft is published. Saved versions remain in History.</p><button type="button" onClick={() => { onChange(articles.filter(item => identity(item) !== identity(article))); setSelected(""); setRemoving(false); }}>Confirm remove article</button><button type="button" onClick={() => setRemoving(false)}>Keep article</button></div>}
          </div>
        </div>
        <aside className="admin-preview" aria-label="Authored article preview">
          <h3>Local article preview</h3><h4>{article.title || "Untitled article"}</h4><p>{article.excerpt}</p>
          {article.cover && contentImageSchema.safeParse(article.cover.src).success && <img src={previewImage(article.cover.src)} alt={article.cover.alt} width={480} height={320} style={{ width: "100%", height: "auto" }} />}
          <div className="store-prose"><AuthoredArticleBody blocks={article.blocks} preview /></div>
          <small>Local preview · /blogs/{identity(article)}</small>
        </aside>
      </div>
    </>}
  </section>;
}
