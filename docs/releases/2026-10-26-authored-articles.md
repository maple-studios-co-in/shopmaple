# Shop Admin article authoring

Shop Admin can create articles under the four existing blogs. Staff choose a fixed route and supply title, excerpt, optional cover, and up to 60 structured paragraph, heading, quotation, list, link or image blocks. The existing ten source articles retain their copy, artwork, dates and ordering. Up to 20 authored articles fit within the existing 128 KiB document limit, with a 48 KiB per-article limit.

New required fields start empty. Instructions cannot accidentally become published body copy or image descriptions. Draft preview uses authenticated image URLs and escaped text. Save, publish and restore apply to the entire storefront document; publication is not per article. Removing an article removes its public route only after publishing that draft. Identity changes require removal and recreation; automatic redirects are not included.

The API checks publisher/session, same-origin, CSRF and document version before publication. It validates internal link destinations against the candidate pages/articles and existing catalogue routes. Managed covers and inline media pass the shared private-media gate, including hash verification. Noncanonical dot/repeated-slash image paths are rejected. Failed validation rolls back content, media, revision and date-ledger changes together.

The additive `20261027050000_authored_article_publications` migration creates `ShopArticlePublication`. The server records first publication by blog/handle and preserves it across removal, republication and revision restoration. Client-supplied dates cannot override it. Keep this table with paired backups; do not drop it during an application rollback.

Content schemas are strict: older binaries cannot parse documents containing `authoredArticles`. Deploy API and web together with the migration, and retain a compatible release and paired backup. Prefer a reviewed content revision restored and published through compatible code over an unplanned binary rollback. During content API failure, the original source fallback remains available, but newly authored routes are unavailable until the publication can be read again.

TDD evidence covers valid contract rejection before implementation, date forgery, missing destinations, private media, same-size media tampering, timestamp normalization exceeding the byte cap, canonical path aliases, original source preservation, public route/index/metadata, editor creation/block operations and blank required fields. Separate independent review identified the instructional-default and path-alias issues; regressions precede their fixes. Final suite/build/security/CI results belong in the PR and verified local report.

No production deployment, public article creation, staff credential or customer notification is part of this increment. Production capacity and private publisher provisioning remain prerequisites. The confirmed first publisher is aditya@maplefurnishers.com. Checkout remains disabled.
