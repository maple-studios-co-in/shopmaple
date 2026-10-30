"use client";
import { useEffect, useState, type ReactNode } from "react";
import { FileText, ImagePlus, Images, Megaphone, Plus, RotateCcw, Trash2 } from "lucide-react";
import type { StorefrontContent, CampaignContent, ContentPage } from "@shopmaple/contracts";
import { Button } from "@/components/ui/button";
import { NativeSelectOption } from "@/components/ui/native-select";
import { AuthoredArticleBody } from "@/components/authored-article-body";
import type { StaffSession } from "./dashboard";
import { MediaPicker } from "./media-picker";
import { CampaignScheduleFields } from "./campaign-schedule-fields";
import { Field } from "./field";
import { EmptyState, Notice } from "./crm-primitives";
import {
  ActionButton, ConfirmPanel, DangerZone, EditorWithPreview, FieldGrid, Hint, PanelHeader, PreviewPanel, PreviewTitle, SectionHeading, SelectField, dangerButton,
} from "./kit";
import { AuthoredBlockFields, newAuthoredBlock } from "./authored-block-fields";

type Props = {
  content: StorefrontContent;
  onChange: (content: StorefrontContent) => void;
  session?: StaffSession;
  onExpired?: () => void;
  onScheduleEditingChange?: (editing: boolean) => void;
  /** PageFields only: the index of the page being edited, so the editor can preview it. */
  onSelectedPageChange?: (index: number) => void;
};

/** A copy of `list` with `patch` merged into the item at `index`. */
function patchAt<T>(list: T[], index: number, patch: Partial<T>) {
  return list.map((item, i) => (i === index ? { ...item, ...patch } : item));
}

/** The media library needs a signed-in session; without one the editors show text fields only. */
const mediaProps = ({ session, onExpired }: Props) => (session && onExpired ? { session, onExpired } : undefined);

/** "N of max" beside the button that adds one more. */
function Tally({ count, max, noun, children }: { count: number; max: number; noun: string; children: ReactNode }) {
  return (
    <>
      <span className="text-xs text-muted-foreground tabular-nums">{count} of {max} {noun}</span>
      {children}
    </>
  );
}

export function CampaignFields(props: Props) {
  const { content, onChange, onScheduleEditingChange } = props;
  const [selected, setSelected] = useState(0);
  const [scheduleEditing, setScheduleEditing] = useState(false);
  useEffect(() => {
    onScheduleEditingChange?.(scheduleEditing);
    return () => onScheduleEditingChange?.(false);
  }, [scheduleEditing, onScheduleEditingChange]);
  const campaign = content.campaigns[selected];
  const media = mediaProps(props);
  const update = (patch: Partial<CampaignContent>) => onChange({ ...content, campaigns: patchAt(content.campaigns, selected, patch) });
  const artwork = (patch: Partial<NonNullable<CampaignContent["artwork"]>>) => campaign?.artwork && update({ artwork: { ...campaign.artwork, ...patch } });
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
          <SelectField label="Campaign" className="mb-6 max-w-sm" value={selected} disabled={scheduleEditing} onChange={(event) => setSelected(Number(event.target.value))}>
            {content.campaigns.map((value, index) => (
              <NativeSelectOption key={value.key} value={index} className="capitalize">{value.key.replace(/-/g, " ")}</NativeSelectOption>
            ))}
          </SelectField>
          <EditorWithPreview>
            <div>
              <SectionHeading description="Use one line per headline or offer line, up to three. Destinations must be store links such as /collections/chairs.">
                Copy
              </SectionHeading>
              <FieldGrid>
                <Field label="Campaign label" value={campaign.label} maxLength={120} onChange={(label) => update({ label })} />
                <Field label="Campaign button label" value={campaign.cta} maxLength={80} onChange={(cta) => update({ cta })} />
                <Field label="Campaign headline" value={campaign.headline.join("\n")} maxLength={362} multiline onChange={(headline) => update({ headline: headline.split("\n") })} />
                <Field label="Campaign supporting copy" value={campaign.supporting} maxLength={300} multiline onChange={(supporting) => update({ supporting })} />
                <Field label="Campaign offer" value={campaign.offer.join("\n")} maxLength={362} multiline onChange={(offer) => update({ offer: offer ? offer.split("\n") : [] })} />
                <Field label="Campaign eligibility" value={campaign.eligibility} maxLength={300} onChange={(eligibility) => update({ eligibility })} />
                <Field label="Campaign destination" value={campaign.href} maxLength={500} onChange={(href) => update({ href })} />
              </FieldGrid>
              <CampaignScheduleFields key={campaign.key} value={campaign.schedule} onChange={(schedule) => update({ schedule })} onEditingChange={setScheduleEditing} />
              {media && (
                <>
                  <SectionHeading description="The storefront keeps the original artwork until you choose a replacement for both sizes.">Artwork</SectionHeading>
                  {campaign.artwork ? (
                    <FieldGrid>
                      <MediaPicker label="Campaign desktop artwork" value={campaign.artwork.desktopImage} onChange={(desktopImage) => artwork({ desktopImage })} {...media} />
                      <MediaPicker label="Campaign mobile artwork" value={campaign.artwork.mobileImage} onChange={(mobileImage) => artwork({ mobileImage })} {...media} />
                      <Field label="Campaign artwork alt text" value={campaign.artwork.alt} maxLength={200} onChange={(alt) => artwork({ alt })} />
                      <div data-span="full">
                        <ActionButton icon={RotateCcw} onClick={() => update({ artwork: null })}>Restore original campaign artwork</ActionButton>
                      </div>
                    </FieldGrid>
                  ) : (
                    <ActionButton icon={ImagePlus} onClick={() => update({ artwork: { desktopImage: "", mobileImage: "", alt: campaign.label } })}>
                      Replace campaign artwork
                    </ActionButton>
                  )}
                </>
              )}
            </div>
            <PreviewPanel tone="accent" aria-label="Campaign preview" eyebrow="Copy preview" footnote="Local copy preview · Artwork is managed separately">
              <p className="text-xs font-semibold tracking-[0.04em] uppercase">{campaign.label}</p>
              <PreviewTitle className="text-2xl">
                {campaign.headline.map((line, index) => <span key={index}>{line}<br /></span>)}
              </PreviewTitle>
              <p>{campaign.supporting}</p>
              <p className="font-medium">{campaign.offer.join(" · ")}</p>
              <p className="text-xs text-primary-foreground/85">{campaign.eligibility}</p>
              <span className="w-fit rounded-sm bg-card px-4 py-2 text-xs font-semibold text-primary">{campaign.cta}</span>
            </PreviewPanel>
          </EditorWithPreview>
        </>
      )}
    </>
  );
}

export function InstagramFields(props: Props) {
  const { content, onChange } = props;
  const posts = content.instagramPosts;
  const media = mediaProps(props);
  const setPosts = (instagramPosts: typeof posts) => onChange({ ...content, instagramPosts });
  const update = (index: number, patch: Partial<(typeof posts)[number]>) => setPosts(patchAt(posts, index, patch));
  const addPost = (
    <ActionButton icon={Plus} variant="default" size="default" disabled={posts.length >= 30} onClick={() => setPosts([...posts, { href: "", src: "", alt: "" }])}>
      Add Instagram post
    </ActionButton>
  );
  return (
    <>
      <PanelHeader
        title="Instagram"
        description="Posts appear in this order. Use a public Instagram post or reel link and an approved Maple image. Image descriptions help visitors using screen readers."
        actions={posts.length > 0 && <Tally count={posts.length} max={30} noun="posts">{addPost}</Tally>}
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
                <ActionButton icon={Trash2} variant="ghost" className={dangerButton} disabled={posts.length <= 1} onClick={() => setPosts(posts.filter((_, i) => i !== index))}>
                  Remove post {index + 1}
                </ActionButton>
              </div>
              <FieldGrid>
                <Field label={`Post ${index + 1} link`} value={post.href} maxLength={300} onChange={(href) => update(index, { href })} />
                <Field label={`Post ${index + 1} alt text`} value={post.alt} maxLength={200} onChange={(alt) => update(index, { alt })} />
                <Field label={`Post ${index + 1} image`} value={post.src} className="sm:col-span-2" onChange={(src) => update(index, { src })} />
                {media && <MediaPicker label={`Post ${index + 1} library image`} value={post.src} onChange={(src) => update(index, { src })} {...media} />}
              </FieldGrid>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

const newBanner = { desktopImage: "", mobileImage: "", alt: "", href: "/collections/all", label: "Explore" };

export function PageFields(props: Props) {
  const { content, onChange, session, onExpired, onSelectedPageChange } = props;
  const [selected, setSelected] = useState(0);
  const [selectionRevision, setSelectionRevision] = useState(0);
  const [conversionError, setConversionError] = useState("");
  const [restoring, setRestoring] = useState(false);
  const pages = content.pages;
  const page = pages[selected];
  const media = mediaProps(props);
  function selectPage(index: number) {
    setSelected(index);
    onSelectedPageChange?.(index);
    // A removed page can be replaced at the same index; reset only on selection actions.
    setSelectionRevision((value) => value + 1);
    setConversionError("");
    setRestoring(false);
  }
  const setPages = (next: ContentPage[]) => onChange({ ...content, pages: next });
  const update = (patch: Partial<ContentPage>) => setPages(patchAt(pages, selected, patch));
  const banner = (patch: Partial<NonNullable<ContentPage["banner"]>>) => page?.banner && update({ banner: { ...page.banner, ...patch } });
  function convert() {
    if (!page) return;
    const paragraphs = page.body.split(/\n\s*\n/).filter((text) => text.trim());
    if (paragraphs.length > 60) {
      setConversionError("Use at most 60 paragraphs before converting to structured blocks. Your plain text has not changed.");
      return;
    }
    setConversionError("");
    update({ blocks: paragraphs.length ? paragraphs.map((text) => ({ ...newAuthoredBlock("paragraph"), text })) : [newAuthoredBlock("paragraph")] });
  }
  function restorePlainText() {
    setPages(pages.map((value, index) => {
      if (index !== selected) return value;
      const { blocks: discarded, ...plainPage } = value;
      return plainPage;
    }));
    setRestoring(false);
  }
  function addPage() {
    selectPage(pages.length);
    setPages([...pages, { slug: "", title: "", description: "", body: "", banner: null }]);
  }
  const addPageButton = (
    <ActionButton icon={Plus} variant="default" size="default" disabled={pages.length >= 20} onClick={addPage}>Add page</ActionButton>
  );
  return (
    <section aria-label="Informational pages editor">
      <PanelHeader
        title="Informational pages"
        description="Create a simple informational page at /pages/your-slug. Existing storefront and enquiry routes are reserved."
        actions={pages.length > 0 && <Tally count={pages.length} max={20} noun="pages">{addPageButton}</Tally>}
      />
      {pages.length > 0 && (
        <SelectField label="Page" className="mb-6 max-w-sm" value={selected} onChange={(event) => selectPage(Number(event.target.value))}>
          {pages.map((value, index) => <NativeSelectOption key={index} value={index}>{value.title || "Untitled page"}</NativeSelectOption>)}
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
              <Field label="Page title" value={page.title} maxLength={160} onChange={(title) => update({ title })} />
              <Field label="Page slug" value={page.slug} maxLength={80} onChange={(slug) => update({ slug })} />
              <Field label="Page description" value={page.description} maxLength={300} multiline onChange={(description) => update({ description })} />
              {page.blocks === undefined && <Field label="Page body" value={page.body} maxLength={8000} multiline onChange={(body) => update({ body })} />}
            </FieldGrid>
            {page.blocks === undefined ? (
              <div className="mt-4 grid justify-items-start gap-3">
                <Hint>Use plain text, with blank lines between paragraphs. HTML and scripts display as text.</Hint>
                <Button type="button" variant="outline" size="sm" onClick={convert}>Use structured blocks</Button>
                {conversionError && <Notice tone="error">{conversionError}</Notice>}
              </div>
            ) : (
              <>
                <AuthoredBlockFields blockLabel="Page block" value={page.blocks} onChange={(blocks) => update({ blocks })} session={session} onExpired={onExpired} />
                <div className="mt-4 grid justify-items-start gap-3">
                  <ActionButton icon={RotateCcw} variant="ghost" onClick={() => setRestoring(true)}>Return to plain text</ActionButton>
                  {restoring && (
                    <ConfirmPanel confirm="Confirm return to plain text" cancel="Keep structured blocks" onConfirm={restorePlainText} onCancel={() => setRestoring(false)}>
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
                  <Field label="Desktop image" value={page.banner.desktopImage} onChange={(desktopImage) => banner({ desktopImage })} />
                  <Field label="Mobile image" value={page.banner.mobileImage} onChange={(mobileImage) => banner({ mobileImage })} />
                  {media && (
                    <>
                      <MediaPicker label="Page desktop library image" value={page.banner.desktopImage} onChange={(desktopImage) => banner({ desktopImage })} {...media} />
                      <MediaPicker label="Page mobile library image" value={page.banner.mobileImage} onChange={(mobileImage) => banner({ mobileImage })} {...media} />
                    </>
                  )}
                  <Field label="Banner alt text" value={page.banner.alt} maxLength={200} onChange={(alt) => banner({ alt })} />
                  <Field label="Banner link" value={page.banner.href} maxLength={500} onChange={(href) => banner({ href })} />
                  <Field label="Banner button label" value={page.banner.label} maxLength={80} onChange={(label) => banner({ label })} />
                  <div data-span="full">
                    <ActionButton icon={Trash2} variant="ghost" className={dangerButton} onClick={() => update({ banner: null })}>Remove page banner</ActionButton>
                  </div>
                </FieldGrid>
              </>
            ) : (
              <ActionButton icon={ImagePlus} className="mt-6" onClick={() => update({ banner: newBanner })}>Add page banner</ActionButton>
            )}
            <DangerZone note="Removal stays in your draft until it is published. Earlier saved versions remain in History.">
              <ActionButton icon={Trash2} variant="ghost" className={dangerButton} onClick={() => { setPages(pages.filter((_, index) => index !== selected)); selectPage(0); }}>
                Remove page
              </ActionButton>
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
              <p className="rounded-md bg-sunken px-3 py-2 text-xs text-foreground">Banner: {page.banner.alt || "Add an image description"} · {page.banner.label}</p>
            )}
          </PreviewPanel>
        </EditorWithPreview>
      )}
    </section>
  );
}
