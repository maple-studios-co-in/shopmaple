-- The buyer's payment emails (Figma 488:1339 "payment unsuccessful", 488:1390 "payment pending"; orders/notifications.ts):
-- two more kinds, and `skipped` for an email that stopped being true before it was sent (never sent, nothing for staff).
-- Additive: every existing row stays valid, so it is safe under the running release.
ALTER TABLE "OrderNotification" DROP CONSTRAINT "OrderNotification_kind_check";
ALTER TABLE "OrderNotification" ADD CONSTRAINT "OrderNotification_kind_check" CHECK ("kind" IN (
  'customer_confirmed', 'customer_received', 'customer_payment_failed', 'customer_payment_pending', 'staff_order', 'staff_payment', 'staff_attention'));
ALTER TABLE "OrderNotification" DROP CONSTRAINT "OrderNotification_state_check";
ALTER TABLE "OrderNotification" ADD CONSTRAINT "OrderNotification_state_check" CHECK ("state" IN ('pending', 'processing', 'sent', 'failed', 'skipped'));

-- The sweep starts from Razorpay's recent reports of one type, then reads each checkout's other reports by its order.
CREATE INDEX "PaymentWebhookInbox_merchantScope_eventType_receivedAt_idx" ON "PaymentWebhookInbox"("merchantScope", "eventType", "receivedAt");
CREATE INDEX "PaymentWebhookInbox_merchantScope_providerOrderId_idx" ON "PaymentWebhookInbox"("merchantScope", "providerOrderId");
