import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { Express, Request, Response } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { HttpError } from "../cart.js";
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
const sessionDuration = 8 * 60 * 60000;
const digest = (value: string) =>
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
function readToken(req: Request, secure: boolean) {
  const values = (req.headers.cookie ?? "")
    .split(";")
    .map((v) => v.trim())
    .filter((v) => v.startsWith(cookieName(secure) + "="));
  if (values.length !== 1) return null;
  const token = values[0]!.slice(cookieName(secure).length + 1);
  return /^[a-f0-9]{64}$/.test(token) ? token : null;
}
const authRequired = () =>
  new HttpError(401, "ADMIN_AUTH_REQUIRED", "Sign in to manage shop content.");
export async function requireStaff(
  db: Database,
  req: Request,
  secure: boolean,
  write = false,
  publisher = false,
  lock = false,
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
  if (!session || session.expiresAt <= new Date()) throw authRequired();
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
  if (publisher && admin.role !== "publisher")
    throw new HttpError(
      403,
      "ADMIN_ROLE_REQUIRED",
      "A publisher must approve this change.",
    );
  return {
    user: {
      id: admin.id,
      email: admin.email,
      role: admin.role,
      canManageEnquiries: admin.canManageEnquiries,
    },
    csrfToken,
    tokenHash,
  };
}
function setSessionCookie(res: Response, token: string, secure: boolean) {
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
) {
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
      const admin = await db.shopAdmin.findUnique({
        where: { email: input.email },
      });
      const valid = await verifyPassword(
        input.password,
        admin?.passwordHash ?? dummyHash,
      );
      if (
        !admin?.active ||
        !valid ||
        (admin.lockedUntil && admin.lockedUntil > new Date())
      ) {
        if (admin && !valid) {
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
          },
        });
      });
      setSessionCookie(res, token, secure);
      res.json({
        user: {
          id: admin.id,
          email: admin.email,
          role: admin.role,
          canManageEnquiries: admin.canManageEnquiries,
        },
        csrfToken: digest("csrf:" + token),
      });
    },
  );
  app.use("/api/admin", async (req, _res, next) => {
    await requireStaff(db, req, secure);
    next();
  });
  app.get("/api/admin/session", async (req, res) => {
    const { user, csrfToken } = await requireStaff(db, req, secure);
    res.json({ user, csrfToken });
  });
  app.post("/api/admin/logout", async (req, res) => {
    const session = await requireStaff(db, req, secure, true);
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
