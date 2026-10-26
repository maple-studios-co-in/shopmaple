# Navigation and category-copy fixes

Featured products in both mobile menu rails now close the controlled drawer when activated. The destination link remains unchanged, and drawer cleanup restores the previous body scrolling state. Previously, Next.js navigation changed the route while the persistent header left the modal covering the new page.

Desktop mouse departure now preserves an active submenu when one of its descendants holds keyboard focus. Mouse-only departure, outside focus/pointer and Escape continue to dismiss it. Short category introductions now display their complete normalized text without an added ellipsis; expansion controls appear only above 200 normalized characters. Existing long-source excerpts and Read More/Read Less labels are unchanged.

TDD: navigation characterization passed before three assertion failures reproduced the two mobile rails and focused-panel dismissal. Final navigation/header/internal-link tests pass 15/15. Category characterization passed 2/2 before eight expected failures covered short, empty, boundary-length and whitespace cases; focused tests pass 10/10 and affected category tests pass 42/42.

Integrated verification passes 682 tests: 238 API, 386 web and 58 deployment/recovery. Typecheck and production build pass. Independent read-only diff review found no actionable issues. Final-commit security and exact-head CI are release gates recorded in the PR.

Browser verification reproduced the mobile modal defect before the change. The rebuilt application closes both main and Living Room featured links and restores scrolling at 390px. Keyboard ArrowDown enters the desktop panel; Escape closes it and restores the trigger. The sofa introduction preserves its original collapsed preview and expands to all 1,098 normalized characters. Pointer-departure behavior is covered by regression tests, not a native browser pointer test. The two featured products are absent from the limited local catalogue, so these navigation checks do not establish catalogue completeness.

Initial homepage scripts total 227,216 raw bytes and 68,263 gzip bytes, an increase of 128 and 36 bytes over PR #34. The existing unrelated-template payload gate passes. No performance improvement is claimed from this measurement.

No database, content, account, dependency, production or checkout changes are included. Production deployment remains gated by capacity and private publisher provisioning. The full goal remains active; structured page authoring and broader source/layout, accessibility, operational and commerce acceptance still need work.
