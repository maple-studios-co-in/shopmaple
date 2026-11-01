import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { reviewTokenSchema } from "@shopmaple/contracts/reviews";

/** How long a buyer has to use a review link after delivery. */
export const reviewLinkLifetimeMs = 90 * 86_400_000;
const purpose = "shopmaple-review-invite-v1:";

export const newInvitationId = () => `rvi_${randomUUID()}`;
const signature = (secret: string, id: string) => createHmac("sha256", secret).update(purpose + id).digest("base64url");

/** The link token: the invitation id and an HMAC of it, so a resend rebuilds it without stored secrets. */
export function reviewToken(secret: string, invitationId: string) {
  return `${invitationId}.${signature(secret, invitationId)}`;
}

/** The invitation id a token names, or null when it is malformed or not signed by this store. */
export function verifiedInvitationId(secret: string, token: unknown): string | null {
  const parsed = reviewTokenSchema.safeParse(token);
  if (!parsed.success) return null;
  const [id, supplied] = parsed.data.split(".") as [string, string];
  const expected = Buffer.from(signature(secret, id));
  const given = Buffer.from(supplied);
  return given.length === expected.length && timingSafeEqual(given, expected) ? id : null;
}

export function reviewLink(origin: string, secret: string, invitationId: string) {
  return `${origin}/reviews/new?token=${reviewToken(secret, invitationId)}`;
}
