# Cart recovery and carousel keyboard acceptance

The preceding goal increment made progress: PR37 merged with matching tested and main trees. This increment addresses remaining shopping-state correctness and keyboard access; the complete storefront/CMS/commerce goal remains active.

## Requirements

- A delayed cart write must stop blocking feedback indefinitely. A rejected or timed-out transport must not be treated as proof the server rejected the operation.
- Recover by replaying the same operation identity and payload; never silently create a replacement write. Preserve pending intent across page reload.
- Bind every write to its original cart identity and expected revision. Two tabs, stale cookies, delayed original requests and replay after a later edit must not silently overwrite newer cart state.
- Store receipts and quantity/revision changes atomically. Business rejection must also remain terminal for that operation. Read cart items and revision consistently.
- Keep existing origin, cookie, server-price, catalogue and disabled-checkout protections. GET initializes a durable empty cart and rotates unknown or expired cookies; PUT only accepts existing live carts. This avoids trusting an attacker-chosen unsigned bootstrap token. The existing API rate limit applies; empty-cart retention remains an operational follow-up. Receipts must remain while the cart is live.
- Put the autoplay rotation control before moving content in keyboard order while retaining the original visual layout. Focus pauses rotation until explicit Play.

## Parallel ownership

- Cart API agent: API/cart endpoints, shared cart contracts, Prisma migration and real-database regression tests.
- Cart UI agent: provider, cart recovery controls and frontend transport fixtures/tests.
- Carousel agent: carousel component, scoped layout styles and keyboard tests.
- Integrator: protocol review, full verification, browser checks, migration/release evidence and backlog.

## Verification and release gates

Characterize legacy behavior, observe assertion-based RED, then GREEN and affected tests. Test duplicate/concurrent operations, stale revisions, mismatched cart identity, changed replay payload, rejected-operation replay, expiry, malformed responses, lost responses, unmount and reload. Review the final immutable diff independently. Run full suite, guarded recovery tests, types/build, dependency/history/staged secret/static scans and exact-head CI before merge.

Local schema migration requires a private backup and inventory check; no production migration, restart or deployment while server capacity is unresolved. Last read-only check at 2026-10-26T01:09:03Z found 9,052 KiB available at 100% capacity; the application remained on 26bd9aa, with /api/health reporting preview mode and checkout disabled. An initial /health request returned404; it was an incorrect endpoint, not an outage.

No original marketing copy changes or live customer/order/payment actions are authorized by this increment. Operational recovery messages are part of the new behavior. Publisher activation, cleanup approval and broader integration/performance acceptance remain separate outstanding work.
