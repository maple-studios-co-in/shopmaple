-- Keep the remote quote unchanged. Existing attempts deliberately retain NULL:
-- inventing source bindings from their IDs would bypass authoritative mapping.
ALTER TABLE "CheckoutAttempt" ADD COLUMN "catalogueBindings" JSONB;
