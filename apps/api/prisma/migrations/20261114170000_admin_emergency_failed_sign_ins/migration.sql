-- Failed tries at the emergency account are recorded as well as successes (review, 14 Nov 2026).
-- Only the list of allowed values changes; no row does.
ALTER TABLE "ShopAdminSignIn" DROP CONSTRAINT "ShopAdminSignIn_method_check";
ALTER TABLE "ShopAdminSignIn" ADD CONSTRAINT "ShopAdminSignIn_method_check" CHECK ("method" IN ('keeri', 'emergency', 'emergency_failed'));
