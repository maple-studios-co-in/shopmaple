"use client";
import { useState } from "react";
import type { EditorialContent, EditorialNode, EditorialPolicy, EditorialBlog, EditorialArticle } from "@shopmaple/contracts";
import { resolveEditorialContent } from "@/lib/editorial-content-defaults";
import { StoreContent } from "@/components/store-content";
import { Field } from "./forms";

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
    if (!labels[node.tag]) return <div key={index}>{children}</div>;
    return <details key={index}>
      <summary>{labels[node.tag]} · {previewText(node.children) || "Empty text"}</summary>
      <div className="admin-fields">{children}</div>
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
    <h2>Policies &amp; blogs</h2>
    <p>Edit the existing pages. Changes stay in your draft until published. Original formatting, page addresses, publication dates and artwork stay in place.</p>
    <label className="admin-field"><span>Policy or blog page</span>
      <select aria-label="Policy or blog page" value={selected} onChange={event => setSelected(event.target.value)}>
        <optgroup label="Policies">{Object.entries(resolved.policies).map(([slug, item]) => <option key={slug} value={`policy:${slug}`}>{item.title}</option>)}</optgroup>
        <optgroup label="Blog pages">{resolved.blogs.map(item => <option key={item.handle} value={`blog:${item.handle}`}>{item.title}</option>)}</optgroup>
        <optgroup label="Articles">{resolved.blogs.flatMap(item => item.articles.map(post => <option key={`${item.handle}/${post.handle}`} value={`article:${item.handle}/${post.handle}`}>{post.title}</option>))}</optgroup>
      </select>
    </label>
    {document && <div className="admin-editor-preview" key={selected}>
      <div>
        <Field label="Editorial page title" value={document.title} maxLength={article ? 300 : 160} onChange={title => update({ title })} />
        {article && <Field label="Article excerpt" value={article.excerpt} maxLength={2000} multiline onChange={excerpt => update({ excerpt })} />}
        {content && <><h3>Page text</h3><p>Open a paragraph, heading, list or table to edit its text. HTML is treated as text.</p>
          <TextFields nodes={content} original={original ?? []} onChange={content => update({ content })} />
        </>}
      </div>
      <aside className="admin-preview" aria-label="Editorial preview">
        <h3>Text preview</h3><h4>{document.title}</h4>
        {article && <p>{article.excerpt}</p>}
        {content && <div className="store-prose"><StoreContent nodes={content} /></div>}
        <small>Local preview · {url}</small>
      </aside>
    </div>}
  </section>;
}
