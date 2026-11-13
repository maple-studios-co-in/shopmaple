import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { Express, Request, Response } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { HttpError } from "../cart.js";
import { keeriGraceMs, keeriRecheckMs, signInOffer, type AdminSignIn } from "./keeri-sign-in.js";
type Database = PrismaClient | Prisma.TransactionClient;
export const staffInputSchema = z
  .object({
    email: z
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    password: z.string().min(14).max(128),
    role: z.enum(["editor", "publisher"]),
  })
  .strict();
const loginSchema = z
  .object({
    email: z
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    password: z.string().min(1).max(128),
  })
  .strict();
const options = { N: 131072, r: 8, p: 1, maxmem: 192 * 1024 * 1024 };
export const sessionDuration = 8 * 60 * 60000;
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const derive = (password: string, salt: string) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(password, salt, 64, options, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$131072$8$1$${salt}$${(await derive(password, salt)).toString("hex")}`;
}
async function verifyPassword(password: string, encoded: string) {
  const parts = encoded.split("$");
  if (
    parts.length !== 6 ||
    parts.slice(0, 4).join("$") !== "scrypt$131072$8$1" ||
    !/^[a-f0-9]{32}$/.test(parts[4]!) ||
    !/^[a-f0-9]{128}$/.test(parts[5]!)
  )
    return false;
  return timingSafeEqual(
    await derive(password, parts[4]!),
    Buffer.from(parts[5]!, "hex"),
  );
}
// Unknown users pay the same password-hashing cost. This is not an account credential.
const dummyHash = `scrypt$131072$8$1$${"0".repeat(32)}$${"0".repeat(128)}`;
export function cookieName(secure: boolean) {
  return secure ? "__Host-shop_admin" : "shop_admin";
}
export function readToken(req: Request, secure: boolean) {
  const values = (req.headers.cookie ?? "")
    .split(";")
    .map((v) => v.trim())
    .filter((v) => v.startsWith(cookieName(secure) + "="));
  if (values.length !== 1) return null;
  const token = values[0]!.slice(cookieName(secure).length + 1);
  return /^[a-f0-9]{64}$/.test(token) ? token : null;
}
export const authRequired = () =>
  new HttpError(401, "ADMIN_AUTH_REQUIRED", "Sign in to manage shop content.");
/**
 * A Keeri session is only as good as Keeri's last word on it. The guard in keeri-session.ts renews that
 * every minute; this is the backstop for any route the guard did not run before, so a session Keeri has
 * not confirmed within the grace period opens nothing anywhere.
 */
const keeriConfirmed = (session: { method: string; keeriCheckedAt: Date | null }) =>
  session.method !== "keeri" ||
  (session.keeriCheckedAt !== null && Date.now() - session.keeriCheckedAt.getTime() < keeriGraceMs + keeriRecheckMs);
/** The signed-in person as the dashboard reads them. Name and the emergency mark appear only when they apply. */
const staffUser = (admin: { id: string; email: string; name: string | null; role: "none" | "viewer" | "editor" | "publisher"; canManageEnquiries: boolean }, method: string) => ({
  id: admin.id,
  email: admin.email,
  role: admin.role,
  canManageEnquiries: admin.canManageEnquiries,
  ...(admin.name ? { name: admin.name } : {}),
  ...(method === "emergency" ? { emergency: true } : {}),
});
/**
 * What a route needs of the website's content. `any` is for routes that are not about content at all:
 * the session itself and the Enquiries screen, which has its own check. `sign-out` is `any` for a session
 * Keeri has not confirmed lately as well: somebody must always be able to end their own session.
 */
export type StaffNeed = "any" | "view" | "edit" | "sign-out";
const contentLevel = { none: 0, viewer: 1, editor: 2, publisher: 3 } as const;
export async function requireStaff(
  db: Database,
  req: Request,
  secure: boolean,
  write = false,
  publisher = false,
  lock = false,
  needs: StaffNeed = write ? "edit" : "view",
) {
  const token = readToken(req, secure);
  if (!token) throw authRequired();
  const tokenHash = digest(token);
  if (lock)
    await db.$queryRaw`SELECT "id" FROM "ShopAdminSession" WHERE "tokenHash"=${tokenHash} FOR SHARE`;
  const session = await db.shopAdminSession.findUnique({
    where: { tokenHash },
    include: { admin: true },
  });
  if (!session || session.expiresAt <= new Date() || (needs !== "sign-out" && !keeriConfirmed(session))) throw authRequired();
  if (lock)
    await db.$queryRaw`SELECT "id" FROM "ShopAdmin" WHERE "id"=${session.adminId} FOR SHARE`;
  const admin = lock
    ? await db.shopAdmin.findUnique({ where: { id: session.adminId } })
    : session.admin;
  if (!admin?.active) throw authRequired();
  const csrfToken = digest("csrf:" + token);
  if (write) {
    const supplied = req.get("X-CSRF-Token");
    if (
      !supplied ||
      !/^[a-f0-9]{64}$/.test(supplied) ||
      !timingSafeEqual(
        Buffer.from(supplied, "hex"),
        Buffer.from(csrfToken, "hex"),
      )
    )
      throw new HttpError(
        403,
        "CSRF_REJECTED",
        "Refresh your admin session and try again.",
      );
  }
  const level = contentLevel[admin.role];
  if (needs !== "any" && needs !== "sign-out" && level < 1)
    throw new HttpError(403, "ADMIN_ROLE_REQUIRED", "Your account does not include the website's content.");
  if (needs === "edit" && level < 2)
    throw new HttpError(403, "ADMIN_ROLE_REQUIRED", "Your account can view the website's content but not change it.");
  if (publisher && admin.role !== "publisher")
    throw new HttpError(
      403,
      "ADMIN_ROLE_REQUIRED",
      "A publisher must approve this change.",
    );
  return { user: staffUser(admin, session.method), csrfToken, tokenHash };
}
export function setSessionCookie(res: Response, token: string, secure: boolean) {
  res.cookie(cookieName(secure), token, {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: "/",
    maxAge: sessionDuration,
  });
}
export function registerStaffRoutes(
  app: Express,
  db: PrismaClient,
  secure: boolean,
  signIn: AdminSignIn = { mode: "password" },
) {
  // With Keeri sign-in on, shop passwords are switched off for everybody except the one emergency
  // account, whose sessions are marked and recorded.
  const keeri = signIn.mode === "keeri" ? signIn : null;
  app.post(
    "/api/admin/login",
    rateLimit({
      windowMs: 15 * 60000,
      limit: 5,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: {
        code: "ADMIN_LOGIN_LIMIT",
        message: "Too many sign-in attempts. Try again later.",
      },
    }),
    async (req, res) => {
      const input = loginSchema.parse(req.body);
      // Any other address is treated as one nobody holds: the same answer, at the same cost.
      const allowed = !keeri || (keeri.emergencyEmail !== null && input.email === keeri.emergencyEmail);
      let admin = allowed
        ? await db.shopAdmin.findUnique({ where: { email: input.email } })
        : null;
      // A lock that has run out is over: the count starts again. Without this the count stayed at five,
      // so one wrong try every fifteen minutes kept the account locked for as long as somebody cared to.
      if (admin?.lockedUntil && admin.lockedUntil <= new Date())
        admin = await db.shopAdmin.update({ where: { id: admin.id }, data: { failedAttempts: 0, lockedUntil: null } });
      const locked = Boolean(admin?.lockedUntil && admin.lockedUntil > new Date());
      const valid = await verifyPassword(
        input.password,
        admin?.passwordHash ?? dummyHash,
      );
      if (
        !admin?.active ||
        !admin.passwordHash ||
        !valid ||
        locked
      ) {
        // A try made while the account is locked is refused but not counted, so it cannot stretch the lock.
        if (admin && !valid && !locked) {
          const failed = await db.shopAdmin.update({
            where: { id: admin.id },
            data: { failedAttempts: { increment: 1 } },
          });
          if (failed.failedAttempts >= 5)
            await db.shopAdmin.update({
              where: { id: admin.id },
              data: { lockedUntil: new Date(Date.now() + 15 * 60000) },
            });
        }
        // A refused try at the emergency account is recorded like a successful one. No address, no password.
        if (keeri && admin) {
          await db.shopAdminSignIn.create({ data: { adminId: admin.id, method: "emergency_failed" } });
          console.warn(`[admin] emergency password sign-in refused for staff ${admin.id}${locked ? " (locked)" : ""}`);
        }
        throw new HttpError(
          401,
          "ADMIN_LOGIN_FAILED",
          "The email or password is incorrect, or sign-in is temporarily unavailable.",
        );
      }
      const token = randomBytes(32).toString("hex");
      await db.$transaction(async (tx) => {
        const previous = readToken(req, secure);
        if (previous)
          await tx.shopAdminSession.deleteMany({
            where: { tokenHash: digest(previous) },
          });
        await tx.$queryRaw`SELECT "id" FROM "ShopAdmin" WHERE "id"=${admin.id} FOR UPDATE`;
        const current = await tx.shopAdmin.findUniqueOrThrow({
          where: { id: admin.id },
        });
        if (
          !current.active ||
          current.passwordHash !== admin.passwordHash ||
          (current.lockedUntil && current.lockedUntil > new Date())
        )
          throw authRequired();
        await tx.shopAdmin.update({
          where: { id: admin.id },
          data: { failedAttempts: 0, lockedUntil: null },
        });
        await tx.shopAdminSession.create({
          data: {
            adminId: admin.id,
            tokenHash: digest(token),
            expiresAt: new Date(Date.now() + sessionDuration),
            method: keeri ? "emergency" : "password",
          },
        });
        if (keeri) await tx.shopAdminSignIn.create({ data: { adminId: admin.id, method: "emergency" } });
      });
      // Said in the server log as well as the table, with no address or name: emergency access is rare enough to notice.
      if (keeri) console.warn(`[admin] emergency password sign-in by staff ${admin.id}`);
      setSessionCookie(res, token, secure);
      res.json({
        user: staffUser(admin, keeri ? "emergency" : "password"),
        csrfToken: digest("csrf:" + token),
      });
    },
  );
  // Every staff route needs a session, and all but these need at least View of the content: the session
  // itself, signing out, and the Enquiries screen, which somebody may hold with nothing else.
  const openToAnyRole = (path: string) => path === "/session" || path === "/logout" || path === "/enquiries" || path.startsWith("/enquiries/");
  app.use("/api/admin", async (req, _res, next) => {
    await requireStaff(db, req, secure, false, false, false, req.path === "/logout" ? "sign-out" : openToAnyRole(req.path) ? "any" : "view");
    next();
  });
  app.get("/api/admin/session", async (req, res) => {
    const { user, csrfToken } = await requireStaff(db, req, secure, false, false, false, "any");
    res.json({ user, csrfToken, ...signInOffer(signIn) });
  });
  app.post("/api/admin/logout", async (req, res) => {
    const session = await requireStaff(db, req, secure, true, false, false, "sign-out");
    await db.shopAdminSession.deleteMany({
      where: { tokenHash: session.tokenHash },
    });
    res.clearCookie(cookieName(secure), {
      httpOnly: true,
      secure,
      sameSite: "strict",
      path: "/",
    });
    res.status(204).end();
  });
}
