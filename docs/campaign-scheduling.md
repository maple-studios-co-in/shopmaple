# Campaign visibility windows

Shop Admin can set an optional start and end for each existing campaign slot. Inputs and summaries use India time (Asia/Kolkata, UTC+05:30) regardless of the operator computer's timezone. Storage uses explicit-zone ISO instants. The start is inclusive and the end exclusive; either bound may be empty. Clearing a window restores an always-visible campaign without changing its artwork, destination or copy.

Apply the schedule edit, Save draft, then Publish draft. Pending local schedule edits disable the parent Save/Publish controls and section switching so displayed inputs cannot be silently omitted. Cancellation retains the previous draft window. Editors may save; only a currently authorized publisher may publish. Existing Origin/CSRF, session checks, optimistic versions, revision history and media-publication transactions continue to apply. No migration, worker, commerce permission or inventory/order write is introduced.

The server evaluates each fresh render with its clock. A small client component handles already-open pages at the next start/end boundary and rechecks after focus or visibility resumes; there is no recurring polling interval or animation dependency. Browser clock accuracy affects an already-open page's timing. JavaScript-disabled pages change on the next navigation/reload. A schedule is a presentation rule, not an embargo: published API content and published media remain public before a future display time. Drafts remain private.

When a successful content response validates, its timing controls banner appearance. A genuine `CONTENT_NOT_PUBLISHED` 404 retains the initial bundled banners. Other failures or malformed responses suppress promotional banners while retaining the rest of the original store defaults; an expired published offer must not reappear as a bundled fallback during an outage. An inactive banner renders no section, offer or link; bundled artwork is not substituted for it.

## The product page timer

A campaign may carry a timer offer (an offer line and a code, under **Product page timer** beside its schedule). While that campaign's window is open, every product page shows "Don't miss the deal" with the code and a countdown to the schedule's end, plus the offer tab on the page's edge. There is one source of truth: moving the schedule moves the timer, and no dates are entered twice. Publishing is what applies a change, as with any campaign edit; a page already open picks up a new schedule on its next load, and honours the window it already has at each start and end.

- A timer needs a deadline: a campaign with an offer but no end shows no timer, and the form says so.
- When campaigns overlap, the shopper sees the deadline that comes first. When it ends, the next one takes over.
- A running campaign's offer takes the place of the offer set by hand under Product highlights, which still runs when no campaign does.
- During an API outage no offer runs, for the same reason no banner does.
- The code is shown to shoppers; nothing here creates or applies a discount. Add only an offer your team honours.
- A schedule is not an embargo here either: once published, a code scheduled for later can be read in the page's data before its start, so publish a code only when it may be seen.

`CAMPAIGN_DEAL_DEMO=1` runs a placeholder offer (SALE30) through this same path for local design reviews, until a real campaign carries an offer. A production server ignores it. To remove it, delete `apps/web/lib/demo-campaign-deal.ts` and its call in `readPublishedContent`.

## Verification

Verification includes legacy omission/null, explicit-zone/date bounds, equal/reversed windows, start/end instants, opening/closing on an already-open page, focus resumption, source-copy preservation, invalid API responses, editor/publisher boundaries, real database save/publish/restore and stale-version rejection. Browser checks and the final combined test/security/release results are separate evidence; this document alone does not assert deployment.
