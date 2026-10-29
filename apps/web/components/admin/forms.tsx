"use client";
import { useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { FileText, ImagePlus, Images, Megaphone, Plus, RotateCcw, Trash2 } from "lucide-react";
import type {
  StorefrontContent,
  CampaignContent,
  ContentPage,
} from "@shopmaple/contracts";
import { Button } from "@/components/ui/button";
import { NativeSelectOption } from "@/components/ui/native-select";
import { AuthoredArticleBody } from "@/components/authored-article-body";
import { cn } from "@/lib/utils";
import type { StaffSession } from "./dashboard";
import { MediaPicker } from "./media-picker";
import { CampaignScheduleFields } from "./campaign-schedule-fields";
import { Field } from "./field";
import { EmptyState, Notice } from "./crm-primitives";
import { FieldGrid, PanelHeader, SectionHeading, SelectField } from "./kit";
import { AuthoredBlockFields, newAuthoredBlock } from "./authored-block-fields";
export { Field } from "./field";

type Props = {
  content: StorefrontContent;
  onChange: (content: StorefrontContent) => void;
  session?: StaffSession;
  onExpired?: () => void;
  onScheduleEditingChange?: (editing: boolean) => void;
  /** PageFields only: the index of the page being edited, so the editor can preview it. */
  onSelectedPageChange?: (index: number) => void;
};

/* Layout pieces shared by the content editors (campaigns, pages, policies, articles). */

/** Fields on the left, a sticky local preview on the right; stacks when the panel is narrow. */
export function EditorWithPreview({ className, ...props }: ComponentProps<"div">) {
  return (
    <div className="@container">
      <div className={cn("grid items-start gap-6 @3xl:grid-cols-[minmax(0,1fr)_minmax(240px,0.62fr)] @3xl:gap-8 [&>*]:min-w-0", className)} {...props} />
    </div>
  );
}

/** The local copy preview beside an editor: a raised card that follows the fields as they scroll. */
export function PreviewPanel({ eyebrow, footnote, tone = "card", className, children, ...props }: Omit<ComponentProps<"aside">, "children"> & {
  eyebrow: ReactNode;
  footnote: ReactNode;
  tone?: "card" | "accent";
  children: ReactNode;
}) {
  return (
    <aside
      className={cn(
        "grid gap-3 rounded-xl border p-5 text-[13.5px] leading-relaxed shadow-md [overflow-wrap:anywhere] @3xl:sticky @3xl:top-20",
        tone === "accent" ? "border-transparent bg-primary text-primary-foreground" : "border-border bg-card text-foreground",
        className,
      )}
      {...props}
    >
      <h3 className={cn("text-[11px] font-semibold tracking-[0.06em] uppercase", tone === "accent" ? "text-primary-foreground/80" : "text-faint")}>{eyebrow}</h3>
      {children}
      <small className={cn("mt-2 block border-t pt-3 text-[11.5px]", tone === "accent" ? "border-primary-foreground/20 text-primary-foreground/80" : "border-line-soft text-muted-foreground")}>{footnote}</small>
    </aside>
  );
}

/** The storefront-style title inside a preview card. */
export function PreviewTitle({ className, ...props }: ComponentProps<"h4">) {
  return <h4 className={cn("font-display text-[24px] leading-tight font-normal text-balance", className)} {...props} />;
}

/** A short hint under a group of fields. */
export function Hint({ className, ...props }: ComponentProps<"p">) {
  return <p data-span="full" className={cn("max-w-[68ch] text-[12.5px] leading-relaxed text-muted-foreground", className)} {...props} />;
}

/** An inline confirmation for a destructive step: what will happen, then the two choices. */
export function ConfirmPanel({ children, actions }: { children: ReactNode; actions: ReactNode }) {
  return (
    <div role="alert" className="grid gap-3 rounded-lg border border-danger/25 bg-danger-bg px-4 py-3.5 text-[13px] leading-relaxed text-foreground">
      <p className="max-w-[68ch]">{children}</p>
      <div className="flex flex-wrap gap-2">{actions}</div>
    </div>
  );
}

/** The bottom-of-form removal area, set apart from the fields by a soft divider. */
export function DangerZone({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <div className="mt-8 grid justify-items-start gap-3 border-t border-line-soft pt-5">
      {children}
      {note && <p className="max-w-[68ch] text-[12.5px] text-muted-foreground">{note}</p>}
    </div>
  );
}

export const dangerButton = "text-danger hover:bg-danger-bg hover:text-danger";

export function CampaignFields({
  content,
  onChange,
  session,
  onExpired,
  onScheduleEditingChange,
}: Props) {
  const [selected, setSelected] = useState(0);
  const [scheduleEditing, setScheduleEditing] = useState(false);
  useEffect(() => {
    onScheduleEditingChange?.(scheduleEditing);
    return () => onScheduleEditingChange?.(false);
  }, [scheduleEditing, onScheduleEditingChange]);
  const campaign = content.campaigns[selected];
  function update(patch: Partial<CampaignContent>) {
    onChange({
      ...content,
      campaigns: content.campaigns.map((value, index) =>
        index === selected ? { ...value, ...patch } : value,
      ),
    });
  }
  return (
    <>
      <PanelHeader
        title="Campaigns"
        description="Update campaign copy, destination and artwork. Original artwork stays in place until you choose a replacement."
      />
      {!campaign ? (
        <EmptyState title="No campaigns in this draft" icon={<Megaphone strokeWidth={1.5} />}>
          Campaigns come with the storefront theme. To bring them back, restore an earlier version from History.
        </EmptyState>
      ) : (
        <>
          <SelectField
            label="Campaign"
            className="mb-6 max-w-sm"
            value={selected}
            disabled={scheduleEditing}
            onChange={(event) => setSelected(Number(event.target.value))}
          >
            {content.campaigns.map((value, index) => (
              <NativeSelectOption key={value.key} value={index} className="capitalize">
                {value.key.replace(/-/g, " ")}
              </NativeSelectOption>
            ))}
          </SelectField>
          <EditorWithPreview>
            <div>
              <SectionHeading description="Use one line per headline or offer line, up to three. Destinations must be store links such as /collections/chairs.">
                Copy
              </SectionHeading>
              <FieldGrid>
                <Field
                  label="Campaign label"
                  value={campaign.label}
                  maxLength={120}
                  onChange={(label) => update({ label })}
                />
                <Field
                  label="Campaign button label"
                  value={campaign.cta}
                  maxLength={80}
                  onChange={(cta) => update({ cta })}
                />
                <Field
                  label="Campaign headline"
                  value={campaign.headline.join("\n")}
                  maxLength={362}
                  multiline
                  onChange={(headline) =>
                    update({ headline: headline.split("\n") })
                  }
                />
                <Field
                  label="Campaign supporting copy"
                  value={campaign.supporting}
                  maxLength={300}
                  multiline
                  onChange={(supporting) => update({ supporting })}
                />
                <Field
                  label="Campaign offer"
                  value={campaign.offer.join("\n")}
                  maxLength={362}
                  multiline
                  onChange={(offer) =>
                    update({ offer: offer ? offer.split("\n") : [] })
                  }
                />
                <Field
                  label="Campaign eligibility"
                  value={campaign.eligibility}
                  maxLength={300}
                  onChange={(eligibility) => update({ eligibility })}
                />
                <Field
                  label="Campaign destination"
                  value={campaign.href}
                  maxLength={500}
                  onChange={(href) => update({ href })}
                />
              </FieldGrid>
              <CampaignScheduleFields
                key={campaign.key}
                value={campaign.schedule}
                onChange={(schedule) => update({ schedule })}
                onEditingChange={setScheduleEditing}
              />
              {session && onExpired && (
                <>
                  <SectionHeading description="The storefront keeps the original artwork until you choose a replacement for both sizes.">
                    Artwork
                  </SectionHeading>
                  {campaign.artwork ? (
                    <FieldGrid>
                      <MediaPicker
                        label="Campaign desktop artwork"
                        value={campaign.artwork.desktopImage}
                        onChange={(desktopImage) =>
                          update({
                            artwork: { ...campaign.artwork!, desktopImage },
                          })
                        }
                        session={session}
                        onExpired={onExpired}
                      />
                      <MediaPicker
                        label="Campaign mobile artwork"
                        value={campaign.artwork.mobileImage}
                        onChange={(mobileImage) =>
                          update({
                            artwork: { ...campaign.artwork!, mobileImage },
                          })
                        }
                        session={session}
                        onExpired={onExpired}
                      />
                      <Field
                        label="Campaign artwork alt text"
                        value={campaign.artwork.alt}
                        maxLength={200}
                        onChange={(alt) =>
                          update({ artwork: { ...campaign.artwork!, alt } })
                        }
                      />
                      <div data-span="full">
                        <Button type="button" variant="outline" size="sm" onClick={() => update({ artwork: null })}>
                          <RotateCcw aria-hidden="true" strokeWidth={1.5} />
                          Restore original campaign artwork
                        </Button>
                      </div>
                    </FieldGrid>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        update({
                          artwork: {
                            desktopImage: "",
                            mobileImage: "",
                            alt: campaign.label,
                          },
                        })
                      }
                    >
                      <ImagePlus aria-hidden="true" strokeWidth={1.5} />
                      Replace campaign artwork
                    </Button>
                  )}
                </>
              )}
            </div>
            <PreviewPanel
              tone="accent"
              aria-label="Campaign preview"
              eyebrow="Copy preview"
              footnote="Local copy preview · Artwork is managed separately"
            >
              <p className="text-[12px] font-semibold tracking-[0.04em] uppercase">{campaign.label}</p>
              <PreviewTitle className="text-[26px]">
                {campaign.headline.map((line, index) => (
                  <span key={index}>
                    {line}
                    <br />
                  </span>
                ))}
              </PreviewTitle>
              <p>{campaign.supporting}</p>
              <p className="font-medium">{campaign.offer.join(" · ")}</p>
              <p className="text-[12.5px] text-primary-foreground/85">{campaign.eligibility}</p>
              <span className="w-fit rounded-sm bg-card px-4 py-2 text-[12.5px] font-semibold text-primary">{campaign.cta}</span>
            </PreviewPanel>
          </EditorWithPreview>
        </>
      )}
    </>
  );
}

export function InstagramFields({
  content,
  onChange,
  session,
  onExpired,
}: Props) {
  function update(
    index: number,
    patch: Partial<StorefrontContent["instagramPosts"][number]>,
  ) {
    onChange({
      ...content,
      instagramPosts: content.instagramPosts.map((value, i) =>
        i === index ? { ...value, ...patch } : value,
      ),
    });
  }
  const posts = content.instagramPosts;
  const addPost = (
    <Button
      type="button"
      disabled={posts.length >= 30}
      onClick={() =>
        onChange({
          ...content,
          instagramPosts: [...posts, { href: "", src: "", alt: "" }],
        })
      }
    >
      <Plus aria-hidden="true" strokeWidth={1.5} />
      Add Instagram post
    </Button>
  );
  return (
    <>
      <PanelHeader
        title="Instagram"
        description="Posts appear in this order. Use a public Instagram post or reel link and an approved Maple image. Image descriptions help visitors using screen readers."
        actions={posts.length > 0 && (
          <>
            <span className="text-[12px] text-muted-foreground tabular-nums">{posts.length} of 30 posts</span>
            {addPost}
          </>
        )}
      />
      {posts.length === 0 ? (
        <EmptyState title="No Instagram posts yet" icon={<Images strokeWidth={1.5} />} action={addPost}>
          The homepage needs at least one post. Add a post link and an approved image to fill the Instagram row.
        </EmptyState>
      ) : (
        <ol className="grid gap-3">
          {posts.map((post, index) => (
            <li key={index} className="grid gap-4 rounded-lg border border-border bg-card p-4 shadow-xs sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <SectionHeading as="h4" className="m-0">Post {index + 1}</SectionHeading>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={dangerButton}
                  disabled={posts.length <= 1}
                  onClick={() =>
                    onChange({
                      ...content,
                      instagramPosts: posts.filter((_, i) => i !== index),
                    })
                  }
                >
                  <Trash2 aria-hidden="true" strokeWidth={1.5} />
                  Remove post {index + 1}
                </Button>
              </div>
              <FieldGrid>
                <Field
                  label={`Post ${index + 1} link`}
                  value={post.href}
                  maxLength={300}
                  onChange={(href) => update(index, { href })}
                />
                <Field
                  label={`Post ${index + 1} alt text`}
                  value={post.alt}
                  maxLength={200}
                  onChange={(alt) => update(index, { alt })}
                />
                <Field
                  label={`Post ${index + 1} image`}
                  value={post.src}
                  maxLength={1000}
                  className="sm:col-span-2"
                  onChange={(src) => update(index, { src })}
                />
                {session && onExpired && (
                  <MediaPicker
                    label={`Post ${index + 1} library image`}
                    value={post.src}
                    onChange={(src) => update(index, { src })}
                    session={session}
                    onExpired={onExpired}
                  />
                )}
              </FieldGrid>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

export function PageFields({ content, onChange, session, onExpired, onSelectedPageChange }: Props) {
  const [selected, setSelected] = useState(0);
  const [selectionRevision, setSelectionRevision] = useState(0);
  const [conversionError, setConversionError] = useState("");
  const [restoring, setRestoring] = useState(false);
  function selectPage(index: number) {
    setSelected(index);
    onSelectedPageChange?.(index);
    // A removed page can be replaced at the same index; reset only on selection actions.
    setSelectionRevision(value => value + 1);
    setConversionError("");
    setRestoring(false);
  }
  const page = content.pages[selected];
  function update(patch: Partial<ContentPage>) {
    onChange({
      ...content,
      pages: content.pages.map((value, index) =>
        index === selected ? { ...value, ...patch } : value,
      ),
    });
  }
  function banner(patch: Partial<NonNullable<ContentPage["banner"]>>) {
    if (page?.banner) update({ banner: { ...page.banner, ...patch } });
  }
  function convert() {
    if (!page) return;
    const paragraphs = page.body.split(/\n\s*\n/).filter(text => text.trim());
    if (paragraphs.length > 60) {
      setConversionError("Use at most 60 paragraphs before converting to structured blocks. Your plain text has not changed.");
      return;
    }
    setConversionError("");
    update({ blocks: paragraphs.length ? paragraphs.map(text => ({ ...newAuthoredBlock("paragraph"), text })) : [newAuthoredBlock("paragraph")] });
  }
  function restorePlainText() {
    onChange({ ...content, pages: content.pages.map((value, index) => {
      if (index !== selected) return value;
      const { blocks: discarded, ...plainPage } = value;
      return plainPage;
    }) });
    setRestoring(false);
  }
  function addPage() {
    selectPage(content.pages.length);
    onChange({
      ...content,
      pages: [
        ...content.pages,
        {
          slug: "",
          title: "",
          description: "",
          body: "",
          banner: null,
        },
      ],
    });
  }
  const addPageButton = (
    <Button type="button" disabled={content.pages.length >= 20} onClick={addPage}>
      <Plus aria-hidden="true" strokeWidth={1.5} />
      Add page
    </Button>
  );
  return (
    <section aria-label="Informational pages editor">
      <PanelHeader
        title="Informational pages"
        description="Create a simple informational page at /pages/your-slug. Existing storefront and enquiry routes are reserved."
        actions={content.pages.length > 0 && (
          <>
            <span className="text-[12px] text-muted-foreground tabular-nums">{content.pages.length} of 20 pages</span>
            {addPageButton}
          </>
        )}
      />
      {content.pages.length > 0 && (
        <SelectField
          label="Page"
          className="mb-6 max-w-sm"
          value={selected}
          onChange={(event) => selectPage(Number(event.target.value))}
        >
          {content.pages.map((value, index) => (
            <NativeSelectOption key={index} value={index}>
              {value.title || "Untitled page"}
            </NativeSelectOption>
          ))}
        </SelectField>
      )}
      {!page ? (
        <EmptyState title="No custom pages yet" icon={<FileText strokeWidth={1.5} />} action={addPageButton}>
          Add a page to start writing. It stays in your draft until the draft is published.
        </EmptyState>
      ) : (
        <EditorWithPreview key={`${selected}:${selectionRevision}`}>
          <div>
            <FieldGrid>
              <Field
                label="Page title"
                value={page.title}
                maxLength={160}
                onChange={(title) => update({ title })}
              />
              <Field
                label="Page slug"
                value={page.slug}
                maxLength={80}
                onChange={(slug) => update({ slug })}
              />
              <Field
                label="Page description"
                value={page.description}
                maxLength={300}
                multiline
                onChange={(description) => update({ description })}
              />
              {page.blocks === undefined && <Field
                label="Page body"
                value={page.body}
                maxLength={8000}
                multiline
                onChange={(body) => update({ body })}
              />}
            </FieldGrid>
            {page.blocks === undefined ? (
              <div className="mt-4 grid justify-items-start gap-3">
                <Hint>Use plain text, with blank lines between paragraphs. HTML and scripts display as text.</Hint>
                <Button type="button" variant="outline" size="sm" onClick={convert}>Use structured blocks</Button>
                {conversionError && <Notice tone="error">{conversionError}</Notice>}
              </div>
            ) : (
              <>
                <AuthoredBlockFields blockLabel="Page block" value={page.blocks} onChange={blocks => update({ blocks })} session={session} onExpired={onExpired} />
                <div className="mt-4 grid justify-items-start gap-3">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setRestoring(true)}>
                    <RotateCcw aria-hidden="true" strokeWidth={1.5} />
                    Return to plain text
                  </Button>
                  {restoring && (
                    <ConfirmPanel actions={<>
                      <Button type="button" variant="destructive" size="sm" onClick={restorePlainText}>Confirm return to plain text</Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => setRestoring(false)}>Keep structured blocks</Button>
                    </>}>
                      Return to the original plain-text body? This will discard all structured block edits. Save draft and Publish draft still apply to the whole storefront.
                    </ConfirmPanel>
                  )}
                </div>
              </>
            )}
            {page.banner ? (
              <>
                <SectionHeading description="A wide image with a link, shown above the page copy.">Page banner</SectionHeading>
                <FieldGrid>
                  <Field
                    label="Desktop image"
                    value={page.banner.desktopImage}
                    onChange={(desktopImage) => banner({ desktopImage })}
                  />
                  <Field
                    label="Mobile image"
                    value={page.banner.mobileImage}
                    onChange={(mobileImage) => banner({ mobileImage })}
                  />
                  {session && onExpired && (
                    <>
                      <MediaPicker
                        label="Page desktop library image"
                        value={page.banner.desktopImage}
                        onChange={(desktopImage) => banner({ desktopImage })}
                        session={session}
                        onExpired={onExpired}
                      />
                      <MediaPicker
                        label="Page mobile library image"
                        value={page.banner.mobileImage}
                        onChange={(mobileImage) => banner({ mobileImage })}
                        session={session}
                        onExpired={onExpired}
                      />
                    </>
                  )}
                  <Field
                    label="Banner alt text"
                    value={page.banner.alt}
                    maxLength={200}
                    onChange={(alt) => banner({ alt })}
                  />
                  <Field
                    label="Banner link"
                    value={page.banner.href}
                    maxLength={500}
                    onChange={(href) => banner({ href })}
                  />
                  <Field
                    label="Banner button label"
                    value={page.banner.label}
                    maxLength={80}
                    onChange={(label) => banner({ label })}
                  />
                  <div data-span="full">
                    <Button type="button" variant="ghost" size="sm" className={dangerButton} onClick={() => update({ banner: null })}>
                      <Trash2 aria-hidden="true" strokeWidth={1.5} />
                      Remove page banner
                    </Button>
                  </div>
                </FieldGrid>
              </>
            ) : (
              <div className="mt-6">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    update({
                      banner: {
                        desktopImage: "",
                        mobileImage: "",
                        alt: "",
                        href: "/collections/all",
                        label: "Explore",
                      },
                    })
                  }
                >
                  <ImagePlus aria-hidden="true" strokeWidth={1.5} />
                  Add page banner
                </Button>
              </div>
            )}
            <DangerZone note="Removal stays in your draft until it is published. Earlier saved versions remain in History.">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={dangerButton}
                onClick={() => {
                  onChange({
                    ...content,
                    pages: content.pages.filter(
                      (_, index) => index !== selected,
                    ),
                  });
                  selectPage(0);
                }}
              >
                <Trash2 aria-hidden="true" strokeWidth={1.5} />
                Remove page
              </Button>
            </DangerZone>
          </div>
          <PreviewPanel
            aria-label="Page preview"
            eyebrow={page.blocks === undefined ? "Text preview" : "Local page preview"}
            footnote={<>Local preview · /pages/{page.slug || "your-slug"}</>}
          >
            <PreviewTitle>{page.title || "Untitled page"}</PreviewTitle>
            {page.description && <p className="text-muted-foreground">{page.description}</p>}
            {page.blocks === undefined
              ? <div data-plain-copy className="whitespace-pre-wrap [overflow-wrap:anywhere]">{page.body}</div>
              : <div className="store-prose"><AuthoredArticleBody blocks={page.blocks} preview /></div>}
            {page.banner && (
              <p className="rounded-md bg-sunken px-3 py-2 text-[12.5px] text-foreground">
                Banner: {page.banner.alt || "Add an image description"} ·{" "}
                {page.banner.label}
              </p>
            )}
          </PreviewPanel>
        </EditorWithPreview>
      )}
    </section>
  );
}
