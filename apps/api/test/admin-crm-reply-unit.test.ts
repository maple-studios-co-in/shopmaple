import assert from "node:assert/strict";
import { test } from "node:test";
import { ActorRateLimit, recordReplyOutcome } from "../src/admin/enquiries.js";

test("the limiter reserves slots up front and releases a reservation that did not become a send", () => {
  let now = 1_000_000;
  const limit = new ActorRateLimit(2, 60_000, () => now);
  assert.equal(limit.reserve("a"), true);
  assert.equal(limit.reserve("a"), true);
  assert.equal(limit.reserve("a"), false, "the third parallel reservation is refused before any send");
  assert.equal(limit.reserve("b"), true, "limits are per staff member");
  limit.release("a");
  assert.equal(limit.reserve("a"), true, "a released reservation frees its slot");
  assert.equal(limit.reserve("a"), false);
  now += 60_001;
  assert.equal(limit.reserve("a"), true, "reservations age out of the window");
});

test("recording the outcome falls back to a last-resort update, so no intent row stays at email_sending", async () => {
  const updates: unknown[] = [];
  const failing = {
    $transaction: async () => { throw new Error("connection reset"); },
    enquiryActivity: { updateMany: async (args: unknown) => { updates.push(args); return { count: 1 }; } },
  };
  await assert.rejects(recordReplyOutcome(failing as never, { id: "enq_x", activityId: "act_1" }, true), /recorded|outcome/i);
  assert.deepEqual(updates, [{ where: { id: "act_1", action: "email_sending" }, data: { action: "email_sent" } }], "an accepted send is still recorded as sent");
  updates.length = 0;
  await assert.rejects(recordReplyOutcome(failing as never, { id: "enq_x", activityId: "act_2" }, false), /recorded|outcome/i);
  assert.deepEqual(updates, [{ where: { id: "act_2", action: "email_sending" }, data: { action: "email_failed" } }]);
  const broken = { $transaction: async () => { throw new Error("down"); }, enquiryActivity: { updateMany: async () => { throw new Error("still down"); } } };
  await assert.rejects(recordReplyOutcome(broken as never, { id: "enq_x", activityId: "act_3" }, true), /recorded|outcome/i, "even the last resort failing surfaces as an error rather than a silent success");
});
