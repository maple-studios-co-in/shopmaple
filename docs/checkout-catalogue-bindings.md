# Exact Keeri identities for checkout

A merged Shopify/Keeri listing can retain its original local product and variant IDs. The stocked v2 checkout now resolves those IDs through persisted Keeri source identities before requesting a quote, preserving the cart and public URLs. It never guesses from a title, SKU or ID format. Configured tenant, source parent, publication and existing stock eligibility are checked.

Each checkout attempt stores a separate immutable local/source binding snapshot. Keeri's authoritative quote and its digest are unchanged. Serializable reads/rechecks cover quote creation, replay, provider claim and the return from a remote reservation. Missing or changed identities refuse new payment preparation. Once payment initiation has started, the frozen quote remains authoritative for capture and order handoff; later catalogue changes do not redirect it.

Two additive migrations add nullable `CheckoutAttempt.catalogueBindings` and a database trigger rejecting binding rewrites. Existing v1 attempts remain compatible. Old v2 attempts without bindings cannot initiate a new provider order; no identities are backfilled by guesswork. Existing awaiting-payment/captured attempts keep their status and idempotent provider reads. Apply migrations before running the new commerce service. Rolling back application code is schema-compatible; dropping the binding column would destroy evidence and is not a recovery procedure.

If a mapping changes while a remote reservation is being obtained, no provider order is created and the attempt requires reconciliation. This service has no reservation-release port; the existing hold expiry/manual recovery process remains necessary. No transaction is held open across external transports.

## Verification

The original v2 characterization passed 9 tests. Seven new assertion failures established RED for local-ID translation, missing/mismatched identities, quote/reservation races and unmapped old attempts. A separate real-database UPDATE established RED for immutable bindings. After implementation, all 21 v2 tests and the affected 75-test commerce suite passed, including exact tenant-prefix rejection and concurrent provider calls producing one gateway POST. Only the dedicated loopback test database was migrated. Local logs are in `.local/checkout-identity/`.

This is a prerequisite for made-to-order checkout, not its activation. The v2 path still requires stocked eligibility; no physical stock or delivery dates are fabricated. Full-payment MTO acceptance, shipping/price/payment configuration, runtime composition and end-to-end confirmation remain open. Production checkout stays disabled.
