"use client";
import { useEffect, useState } from "react";
import type { StaffSession } from "./dashboard";
import { MediaPicker } from "./media-picker";
import { CampaignScheduleFields } from "./campaign-schedule-fields";
import type {
  StorefrontContent,
  CampaignContent,
  ContentPage,
} from "@shopmaple/contracts";
import { Field } from "./field";
export { Field } from "./field";
import { AuthoredBlockFields, newAuthoredBlock } from "./authored-block-fields";
import { AuthoredArticleBody } from "@/components/authored-article-body";
type Props = {
  content: StorefrontContent;
  onChange: (content: StorefrontContent) => void;
  session?: StaffSession;
  onExpired?: () => void;
  onScheduleEditingChange?: (editing: boolean) => void;
};
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
      <h2>Campaigns</h2>
      <p>
        Update campaign copy, destination and artwork. Original artwork stays in
        place until you choose a replacement.
      </p>
      {!campaign ? (
        <p>No campaigns are configured in this draft.</p>
      ) : (
        <>
          <label className="admin-field">
            <span>Campaign</span>
            <select
              aria-label="Campaign"
              value={selected}
              disabled={scheduleEditing}
              onChange={(event) => setSelected(Number(event.target.value))}
            >
              {content.campaigns.map((value, index) => (
                <option key={value.key} value={index}>
                  {value.key.replace(/-/g, " ")}
                </option>
              ))}
            </select>
          </label>
          <div className="admin-editor-preview">
            <div className="admin-fields">
              <Field
                label="Campaign label"
                value={campaign.label}
                maxLength={120}
                onChange={(label) => update({ label })}
              />
              <CampaignScheduleFields
                key={campaign.key}
                value={campaign.schedule}
                onChange={(schedule) => update({ schedule })}
                onEditingChange={setScheduleEditing}
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
                label="Campaign button label"
                value={campaign.cta}
                maxLength={80}
                onChange={(cta) => update({ cta })}
              />
              <Field
                label="Campaign destination"
                value={campaign.href}
                maxLength={500}
                onChange={(href) => update({ href })}
              />
              {session &&
                onExpired &&
                (campaign.artwork ? (
                  <>
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
                    <button
                      type="button"
                      onClick={() => update({ artwork: null })}
                    >
                      Restore original campaign artwork
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
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
                    Replace campaign artwork
                  </button>
                ))}
              <p>
                Use one line per headline or offer line, up to three.
                Destinations must be store links such as /collections/chairs.
              </p>
            </div>
            <aside
              className="admin-preview admin-campaign-preview"
              aria-label="Campaign preview"
            >
              <h3>Copy preview</h3>
              <p>{campaign.label}</p>
              <h4>
                {campaign.headline.map((line, index) => (
                  <span key={index}>
                    {line}
                    <br />
                  </span>
                ))}
              </h4>
              <p>{campaign.supporting}</p>
              <p>{campaign.offer.join(" · ")}</p>
              <p>{campaign.eligibility}</p>
              <span className="admin-preview-cta">{campaign.cta}</span>
              <small>Local copy preview · Artwork is managed separately</small>
            </aside>
          </div>
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
  return (
    <>
      <div className="admin-section-heading">
        <h2>Instagram</h2>
        <button
          disabled={content.instagramPosts.length >= 30}
          onClick={() =>
            onChange({
              ...content,
              instagramPosts: [
                ...content.instagramPosts,
                { href: "", src: "", alt: "" },
              ],
            })
          }
        >
          Add Instagram post
        </button>
      </div>
      <p>
        Posts appear in this order. Use a public Instagram post or reel link and
        an approved Maple image. Image descriptions help visitors using screen
        readers.
      </p>
      <div className="admin-posts">
        {content.instagramPosts.map((post, index) => (
          <div className="admin-post" key={index}>
            <h3>Post {index + 1}</h3>
            <div className="admin-fields">
              <Field
                label={`Post ${index + 1} link`}
                value={post.href}
                maxLength={300}
                onChange={(href) => update(index, { href })}
              />
              <Field
                label={`Post ${index + 1} image`}
                value={post.src}
                maxLength={1000}
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
              <Field
                label={`Post ${index + 1} alt text`}
                value={post.alt}
                maxLength={200}
                onChange={(alt) => update(index, { alt })}
              />
            </div>
            <button
              disabled={content.instagramPosts.length <= 1}
              onClick={() =>
                onChange({
                  ...content,
                  instagramPosts: content.instagramPosts.filter(
                    (_, i) => i !== index,
                  ),
                })
              }
            >
              Remove post {index + 1}
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
export function PageFields({ content, onChange, session, onExpired }: Props) {
  const [selected, setSelected] = useState(0);
  const [selectionRevision, setSelectionRevision] = useState(0);
  const [conversionError, setConversionError] = useState("");
  const [restoring, setRestoring] = useState(false);
  function selectPage(index: number) {
    setSelected(index);
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
  return (
    <section className="admin-structured-pages" aria-label="Informational pages editor">
      <div className="admin-section-heading">
        <h2>Informational pages</h2>
        <button
          disabled={content.pages.length >= 20}
          onClick={() => {
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
          }}
        >
          Add page
        </button>
      </div>
      <p>
        Create a simple informational page at /pages/your-slug. Existing
        storefront and enquiry routes are reserved.
      </p>
      {content.pages.length > 0 && (
        <label className="admin-field">
          <span>Page</span>
          <select
            aria-label="Page"
            value={selected}
            onChange={(event) => selectPage(Number(event.target.value))}
          >
            {content.pages.map((value, index) => (
              <option key={index} value={index}>
                {value.title || "Untitled page"}
              </option>
            ))}
          </select>
        </label>
      )}
      {!page ? (
        <div className="admin-empty">
          <p>No custom pages yet. Add a page to start writing.</p>
        </div>
      ) : (
        <div className="admin-editor-preview" key={`${selected}:${selectionRevision}`}>
          <div>
            <div className="admin-fields">
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
            </div>
            {page.blocks === undefined ? <>
              <p>Use plain text, with blank lines between paragraphs. HTML and scripts display as text.</p>
              <button type="button" onClick={convert}>Use structured blocks</button>
              {conversionError && <p role="alert">{conversionError}</p>}
            </> : <>
              <AuthoredBlockFields blockLabel="Page block" value={page.blocks} onChange={blocks => update({ blocks })} session={session} onExpired={onExpired} />
              <button type="button" onClick={() => setRestoring(true)}>Return to plain text</button>
              {restoring && <div role="alert">
                <p>Return to the original plain-text body? This will discard all structured block edits. Save draft and Publish draft still apply to the whole storefront.</p>
                <button type="button" onClick={restorePlainText}>Confirm return to plain text</button>
                <button type="button" onClick={() => setRestoring(false)}>Keep structured blocks</button>
              </div>}
            </>}
            {page.banner ? (
              <>
                <h3>Page banner</h3>
                <div className="admin-fields">
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
                </div>
                <button onClick={() => update({ banner: null })}>
                  Remove page banner
                </button>
              </>
            ) : (
              <button
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
                Add page banner
              </button>
            )}
            <div className="admin-delete">
              <button
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
                Remove page
              </button>
              <p>
                Removal stays in your draft until it is published. Earlier saved
                versions remain in History.
              </p>
            </div>
          </div>
          <aside className="admin-preview" aria-label="Page preview">
            <h3>{page.blocks === undefined ? "Text preview" : "Local page preview"}</h3>
            <h4>{page.title || "Untitled page"}</h4>
            <p>{page.description}</p>
            {page.blocks === undefined ? <div className="admin-plain-copy">{page.body}</div> : <div className="store-prose"><AuthoredArticleBody blocks={page.blocks} preview /></div>}
            {page.banner && (
              <p>
                Banner: {page.banner.alt || "Add an image description"} ·{" "}
                {page.banner.label}
              </p>
            )}
            <small>Local preview · /pages/{page.slug || "your-slug"}</small>
          </aside>
        </div>
      )}
    </section>
  );
}
