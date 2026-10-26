# Navigation Continuity Implementation Plan

> **For agentic workers:** Use the user-requested parallel agents with separate file ownership. Steps use checkbox syntax for tracking.

**Goal:** Close the mobile menu on featured-product navigation and preserve a desktop submenu while its links hold keyboard focus.

**Architecture:** Extend the existing rail callback and desktop dismissal guard. Keep the existing controlled drawer and native links; no global route listener.

**Tech Stack:** Next.js 16, React 19, Node.js 22, existing TypeScript/JSDOM tests.

**Spec:** `docs/superpowers/specs/2026-10-26-navigation-continuity.md`

## Global constraints

- Preserve all source menu copy, assets, hrefs and ordering.
- Real behavior RED must precede implementation; no dependency install or checkout activation.
- No database changes; security checks and independent final review before merge.

## Review focus

- Both featured rails must close, not only the initial menu.
- Focused submenu content must remain connected and focused after mouse departure.
- Mouse-only departure must still dismiss the panel.
- Escape/outside blur must continue to dismiss and return focus appropriately.
- Controlled drawer closure must restore prior body overflow and retain destination hrefs.

## Task 1: Navigation regressions and fixes — navigation agent

Files: `apps/web/components/navigation.tsx`, `apps/web/test/navigation.test.tsx`.

- [x] Characterize existing mouse, keyboard and controlled-drawer behavior.
- [x] Add and run RED for main and Living Room featured-product activation: close callback, closed dialog, restored body overflow, unchanged local destination.
- [x] Add and run RED for pointer leave while a panel link is focused: panel and focused element remain; mouse-only departure still closes.
- [x] Implement optional `onNavigate` on ProductRail and pass `onClose` at both mobile call sites; guard desktop mouse departure when the active panel contains document focus.
- [x] Run navigation tests and affected header tests; record RED/GREEN and limitations.

## Task 2: Integration and release — parent

In parallel, the category agent owns only `apps/web/components/category-controls.tsx` and new `apps/web/test/category-introduction.test.tsx`. Characterize long-source collapse behavior, then RED short, empty, 198/200-character and whitespace-threshold cases. GREEN must preserve the normalized full text at 200 or fewer characters, and retain the existing excerpt and toggle behavior for longer introductions. Parent verifies source-copy preservation and affected category tests.

- [x] Independent diff review for link semantics, focus and cleanup.
- [x] Full project and recovery suites (682 tests), types and production build.
- [ ] Final-commit dependency, secret and static checks.
- [x] Browser mobile featured navigation, desktop keyboard entry/Escape, source category expansion and viewport restoration. Pointer departure is covered by regression tests; no native browser pointer claim.
- [ ] Commit, exact-head CI, authorized merge and main tree comparison.
- [ ] Update backlog with measured evidence and unresolved production/commerce gates.
