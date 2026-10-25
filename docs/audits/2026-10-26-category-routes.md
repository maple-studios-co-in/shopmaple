# Next storefront parity increment — bounded audit, 26 October 2026

Read-only audit of checkout `8e83717` on `codex/shop-paired-recovery`, the public Shopify reference, and the deployed store. Only this report was written. No forms, carts, accounts, messages, orders, or payments were submitted. No implementation, test run, deployment, or complete-site certification is claimed.

## Main finding

**The outstanding sampled route mismatch is `/collections/chairs`, not `/pages/chairs`. They are two different source designs.** Redirecting one to the other would be a migration adaptation, not exact source parity. The misleading footer self-link identified by the earlier audit has already been removed in both current code and the live store.

| Route | Current Shopify reference | Current deployed store |
| --- | --- | --- |
| `/pages/chairs` | Chairs introduction; six chair-category tiles; Best Sellers; Chairs; Bedrooms; Living; Maple Difference values; Paired Together | Same sampled copy/section sequence, plus authorized campaign banners. Best Sellers correctly points to `/collections/chair-collection`. Read More expands and exposes `aria-expanded=true`. |
| `/collections/chairs` | Distinct legacy editorial template: newest-arrivals hero, sofa-category tiles, product/offers/room merchandising, signature banner, design rails, FAQ, craftsmanship values | Generic 35-item chair grid, filters, sorting and two pages. None of that legacy editorial structure. |
| `/collections/chair-collection` | Separate collection linked by the Chairs editorial Best Sellers CTA | An implemented local collection. Its membership is not equivalent to the generic `chairs` category; do not use it as a replacement for the whole existing chair grid without preserving that distinction. |

Live browser checks used an agent-owned background IAB tab. The source `/collections/chairs` visibly rendered its legacy editorial structure, while the destination route rendered 35 items and the generic snapshot note. Its only same-URL links were the two normal **Clear all** controls. The old “Browse the complete chair collection on our current shop” text/link was absent. This earlier finding is closed for the inspected runtime.

Sources:

- [Original legacy Chairs route](https://shop.maplefurnishers.com/collections/chairs).
- [Original Chairs page](https://shop.maplefurnishers.com/pages/chairs).
- [Deployed collection route](https://store.maplefurnishers.com/collections/chairs).
- [Deployed Chairs page](https://store.maplefurnishers.com/pages/chairs).
- Original owner-exported theme: `/Users/adityaagrawal/Documents/ChatGPT/MapleFurnishers/reference/shopify-153432359101/theme/templates/collection.chairs.json` and `page.chairs.json`.
- Current route dispatch: `apps/web/app/collections/[handle]/page.tsx:22`; generic listing footer: `apps/web/components/collection-listing.tsx:361`; category page: `apps/web/app/pages/chairs/page.tsx`; content: `apps/web/data/landing-categories.json:408`.

## Priority 1: restore the distinct legacy Chairs landing with honest destinations

For the user's exact-source direction, implement a dedicated renderer/data record for the **unfiltered `/collections/chairs`** route. Keep the existing `/pages/chairs` editorial page and its navigation destinations. Keep query-driven chair browsing available: the existing all-furniture category filter (`/collections/all?category=chairs`) provides the same category predicate without conflating it with `chair-collection`. Decide and test legacy filter query behavior explicitly, rather than silently dropping `q`, `sort`, `availability`, `min`, `max`, or `page` when dispatching the editorial route.

The observed legacy section sequence is:

1. Introducing / Our Newest Arrivals hero and descriptive paragraph.
2. Ten sofa-category tiles, in source order: Designer Sofa Sets, Wooden Sofas, Fabric Sofas, L Shape Sofa, Sofa Cum Beds, Recliners, Chesterfield Sofas, 3 Seater Sofas, 2 Seater Sofas, Sofas. These unexpected sofa tiles are genuinely present on the original Chairs route; do not silently relabel them as chairs.
3. Seat tagline and Best Sellers rail (source collection `all`, CTA `/collections/all`).
4. Four offer tiles, with the observed expired-offer state. Do not restart an expired countdown.
5. Moving room-rhythm text.
6. An unconfigured room block, followed by Bed Room and Living Room merchandising with featured products.
7. Signature-product banner.
8. Bentley Chair rail (the source collection currently has no products), then Accent Chair rail.
9. Five FAQ disclosures, then Grain / Edge / Fabric / Polish values.

**The original also contains defects that should be documented adaptations:** its unconfigured room block has an empty heading, “Next, select a collection to display products”, and Shop collection/View all anchors pointing back to `/collections/chairs`. The export names nonexistent `dinning-tables`. Do not reproduce this broken circular interaction. Omit the unconfigured block or use a clearly approved existing collection with accurate copy. Likewise, do not manufacture products for the empty Bentley collection. Preserve the source section only with an honest empty state, or document its omission.

The FAQ includes operational claims about order emails, shipping charges and returns. Preserve source copy only alongside existing truthful preview/service boundaries; this work does not establish a shipping calculator or notification service. FAQ disclosure must not submit anything.

Avoid changing catalogue identity, variant mappings, price authority, membership, checkout or CMS contracts merely to reconstruct this route. The existing local `bed-room`, `living-room`, `bentley-chair` and `accent-chair` collections provide concrete source-derived membership. Use the safe existing product-card fallbacks if a source product is not in the owned API.

### Required test-first behavior for this increment

Use Node 22. Add characterization before changing the dispatcher, then add an assertion-failing regression test. Suggested focused command from `apps/web`:

```sh
npx tsx --tsconfig test/tsconfig.json --test test/chairs-landing.test.tsx test/collections.test.tsx test/internal-navigation.test.tsx
```

`chairs-landing.test.tsx` is proposed and does not exist yet. Suggested independent expectations:

- Bare `/collections/chairs` renders the observed newest-arrivals heading, room merchandising, five FAQ controls and values in source order; it does not return only the generic grid. Expected RED: newest-arrivals heading absent.
- `/pages/chairs` retains its distinct title/introduction and six chair categories. Its Best Sellers CTA remains exactly `/collections/chair-collection`, never `/pages/chairs` or the legacy landing.
- A real visitor following each editorial CTA reaches a useful local destination. No “Shop collection” or “View all” advertises the same route as its own destination; do not prohibit legitimate filter-reset or fragment links generically.
- Existing filter/sort/page requests preserve the same chair predicate and query state under the chosen compatibility behavior. Include a chair absent from `chair-collection` and a non-chair fixture so replacing membership would fail.
- Empty/missing room collections do not expose the theme-editor placeholder, an empty heading, fabricated stock, or circular CTA. Empty Bentley content is explicit.
- FAQ keyboard/click behavior expands the corresponding answer without opening unrelated answers or triggering transport. Expired offer stays expired.
- If the moving text is implemented, reduced motion and missing motion APIs produce readable stationary text; keyboard focus and pause controls stop motion; offscreen/hidden content suspends motion; cleanup removes timers/listeners. Reuse the verified motion primitive where suitable.

Then run the affected category/content/navigation suite, complete `npm test`, `npm run typecheck`, `npm run build`, and `npm run security:check`; scan staged changes and final commit per repository rules. Browser acceptance needs original/deployed pairs at desktop/mobile with full-page section checks, the CTA destinations, FAQ keyboard behavior, actual reduced motion, and query compatibility. Do not call the existing HTTP 200 route check parity evidence.

## Priority 2: remaining sampled category pages need visual acceptance, not another copy rewrite

Fresh public HTML reads on 26 October were compared with `apps/web/data/landing-categories.json` and the exported source templates. The exact **distinct product-handle sets** match for the three sampled editorial pages: Sofas 24, Tables 32, Chairs 25. This does not prove row-level order or live inventory authority. The values headings and body copy also match the current public source:

- [Sofas](https://shop.maplefurnishers.com/pages/sofas): Grain / Edge / Fabric / Polish.
- [Tables](https://shop.maplefurnishers.com/pages/tables) and [Chairs](https://shop.maplefurnishers.com/pages/chairs): Quiet Luxury / Built for Real Living / Ages Beautifully / Strength You Don’t See.
- Tables Best Sellers View all points to `/collections/tables`; Chairs Best Sellers View all points to `/collections/chair-collection`; Sofas has no View all link in the fetched page. Local data matches these settings.
- The exported source uses a desktop product carousel and `carousel_on_mobile: false` for these rows. The local mobile two-column grid is supported by that source setting; it is not evidence of missing autoplay. Do not enable automatic motion on all product rows just because the user asked for moving layouts.
- The live Chairs page's introduction matched the source opening, its values copy matched, and Read More worked. Full expanded introduction equality was not machine-compared between the two pages, but the source expanded text matches the stored prose on inspection.

The next evidence task for these three pages is matched desktop/mobile full-page comparison of imagery, spacing, typography, row ordering, image crop, hover/focus effects and visible movement, using authorized Suggested campaign replacements. This audit did not reopen Figma or inspect all responsive states, so it cannot claim a new Figma acceptance. Existing provenance's first-viewport acceptance is deliberately narrower.

## Documentation corrections to accompany implementation

- `docs/audits/2026-10-26-page-parity.md` still reports the removed legacy footer self-link. Record it as verified closed without implying the legacy route's editorial parity is closed.
- `docs/ui-parity-progress.md` says unsupported category links and missing products continue on Shopify. Current `landingCollectionHref` instead uses a local `/collections/all?q=...` fallback, and `SourceProductCard` is an enquiry-only local contact link with Price on request. Preserve the current safe behavior and update the historical/superseding documentation deliberately.
- `apps/web/data/landing-PROVENANCE.md` makes the same outdated external-link fallback statements. Current tests already assert the local/enquiry behavior.
- Do not repeat the earlier audit's implication that the bespoke source `/collections/chairs` page “already exists” at `/pages/chairs`: the browser and theme confirm different content templates.

## Limits

No mobile/browser viewport sweep, retained screenshot packet, Figma reinspection, performance run, service submission, backend verification or automated test suite was performed in this read-only task. The source's product list changed relative to the web index's cached rendering; current ordinary-browser/public-HTML observations take precedence over that index. Other categories, Nimbus, Our Story, policy/article bodies and PDP variant identity remain outside this sample. This report recommends the next bounded increment; it does not claim the storefront is complete.
