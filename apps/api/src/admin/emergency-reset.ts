import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { Express } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { HttpError } from "../cart.js";
import { sendTransactionalEmail } from "../enquiry-delivery-provider.js";
import { digest, hashPassword } from "./auth.js";
import type { AdminSignIn } from "./keeri-sign-in.js";

/**
 * "Forgot the emergency password" (owner, 14 Nov 2026), so a forgotten one never again needs a developer.
 *
 * It exists for the emergency account only, and the link only ever goes to that account's own address,
 * which comes from the server's settings: nothing a visitor types chooses who is emailed. The link works
 * once, for fifteen minutes, and only lets the holder choose a new password; signing in afterwards is still
 * the labelled, recorded emergency sign-in. Everybody else's way in is Keeri, which has its own reset.
 *
 * Asking needs no sign-in (the person asking cannot sign in), so anybody can make the store email the owner.
 * That is held to three emails an hour, and each one is a working link in the owner's own inbox, so it can
 * annoy but cannot lock the owner out. Setting a password also clears a lock on the account.
 */
export const resetLifetimeMs = 15 * 60_000;
/** Links emailed for the account in any one hour, whoever asks and from wherever. */
const resetsPerHour = 3;
const answer = { message: "If the emergency account is set up, a reset link has been emailed to it. It works once, for 15 minutes." };
const invalid = () => new HttpError(400, "RESET_LINK_INVALID", "This reset link is not valid any more. Ask for a new one.");
const resetSchema = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), password: z.string().min(14).max(128) }).strict();

function resetEmail(origin: string, token: string) {
  return {
    subject: "Reset the shop admin's emergency password",
    text: [
      "Somebody asked to reset the emergency password for the Maple Furnishers shop admin.",
      "",
      "Open this link to choose a new one:",
      // After the #, so the link's secret part is never sent to a server or written to an access log.
      `${origin}/admin#reset=${token}`,
      "",
      "It works once, for 15 minutes. If you didn't ask for this, ignore this email: the password stays as it is.",
      "",
      "Maple Furnishers",
    ].join("\n"),
  };
}

export function registerEmergencyResetRoutes(app: Express, db: PrismaClient, signIn: AdminSignIn & { mode: "keeri" }, webOrigin: string) {
  const { emergencyEmail, resetMail } = signIn;
  if (!emergencyEmail) return;
  const limiter = (limit: number, windowMs: number) => rateLimit({
    windowMs, limit, standardHeaders: "draft-8", legacyHeaders: false,
    message: { code: "ADMIN_LOGIN_LIMIT", message: "Too many attempts. Try again later." },
  });

  // Takes nothing from the request: the same words come back whatever happened, and at most one address is ever emailed.
  app.post("/api/admin/emergency/reset-request", limiter(5, 60 * 60_000), async (_req, res) => {
    const admin = resetMail ? await db.shopAdmin.findUnique({ where: { email: emergencyEmail } }) : null;
    if (resetMail && admin?.active) {
      const now = new Date();
      const recent = await db.shopAdminPasswordReset.count({ where: { adminId: admin.id, createdAt: { gt: new Date(now.getTime() - 60 * 60_000) } } });
      if (recent < resetsPerHour) {
        const token = randomBytes(32).toString("hex");
        // An earlier link stays good for its fifteen minutes: anybody can ask for a link, so asking must not
        // be a way to cancel the one the owner is about to open. Using any one of them ends the rest.
        const row = await db.shopAdminPasswordReset.create({ data: { adminId: admin.id, tokenHash: digest(token), expiresAt: new Date(now.getTime() + resetLifetimeMs) } });
        const outcome = await sendTransactionalEmail(resetMail.config, `admin-reset/${row.id}`, { to: emergencyEmail, ...resetEmail(webOrigin, token) }, resetMail.fetch)
          .catch(() => ({ status: "uncertain", code: "network_error" }) as const);
        // The failure category only; never the address or the link.
        console.warn(outcome.status === "accepted" ? `[admin] emergency password reset link emailed for staff ${admin.id}` : `[admin] emergency password reset email was not accepted by the mail service: ${outcome.code}`);
      }
    }
    res.status(202).json(answer);
  });

  app.post("/api/admin/emergency/reset", limiter(10, 15 * 60_000), async (req, res) => {
    const input = resetSchema.parse(req.body);
    const tokenHash = digest(input.token);
    const found = await db.shopAdminPasswordReset.findUnique({ where: { tokenHash }, include: { admin: true } });
    // Still the emergency account, still switched on, and the link neither used nor lapsed.
    if (!found || found.usedAt || found.expiresAt <= new Date() || !found.admin.active || found.admin.email !== emergencyEmail) throw invalid();
    const passwordHash = await hashPassword(input.password);
    await db.$transaction(async (tx) => {
      // The one statement both checks the link is unused and uses it, so it cannot be spent twice.
      const used = await tx.shopAdminPasswordReset.updateMany({ where: { id: found.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
      if (used.count !== 1) throw invalid();
      await tx.shopAdminPasswordReset.updateMany({ where: { adminId: found.adminId, usedAt: null, expiresAt: { gt: new Date() } }, data: { expiresAt: new Date() } });
      await tx.shopAdmin.update({ where: { id: found.adminId }, data: { passwordHash, failedAttempts: 0, lockedUntil: null } });
      // Whoever was in with the old password is out. A Keeri session of the same person is Keeri's to end.
      await tx.shopAdminSession.deleteMany({ where: { adminId: found.adminId, method: { in: ["emergency", "password"] } } });
    });
    console.warn(`[admin] emergency password was reset for staff ${found.adminId}`);
    res.status(204).end();
  });
}

/**
 * What is wrong with the emergency account, in words for the API log at start-up, or null when it is usable.
 * The set-up helper only edits settings files and cannot see the database, so this is where a mistyped
 * address is caught. It names the setting, never the address.
 */
export async function emergencyAccountProblem(db: PrismaClient, signIn: AdminSignIn): Promise<string | null> {
  if (signIn.mode !== "keeri") return null;
  if (!signIn.emergencyEmail) return "No emergency account is named (ADMIN_EMERGENCY_EMAIL): if Keeri cannot be reached, nobody can sign in to the shop admin.";
  const account = await db.shopAdmin.findUnique({ where: { email: signIn.emergencyEmail }, select: { active: true, passwordHash: true } });
  if (!account?.active) return "ADMIN_EMERGENCY_EMAIL does not match an active shop-admin account: emergency sign-in and its reset link will not work until it does.";
  if (!account.passwordHash) return "The emergency account has no password yet: use \"Forgot the emergency password\" on the sign-in page once to set one.";
  return null;
}
