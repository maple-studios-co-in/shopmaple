"use client";
import { useState } from "react";
import { authoredArticlesSchema, blogHandles, contentImageSchema, type AuthoredArticle } from "@shopmaple/contracts";
import { AuthoredArticleBody } from "@/components/authored-article-body";
import type { StaffSession } from "./dashboard";
import { Field } from "./field";
import { AuthoredBlockFields, ignoreTextEnter, newAuthoredBlock } from "./authored-block-fields";
import { MediaPicker, mediaPreviewUrl } from "./media-picker";
import { Newspaper, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelectOption } from "@/components/ui/native-select";
import { EmptyState, Notice } from "./crm-primitives";
import {
  ActionButton, ConfirmPanel, DangerZone, EditorWithPreview, FieldGrid, Hint, PreviewPanel, PreviewTitle, SectionHeading, SelectField, dangerButton,
} from "./kit";

const identity = (article: AuthoredArticle) => `${article.blog}/${article.handle}`;
const blogLabels: Record<AuthoredArticle["blog"], string> = { news: "News", "buying-guidelines": "Buying guidelines", "life-culture": "Life & culture", "recent-stories": "Recent stories" };
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
    // Checks the route and title only (the title stands in as the body); Save draft validates the real blocks.
    const validation = authoredArticlesSchema.safeParse([{ ...next, blocks: [{ ...next.blocks[0], text: title }] }]);
    if (!validation.success) { setError(validation.error.issues.map(issue => issue.message).join(". ")); return; }
    if (articles.some(item => identity(item) === identity(next))) { setError("Article routes must be unique"); return; }
    if (articles.length >= 20) { setError("Use at most 20 authored articles"); return; }
    onChange([...articles, next]); setSelected(identity(next)); setCreating(false); setRemoving(false); setError(""); setHandle(""); setTitle("");
  }
  const newArticleButton = <ActionButton icon={Plus} variant="default" size="default" disabled={articles.length >= 20 || creating}
    onClick={() => { setCreating(true); setError(""); setRemoving(false); }}>New article</ActionButton>;
  return <section aria-label="New articles editor" className="mt-10 border-t border-line-soft pt-8" onKeyDown={ignoreTextEnter}>
    <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <SectionHeading className="m-0" description="Create articles with text, headings, lists, quotations, links and images. Save draft and Publish draft apply to the whole storefront. Nothing here becomes public until an administrator publishes the draft.">
        Write new articles
      </SectionHeading>
      {(articles.length > 0 || creating) && <div className="flex items-center gap-3">
        <small className="text-xs text-muted-foreground tabular-nums">{articles.length} of 20 articles</small>
        {newArticleButton}
      </div>}
    </div>
    <Hint className="mb-5">Publication dates are assigned on first publication. An article address stays fixed; remove and recreate the article to use a different address.</Hint>
    {articles.length === 0 && !creating && <EmptyState title="No new articles yet" icon={<Newspaper strokeWidth={1.5} />} action={newArticleButton}>
      Start an article in one of the four blogs. It stays in your draft until the draft is published.
    </EmptyState>}
    {creating && <div aria-label="New article details" className="mb-6 grid gap-4 rounded-lg border border-border bg-card p-4 shadow-xs sm:p-5">
      <SectionHeading as="h4" className="m-0">New article</SectionHeading>
      <FieldGrid>
        <SelectField label="New article blog" value={blog} onChange={event => setBlog(event.target.value as AuthoredArticle["blog"])}>
          {blogHandles.map(item => <NativeSelectOption key={item} value={item}>{blogLabels[item]}</NativeSelectOption>)}
        </SelectField>
        <Field label="New article title" value={title} maxLength={300} onChange={setTitle} />
        <Field label="New article slug" value={handle} maxLength={120} onChange={setHandle} />
        <Hint>Use lowercase letters, numbers and single hyphens. Preview address:{" "}
          <span className="font-medium text-foreground [overflow-wrap:anywhere]">/blogs/{blog}/{handle || "your-slug"}</span></Hint>
      </FieldGrid>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={addArticle}>Add article to draft</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => { setCreating(false); setError(""); }}>Cancel new article</Button>
      </div>
    </div>}
    {article && <>
      <div className="mb-6 flex flex-wrap items-end gap-x-6 gap-y-3">
        <SelectField label="Authored article" className="w-full max-w-sm" value={identity(article)}
          onChange={event => { setSelected(event.target.value); setRemoving(false); }}>
          {articles.map(item => <NativeSelectOption key={identity(item)} value={identity(item)}>
            {item.title || "Untitled article"} · {blogLabels[item.blog]}
          </NativeSelectOption>)}
        </SelectField>
        <dl className="grid gap-0.5 pb-1 text-xs">
          <div className="flex gap-1.5"><dt className="text-muted-foreground">Address:</dt>
            <dd className="font-medium [overflow-wrap:anywhere]">/blogs/{identity(article)}</dd></div>
          <div className="flex gap-1.5"><dt className="sr-only">Status</dt>
            <dd className="text-muted-foreground">{article.publishedAt ? `First published: ${article.publishedAt}` : "Not published yet"}</dd></div>
        </dl>
      </div>
      <EditorWithPreview key={identity(article)}>
        <div>
          <FieldGrid>
            <Field label="Authored article title" value={article.title} maxLength={300} className="sm:col-span-2" onChange={title => update({ title })} />
            <Field label="Authored article excerpt" value={article.excerpt} maxLength={2000} multiline onChange={excerpt => update({ excerpt })} />
            <MediaPicker label="Article cover" value={article.cover?.src ?? ""} session={session} onExpired={onExpired}
              onChange={src => update({ cover: src ? { src, alt: article.cover?.alt ?? "" } : null })} />
            {article.cover && <Field label="Cover image description" value={article.cover.alt} maxLength={200} className="sm:col-span-2"
              onChange={alt => update({ cover: { ...article.cover!, alt } })} />}
          </FieldGrid>
          <AuthoredBlockFields value={article.blocks} onChange={blocks => update({ blocks })} session={session} onExpired={onExpired} />
          <DangerZone note={removing ? undefined : "Removal stays in your draft until it is published. Saved versions remain in History."}>
            <ActionButton icon={Trash2} variant="ghost" className={dangerButton} onClick={() => setRemoving(true)}>Remove article</ActionButton>
            {removing && <ConfirmPanel confirm="Confirm remove article" cancel="Keep article" onCancel={() => setRemoving(false)}
              onConfirm={() => { onChange(articles.filter(item => identity(item) !== identity(article))); setSelected(""); setRemoving(false); }}>
              Remove “{article.title}” and all its blocks from this draft? This takes effect publicly only when the whole draft is published. Saved versions remain in History.
            </ConfirmPanel>}
          </DangerZone>
        </div>
        <PreviewPanel aria-label="Authored article preview" eyebrow="Local article preview" footnote={<>Local preview · /blogs/{identity(article)}</>}>
          <PreviewTitle>{article.title || "Untitled article"}</PreviewTitle>
          {article.excerpt && <p className="text-muted-foreground">{article.excerpt}</p>}
          {article.cover && contentImageSchema.safeParse(article.cover.src).success && <img src={mediaPreviewUrl(article.cover.src)} alt={article.cover.alt}
            width={480} height={320} className="h-auto w-full rounded-md bg-sunken object-contain" />}
          <div className="store-prose"><AuthoredArticleBody blocks={article.blocks} preview /></div>
        </PreviewPanel>
      </EditorWithPreview>
    </>}
  </section>;
}
