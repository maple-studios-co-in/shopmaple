-- The buyer's consent to order updates on WhatsApp (owner, 13 Nov 2026): when they ticked the box at checkout.
-- Additive and nullable, so it is safe under the running release; existing attempts carry no consent.
ALTER TABLE "CheckoutAttempt" ADD COLUMN "whatsappOptInAt" TIMESTAMP(3);
