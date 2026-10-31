"use client";
import { useState } from "react";
import type { EditorialContent, EditorialNode, EditorialPolicy, EditorialBlog, EditorialArticle } from "@shopmaple/contracts";
import dynamic from "next/dynamic";
// The editor (TipTap and ProseMirror) loads only when a policy or article is opened, not with the whole admin.
const RichTextEditor = dynamic(() => import("./rich-text-editor").then((module) => module.RichTextEditor), { ssr: false });
import { resolveEditorialContent } from "@/lib/editorial-content-defaults";
import { StoreContent } from "@/components/store-content";
import { NativeSelectOptGroup, NativeSelectOption } from "@/components/ui/native-select";
import { Field } from "./field";
import { EditorWithPreview, PreviewPanel, PreviewTitle, SectionHeading, SelectField } from "./kit";

export function EditorialFields({ value, onChange, disabled = false }: { value?: EditorialContent; onChange: (value: EditorialContent) => void; disabled?: boolean }) {
  const [selected, setSelected] = useState("policy:privacy-policy");
  const overrides = value ?? { policies: [], blogs: [], articles: [] };
  const resolved = resolveEditorialContent(value);
  const [kind, identity = ""] = selected.split(":");
  const [blogHandle, articleHandle] = identity.split("/");
  const policy = kind === "policy" && Object.hasOwn(resolved.policies, identity) ? resolved.policies[identity as keyof typeof resolved.policies] : undefined;
  const blog = resolved.blogs.find(item => item.handle === blogHandle);
  const article = kind === "article" ? blog?.articles.find(item => item.handle === articleHandle) : undefined;
  const document = policy ?? article ?? (kind === "blog" ? blog : undefined);
  const content = policy?.content ?? article?.content;
  const url = policy ? `/policies/${identity}` : `/blogs/${identity}`;
  function update(patch: { title?: string; content?: EditorialNode[]; excerpt?: string }) {
    if (policy) {
      const next = { slug: identity, title: policy.title, content: policy.content, ...patch } as EditorialPolicy;
      onChange({ ...overrides, policies: [...overrides.policies.filter(item => item.slug !== identity), next] });
    } else if (article) {
      const next = { blog: blogHandle, handle: articleHandle, title: article.title, excerpt: article.excerpt, content: article.content, ...patch } as EditorialArticle;
      onChange({ ...overrides, articles: [...overrides.articles.filter(item => item.blog !== blogHandle || item.handle !== articleHandle), next] });
    } else if (blog && kind === "blog") {
      const next = { handle: blogHandle, title: patch.title ?? blog.title } as EditorialBlog;
      onChange({ ...overrides, blogs: [...overrides.blogs.filter(item => item.handle !== blogHandle), next] });
    }
  }
  return <section aria-label="Policies and blogs editor">
    <SectionHeading description="Edit the existing pages. Changes stay in your draft until published. Original formatting, page addresses, publication dates and artwork stay in place.">
      Existing policies and blog posts
    </SectionHeading>
    <SelectField label="Policy or blog page" className="mb-6 max-w-md" value={selected} onChange={event => setSelected(event.target.value)}>
      {([
        ["Policies", Object.entries(resolved.policies).map(([slug, item]) => [`policy:${slug}`, item.title])],
        ["Blog pages", resolved.blogs.map(item => [`blog:${item.handle}`, item.title])],
        ["Articles", resolved.blogs.flatMap(item => item.articles.map(post => [`article:${item.handle}/${post.handle}`, post.title]))],
      ] as const).map(([group, options]) => <NativeSelectOptGroup key={group} label={group}>
        {options.map(([key, title]) => <NativeSelectOption key={key} value={key}>{title}</NativeSelectOption>)}
      </NativeSelectOptGroup>)}
    </SelectField>
    {document && <EditorWithPreview key={selected}>
      <div className="grid gap-4">
        <Field label="Editorial page title" value={document.title} maxLength={article ? 300 : 160} onChange={title => update({ title })} />
        {article && <Field label="Article excerpt" value={article.excerpt} maxLength={2000} multiline onChange={excerpt => update({ excerpt })} />}
        {content && <>
          <SectionHeading as="h4" className="mt-4 mb-0" description="Write and format as in a document. Links can go to store pages, Maple Furnishers pages, email or phone.">Page text</SectionHeading>
          <RichTextEditor label="Page text" value={content} disabled={disabled} onChange={content => update({ content })} />
        </>}
      </div>
      <PreviewPanel aria-label="Editorial preview" eyebrow="Text preview" footnote={<>Local preview · {url}</>}>
        <PreviewTitle>{document.title}</PreviewTitle>
        {article && <p className="text-muted-foreground">{article.excerpt}</p>}
        {content && <div className="store-prose"><StoreContent nodes={content} /></div>}
      </PreviewPanel>
    </EditorWithPreview>}
  </section>;
}
