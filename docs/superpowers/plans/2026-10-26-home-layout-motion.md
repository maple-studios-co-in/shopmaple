# Suggested homepage composition and source ticker

Continue the active goal from merged PR45. Saved Figma251-507/251-508 and original theme index.json are the visual/content references. Preserve original Shopify copy and existing published overrides. Reuse source video/poster/logo, original testimonial and original collection titles. Do not invent portraits, new claims, reviews or newsletter success.

- Inset light testimonial section: heading/video on the left, separate quote panel on the right; stack logically on mobile. Keep all paragraphs, attribution and controlled video.
- Inset burgundy newsletter panel: editorial left, existing logo/form right. Keep unavailable/unsent states honest.
- Add visible chair heading using source Chairs, and context-labelled View all links. Original bestseller section uses collection all; chair link opens the existing chairs collection. Preserve product order and partial failures.
- Restore source scrolling slogan with native/CSS motion, Pause/Resume, sticky user pause, focus/hover suspension, hidden/offscreen suspension, reduced-motion/full-copy and no-JS fallback. No animation dependency.
- Add optional published ticker autoplay and chair-heading fields, legacy-compatible omissions, existing draft/publish/version/role controls; no automatic publication.

Ownership: ticker agent owns new ticker component/CSS/tests; editorial agent owns HomeTestimonial/HomeNewsletter and only corresponding home-parityCSS/tests; CMS agent owns content contract/admin editor/new API+admin tests and exclusive dedicated test DB until release. Root owns homepage/layout integration, railCSS/default heading/render tests, final integration/docs/browser/release.

TDD with genuine assertion RED, focused GREEN and complete suite/types/build/bundle/security. CSS composition is verified through rendered browser geometry/screenshots rather than source-string tests. Independent immutable final review before merge. Production remains gated by capacity/backup recovery; keep checkout and enquiry delivery disabled. The confirmed publisher is aditya@maplefurnishers.com; alert recipient contact@maplefurnishers.com, with private setup still pending.
