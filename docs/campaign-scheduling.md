# Campaign visibility windows

Shop Admin can set an optional start and end for each existing campaign slot. Inputs and summaries use India time (Asia/Kolkata, UTC+05:30) regardless of the operator computer's timezone. Storage uses explicit-zone ISO instants. The start is inclusive and the end exclusive; either bound may be empty. Clearing a window restores an always-visible campaign without changing its artwork, destination or copy.

Apply the schedule edit, Save draft, then Publish draft. Pending local schedule edits disable the parent Save/Publish controls and section switching so displayed inputs cannot be silently omitted. Cancellation retains the previous draft window. Editors may save; only a currently authorized publisher may publish. Existing Origin/CSRF, session checks, optimistic versions, revision history and media-publication transactions continue to apply. No migration, worker, commerce permission or inventory/order write is introduced.

The server evaluates each fresh render with its clock. A small client component handles already-open pages at the next start/end boundary and rechecks after focus or visibility resumes; there is no recurring polling interval or animation dependency. Browser clock accuracy affects an already-open page's timing. JavaScript-disabled pages change on the next navigation/reload. A schedule is a presentation rule, not an embargo: published API content and published media remain public before a future display time. Drafts remain private.

When a successful content response validates, its timing controls banner appearance. A genuine `CONTENT_NOT_PUBLISHED` 404 retains the initial bundled banners. Other failures or malformed responses suppress promotional banners while retaining the rest of the original store defaults; an expired published offer must not reappear as a bundled fallback during an outage. An inactive banner renders no section, offer or link; bundled artwork is not substituted for it.

## The product page timer

Since 10 November 2026 the product page's "Don't miss the deal" box and its edge tab show only the product's own offer from Keeri (the catalogue's `offers=1` level), while it runs. Its code is one checkout takes. Campaigns and Product highlights no longer carry a timer offer: a store-wide code could name an offer checkout does not apply. A `deal` saved on a campaign or under Product highlights before then still parses and is kept, but nothing reads or edits it. Campaign banners and their schedules are unchanged. Offers are set up in Keeri; see `docs/keeri-integration.md`.

## Verification

Verification includes legacy omission/null, explicit-zone/date bounds, equal/reversed windows, start/end instants, opening/closing on an already-open page, focus resumption, source-copy preservation, invalid API responses, editor/publisher boundaries, real database save/publish/restore and stale-version rejection. Browser checks and the final combined test/security/release results are separate evidence; this document alone does not assert deployment.
