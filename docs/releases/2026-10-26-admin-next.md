# Shop Admin readiness increment — 26 October 2026

## Outcome

An authenticated staff member with enquiry permission can now open the protected enquiry inbox even when the independent content draft request fails or returns malformed content. Previously, `apps/web/components/admin/editor.tsx` hid all section navigation until the content document loaded, so a CMS problem also blocked enquiry operations.

The overview retains its loading/error and explicit retry path. Content fields remain unavailable until a valid draft loads, and saving/publishing remain disabled. The Enquiries section retains its own current-session/capability checks and denial handling; a 401 returns to sign-in and a 403 exposes no enquiry rows. Restoring content availability re-enables the existing editor. This is a local implementation change, not production readiness or deployment evidence.

## Existing implementation verified in this checkout

| Capability | Existing source and boundary |
| --- | --- |
| Banner and campaign authoring | `apps/web/components/admin/forms.tsx`, `campaign-schedule-fields.tsx`, `template-artwork-fields.tsx`, and `media-library.tsx`: copy, artwork, scheduling and media controls already exist. |
| Page and homepage section editing | `apps/web/components/admin/editor.tsx`, `service-page-fields.tsx`, `authored-article-fields.tsx`, and `home-details-fields.tsx`: page content and homepage order/visibility use the existing saved document. |
| Draft, publish and revision recovery | `apps/api/src/admin/content.ts`: versioned writes, revision history, explicit publisher-only publication and restoration into a draft. `apps/web/components/admin/editor.tsx` prevents publication of unsaved local changes. |
| Protected enquiry operations | `apps/api/src/admin/enquiries.ts`, `apps/web/components/admin/enquiry-inbox.tsx`, and `enquiry-workflow.tsx`: separate `canManageEnquiries` capability; metadata list, detail, review, assignment, internal notes and activity. Writes retain current version and CSRF validation. |
| Enquiry alerts | `apps/api/src/enquiry-delivery-provider.ts`, `enquiry-delivery-worker.ts`, `enquiry-delivery-runner.ts`, `admin/enquiry-delivery.ts`, and `apps/web/components/admin/enquiry-delivery-panel.tsx`: disabled-by-default delivery, durable jobs, bounded retries and provider acceptance state. Acceptance is explicitly not mailbox delivery. Public receipts in `apps/api/src/enquiries.ts` retain `notificationSent: false`. |
| Initial publisher setup | `deploy/bootstrap-shop-admin.sh`, `apps/api/src/admin/bootstrap-cli.ts`, and `docs/admin-release.md`: private create-only setup for `aditya@maplefurnishers.com`; no default password or public signup. |

The intended team alert recipient is `contact@maplefurnishers.com`, as documented in `docs/enquiry-delivery.md`. It is separate from the publisher identity; the publisher role does not automatically grant enquiry permission. This increment does not read or update private runtime configuration, provision an account, grant a capability, or send email.

## Tests and review

Files changed for this increment:

- `apps/web/components/admin/editor.tsx`
- `apps/web/test/admin-dashboard.test.tsx`
- This release note

Node.js 22.21.1 was used. From `apps/web`, RED command:

```sh
npx tsx --tsconfig test/tsconfig.json --test \
  --test-name-pattern='unavailable content|authorised enquiry staff' \
  test/admin-dashboard.test.tsx
```

Before implementation, both new tests failed with the expected assertion `Missing Enquiries button`. The same command then passed 2/2 after implementation. The cases cover service failure, malformed draft response, recovery through explicit retry, absent capability, enquiry 403 and expired-session 401.

Affected UI integration command:

```sh
npx tsx --tsconfig test/tsconfig.json --test \
  test/admin-dashboard.test.tsx \
  test/admin-enquiry-inbox.test.tsx \
  test/admin-enquiry-delivery.test.tsx \
  test/admin-enquiry-workflow.test.tsx
```

Result: 51/51 passed. Existing Node MockTimers experimental warnings were emitted. These tests render real React components and substitute only the HTTP transport. No database, notification provider or live account was touched. The integrating agent owns full repository tests, typecheck, production build, dependency/secret/static checks and final security review; this note does not substitute the focused results for those gates.

## Remaining operational gates

1. Review and deploy an immutable integrated API/web release with the applicable migrations, adequate capacity and verified paired database/media backup and restore evidence.
2. Privately provision the initial publisher and verify production sign-in, cookie/proxy behavior, edit/save/publish/restore and ordinary public storefront output. Separately authorize enquiry access where needed.
3. Configure verified sender credentials and the chosen recipient in the protected production environment. Keep alerts disabled until a separately authorized controlled acceptance test establishes provider acceptance and actual receipt at `contact@maplefurnishers.com`.
4. Verify public enquiry persistence, duplicate handling, authorised inbox access and delivery recovery under the intended operating policy. Do not claim notification success from queue insertion or provider acceptance alone.

No credentials, live email, production writes, staff-management UI, password-reset UI, MFA, delivery/bounce webhooks or checkout activation are added by this increment. See `docs/admin-release.md` and `docs/enquiry-delivery.md` for the existing operational procedures and boundaries.
