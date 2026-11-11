-- Customer passwords (Figma 392:1652 login, 392:1697 sign-up; 11 Nov 2026). Additive: existing accounts keep signing in
-- by emailed code until they set a password through sign-up or "Forgot password?".
ALTER TABLE "Customer" ADD COLUMN "passwordHash" TEXT,
  ADD COLUMN "passwordSetAt" TIMESTAMP(3);
