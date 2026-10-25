# Keeri export transport boundary

`apps/api/src/keeri-fetch.ts` is a server-only consumer for the **proposed** version-1 export contract already described in [Keeri integration](keeri-integration.md). It does not prove that Keeri exposes that endpoint today. No environment wiring, schedule, database import or real service credential is enabled by this module.

An operator-owned configuration supplies a fixed HTTPS endpoint, exact trusted origin, service bearer token and expected tenant. Never populate these from browser input. Query strings, fragments, embedded credentials, insecure schemes and cross-origin destinations are rejected before the transport runs. Redirects are refused, including same-origin redirects, so credentials cannot follow a redirected request. The endpoint must be a reviewed trusted service host; this is not a general arbitrary-URL fetch proxy or a DNS-based SSRF filter.

The consumer accepts only a 200 JSON response, bounds the entire transfer (15 seconds and 10 MiB by default), aborts stalled connection/body reads, bounds streamed bytes independently of Content-Length and validates the full export and cross-record tenant ownership before returning. Returned variants remain unavailable until stock reservation guarantees exist. Errors expose stable codes, never tokens, response bodies or raw upstream exception messages. There are no automatic retries or writes.

The credential protocol and route need to be implemented or confirmed on the producer before activation. This module deliberately does not reuse an admin browser session or private media URLs as public access.

## TDD evidence

Command: `node --import tsx --test apps/api/test/keeri-fetch.test.ts` under Node 22.

- RED: seven consumer tests failed against the explicit unimplemented boundary, including assertion mismatches for required configuration, tenant, size and timeout rejections.
- GREEN: all eight tests passed after implementation. External fetch is injected; real response streams, abort signals, JSON/schema/tenant adaptation and product projection execute.
- Cases: fixed-destination authentication, unsafe destinations, redirect/status/content-type rejection, invalid complete/tenant/ownership data, declared and streamed overflow, connection/body deadline and redacted failure codes.
- A later regression test first failed with `false !== true` for an unread response arriving after timeout; cancellation was added and the eight-test suite passed.
- These tests establish local consumer behavior, not a live authenticated Keeri round trip. Full suite/typecheck/build and final security review are separate integration checks.
