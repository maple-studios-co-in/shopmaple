# Project engineering rules

These rules apply across the monorepo. Read any more-specific `AGENTS.md` before changing that area.

## Test-driven development

- Every new feature, defect fix, behavior change, and refactor uses the RED → GREEN → REFACTOR loop in [docs/testing.md](docs/testing.md).
- Before implementation, write a behavior test and run it. Record the exact command and the expected failing assertion. An import error, broken fixture, missing database, or accidental syntax error is not adequate RED evidence.
- Implement only enough to pass. Run the focused test, then affected integration tests and the entire project suite before completion. Refactor only while green.
- Tests assert observable behavior with independent expected values. Do not assert source text, mock existence, or implementation structure merely to increase coverage.
- Use real business logic and the dedicated test database. Mock only external transport boundaries; never send test orders, messages, or payments to live systems.
- Existing code is not retroactively TDD. Add characterization tests for behavior being changed, then a failing regression test for the intended change. Report remaining untested areas honestly.
- Pure prose, generated output, and declarative configuration do not need artificial unit tests. Validate with the actual parser, build, scanner, or workflow. Any custom executable logic still requires behavior tests first.
- Include RED/GREEN commands, results, and limitations in the PR. Do not claim a failing suite passed or omit unrelated failures. Never change a test only to conceal a real failure.

## Admin UI

- The shop admin is built on shadcn/ui. Components come from `apps/web/components/ui` (owned code from `components.json`); compose them with Tailwind utilities in the admin components.
- Write no new hand-written CSS for the admin. `apps/web/styles/admin.css` is the token file: `--admin-*` tokens, the shadcn variable mapping and the scoped base. Change a token there instead of adding a rule. Overlays render inside `.shop-admin` through `AdminRoot`.

## Storefront UI

- The owner decided on 2026-11-01: the product page follows the "Maple / PDF Review" Figma design; every other storefront page (homepage, header, footer, mega-menu, collections, category pages, Our Story, Help, wishlist and account) keeps its classic look. Don't rebuild those pages on a Figma design unless the owner asks for that page, and show the owner a preview before any visual change ships.
- The product page and its parts live in `apps/web/components/store` and use Tailwind utilities with the storefront tokens (`bg-cream`, `text-espresso`, `text-taupe`, `border-sand`, `bg-brand`, `font-body`, `font-serif`, `text-label` ... `text-h1`), wrapped in `data-store`. Its "More …" row uses `product-card-figma.tsx`; the rest of the store uses the classic `product-card.tsx`.
- Classic pages are styled by their own stylesheets in `apps/web/styles` (loaded by the root layout) together with `tailwind.css`. Keep visual changes to classic pages small and in the existing stylesheet for that page.
- Reach markup in tests through `data-*` hooks, not class names.

## Security and delivery

- Follow [SECURITY.md](SECURITY.md). Run dependency, secret, and static checks for each implementation increment and again on the final commit. Review findings before merge.
- Changes to authorization, checkout, payments, webhooks, synchronization, or persistence require adversarial regression cases and a security review of the final diff.
- Keep credentials, personal customer data, and production database URLs out of source, logs, fixtures, and reports. Scan with redaction. Do not weaken gates or add broad allowlists to make CI green.
- Use Node.js 22. Install from the lockfile. Never run destructive integration tests against development or production data.
- Keep checkout disabled until the documented live integration and operational release gates pass. A passing local suite or merged PR is not a production deployment or proof of a working merchant account.
- Parallel agents must have explicit, separate file ownership. Coordinate shared contracts and migrations before editing; the integrating agent runs the complete suite after all changes land.
