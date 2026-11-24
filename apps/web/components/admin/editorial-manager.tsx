"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { ArrowLeft, BookOpen, Copy, Eye, EyeOff, FileText, Newspaper, Pencil, Plus, RotateCcw, Search, Trash2, type LucideIcon } from "lucide-react";
import { authoredArticleLimit, templateMediaKeys, type EditorialNode, type StorefrontContent } from "@shopmaple/contracts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelectOption } from "@/components/ui/native-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import * as admin from "@/lib/editorial-admin";
import { cn } from "@/lib/utils";
import { ignoreTextEnter } from "./authored-block-fields";
import { EmptyState, Notice, formatDate } from "./crm-primitives";
import type { StaffSession } from "./dashboard";
import { Field } from "./field";
import { CheckField, ConfirmPanel, ContentPanel, FieldGrid, Hint, SectionHeading, SelectField } from "./kit";
import { MediaPicker } from "./media-picker";

// The editor (TipTap and ProseMirror) loads only when a policy or article is opened, not with the whole admin.
const RichTextEditor = dynamic(() => import("./rich-text-editor").then((module) => module.RichTextEditor), {
  ssr: false,
  loading: () => <div aria-busy="true" className="min-h-[480px] animate-pulse rounded-lg border border-input bg-surface" />,
});

type Section = "policies" | "articles" | "blogs";
type Opened = Record<Section, string | null>;
/** A page chosen in the live preview (click-to-edit): "policy:<slug>", "blog:<handle>" or "article:<blog>/<handle>". */
export type EditorialRequest = { choice: string; at: number };
function fromRequest(request?: EditorialRequest | null): { section: Section; id: string } | null {
  const [kind, id] = (request?.choice ?? "").split(/:(.*)/s);
  if (!id) return null;
  return kind === "policy" ? { section: "policies", id } : kind === "blog" ? { section: "blogs", id } : kind === "article" ? { section: "articles", id } : null;
}
type Confirming = { action: "delete" | "restore"; id: string } | null;
type Props = {
  content: StorefrontContent; onChange: (content: StorefrontContent) => void; disabled?: boolean;
  session?: StaffSession; onExpired?: () => void;
  /** The storefront address of what is open, so the live preview shows it; `initial` is the report as the screen opens. */
  onPageChange?: (address: string, initial: boolean) => void;
  request?: EditorialRequest | null;
};

/**
 * Policies, blog articles and blogs (owner, 24 Nov 2026: "all CRUD operations properly functional that is all delete
 * add new articles and all and if any section is missing add them"): each section lists everything with its state, and
 * opens one item at a time in a full editor. Imported pages can be edited, hidden and restored to their original; pages
 * staff add can also be duplicated, moved to a new address and deleted. Everything stays in the draft until published.
 */
export function EditorialManager({ content, onChange, disabled = false, session, onExpired, onPageChange, request }: Props) {
  const asked = fromRequest(request);
  const [section, setSection] = useState<Section>(asked?.section ?? "policies");
  const [opened, setOpened] = useState<Opened>(() => {
    const initial: Opened = { policies: null, articles: null, blogs: null };
    if (asked) initial[asked.section] = asked.id;
    return initial;
  });
  const [notice, setNotice] = useState("");
  const [blogFilter, setBlogFilter] = useState("all");
  /** A new article started from a blog's page goes into that blog. */
  const [newArticleBlog, setNewArticleBlog] = useState<string | null>(null);
  const media = session && onExpired ? { session, onExpired } : undefined;
  // A page clicked in the live preview opens here.
  const lastRequest = useRef(request?.at);
  useEffect(() => {
    if (!request || request.at === lastRequest.current) return;
    lastRequest.current = request.at;
    const next = fromRequest(request);
    if (!next) return;
    setSection(next.section);
    setOpened(current => ({ ...current, [next.section]: next.id }));
    setNotice("");
  }, [request]);
  const policies = admin.policyList(content), blogs = admin.blogList(content), articles = admin.articleList(content);
  // The live preview follows what is open; a list shows its first page that is on the site.
  const open = opened[section];
  const address = section === "policies" ? admin.policyPath(open ?? policies.find(item => !item.hidden)?.slug ?? "privacy-policy")
    : section === "blogs" ? admin.blogPath(open ?? blogs.find(item => !item.hidden)?.handle ?? "recent-stories")
    : open ? admin.articlePath(open) : admin.blogPath(blogFilter !== "all" ? blogFilter : blogs.find(item => !item.hidden)?.handle ?? "recent-stories");
  const reported = useRef(false);
  useEffect(() => { onPageChange?.(address, !reported.current); reported.current = true; }, [address]); // eslint-disable-line react-hooks/exhaustive-deps
  const openItem = (target: Section, id: string | null) => {
    setSection(target);
    setOpened(current => ({ ...current, [target]: id }));
    setNotice("");
  };
  const apply = (next: StorefrontContent, message = "") => { onChange(next); setNotice(message); };
  const shared = { content, apply, disabled, media, notice, setNotice };
  return <section aria-label="Policies and blogs" onKeyDown={ignoreTextEnter}>
    <Tabs value={section} onValueChange={value => { setSection(value as Section); setNotice(""); }}>
      <TabsList variant="line" aria-label="Policies and blogs sections" className="mb-5 h-auto w-full justify-start gap-4 border-b border-line-soft pb-1.5">
        <SectionTab value="policies" icon={FileText} label="Policies" count={policies.length} />
        <SectionTab value="articles" icon={Newspaper} label="Articles" count={articles.length} />
        <SectionTab value="blogs" icon={BookOpen} label="Blogs" count={blogs.length} />
      </TabsList>
      <TabsContent value="policies">
        {opened.policies && admin.policyView(content, opened.policies)
          ? <PolicyEditor key={opened.policies} slug={opened.policies} {...shared} onOpen={id => openItem("policies", id)} />
          : <PolicyList {...shared} items={policies} onOpen={id => openItem("policies", id)} />}
      </TabsContent>
      <TabsContent value="articles">
        {opened.articles && admin.articleView(content, opened.articles)
          ? <ArticleEditor key={opened.articles} id={opened.articles} {...shared} blogs={blogs} onOpen={id => openItem("articles", id)} />
          : <ArticleList {...shared} items={articles} blogs={blogs} filter={blogFilter} onFilter={setBlogFilter} onOpen={id => openItem("articles", id)}
            newBlog={newArticleBlog} onNewBlogUsed={() => setNewArticleBlog(null)} />}
      </TabsContent>
      <TabsContent value="blogs">
        {opened.blogs && admin.blogView(content, opened.blogs)
          ? <BlogEditor key={opened.blogs} handle={opened.blogs} {...shared} articles={articles} onOpen={id => openItem("blogs", id)}
            onOpenArticle={id => openItem("articles", id)} onNewArticle={handle => { setNewArticleBlog(handle); openItem("articles", null); }} />
          : <BlogList {...shared} items={blogs} onOpen={id => openItem("blogs", id)} />}
      </TabsContent>
    </Tabs>
  </section>;
}

type Shared = {
  content: StorefrontContent; apply: (next: StorefrontContent, message?: string) => void; disabled: boolean;
  media?: { session: StaffSession; onExpired: () => void }; notice: string; setNotice: (notice: string) => void;
};

function SectionTab({ value, icon: Icon, label, count }: { value: Section; icon: LucideIcon; label: string; count: number }) {
  return <TabsTrigger value={value} className="flex-none px-1 pb-2">
    <Icon aria-hidden="true" strokeWidth={1.75} />{label}
    <span className="rounded-full bg-muted px-1.5 text-2xs font-medium tabular-nums text-muted-foreground">{count}</span>
  </TabsTrigger>;
}

// ---------- Shared pieces ----------

/** What happened, said once where the list or editor starts (and read out by screen readers). */
function Status({ notice }: { notice: string }) {
  return notice ? <Notice tone="status" className="mb-4">{notice}</Notice> : null;
}
function ListHeader({ title, description, count, action }: { title: string; description: ReactNode; count?: ReactNode; action: ReactNode }) {
  return <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
    <SectionHeading className="m-0" description={description}>{title}</SectionHeading>
    <div className="flex items-center gap-3">{count && <small className="text-xs text-muted-foreground tabular-nums">{count}</small>}{action}</div>
  </div>;
}
function IconAction({ label, icon: Icon, onClick, disabled, danger = false }: { label: string; icon: LucideIcon; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return <Button type="button" variant="ghost" size="icon-sm" aria-label={label} title={label} disabled={disabled} onClick={onClick}
    className={cn(danger && "text-danger hover:bg-danger-bg hover:text-danger")}><Icon aria-hidden="true" /></Button>;
}
function StateBadges({ hidden, edited, added, extra }: { hidden?: boolean; edited?: boolean; added?: boolean; extra?: ReactNode }) {
  return <>
    {hidden && <Badge variant="outline" className="gap-1 border-danger/30 text-danger"><EyeOff aria-hidden="true" />Hidden</Badge>}
    {edited && <Badge variant="secondary">Edited</Badge>}
    {added && <Badge variant="outline">Added</Badge>}
    {extra}
  </>;
}
/** One row of a list: the item's name opens it; its address and state beside; quick actions at the end. */
function Row({ id, title, address, meta, badges, actions, children, onOpen }: {
  id: string; title: string; address: string; meta?: ReactNode; badges: ReactNode; actions: ReactNode; children?: ReactNode; onOpen: () => void;
}) {
  return <li className="grid gap-3 px-4 py-3 sm:px-5" data-editorial-item={id}>
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="min-w-0 flex-1 basis-64">
        <button type="button" data-editorial-open={id} onClick={onOpen}
          className="rounded-sm text-left text-sm font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          {title || "Untitled"}
        </button>
        <p className="mt-0.5 text-xs text-muted-foreground [overflow-wrap:anywhere]">{address}{meta && <> · {meta}</>}</p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">{badges}</div>
      <div className="flex items-center gap-0.5">{actions}</div>
    </div>
    {children}
  </li>;
}
const listClass = "divide-y divide-line-soft overflow-hidden rounded-lg border border-border bg-card shadow-xs";
/** The top of an open item: back to the list, its name and address, and what can be done with it. */
function EditorHeader({ back, onBack, title, address, badges, actions }: {
  back: string; onBack: () => void; title: string; address: ReactNode; badges: ReactNode; actions: ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
  return <div className="mb-6 grid gap-3">
    <div><Button type="button" variant="ghost" size="sm" className="-ml-2 gap-1.5 text-muted-foreground" onClick={onBack}><ArrowLeft aria-hidden="true" />{back}</Button></div>
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h3 ref={heading} tabIndex={-1} className="font-display text-2xl leading-tight text-balance outline-none">{title || "Untitled"}</h3>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span className="[overflow-wrap:anywhere]">{address}</span>{badges}</div>
      </div>
      <div className="flex flex-wrap gap-2">{actions}</div>
    </div>
  </div>;
}
/** Back to the list, with the keyboard on the row just left. */
function backTo(onOpen: (id: string | null) => void, id: string) {
  onOpen(null);
  // Addresses are lowercase letters, numbers, hyphens and a slash, so they sit in the selector as they are.
  setTimeout(() => document.querySelector<HTMLElement>(`[data-editorial-open="${id}"]`)?.focus());
}
/** The address part a title suggests, until staff type their own. */
function useAddress(title: string, max: number) {
  const [typed, setTyped] = useState<string | null>(null);
  return [typed ?? admin.slugify(title, max), (value: string) => setTyped(value.toLowerCase().replace(/\s+/g, "-"))] as const;
}
function NewForm({ label, children, error, submit, onSubmit, onCancel }: {
  label: string; children: ReactNode; error: string; submit: string; onSubmit: () => void; onCancel: () => void;
}) {
  return <div role="group" aria-label={label} className="mb-5 grid gap-4 rounded-lg border border-border bg-card p-4 shadow-xs sm:p-5"
    onKeyDown={event => {
      if (event.key === "Enter" && (event.target as HTMLElement).tagName === "INPUT") { event.preventDefault(); onSubmit(); }
      if (event.key === "Escape") onCancel();
    }}>
    <SectionHeading as="h4" className="m-0">{label}</SectionHeading>
    {children}
    {error && <Notice tone="error">{error}</Notice>}
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" onClick={onSubmit}>{submit}</Button>
      <Button type="button" variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
    </div>
  </div>;
}
/** Text that cannot be left empty says so under its field. */
const Missing = ({ when, children }: { when: boolean; children: ReactNode }) => when ? <p className="-mt-2 text-xs text-danger">{children}</p> : null;
/** Where a hidden or deleted page is still linked from text, which publishing would refuse. */
function linkWarning(content: StorefrontContent, paths: string[], except?: string) {
  const places = admin.textLinksTo(content, paths, except);
  if (!places.length) return "";
  const list = places.length > 3 ? `${places.slice(0, 3).join(", ")} and ${places.length - 3} more` : places.join(" and ");
  return ` Text in ${list} links to it: change ${places.length === 1 ? "that link" : "those links"} before publishing.`;
}
const chromeNote = (content: StorefrontContent, paths: string[], verb: string) =>
  admin.chromeLinksTo(content, paths) ? ` Its menu and footer links are ${verb} too.` : "";
/** The rich text with a short guide above it. */
function TextEditor({ label, description, value, onChange, disabled, media, placeholder }: {
  label: string; description: ReactNode; value: EditorialNode[]; onChange: (value: EditorialNode[]) => void; disabled: boolean;
  media?: Shared["media"]; placeholder: string;
}) {
  return <div className="grid gap-2">
    <SectionHeading as="h4" className="m-0" description={description}>{label}</SectionHeading>
    <RichTextEditor label={label} value={value} onChange={onChange} disabled={disabled} media={media} placeholder={placeholder} />
  </div>;
}
/** What a search engine shows for the page, with its look as a result. */
function SearchListing({ title, description, fallbackTitle, fallbackDescription, address, onTitle, onDescription }: {
  title: string; description: string; fallbackTitle: string; fallbackDescription: string; address: string;
  onTitle: (value: string) => void; onDescription: (value: string) => void;
}) {
  return <>
    <FieldGrid>
      <Field label="Title in search results" value={title} maxLength={120} placeholder={fallbackTitle} onChange={onTitle} hint="Leave empty to use the page title." />
      <Field label="Description in search results" value={description} maxLength={300} multiline placeholder={fallbackDescription} onChange={onDescription}
        hint="About 150 characters reads best. Leave empty to let search engines choose." />
    </FieldGrid>
    <figure aria-label="Search result preview" className="grid gap-0.5 rounded-lg border border-line-soft bg-surface p-4">
      <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{address}</p>
      <p className="text-[17px] leading-snug text-[#1a0dab] [overflow-wrap:anywhere]">{title || fallbackTitle || "Untitled"}</p>
      <p className="line-clamp-2 text-[13px] leading-snug text-muted-foreground">{description || fallbackDescription}</p>
    </figure>
  </>;
}
function Picture({ label, value, onChange, media, describe, required = false }: {
  label: string; value: { src: string; alt: string } | null | undefined; onChange: (value: { src: string; alt: string } | null) => void;
  media?: Shared["media"]; describe: string; required?: boolean;
}) {
  if (!media) return <Hint>Sign in again to choose pictures.</Hint>;
  return <>
    <MediaPicker label={label} value={value?.src ?? ""} session={media.session} onExpired={media.onExpired}
      onChange={src => onChange(src ? { src, alt: value?.alt ?? "" } : null)} />
    {value && <Field label={describe} value={value.alt} maxLength={200} onChange={alt => onChange({ ...value, alt })}
      hint="Describe what the picture shows; it is read out to shoppers who cannot see it." />}
    {value && <Missing when={required && !value.alt.trim()}>Describe the picture before saving.</Missing>}
  </>;
}
/** A new address for something staff added, applied on request (links to it follow). */
function AddressPanel({ prefix, current, max, onMove, published, changed = false, children }: {
  prefix: string; current: string; max: number; onMove: (to: string) => string | null; published?: boolean;
  /** Something besides the address part changed (an article's blog). */
  changed?: boolean; children?: ReactNode;
}) {
  const [value, setValue] = useState(current);
  const [error, setError] = useState("");
  useEffect(() => { setValue(current); setError(""); }, [current]);
  return <ContentPanel title="Address">
    {children}
    <Field label="Address" value={value} maxLength={max} onChange={next => { setValue(next.toLowerCase().replace(/\s+/g, "-")); setError(""); }}
      hint={`${prefix}${value || "…"}`} />
    {published && <Hint>This page is on the site now. Once the draft is published it moves to the new address, and the old address shows “not found”.</Hint>}
    <Hint>Links to it in the menu, the footer, pages and articles change to the new address.</Hint>
    {error && <Notice tone="error">{error}</Notice>}
    <div><Button type="button" variant="outline" size="sm" disabled={value === current && !changed} onClick={() => setError(onMove(value) ?? "")}>Change address</Button></div>
  </ContentPanel>;
}

// ---------- Policies ----------

function PolicyList({ content, apply, disabled, notice, items, onOpen }: Shared & { items: admin.PolicyView[]; onOpen: (id: string | null) => void }) {
  const [creating, setCreating] = useState(false);
  const [confirming, setConfirming] = useState<Confirming>(null);
  const added = items.filter(item => !item.imported).length;
  const full = added >= admin.policyCapacity;
  return <>
    <Status notice={notice} />
    <ListHeader title="Policies" description="The policy pages linked from the footer. Edit, hide or restore the originals, or add your own."
      count={`${added} of ${admin.policyCapacity} added`}
      action={<Button type="button" size="sm" disabled={disabled || full || creating} onClick={() => setCreating(true)}><Plus aria-hidden="true" />New policy</Button>} />
    {creating && <NewPolicy content={content} onCancel={() => setCreating(false)} onCreate={(next, slug, title) => {
      onOpen(slug); apply(next, `“${title}” is added to the draft.`); setCreating(false);
    }} />}
    <ul className={listClass} aria-label="Policies">
      {items.map(item => {
        const path = admin.policyPath(item.slug);
        return <Row key={item.slug} id={item.slug} title={item.title} address={path} onOpen={() => onOpen(item.slug)}
          meta={admin.hasText(item.content) ? undefined : "No text yet"}
          badges={<StateBadges hidden={item.hidden} edited={item.edited} added={!item.imported} />}
          actions={<>
            <IconAction label={`Edit ${item.title}`} icon={Pencil} onClick={() => onOpen(item.slug)} />
            <IconAction label={item.hidden ? `Show ${item.title} on the site` : `Hide ${item.title} from the site`} icon={item.hidden ? Eye : EyeOff} disabled={disabled}
              onClick={() => apply(admin.setPolicyHidden(content, item.slug, !item.hidden), item.hidden
                ? `“${item.title}” is shown again once the draft is published.` : `“${item.title}” is hidden: it comes off the site when the draft is published.${chromeNote(content, [path], "turned off")}${linkWarning(content, [path])}`)} />
            {item.imported
              ? <IconAction label={`Restore the original ${item.title}`} icon={RotateCcw} disabled={disabled || (!item.edited && !item.hidden)} onClick={() => setConfirming({ action: "restore", id: item.slug })} />
              : <IconAction label={`Delete ${item.title}`} icon={Trash2} danger disabled={disabled} onClick={() => setConfirming({ action: "delete", id: item.slug })} />}
          </>}>
          {confirming?.id === item.slug && <PolicyConfirm content={content} item={item} action={confirming.action} onCancel={() => setConfirming(null)}
            onDone={(next, message) => { apply(next, message); setConfirming(null); }} />}
        </Row>;
      })}
    </ul>
  </>;
}
function PolicyConfirm({ content, item, action, onCancel, onDone }: {
  content: StorefrontContent; item: admin.PolicyView; action: "delete" | "restore"; onCancel: () => void; onDone: (next: StorefrontContent, message: string) => void;
}) {
  const path = admin.policyPath(item.slug);
  return action === "delete"
    ? <ConfirmPanel confirm="Delete policy" cancel="Keep policy" onCancel={onCancel}
      onConfirm={() => onDone(admin.deletePolicy(content, item.slug), `“${item.title}” is deleted from the draft.${linkWarning(content, [path])}`)}>
      Delete “{item.title}”? It comes off the site when the draft is published.{chromeNote(content, [path], "removed")}{linkWarning(content, [path])} Saved versions stay in History.
    </ConfirmPanel>
    : <ConfirmPanel confirm="Restore original" cancel="Keep my changes" onCancel={onCancel}
      onConfirm={() => onDone(admin.restorePolicy(content, item.slug), `“${item.title}” is back to its original.`)}>
      Put back the original “{admin.policyView({ ...content, editorialContent: undefined }, item.slug)?.title}”? Your changes to its title, text, photo and search listing leave the draft{item.hidden ? ", and it is shown again" : ""}.
    </ConfirmPanel>;
}
function NewPolicy({ content, onCreate, onCancel }: { content: StorefrontContent; onCreate: (next: StorefrontContent, slug: string, title: string) => void; onCancel: () => void }) {
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useAddress(title, 80);
  const room = admin.footerRoom(content);
  const [footer, setFooter] = useState(room > 0);
  const [error, setError] = useState("");
  return <NewForm label="New policy" submit="Create policy" error={error} onCancel={onCancel} onSubmit={() => {
    const result = admin.addPolicy(content, { title, slug, footer: footer && room > 0 });
    if (result.ok) onCreate(result.content, slug, title.trim()); else setError(result.error);
  }}>
    <FieldGrid>
      <Field label="Policy title" value={title} maxLength={160} onChange={value => { setTitle(value); setError(""); }} placeholder="Warranty Policy" />
      <Field label="Address" value={slug} maxLength={80} onChange={value => { setSlug(value); setError(""); }} hint={`/policies/${slug || "…"}`} />
      <CheckField label="Add a link to it in the footer" checked={footer && room > 0} disabled={room <= 0} onChange={event => setFooter(event.currentTarget.checked)}
        description={room > 0 ? "It joins the policy links at the bottom of every page." : `The footer already has ${admin.footerPolicyLinkLimit} policy links; remove one in Navigation & footer first.`} />
    </FieldGrid>
  </NewForm>;
}
function PolicyEditor({ slug, content, apply, disabled, media, notice, onOpen }: Shared & { slug: string; onOpen: (id: string | null) => void }) {
  const policy = admin.policyView(content, slug)!;
  const [confirming, setConfirming] = useState<Confirming>(null);
  const path = admin.policyPath(slug);
  const update = (patch: Parameters<typeof admin.updatePolicy>[2]) => apply(admin.updatePolicy(content, slug, patch));
  const link = admin.footerLink(content, slug), room = admin.footerRoom(content);
  const template = (templateMediaKeys as readonly string[]).includes(`policy-${slug}`);
  return <div>
    <EditorHeader back="All policies" onBack={() => backTo(onOpen, slug)} title={policy.title} address={path}
      badges={<StateBadges hidden={policy.hidden} edited={policy.edited} added={!policy.imported} />}
      actions={<>
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => apply(admin.setPolicyHidden(content, slug, !policy.hidden), policy.hidden
          ? "Shown again once the draft is published." : `Hidden: it comes off the site when the draft is published.${chromeNote(content, [path], "turned off")}${linkWarning(content, [path])}`)}>
          {policy.hidden ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}{policy.hidden ? "Show on site" : "Hide from site"}
        </Button>
        {policy.imported
          ? <Button type="button" variant="outline" size="sm" disabled={disabled || (!policy.edited && !policy.hidden)} onClick={() => setConfirming({ action: "restore", id: slug })}><RotateCcw aria-hidden="true" />Restore original</Button>
          : <Button type="button" variant="outline" size="sm" disabled={disabled} className="text-danger hover:bg-danger-bg hover:text-danger" onClick={() => setConfirming({ action: "delete", id: slug })}><Trash2 aria-hidden="true" />Delete</Button>}
      </>} />
    {confirming && <div className="mb-5"><PolicyConfirm content={content} item={policy} action={confirming.action} onCancel={() => setConfirming(null)}
      onDone={(next, message) => { if (confirming.action === "delete") onOpen(null); apply(next, message); setConfirming(null); }} /></div>}
    <Status notice={notice} />
    {policy.hidden && <Notice tone="info" className="mb-5">This policy is hidden. It is not on the site once the draft is published, and the live preview shows “not found” for it.</Notice>}
    <div className="grid gap-6">
      <div className="grid gap-4">
        <Field label="Policy title" value={policy.title} maxLength={160} onChange={title => update({ title })} />
        <Missing when={!policy.title.trim()}>Give the policy a title before saving.</Missing>
      </div>
      <TextEditor key={slug} label="Policy text" value={policy.content} onChange={value => update({ content: value })} disabled={disabled} media={media}
        placeholder="Start writing the policy. Use Heading for each section."
        description="Each Heading starts a numbered section, listed under “On this page”. Text before the first heading sits under the title." />
      <div className="grid gap-2">
        <ContentPanel title="Footer link">
          {link ? <>
            <Field label="Footer link words" value={link.label} maxLength={120} onChange={label => apply(admin.setFooterLabel(content, slug, label))}
              hint={link.enabled ? "Shown with the policy links at the bottom of every page." : "This footer link is turned off; turn it on in Navigation & footer."} />
            <Missing when={!link.label.trim()}>Write the link's words before saving.</Missing>
            <div><Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => apply(admin.removeFooterLink(content, slug), "Removed from the footer.")}>Remove from footer</Button></div>
          </> : <>
            <Hint>This policy has no link in the footer.</Hint>
            <div><Button type="button" variant="outline" size="sm" disabled={disabled || room <= 0} onClick={() => apply(admin.addFooterLink(content, slug, policy.title), "Added to the footer.")}>
              <Plus aria-hidden="true" />Add to footer</Button></div>
            {room <= 0 && <Hint>The footer holds {admin.footerPolicyLinkLimit} policy links; remove one in Navigation & footer first.</Hint>}
          </>}
        </ContentPanel>
        <ContentPanel title="Photo">
          <Picture label="Policy photo" value={policy.photo} media={media} describe="Photo description" onChange={photo => update({ photo })} />
          <Hint>{template ? "Without a photo of its own, the page shows the photo set for it in Artwork." : "Without a photo of its own, the page shows the Terms of Service photo."}</Hint>
        </ContentPanel>
        <ContentPanel title="Search engine listing">
          <SearchListing title={policy.seoTitle ?? ""} description={policy.seoDescription ?? ""} fallbackTitle={policy.title} fallbackDescription="Search engines choose words from the page."
            address={path} onTitle={seoTitle => update({ seoTitle })} onDescription={seoDescription => update({ seoDescription })} />
        </ContentPanel>
        {!policy.imported && <AddressPanel prefix="/policies/" current={slug} max={80} onMove={to => {
          const result = admin.movePolicy(content, slug, to);
          if (!result.ok) return result.error;
          onOpen(to);
          apply(result.content, `The policy is now at ${admin.policyPath(to)}.`);
          return null;
        }} />}
      </div>
    </div>
  </div>;
}

// ---------- Articles ----------

const dateOf = (article: admin.ArticleView) => article.publishedAt ? `Published ${formatDate(article.publishedAt)}` : "Not published yet";
function ArticleList({ content, apply, disabled, notice, setNotice, items, blogs, filter, onFilter, onOpen, newBlog, onNewBlogUsed }: Shared & {
  items: admin.ArticleView[]; blogs: admin.BlogView[]; filter: string; onFilter: (blog: string) => void; onOpen: (id: string | null) => void;
  newBlog: string | null; onNewBlogUsed: () => void;
}) {
  const [creating, setCreating] = useState(newBlog !== null);
  const [query, setQuery] = useState("");
  const [confirming, setConfirming] = useState<Confirming>(null);
  const written = items.filter(item => item.kind === "authored").length;
  const full = written >= authoredArticleLimit;
  const blogTitle = (handle: string) => blogs.find(blog => blog.handle === handle)?.title ?? handle;
  const hiddenBlog = (handle: string) => !!blogs.find(blog => blog.handle === handle)?.hidden;
  const words = query.trim().toLowerCase();
  const shown = items.filter(item => (filter === "all" || item.blog === filter) && (!words || `${item.title} ${item.excerpt}`.toLowerCase().includes(words)));
  return <>
    <Status notice={notice} />
    <ListHeader title="Articles" description="Every blog article. Write new ones, or edit, hide, duplicate and delete them. A new article goes on the site when the draft is published."
      count={`${written} of ${authoredArticleLimit} written`}
      action={<Button type="button" size="sm" disabled={disabled || full || creating} onClick={() => setCreating(true)}><Plus aria-hidden="true" />New article</Button>} />
    {creating && <NewArticle content={content} blogs={blogs} initialBlog={newBlog ?? (filter !== "all" ? filter : undefined)}
      onCancel={() => { setCreating(false); onNewBlogUsed(); }}
      onCreate={(next, id, title) => { onOpen(id); apply(next, `“${title}” is added to the draft.`); setCreating(false); onNewBlogUsed(); }} />}
    <div className="mb-3 flex flex-wrap items-end gap-3">
      <label className="relative grid min-w-0 flex-1 basis-56 gap-2">
        <span className="text-xs font-medium text-foreground">Find an article</span>
        <Search aria-hidden="true" className="pointer-events-none absolute bottom-3 left-3 size-4 text-muted-foreground" />
        <Input type="search" aria-label="Find an article" value={query} placeholder="Search titles and excerpts" onChange={event => setQuery(event.target.value)} className="h-10 bg-card pl-9 text-sm" />
      </label>
      <SelectField label="Filter by blog" className="w-full max-w-56" value={filter} onChange={event => { onFilter(event.target.value); setNotice(""); }}>
        <NativeSelectOption value="all">All blogs</NativeSelectOption>
        {blogs.map(blog => <NativeSelectOption key={blog.handle} value={blog.handle}>{blog.title}{blog.hidden ? " (hidden)" : ""}</NativeSelectOption>)}
      </SelectField>
    </div>
    <p className="mb-2 text-xs text-muted-foreground" aria-live="polite">{shown.length === items.length ? `${items.length} articles` : `${shown.length} of ${items.length} articles`}</p>
    {shown.length === 0
      ? <EmptyState title={items.length ? "No articles match" : "No articles yet"} icon={<Newspaper strokeWidth={1.5} />}
        action={items.length ? <Button type="button" variant="outline" size="sm" onClick={() => { setQuery(""); onFilter("all"); }}>Show all articles</Button> : undefined}>
        {items.length ? "Try other words, or another blog." : "Write the first article with New article."}
      </EmptyState>
      : <ul className={listClass} aria-label="Articles">
        {shown.map(item => {
          const path = admin.articlePath(item.id);
          return <Row key={item.id} id={item.id} title={item.title} address={path} onOpen={() => onOpen(item.id)}
            meta={<>{blogTitle(item.blog)} · {dateOf(item)}</>}
            badges={<StateBadges hidden={item.hidden} edited={item.edited} added={item.kind === "authored"}
              extra={hiddenBlog(item.blog) && !item.hidden ? <Badge variant="outline">Blog hidden</Badge> : undefined} />}
            actions={<>
              <IconAction label={`Edit ${item.title}`} icon={Pencil} onClick={() => onOpen(item.id)} />
              <IconAction label={item.hidden ? `Show ${item.title} on the site` : `Hide ${item.title} from the site`} icon={item.hidden ? Eye : EyeOff} disabled={disabled}
                onClick={() => apply(admin.setArticleHidden(content, item.id, !item.hidden), item.hidden
                  ? `“${item.title}” is shown once the draft is published.` : `“${item.title}” is hidden: it comes off the site when the draft is published.${chromeNote(content, [path], "turned off")}${linkWarning(content, [path], item.id)}`)} />
              <IconAction label={`Duplicate ${item.title}`} icon={Copy} disabled={disabled || full} onClick={() => {
                const result = admin.duplicateArticle(content, item.id);
                if (result.ok) { onOpen(result.id); apply(result.content, `A hidden copy of “${item.title}” is added. Show it when it is ready.`); }
                else setNotice(result.error);
              }} />
              {item.kind === "imported"
                ? <IconAction label={`Restore the original ${item.title}`} icon={RotateCcw} disabled={disabled || (!item.edited && !item.hidden)} onClick={() => setConfirming({ action: "restore", id: item.id })} />
                : <IconAction label={`Delete ${item.title}`} icon={Trash2} danger disabled={disabled} onClick={() => setConfirming({ action: "delete", id: item.id })} />}
            </>}>
            {confirming?.id === item.id && <ArticleConfirm content={content} item={item} action={confirming.action} onCancel={() => setConfirming(null)}
              onDone={(next, message) => { apply(next, message); setConfirming(null); }} />}
          </Row>;
        })}
      </ul>}
  </>;
}
function ArticleConfirm({ content, item, action, onCancel, onDone }: {
  content: StorefrontContent; item: admin.ArticleView; action: "delete" | "restore"; onCancel: () => void; onDone: (next: StorefrontContent, message: string) => void;
}) {
  const path = admin.articlePath(item.id);
  return action === "delete"
    ? <ConfirmPanel confirm="Delete article" cancel="Keep article" onCancel={onCancel}
      onConfirm={() => onDone(admin.deleteArticle(content, item.id), `“${item.title}” is deleted from the draft.${linkWarning(content, [path], item.id)}`)}>
      Delete “{item.title}”?{item.publishedAt ? " It comes off the site when the draft is published." : " It has not been published."}{chromeNote(content, [path], "removed")}{linkWarning(content, [path], item.id)} Saved versions stay in History.
    </ConfirmPanel>
    : <ConfirmPanel confirm="Restore original" cancel="Keep my changes" onCancel={onCancel}
      onConfirm={() => onDone(admin.restoreArticle(content, item.id), `“${item.title}” is back to its original.`)}>
      Put back the original article? Your changes to its title, excerpt, text, byline and search listing leave the draft{item.hidden ? ", and it is shown again" : ""}.
    </ConfirmPanel>;
}
function BlogSelect({ label, value, blogs, onChange }: { label: string; value: string; blogs: admin.BlogView[]; onChange: (blog: string) => void }) {
  return <SelectField label={label} value={value} onChange={event => onChange(event.target.value)}>
    {blogs.map(blog => <NativeSelectOption key={blog.handle} value={blog.handle}>{blog.title}{blog.hidden ? " (hidden)" : ""}</NativeSelectOption>)}
  </SelectField>;
}
function NewArticle({ content, blogs, initialBlog, onCreate, onCancel }: {
  content: StorefrontContent; blogs: admin.BlogView[]; initialBlog?: string; onCreate: (next: StorefrontContent, id: string, title: string) => void; onCancel: () => void;
}) {
  const [blog, setBlog] = useState(initialBlog && blogs.some(item => item.handle === initialBlog) ? initialBlog : blogs.find(item => !item.hidden)?.handle ?? blogs[0]!.handle);
  const [title, setTitle] = useState("");
  const [handle, setHandle] = useAddress(title, 120);
  const [error, setError] = useState("");
  return <NewForm label="New article" submit="Create article" error={error} onCancel={onCancel} onSubmit={() => {
    const result = admin.addArticle(content, { blog, title, handle });
    if (result.ok) onCreate(result.content, result.id, title.trim()); else setError(result.error);
  }}>
    <FieldGrid>
      <Field label="Article title" value={title} maxLength={300} onChange={value => { setTitle(value); setError(""); }} />
      <BlogSelect label="Blog" value={blog} blogs={blogs} onChange={value => { setBlog(value); setError(""); }} />
      <Field label="Address" value={handle} maxLength={120} onChange={value => { setHandle(value); setError(""); }} hint={`/blogs/${blog}/${handle || "…"}`} />
    </FieldGrid>
  </NewForm>;
}
function ArticleEditor({ id, content, apply, disabled, media, notice, setNotice, blogs, onOpen }: Shared & {
  id: string; blogs: admin.BlogView[]; onOpen: (id: string | null) => void;
}) {
  const article = admin.articleView(content, id)!;
  const [confirming, setConfirming] = useState<Confirming>(null);
  const path = admin.articlePath(id);
  const update = (patch: Parameters<typeof admin.updateArticle>[2]) => apply(admin.updateArticle(content, id, patch));
  const blog = blogs.find(item => item.handle === article.blog);
  const authored = article.kind === "authored";
  const [moveBlog, setMoveBlog] = useState(article.blog);
  return <div>
    <EditorHeader back="All articles" onBack={() => backTo(onOpen, id)} title={article.title} address={<>{path} · {dateOf(article)}</>}
      badges={<StateBadges hidden={article.hidden} edited={article.edited} added={authored} />}
      actions={<>
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => apply(admin.setArticleHidden(content, id, !article.hidden), article.hidden
          ? "Shown once the draft is published." : `Hidden: it comes off the site when the draft is published.${chromeNote(content, [path], "turned off")}${linkWarning(content, [path], id)}`)}>
          {article.hidden ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}{article.hidden ? "Show on site" : "Hide from site"}
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={disabled || (content.authoredArticles?.length ?? 0) >= authoredArticleLimit} onClick={() => {
          const result = admin.duplicateArticle(content, id);
          if (result.ok) { onOpen(result.id); apply(result.content, `This is a hidden copy of “${article.title}”. Show it when it is ready.`); }
          else setNotice(result.error);
        }}><Copy aria-hidden="true" />Duplicate</Button>
        {authored
          ? <Button type="button" variant="outline" size="sm" disabled={disabled} className="text-danger hover:bg-danger-bg hover:text-danger" onClick={() => setConfirming({ action: "delete", id })}><Trash2 aria-hidden="true" />Delete</Button>
          : <Button type="button" variant="outline" size="sm" disabled={disabled || (!article.edited && !article.hidden)} onClick={() => setConfirming({ action: "restore", id })}><RotateCcw aria-hidden="true" />Restore original</Button>}
      </>} />
    {confirming && <div className="mb-5"><ArticleConfirm content={content} item={article} action={confirming.action} onCancel={() => setConfirming(null)}
      onDone={(next, message) => { if (confirming.action === "delete") onOpen(null); apply(next, message); setConfirming(null); }} /></div>}
    <Status notice={notice} />
    {article.hidden && <Notice tone="info" className="mb-5">This article is hidden. It is not on the site once the draft is published, and the live preview shows “not found” for it.</Notice>}
    {!article.hidden && blog?.hidden && <Notice tone="info" className="mb-5">Its blog “{blog.title}” is hidden, so this article is not on the site either.</Notice>}
    <div className="grid gap-6">
      <div className="grid gap-4">
        <Field label="Article title" value={article.title} maxLength={300} onChange={title => update({ title })} />
        <Missing when={!article.title.trim()}>Give the article a title before saving.</Missing>
        <Field label="Excerpt" value={article.excerpt} maxLength={2000} multiline onChange={excerpt => update({ excerpt })}
          hint="Shown under the title on the blog page, and in search results when no description is written." />
      </div>
      <TextEditor key={id} label="Article text" value={article.content} onChange={value => update({ content: value })} disabled={disabled} media={media}
        placeholder="Start writing the article."
        description={article.legacy ? "Written with the earlier block editor: it opens here as rich text, and is kept as rich text once you change it."
          : "Write and format as in a document. Use Image to place a picture from the media library."} />
      <div className="grid gap-2">
        <ContentPanel title="Cover picture">
          {authored
            ? <Picture label="Article cover" value={article.cover} media={media} describe="Cover description" required onChange={cover => update({ cover })} />
            : <Hint>This article's cover is set in Artwork, with the other blog covers.</Hint>}
        </ContentPanel>
        <ContentPanel title="Byline">
          <Field label="Author" value={article.author ?? ""} maxLength={80} onChange={author => update({ author })}
            hint="Shown at the end of the article. Leave empty to keep the sign-off written in the text, if it has one." />
        </ContentPanel>
        <ContentPanel title="Search engine listing">
          <SearchListing title={article.seoTitle ?? ""} description={article.seoDescription ?? ""} fallbackTitle={article.title}
            fallbackDescription={article.excerpt || "Search engines choose words from the article."} address={path}
            onTitle={seoTitle => update({ seoTitle })} onDescription={seoDescription => update({ seoDescription })} />
        </ContentPanel>
        {authored && <AddressPanel prefix={`/blogs/${moveBlog}/`} current={article.handle} max={120} published={!!article.publishedAt} changed={moveBlog !== article.blog}
          onMove={handle => {
            const result = admin.moveArticle(content, id, { blog: moveBlog, handle });
            if (!result.ok) return result.error;
            onOpen(result.id);
            apply(result.content, `The article is now at ${admin.articlePath(result.id)}.`);
            return null;
          }}>
          <BlogSelect label="Blog" value={moveBlog} blogs={blogs} onChange={setMoveBlog} />
        </AddressPanel>}
      </div>
    </div>
  </div>;
}

// ---------- Blogs ----------

function BlogList({ content, apply, disabled, notice, setNotice, items, onOpen }: Shared & { items: admin.BlogView[]; onOpen: (id: string | null) => void }) {
  const [creating, setCreating] = useState(false);
  const [confirming, setConfirming] = useState<Confirming>(null);
  const added = items.filter(item => !item.imported).length;
  const full = added >= admin.blogCapacity;
  return <>
    <Status notice={notice} />
    <ListHeader title="Blogs" description="Each blog has its own page listing its articles. Rename or hide the originals, or add your own."
      count={`${added} of ${admin.blogCapacity} added`}
      action={<Button type="button" size="sm" disabled={disabled || full || creating} onClick={() => setCreating(true)}><Plus aria-hidden="true" />New blog</Button>} />
    {creating && <NewBlog content={content} onCancel={() => setCreating(false)} onCreate={(next, handle, title) => {
      onOpen(handle); apply(next, `“${title}” is added to the draft.`); setCreating(false);
    }} />}
    <ul className={listClass} aria-label="Blogs">
      {items.map(item => {
        const path = admin.blogPath(item.handle);
        const paths = [path, ...admin.articleList(content).filter(article => article.blog === item.handle).map(article => admin.articlePath(article.id))];
        return <Row key={item.handle} id={item.handle} title={item.title} address={path} onOpen={() => onOpen(item.handle)}
          meta={item.articles === 1 ? "1 article" : `${item.articles} articles`}
          badges={<StateBadges hidden={item.hidden} edited={item.edited} added={!item.imported} />}
          actions={<>
            <IconAction label={`Edit ${item.title}`} icon={Pencil} onClick={() => onOpen(item.handle)} />
            <IconAction label={item.hidden ? `Show ${item.title} on the site` : `Hide ${item.title} from the site`} icon={item.hidden ? Eye : EyeOff} disabled={disabled}
              onClick={() => apply(admin.setBlogHidden(content, item.handle, !item.hidden), item.hidden
                ? `“${item.title}” and its articles are shown once the draft is published.`
                : `“${item.title}” is hidden, with its articles: they come off the site when the draft is published.${chromeNote(content, paths, "turned off")}${linkWarning(content, paths)}`)} />
            {item.imported
              ? <IconAction label={`Restore the original ${item.title}`} icon={RotateCcw} disabled={disabled || (!item.edited && !item.hidden)} onClick={() => setConfirming({ action: "restore", id: item.handle })} />
              : <IconAction label={item.articles ? `Delete ${item.title} (move or delete its articles first)` : `Delete ${item.title}`} icon={Trash2} danger disabled={disabled}
                onClick={() => item.articles ? setNotice(`“${item.title}” still has articles. Move them to another blog, or delete them, first.`) : setConfirming({ action: "delete", id: item.handle })} />}
          </>}>
          {confirming?.id === item.handle && <BlogConfirm content={content} item={item} action={confirming.action} onCancel={() => setConfirming(null)}
            onDone={(next, message) => { apply(next, message); setConfirming(null); }} />}
        </Row>;
      })}
    </ul>
  </>;
}
function BlogConfirm({ content, item, action, onCancel, onDone }: {
  content: StorefrontContent; item: admin.BlogView; action: "delete" | "restore"; onCancel: () => void; onDone: (next: StorefrontContent, message: string) => void;
}) {
  const path = admin.blogPath(item.handle);
  if (action === "delete") {
    const result = admin.deleteBlog(content, item.handle);
    return <ConfirmPanel confirm="Delete blog" cancel="Keep blog" onCancel={onCancel}
      onConfirm={() => result.ok ? onDone(result.content, `“${item.title}” is deleted from the draft.${linkWarning(content, [path])}`) : onCancel()}>
      {result.ok ? <>Delete “{item.title}”? Its page comes off the site when the draft is published.{chromeNote(content, [path], "removed")}{linkWarning(content, [path])} Saved versions stay in History.</> : result.error}
    </ConfirmPanel>;
  }
  return <ConfirmPanel confirm="Restore original" cancel="Keep my changes" onCancel={onCancel}
    onConfirm={() => onDone(admin.restoreBlog(content, item.handle), `“${item.title}” is back to its original.`)}>
    Put back the original name of this blog? Your changes to its name and description leave the draft{item.hidden ? ", and it is shown again with its articles" : ""}.
  </ConfirmPanel>;
}
function NewBlog({ content, onCreate, onCancel }: { content: StorefrontContent; onCreate: (next: StorefrontContent, handle: string, title: string) => void; onCancel: () => void }) {
  const [title, setTitle] = useState("");
  const [handle, setHandle] = useAddress(title, 80);
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  return <NewForm label="New blog" submit="Create blog" error={error} onCancel={onCancel} onSubmit={() => {
    const result = admin.addBlog(content, { title, handle, description });
    if (result.ok) onCreate(result.content, handle, title.trim()); else setError(result.error);
  }}>
    <FieldGrid>
      <Field label="Blog name" value={title} maxLength={160} onChange={value => { setTitle(value); setError(""); }} placeholder="Care guides" />
      <Field label="Address" value={handle} maxLength={80} onChange={value => { setHandle(value); setError(""); }} hint={`/blogs/${handle || "…"}`} />
      <Field label="Description for search engines" value={description} maxLength={300} multiline onChange={setDescription} />
    </FieldGrid>
  </NewForm>;
}
function BlogEditor({ handle, content, apply, disabled, notice, articles, onOpen, onOpenArticle, onNewArticle }: Shared & {
  handle: string; articles: admin.ArticleView[]; onOpen: (id: string | null) => void; onOpenArticle: (id: string) => void; onNewArticle: (handle: string) => void;
}) {
  const blog = admin.blogView(content, handle)!;
  const [confirming, setConfirming] = useState<Confirming>(null);
  const path = admin.blogPath(handle);
  const own = articles.filter(article => article.blog === handle);
  const paths = [path, ...own.map(article => admin.articlePath(article.id))];
  const update = (patch: Parameters<typeof admin.updateBlog>[2]) => apply(admin.updateBlog(content, handle, patch));
  return <div>
    <EditorHeader back="All blogs" onBack={() => backTo(onOpen, handle)} title={blog.title} address={path}
      badges={<StateBadges hidden={blog.hidden} edited={blog.edited} added={!blog.imported} />}
      actions={<>
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => apply(admin.setBlogHidden(content, handle, !blog.hidden), blog.hidden
          ? "Shown again, with its articles, once the draft is published."
          : `Hidden, with its articles: they come off the site when the draft is published.${chromeNote(content, paths, "turned off")}${linkWarning(content, paths)}`)}>
          {blog.hidden ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}{blog.hidden ? "Show on site" : "Hide from site"}
        </Button>
        {blog.imported
          ? <Button type="button" variant="outline" size="sm" disabled={disabled || (!blog.edited && !blog.hidden)} onClick={() => setConfirming({ action: "restore", id: handle })}><RotateCcw aria-hidden="true" />Restore original</Button>
          : <Button type="button" variant="outline" size="sm" disabled={disabled} className="text-danger hover:bg-danger-bg hover:text-danger" onClick={() => setConfirming({ action: "delete", id: handle })}><Trash2 aria-hidden="true" />Delete</Button>}
      </>} />
    {confirming && <div className="mb-5"><BlogConfirm content={content} item={blog} action={confirming.action} onCancel={() => setConfirming(null)}
      onDone={(next, message) => { if (confirming.action === "delete") onOpen(null); apply(next, message); setConfirming(null); }} /></div>}
    <Status notice={notice} />
    {blog.hidden && <Notice tone="info" className="mb-5">This blog is hidden, with its articles. They are not on the site once the draft is published.</Notice>}
    <div className="grid gap-6">
      <FieldGrid>
        <Field label="Blog name" value={blog.title} maxLength={160} onChange={title => update({ title })} />
        <Field label="Description for search engines" value={blog.description ?? ""} maxLength={300} multiline onChange={description => update({ description })}
          hint="Search engines may show it under the blog's name." />
      </FieldGrid>
      <Missing when={!blog.title.trim()}>Give the blog a name before saving.</Missing>
      <div>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <SectionHeading as="h4" className="m-0">Articles in this blog</SectionHeading>
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => onNewArticle(handle)}><Plus aria-hidden="true" />New article in this blog</Button>
        </div>
        {own.length === 0 ? <Hint>No articles yet.</Hint> : <ul className={listClass} aria-label="Articles in this blog">
          {own.map(article => <li key={article.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
            <button type="button" onClick={() => onOpenArticle(article.id)}
              className="min-w-0 flex-1 basis-60 rounded-sm text-left text-sm font-medium underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{article.title}</button>
            <span className="text-xs text-muted-foreground">{dateOf(article)}</span>
            <StateBadges hidden={article.hidden} edited={article.edited} added={article.kind === "authored"} />
          </li>)}
        </ul>}
      </div>
      {!blog.imported && <div className="grid gap-2"><AddressPanel prefix="/blogs/" current={handle} max={80} onMove={to => {
        const result = admin.moveBlog(content, handle, to);
        if (!result.ok) return result.error;
        onOpen(to);
        apply(result.content, `The blog is now at ${admin.blogPath(to)}, with its articles.`);
        return null;
      }} /></div>}
    </div>
  </div>;
}
