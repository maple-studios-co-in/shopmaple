# Shop content and motion

User direction: create a dedicated shop backend for website content, pursue the remaining work as a goal with parallel agents, preserve original Shopify copy, improve interactivity and follow TDD/security gates. Keeri continues to own products, inventory, orders and deliveries. The first release below is a working increment, not completion of the entire commerce roadmap.

## Architecture and choices

Use the existing Next 16 / React 19 storefront, Express API, Prisma and isolated PostgreSQL shop database. Add `/admin` and same-origin `/api/admin` content endpoints. A second service/database and external SaaS CMS would add operational overhead; a typed content module fits existing deployment and keeps content independent from commerce. These are implementation choices, not new user requirements.

Native scroll-snap rails and CSS transitions cover Instagram/city/product rows without an animation dependency. GSAP/Anime.js remain candidates for complex future choreography. Never hijack scrolling or animate essential content from permanently hidden SSR markup. Respect live reduced-motion changes, keyboard focus, hover, document visibility and offscreen suspension. Match the verified Shopify Instagram row: 24 source posts, six across on desktop, source proportions; accessible pause and navigation.

## First increment

- Secure staff login with editor/publisher roles, opaque hashed sessions, eight-hour expiry, origin+CSRF checks, bounded login attempts, no public signup. Production uses Secure HttpOnly SameSite=Strict host-only cookies. Credentials are provisioned privately; never committed or put in chat.
- One versioned storefront document: homepage section order/visibility; named homepage text fields; all campaign copy; curated Instagram post data; custom informational pages; motion preferences.
- Published content is separate from drafts. Save/publish/restore use optimistic concurrency. Immutable revisions retain actor attribution. Restore creates a draft requiring explicit publish. Public readers receive only published data; failed/absent content reads use original bundled content, never draft data.
- Admin forms offer section movement, visibility, copy fields, campaign previews, Instagram entries, custom pages and history. No raw HTML, arbitrary CSS, uploaded code or arbitrary remote media origins.
- Existing functional page routes are reserved. New custom pages render escaped text and approved images. Original copy remains the initial default; no automatic rewriting.
- No customer records or inventory/order writes from this module. Existing checkout gates remain disabled.

## Security and validation

Strict shared Zod contract bounds fields, lists and serialized payload to 128 KiB; URL inputs accept canonical internal links or specifically approved media/social hosts and paths. Reject encoded/control-character/backslash URL tricks and duplicate section/post/page/campaign identities. Server-side session and role checks are authoritative, including role changes after login. Admin responses are no-store, including errors. Content reads are fresh and do not reuse the catalogue cache. Concurrent writes must never overwrite another editor silently.

## Follow-up scope tracked in the goal

Remaining existing-layout copy controls, media upload/storage workflow, campaign scheduling, CRM enquiry inbox/assignment/notifications, verified automatic Shopify refresh, product completeness, consistent tax basis, serviceable delivery/packing data, merchant setup, payment recovery and Keeri order readiness. These require separate tested increments; public checkout remains blocked until all commerce gates pass.

## Acceptance

Unauthenticated users cannot read drafts or mutate content. An editor can save/reorder content without changing public output; a publisher can publish and restore revisions without lost updates. Published homepage/custom pages render the saved safe content, retaining source defaults on initial launch. Original Instagram cards move with accessible pause and are usable without JavaScript. All changed behavior has recorded RED/GREEN evidence; complete tests, build, security scans, independent diff review and desktop/mobile browser checks precede release claims.
