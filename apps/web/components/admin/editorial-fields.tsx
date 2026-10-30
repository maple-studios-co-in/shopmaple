"use client";
import { useState } from "react";
import type { EditorialContent, EditorialNode, EditorialPolicy, EditorialBlog, EditorialArticle } from "@shopmaple/contracts";
import { resolveEditorialContent } from "@/lib/editorial-content-defaults";
import { StoreContent } from "@/components/store-content";
import { ChevronRight } from "lucide-react";
import { NativeSelectOptGroup, NativeSelectOption } from "@/components/ui/native-select";
import { EditorWithPreview, Field, PreviewPanel, PreviewTitle } from "./forms";
import { SectionHeading, SelectField } from "./kit";

const labels: Record<string, string> = {
  p: "Paragraph", h1: "Heading", h2: "Heading 2", h3: "Heading 3", h4: "Heading 4", h5: "Heading 5", h6: "Heading 6",
  ul: "Bullet list", ol: "Numbered list", li: "List item", table: "Table", thead: "Table heading", tbody: "Table body", tr: "Table row", th: "Header cell", td: "Table cell", blockquote: "Quotation",
};
function previewText(nodes: EditorialNode[]): string {
  return nodes.map(node => typeof node === "string" ? node : previewText(node.children)).join("").trim().slice(0, 90);
}
function TextFields({ nodes, original, onChange, path = [] }: {
  nodes: EditorialNode[]; original: EditorialNode[]; onChange: (nodes: EditorialNode[]) => void; path?: number[];
}) {
  return <>{nodes.map((node, index) => {
    const position = [...path, index + 1];
    const identity = position.join(".");
    const baseline = original[index];
    const replace = (next: EditorialNode) => onChange(nodes.map((item, i) => i === index ? next : item));
    if (typeof node === "string") {
      if (!node.trim() && !(typeof baseline === "string" && baseline.trim())) return null;
      return <Field key={index} label={`Text ${identity}`} value={node} maxLength={16000} multiline onChange={replace} />;
    }
    if (node.tag === "br" || node.tag === "hr") return null;
    if (node.tag === "img") return <Field key={index} label={`Image description ${identity}`} value={node.alt ?? ""} maxLength={200} onChange={alt => replace({ ...node, alt })} />;
    const children = <TextFields nodes={node.children} original={typeof baseline === "object" ? baseline.children : []} path={position} onChange={children => replace({ ...node, children })} />;
    if (!labels[node.tag]) return <div key={index} className="grid gap-3">{children}</div>;
    return <details key={index} className="min-w-0 rounded-lg border border-border bg-card shadow-xs open:shadow-sm">
      <summary className="flex min-w-0 cursor-pointer list-none items-center gap-2 rounded-lg px-3 py-2.5 text-sm focus-visible:outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/60 [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden="true" strokeWidth={1.5} className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 ease-admin motion-reduce:transition-none [details[open]>summary>&]:rotate-90" />
        <span className="shrink-0 font-semibold text-foreground">{labels[node.tag]}</span>
        <span className="truncate text-muted-foreground"> · {previewText(node.children) || "Empty text"}</span>
      </summary>
      <div className="grid gap-3 border-t border-line-soft p-3">{children}</div>
    </details>;
  })}</>;
}
export function EditorialFields({ value, onChange }: { value?: EditorialContent; onChange: (value: EditorialContent) => void }) {
  const [selected, setSelected] = useState("policy:privacy-policy");
  const overrides = value ?? { policies: [], blogs: [], articles: [] };
  const resolved = resolveEditorialContent(value);
  const originals = resolveEditorialContent();
  const [kind, identity = ""] = selected.split(":");
  const [blogHandle, articleHandle] = identity.split("/");
  const policy = kind === "policy" && Object.hasOwn(resolved.policies, identity) ? resolved.policies[identity as keyof typeof resolved.policies] : undefined;
  const blog = resolved.blogs.find(item => item.handle === blogHandle);
  const article = kind === "article" ? blog?.articles.find(item => item.handle === articleHandle) : undefined;
  const document = policy ?? article ?? (kind === "blog" ? blog : undefined);
  const content = policy?.content ?? article?.content;
  const original = policy ? originals.policies[identity as keyof typeof originals.policies]?.content
    : originals.blogs.find(item => item.handle === blogHandle)?.articles.find(item => item.handle === articleHandle)?.content;
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
      <NativeSelectOptGroup label="Policies">{Object.entries(resolved.policies).map(([slug, item]) => <NativeSelectOption key={slug} value={`policy:${slug}`}>{item.title}</NativeSelectOption>)}</NativeSelectOptGroup>
      <NativeSelectOptGroup label="Blog pages">{resolved.blogs.map(item => <NativeSelectOption key={item.handle} value={`blog:${item.handle}`}>{item.title}</NativeSelectOption>)}</NativeSelectOptGroup>
      <NativeSelectOptGroup label="Articles">{resolved.blogs.flatMap(item => item.articles.map(post => <NativeSelectOption key={`${item.handle}/${post.handle}`} value={`article:${item.handle}/${post.handle}`}>{post.title}</NativeSelectOption>))}</NativeSelectOptGroup>
    </SelectField>
    {document && <EditorWithPreview key={selected}>
      <div className="grid gap-4">
        <Field label="Editorial page title" value={document.title} maxLength={article ? 300 : 160} onChange={title => update({ title })} />
        {article && <Field label="Article excerpt" value={article.excerpt} maxLength={2000} multiline onChange={excerpt => update({ excerpt })} />}
        {content && <>
          <SectionHeading as="h4" className="mt-4 mb-0" description="Open a paragraph, heading, list or table to edit its text. HTML is treated as text.">Page text</SectionHeading>
          <div className="grid gap-2"><TextFields nodes={content} original={original ?? []} onChange={content => update({ content })} /></div>
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
