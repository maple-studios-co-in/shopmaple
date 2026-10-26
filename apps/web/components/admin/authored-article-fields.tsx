"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { authoredArticlesSchema, blogHandles, contentImageSchema, type AuthoredArticle, type AuthoredBlock } from "@shopmaple/contracts";
import { AuthoredArticleBody } from "@/components/authored-article-body";
import type { StaffSession } from "./dashboard";
import { Field } from "./forms";
import { MediaPicker } from "./media-picker";

const identity = (article: AuthoredArticle) => `${article.blog}/${article.handle}`;
const blogLabels: Record<AuthoredArticle["blog"], string> = { news: "News", "buying-guidelines": "Buying guidelines", "life-culture": "Life & culture", "recent-stories": "Recent stories" };
function newBlock(type: Exclude<AuthoredBlock["type"], "image">): AuthoredBlock {
  const id = crypto.randomUUID();
  switch (type) {
    case "heading": return { id, type, level: 2, text: "" };
    case "quote": return { id, type, text: "" };
    case "list": return { id, type, ordered: false, items: [""] };
    case "link": return { id, type, text: "", href: "/collections/all" };
    default: return { id, type, text: "" };
  }
}
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
  const [addingImage, setAddingImage] = useState(false);
  const region = useRef<HTMLElement>(null);
  const focusBlock = useRef<string | null>(null);
  const article = articles.find(item => identity(item) === selected) ?? articles[0];
  useLayoutEffect(() => {
    if (!focusBlock.current) return;
    const id = focusBlock.current;
    focusBlock.current = null;
    region.current?.querySelector<HTMLElement>(`[data-block-id="${id}"] textarea, [data-block-id="${id}"] input, [data-block-id="${id}"] button`)?.focus();
  }, [article?.blocks]);
  function update(patch: Partial<AuthoredArticle>) {
    if (article) onChange(articles.map(item => identity(item) === identity(article) ? { ...item, ...patch } : item));
  }
  function addArticle() {
    const next: AuthoredArticle = { blog, handle, title, excerpt: "", blocks: [newBlock("paragraph")] };
    // Validate the new identity and staff title without requiring unfinished local
    // bodies to be valid. This temporary body is never stored; Save draft still
    // validates every actual block through the complete storefront schema.
    const validation = authoredArticlesSchema.safeParse([{ ...next, blocks: [{ ...next.blocks[0], text: title }] }]);
    if (!validation.success) { setError(validation.error.issues.map(issue => issue.message).join(". ")); return; }
    if (articles.some(item => identity(item) === identity(next))) { setError("Article routes must be unique"); return; }
    if (articles.length >= 20) { setError("Use at most 20 authored articles"); return; }
    onChange([...articles, next]); setSelected(identity(next)); setCreating(false); setRemoving(false); setAddingImage(false); setError(""); setHandle(""); setTitle("");
  }
  function addBlock(block: AuthoredBlock) {
    if (article && article.blocks.length < 60) update({ blocks: [...article.blocks, block] });
  }
  function replaceBlock(id: string, next: AuthoredBlock) {
    if (article) update({ blocks: article.blocks.map(block => block.id === id ? next : block) });
  }
  function moveBlock(index: number, direction: -1 | 1) {
    if (!article || index + direction < 0 || index + direction >= article.blocks.length) return;
    const blocks = [...article.blocks];
    [blocks[index], blocks[index + direction]] = [blocks[index + direction]!, blocks[index]!];
    // A boundary move disables the activated button, which drops native browser
    // focus. Move focus into that same block before the next keyboard action.
    if (index + direction === 0 || index + direction === blocks.length - 1) focusBlock.current = blocks[index + direction]!.id;
    update({ blocks });
  }
  function removeBlock(index: number) {
    if (!article || article.blocks.length <= 1) return;
    const blocks = article.blocks.filter((_, i) => i !== index);
    const next = blocks[Math.min(index, blocks.length - 1)]!;
    focusBlock.current = next.id;
    update({ blocks });
  }
  return <section ref={region} className="admin-authored-articles" aria-label="New articles editor" onKeyDown={event => {
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
      <label className="admin-field"><span>Authored article</span><select aria-label="Authored article" value={identity(article)} onChange={event => { setSelected(event.target.value); setRemoving(false); setAddingImage(false); }}>{articles.map(item => <option key={identity(item)} value={identity(item)}>{item.title || "Untitled article"} · {blogLabels[item.blog]}</option>)}</select></label>
      <p>Address: /blogs/{identity(article)}</p>
      <p>{article.publishedAt ? `First published: ${article.publishedAt}` : "Not published yet"}</p>
      <div className="admin-editor-preview" key={identity(article)}>
        <div className="admin-fields">
          <Field label="Authored article title" value={article.title} maxLength={300} onChange={title => update({ title })} />
          <Field label="Authored article excerpt" value={article.excerpt} maxLength={2000} multiline onChange={excerpt => update({ excerpt })} />
          <MediaPicker label="Article cover" value={article.cover?.src ?? ""} session={session} onExpired={onExpired} onChange={src => update({ cover: src ? { src, alt: article.cover?.alt ?? "" } : null })} />
          {article.cover && <Field label="Cover image description" value={article.cover.alt} maxLength={200} onChange={alt => update({ cover: { ...article.cover!, alt } })} />}
          <h3>Article blocks</h3><p>Keep at least one block. HTML is displayed as text.</p>
          {article.blocks.map((block, index) => <fieldset aria-label="Article block" data-block-id={block.id} key={block.id}>
            <legend>Block {index + 1} · {block.type}</legend>
            {(block.type === "paragraph" || block.type === "quote" || block.type === "heading") && <Field label={`Block ${index + 1} text`} value={block.text} maxLength={block.type === "heading" ? 300 : 8000} multiline={block.type !== "heading"} onChange={text => replaceBlock(block.id, { ...block, text })} />}
            {block.type === "heading" && <label className="admin-field"><span>Heading level</span><select aria-label={`Block ${index + 1} heading level`} value={block.level} onChange={event => replaceBlock(block.id, { ...block, level: Number(event.target.value) as 2 | 3 })}><option value={2}>Heading 2</option><option value={3}>Heading 3</option></select></label>}
            {block.type === "list" && <>
              <Field label={`Block ${index + 1} list items`} value={block.items.join("\n")} maxLength={40019} multiline onChange={text => replaceBlock(block.id, { ...block, items: text.split("\n") })} />
              <p>One item per line; up to 20 items, 2,000 characters each.</p>
              <label><input type="checkbox" aria-label={`Block ${index + 1} numbered list`} checked={block.ordered} onChange={event => replaceBlock(block.id, { ...block, ordered: event.target.checked })} />Numbered list</label>
            </>}
            {block.type === "link" && <>
              <Field label={`Block ${index + 1} link label`} value={block.text} maxLength={300} onChange={text => replaceBlock(block.id, { ...block, text })} />
              <Field label={`Block ${index + 1} link destination`} value={block.href} maxLength={500} onChange={href => replaceBlock(block.id, { ...block, href })} />
              <p>Use a store address such as /collections/all.</p>
            </>}
            {block.type === "image" && <>
              <MediaPicker label={`Block ${index + 1} image`} value={block.src} session={session} onExpired={onExpired} onChange={src => replaceBlock(block.id, { ...block, src })} />
              <Field label={`Block ${index + 1} image description`} value={block.alt} maxLength={200} onChange={alt => replaceBlock(block.id, { ...block, alt })} />
            </>}
            <button type="button" disabled={index === 0} onClick={() => moveBlock(index, -1)}>Move up</button>
            <button type="button" disabled={index === article.blocks.length - 1} onClick={() => moveBlock(index, 1)}>Move down</button>
            <button type="button" disabled={article.blocks.length <= 1} onClick={() => removeBlock(index)}>Remove block</button>
          </fieldset>)}
          <p>{article.blocks.length} of 60 blocks</p>
          <div className="admin-actions">{(["paragraph", "heading", "quote", "list", "link"] as const).map(type => <button key={type} type="button" disabled={article.blocks.length >= 60} onClick={() => addBlock(newBlock(type))}>Add {type}</button>)}
            <button type="button" disabled={article.blocks.length >= 60 || addingImage} onClick={() => setAddingImage(true)}>Add image</button>
          </div>
          {addingImage && <div aria-label="New image block"><MediaPicker label="New block image" value="" session={session} onExpired={onExpired} onChange={src => { if (src) { addBlock({ id: crypto.randomUUID(), type: "image", src, alt: "" }); setAddingImage(false); } }} /><button type="button" onClick={() => setAddingImage(false)}>Cancel image block</button></div>}
          <div className="admin-delete"><button type="button" onClick={() => setRemoving(true)}>Remove article</button>
            {removing && <div role="alert"><p>Remove “{article.title}” and all its blocks from this draft? This takes effect publicly only when the whole draft is published. Saved versions remain in History.</p><button type="button" onClick={() => { onChange(articles.filter(item => identity(item) !== identity(article))); setSelected(""); setRemoving(false); setAddingImage(false); }}>Confirm remove article</button><button type="button" onClick={() => setRemoving(false)}>Keep article</button></div>}
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
