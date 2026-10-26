"use client";
import { useEffect, useState } from "react";
import {
  storefrontContentSchema,
  type StorefrontContent,
} from "@shopmaple/contracts";
import { Field, CampaignFields, InstagramFields, PageFields } from "./forms";
import { SiteChromeFields } from "./site-chrome-fields";
import { CategoryFields } from "./category-fields";
import { StoryFields } from "./story-fields";
import { NimbusFields } from "./nimbus-fields";
import { ServicePageFields } from "./service-page-fields";
import { EditorialFields } from "./editorial-fields";
import { AuthoredArticleFields } from "./authored-article-fields";
import { HomeDetailsFields } from "./home-details-fields";
import { HomeCitiesLayoutFields } from "./home-cities-layout-fields";
import { HomeMerchandisingFields } from "./home-merchandising-fields";
import { MediaLibrary } from "./media-library";
import { TemplateArtworkFields } from "./template-artwork-fields";
import { EnquiryInbox } from "./enquiry-inbox";
import type { StaffSession } from "./dashboard";
import { AdminRequestTimeout, useAdminRequest } from "./use-admin-request";
type Document = {
  version: number;
  draft: StorefrontContent | null;
  publishedVersion: number | null;
  updatedAt: string | null;
};
type Revision = {
  id: string;
  version: number;
  action: string;
  actorEmail: string;
  createdAt: string;
};
const tabs = [
  "Overview",
  "Homepage",
  "Navigation & footer",
  "Merchandising",
  "Artwork",
  "Campaigns",
  "Instagram",
  "Pages",
  "Existing pages",
  "Policies & blogs",
  "Category pages",
  "Media",
  "Enquiries",
  "History",
] as const;
type Tab = (typeof tabs)[number];
const copyLabels: Record<keyof StorefrontContent["homeCopy"], string> = {
  categoryHeading: "Category heading",
  bestsellersHeading: "Bestsellers heading",
  chairsHeading: "Chairs heading",
  socialHeading: "Social heading",
  ticker: "Brand ticker",
  testimonialHeading: "Testimonial heading",
  testimonialSubheading: "Testimonial subheading",
};
export const titleCase = (value: string) =>
  value.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
function parseDocument(value: unknown): Document {
  const document = value as Document;
  if (
    !document ||
    !Number.isSafeInteger(document.version) ||
    document.version < 0 ||
    !(
      document.updatedAt === null ||
      (typeof document.updatedAt === "string" &&
        document.updatedAt.length <= 64 &&
        Number.isFinite(Date.parse(document.updatedAt)))
    ) ||
    !(
      document.publishedVersion === null ||
      (Number.isSafeInteger(document.publishedVersion) &&
        document.publishedVersion >= 0 &&
        document.publishedVersion <= document.version)
    )
  )
    throw new Error("Invalid response");
  return {
    ...document,
    draft:
      document.draft === null
        ? null
        : storefrontContentSchema.parse(document.draft),
  };
}
export function ContentEditor({
  session,
  initialContent,
  onExpired,
}: {
  session: StaffSession;
  initialContent: StorefrontContent;
  onExpired: () => void;
}) {
  const adminRequest = useAdminRequest();
  const [tab, setTab] = useState<Tab>("Overview");
  const [existingPage, setExistingPage] = useState<"story" | "nimbus" | "contact" | "bulk" | "returns">("story");
  const [document, setDocument] = useState<Document | null>(null);
  const [content, setContent] = useState<StorefrontContent | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [scheduleEditing, setScheduleEditing] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revisions, setRevisions] = useState<Revision[]>([]);
  function acceptDocument(value: unknown) {
    const next = parseDocument(value);
    setDocument(next);
    setContent(structuredClone(next.draft ?? initialContent));
    setDirty(next.draft === null);
    setConflict(false);
  }
  async function load() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await adminRequest("/api/admin/content", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (response.status === 401) {
        onExpired();
        return;
      }
      if (!response.ok) throw new Error("Read failed");
      acceptDocument(await response.json());
    } catch (error) {
      setError(
        error instanceof AdminRequestTimeout
          ? "Loading your draft timed out. Please try again."
          : "We couldn't load your draft. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, [session.user.id]);
  useEffect(() => {
    if (!dirty && !scheduleEditing) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, scheduleEditing]);
  async function history() {
    setTab("History");
    setBusy(true);
    setError("");
    try {
      const response = await adminRequest("/api/admin/content/revisions", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (response.status === 401) {
        onExpired();
        return;
      }
      if (!response.ok) throw new Error("Read failed");
      const result = await response.json();
      if (!Array.isArray(result.revisions)) throw new Error("Invalid history");
      setRevisions(result.revisions);
    } catch (error) {
      setError(
        error instanceof AdminRequestTimeout
          ? "Loading revision history timed out. Open History to try again."
          : "We couldn't load revision history. Open History to try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  function edit(next: StorefrontContent) {
    setContent(next);
    setDirty(true);
    setNotice("");
  }
  async function write(
    action: "save" | "publish" | "restore",
    revisionId?: string,
  ) {
    if (!document || !content || busy || conflict || scheduleEditing) return;
    if (action === "save") {
      const validation = storefrontContentSchema.safeParse(content);
      if (!validation.success) {
        const issue = validation.error.issues[0];
        setError(
          `Check ${issue?.path.join(" · ") || "the content fields"}: ${issue?.message || "Some values are invalid."}`,
        );
        return;
      }
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await adminRequest(
        `/api/admin/content${action === "save" ? "" : action === "publish" ? "/publish" : "/rollback"}`,
        {
          method: action === "save" ? "PUT" : "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": session.csrfToken,
          },
          body: JSON.stringify({
            expectedVersion: document.version,
            ...(action === "save"
              ? { content }
              : action === "restore"
                ? { revisionId }
                : {}),
          }),
        },
      );
      if (response.status === 401) {
        onExpired();
        return;
      }
      if (response.status === 409) {
        setConflict(true);
        setError(
          "Another editor saved a newer version. Your changes are still here. Reload the latest draft before editing again; reloading discards these local changes.",
        );
        return;
      }
      if (response.status === 403) {
        setError(
          "Your permission or session has changed. Sign out and sign in again before continuing.",
        );
        return;
      }
      if (!response.ok) {
        setError(
          response.status === 400
            ? "Some content is invalid. Check your links and fields, then save again."
            : "We couldn't complete that change. Your local edits are still here. Please try again.",
        );
        return;
      }
      acceptDocument(await response.json());
      setNotice(
        action === "save"
          ? "Draft saved. The published storefront has not changed."
          : action === "publish"
            ? "Draft published. The storefront now uses this version."
            : "Restored as a draft. Review it, then publish when ready.",
      );
    } catch (error) {
      setError(
        error instanceof AdminRequestTimeout
          ? "The request timed out. Your local edits are still here. Please try again."
          : "We couldn't complete that change. Check your connection and try again. Your local edits are still here.",
      );
    } finally {
      setBusy(false);
    }
  }
  const unavailableDraft = (
    <div className="admin-empty">
      <p role="status">
        {busy ? "Loading store content…" : "Your draft is unavailable."}
      </p>
      {!busy && (
        <button onClick={() => void load()}>Retry loading draft</button>
      )}
    </div>
  );
  return (
    <>
      <div className="admin-toolbar">
        <div>
          <strong>
            {document ? `Draft version ${document.version}` : "Loading draft"}
          </strong>
          <span>
            {document?.publishedVersion
              ? `Published version ${document.publishedVersion}`
              : "No published content yet"}
            {dirty ? " · Unsaved changes" : ""}
          </span>
        </div>
        <div className="admin-actions">
          <button
            data-action="save"
            disabled={!content || !dirty || busy || conflict || scheduleEditing}
            onClick={() => void write("save")}
          >
            Save draft
          </button>
          {session.user.role === "publisher" && (
            <button
              className="admin-primary"
              disabled={!document?.version || dirty || busy || conflict || scheduleEditing}
              onClick={() => void write("publish")}
            >
              Publish draft
            </button>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="admin-alert">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="admin-notice">
          {notice}
        </p>
      )}
      {conflict && (
        <button onClick={() => void load()} disabled={busy}>
          Reload latest draft
        </button>
      )}
      {!content && !session.user.canManageEnquiries ? unavailableDraft : (
        <div className="admin-workspace">
          <nav aria-label="Content sections">
            {tabs
              .filter(
                (name) =>
                  name !== "Enquiries" ||
                  session.user.canManageEnquiries === true,
              )
              .map((name) => (
                <button
                  key={name}
                  aria-current={tab === name ? "page" : undefined}
                  disabled={scheduleEditing || (!content && name !== "Enquiries" && name !== "Overview")}
                  onClick={() =>
                    name === "History" ? void history() : setTab(name)
                  }
                >
                  {name}
                </button>
              ))}
          </nav>
          <div className="admin-panel">
            {tab === "Enquiries" && session.user.canManageEnquiries === true ? (
              <EnquiryInbox session={session} onExpired={onExpired} />
            ) : !content ? unavailableDraft : (
            <fieldset disabled={busy || conflict}>
              <legend className="admin-sr-only">{tab} editor</legend>
              {tab === "Overview" && (
                <>
                  <h2>Your storefront, ready for its next chapter.</h2>
                  <p>
                    Manage homepage content, campaigns, Instagram posts and
                    informational pages. Save your work as a draft, then publish
                    it when it is ready.
                  </p>
                  <dl className="admin-summary">
                    <div>
                      <dt>Homepage sections</dt>
                      <dd>
                        {content.homeSections.filter((s) => s.enabled).length}{" "}
                        visible of {content.homeSections.length}
                      </dd>
                    </div>
                    <div>
                      <dt>Campaigns</dt>
                      <dd>{content.campaigns.length} editable</dd>
                    </div>
                    <div>
                      <dt>Informational pages</dt>
                      <dd>{content.pages.length} pages</dd>
                    </div>
                  </dl>
                  <h3>Publishing</h3>
                  <p>
                    {session.user.role === "publisher"
                      ? "You can edit and publish. Save any unsaved changes before publishing."
                      : "You can edit and save drafts. A publisher must publish your changes."}
                  </p>
                  <p>
                    Restoring a revision creates a draft. It does not change the
                    live storefront until published.
                  </p>
                  <a href="/" target="_blank" rel="noopener noreferrer">
                    Open storefront
                  </a>
                </>
              )}
              {tab === "Navigation & footer" && <SiteChromeFields value={content.siteChrome} onChange={siteChrome => {
                const next = {...content};
                if (siteChrome === undefined) delete next.siteChrome;
                else next.siteChrome = siteChrome;
                edit(next);
              }} />}
              {tab === "Homepage" && (
                <>
                  <h2>Homepage</h2>
                  <p>Move sections into order and choose what visitors see.</p>
                  <ol className="admin-section-list">
                    {content.homeSections.map((section, index) => (
                      <li key={section.key}>
                        <label>
                          <input
                            type="checkbox"
                            aria-label={`Show ${titleCase(section.key)}`}
                            checked={section.enabled}
                            onChange={(e) =>
                              edit({
                                ...content,
                                homeSections: content.homeSections.map((s) =>
                                  s.key === section.key
                                    ? { ...s, enabled: e.target.checked }
                                    : s,
                                ),
                              })
                            }
                          />
                          <span>{titleCase(section.key)}</span>
                        </label>
                        <div>
                          {([-1, 1] as const).map((direction) => (
                            <button
                              key={direction}
                              aria-label={`Move ${titleCase(section.key)} ${direction === -1 ? "up" : "down"}`}
                              disabled={
                                index + direction < 0 ||
                                index + direction >= content.homeSections.length
                              }
                              onClick={() => {
                                const sections = [...content.homeSections];
                                [sections[index], sections[index + direction]] =
                                  [
                                    sections[index + direction]!,
                                    sections[index]!,
                                  ];
                                edit({ ...content, homeSections: sections });
                              }}
                            >
                              {direction === -1 ? "Move up" : "Move down"}
                            </button>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ol>
                  <h3>Homepage copy</h3>
                  <div className="admin-fields">
                    {(
                      Object.keys(
                        copyLabels,
                      ) as (keyof StorefrontContent["homeCopy"])[]
                    ).map((key) => (
                      <Field
                        key={key}
                        label={copyLabels[key]}
                        value={content.homeCopy[key] ?? "Chairs"}
                        multiline={key === "ticker"}
                        maxLength={
                          key === "ticker"
                            ? 600
                            : key === "testimonialSubheading"
                              ? 300
                              : 160
                        }
                        onChange={(value) =>
                          edit({
                            ...content,
                            homeCopy: { ...content.homeCopy, [key]: value },
                          })
                        }
                      />
                    ))}
                  </div>
                  <HomeDetailsFields value={content.homeDetails} onChange={homeDetails => edit({ ...content, homeDetails })} />
                  <HomeCitiesLayoutFields value={content.homeCitiesLayout} onChange={homeCitiesLayout => edit({ ...content, homeCitiesLayout })} />
                  <h3>Motion</h3>
                  <label className="admin-check">
                    <input
                      type="checkbox"
                      checked={content.motion.autoplayTicker ?? true}
                      onChange={(event) => edit({ ...content, motion: {
                        ...content.motion, autoplayTicker: event.target.checked,
                      } })}
                    />
                    Automatically move the homepage ticker
                  </label>
                  <label className="admin-check">
                    <input
                      type="checkbox"
                      checked={content.motion.autoplaySocial}
                      onChange={(e) =>
                        edit({
                          ...content,
                          motion: {
                            ...content.motion,
                            autoplaySocial: e.target.checked,
                          },
                        })
                      }
                    />
                    Automatically move Instagram posts
                  </label>
                  <label className="admin-check">
                    <input
                      type="checkbox"
                      checked={content.motion.autoplayCities}
                      onChange={(e) =>
                        edit({
                          ...content,
                          motion: {
                            ...content.motion,
                            autoplayCities: e.target.checked,
                          },
                        })
                      }
                    />
                    Automatically move city illustrations
                  </label>
                  <p>
                    Visitors can pause motion. Their reduced-motion preference
                    takes priority.
                  </p>
                  <label className="admin-check">
                    <input type="checkbox" checked={content.motion.revealSections}
                      onChange={(event) => edit({ ...content, motion: {
                        ...content.motion, revealSections: event.target.checked,
                      } })} />
                    Section reveal effects
                  </label>
                </>
              )}
              {tab === "Merchandising" && (
                <HomeMerchandisingFields value={content.homeMerchandising} onChange={homeMerchandising => edit({ ...content, homeMerchandising })} session={session} onExpired={onExpired} />
              )}
              {tab === "Campaigns" && (
                <CampaignFields
                  content={content}
                  onChange={edit}
                  session={session}
                  onExpired={onExpired}
                  onScheduleEditingChange={setScheduleEditing}
                />
              )}
              {tab === "Instagram" && (
                <InstagramFields
                  content={content}
                  onChange={edit}
                  session={session}
                  onExpired={onExpired}
                />
              )}
              {tab === "Pages" && (
                <PageFields
                  content={content}
                  onChange={edit}
                  session={session}
                  onExpired={onExpired}
                />
              )}
              {tab === "Category pages" && (
                <CategoryFields
                  value={content.landingPages}
                  onChange={(landingPages) =>
                    edit({ ...content, landingPages })
                  }
                />
              )}
              {tab === "Existing pages" && (
                <>
                  <label className="admin-field">
                    <span>Existing page</span>
                    <select aria-label="Existing page" value={existingPage} onChange={event => {
                      const value = event.target.value;
                      setExistingPage(value === "nimbus" || value === "contact" || value === "bulk" || value === "returns" ? value : "story");
                    }}>
                      <option value="story">Our Story</option>
                      <option value="nimbus">The Nimbus Collection</option>
                      <option value="contact">Contact</option>
                      <option value="bulk">Bulk Enquiry</option>
                      <option value="returns">Return &amp; Exchange</option>
                    </select>
                  </label>
                  {existingPage === "story"
                    ? <StoryFields value={content.storyPage} onChange={storyPage => edit({ ...content, storyPage })} />
                    : existingPage === "nimbus"
                      ? <NimbusFields value={content.nimbusPage} onChange={nimbusPage => edit({ ...content, nimbusPage })} />
                      : <ServicePageFields key={existingPage} page={existingPage} value={content.servicePages} onChange={servicePages => edit({ ...content, servicePages })} />}
                </>
              )}
              {tab === "Artwork" && (
                <TemplateArtworkFields value={content.templateMedia} onChange={templateMedia => edit({ ...content, templateMedia })} session={session} onExpired={onExpired} />
              )}
              {tab === "Media" && (
                <MediaLibrary session={session} onExpired={onExpired} />
              )}
              {tab === "Policies & blogs" && (
                <>
                  <EditorialFields value={content.editorialContent} onChange={editorialContent => edit({ ...content, editorialContent })} />
                  <AuthoredArticleFields value={content.authoredArticles} onChange={authoredArticles => edit({ ...content, authoredArticles })} session={session} onExpired={onExpired} />
                </>
              )}
              {tab === "History" && (
                <>
                  <h2>Revision history</h2>
                  <p>
                    Restore saved content as a new draft. Save local changes
                    before restoring.
                  </p>
                  {revisions.length === 0 ? (
                    <p>No revisions yet. Save a draft to start its history.</p>
                  ) : (
                    <ul className="admin-history">
                      {revisions.map((revision) => (
                        <li key={revision.id}>
                          <div>
                            <strong>
                              Version {revision.version} ·{" "}
                              {titleCase(revision.action)}
                            </strong>
                            <span>
                              {revision.actorEmail} ·{" "}
                              {new Date(revision.createdAt).toLocaleString()}
                            </span>
                          </div>
                          {session.user.role === "publisher" && (
                            <button
                              disabled={dirty}
                              onClick={() => void write("restore", revision.id)}
                            >
                              Restore version {revision.version}
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </fieldset>
            )}
          </div>
        </div>
      )}
    </>
  );
}
