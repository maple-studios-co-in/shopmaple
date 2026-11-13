import { randomBytes, timingSafeEqual } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { Express, Request, RequestHandler, Response } from "express";
import { rateLimit } from "express-rate-limit";
import { HttpError } from "../cart.js";
import { authRequired, digest, readToken, sessionDuration, setSessionCookie } from "./auth.js";
import {
  checkKeeriAccess, exchangeKeeriCode, keeriGraceMs, keeriRecheckMs,
  type AdminSignIn, type KeeriAnswer, type KeeriSignInConfig, type KeeriStaff,
} from "./keeri-sign-in.js";

/** The round trip to Keeri and back is given ten minutes: long enough to type a password there. */
const stateLifetimeMs = 10 * 60_000;
/** Lax, not Strict like the session: it has to come back on the redirect from Keeri, which is another site. */
const stateCookie = (secure: boolean) => (secure ? "__Host-shop_admin_signin" : "shop_admin_signin");
const stateCookieOptions = (secure: boolean) => ({ httpOnly: true, secure, sameSite: "lax" as const, path: "/" });
const callbackUrl = (webOrigin: string) => `${webOrigin}/api/admin/keeri/callback`;
const isUniqueViolation = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

function readState(req: Request, secure: boolean) {
  const name = stateCookie(secure) + "=";
  const values = (req.headers.cookie ?? "").split(";").map((v) => v.trim()).filter((v) => v.startsWith(name));
  if (values.length !== 1) return null;
  const value = values[0]!.slice(name.length);
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}
const sameText = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const single = (value: unknown) => (typeof value === "string" ? value : "");

/** Copy what Keeri says about a person onto their shop-admin row, so History and the role checks read it. */
async function applyKeeriStaff(db: PrismaClient | Prisma.TransactionClient, admin: { id: string; email: string }, staff: KeeriStaff) {
  const updated = await db.shopAdmin.update({
    where: { id: admin.id },
    data: { name: staff.name || null, role: staff.role, canManageEnquiries: staff.canManageEnquiries },
  });
  if (admin.email === staff.email) return updated;
  // Their address changed in Keeri. If another shop account already holds the new one, this row keeps
  // its old address rather than failing the sign-in: the address is how History names them, nothing more.
  const taken = await db.shopAdmin.findUnique({ where: { email: staff.email }, select: { id: true } });
  return taken ? updated : db.shopAdmin.update({ where: { id: admin.id }, data: { email: staff.email } });
}

/**
 * Find or make the shop-admin row for a Keeri person, and start their session.
 *
 * A first Keeri sign-in with the address of an existing shop account takes that account over, so the
 * person's History continues under one name. That happens once: a row already tied to a Keeri person is
 * never handed to a different one. A row the store itself switched off stays off.
 */
async function startKeeriSession(db: PrismaClient, staff: KeeriStaff, previousToken: string | null, emergencyEmail: string | null) {
  const token = randomBytes(32).toString("hex");
  const started = await db.$transaction(async (tx) => {
    let admin = await tx.shopAdmin.findUnique({ where: { keeriUserId: staff.keeriUserId } });
    if (admin) admin = await applyKeeriStaff(tx, admin, staff);
    else {
      const sameAddress = await tx.shopAdmin.findUnique({ where: { email: staff.email } });
      if (sameAddress?.keeriUserId) return false;
      const data = { keeriUserId: staff.keeriUserId, name: staff.name || null, role: staff.role, canManageEnquiries: staff.canManageEnquiries };
      // The account has moved to Keeri, so its shop password goes: it could not be used again anyway.
      // The emergency account is the one exception, and keeps its password for when Keeri is down.
      const moved = sameAddress?.email === emergencyEmail ? data : { ...data, passwordHash: null };
      admin = sameAddress
        ? await tx.shopAdmin.update({ where: { id: sameAddress.id }, data: moved })
        : await tx.shopAdmin.create({ data: { ...data, email: staff.email } });
    }
    if (!admin.active) return false;
    // Whatever session the browser arrived with is ended, and the new one has a token made here:
    // a token planted in the browser beforehand is never the one that becomes signed in.
    if (previousToken) await tx.shopAdminSession.deleteMany({ where: { tokenHash: digest(previousToken) } });
    await tx.shopAdminSession.create({
      data: { adminId: admin.id, tokenHash: digest(token), expiresAt: new Date(Date.now() + sessionDuration), method: "keeri", keeriCheckedAt: new Date() },
    });
    await tx.shopAdminSignIn.create({ data: { adminId: admin.id, method: "keeri" } });
    return true;
  });
  return started ? token : null;
}

type Standing = "ok" | "ended" | "unconfirmed";

/**
 * Runs before every staff route. A Keeri session older than a minute is put to Keeri again:
 * - Keeri says yes: the person's name, role and enquiry access are refreshed, and all their sessions with them.
 * - Keeri says no (disabled, role changed): every Keeri session of theirs ends now.
 * - Keeri cannot be reached: the session carries on until ten minutes after its last yes, then waits.
 * An emergency session passes straight through; it was never Keeri's to confirm. A shop-password
 * session from before Keeri became the only way in ends here.
 */
export function keeriSessionGuard(db: PrismaClient, secure: boolean, signIn: AdminSignIn): RequestHandler {
  const config = signIn.mode === "keeri" ? signIn.ready : null;
  // One question to Keeri per person at a time, however many requests their open tabs send together.
  const asking = new Map<string, Promise<KeeriAnswer>>();
  const ask = (ready: KeeriSignInConfig, adminId: string, keeriUserId: string) => {
    let pending = asking.get(adminId);
    if (!pending) {
      pending = checkKeeriAccess(ready, keeriUserId).finally(() => asking.delete(adminId));
      asking.set(adminId, pending);
    }
    return pending;
  };
  const end = (adminId: string) => db.shopAdminSession.deleteMany({ where: { adminId, method: "keeri" } });

  async function standing(token: string): Promise<Standing> {
    const session = await db.shopAdminSession.findUnique({ where: { tokenHash: digest(token) }, include: { admin: true } });
    if (!session || session.method === "emergency") return "ok";
    const { admin } = session;
    if (session.method === "password") {
      if (signIn.mode !== "keeri") return "ok";
      await db.shopAdminSession.deleteMany({ where: { id: session.id } });
      return "ended";
    }
    // Keeri sign-in switched off or unusable, or a row that is no longer a Keeri person: nothing to confirm with.
    if (!config || !admin.keeriUserId || !session.keeriCheckedAt) {
      await end(admin.id);
      return "ended";
    }
    const age = Date.now() - session.keeriCheckedAt.getTime();
    if (age < keeriRecheckMs) return "ok";
    const answer = await ask(config, admin.id, admin.keeriUserId);
    if (answer.status === "allowed") {
      await applyKeeriStaff(db, admin, answer.staff);
      await db.shopAdminSession.updateMany({ where: { adminId: admin.id, method: "keeri" }, data: { keeriCheckedAt: new Date() } });
      return "ok";
    }
    if (answer.status === "denied") {
      await end(admin.id);
      return "ended";
    }
    return age < keeriGraceMs ? "ok" : "unconfirmed";
  }

  // The ways in and the way out are not Keeri's to hold shut. When Keeri has been unreachable past the
  // grace, the browser still carries its Keeri session cookie, and that is exactly the browser that needs
  // the emergency sign-in, its reset link, a fresh trip to Keeri, or to sign out.
  const beforeSession = new Set(["/login", "/logout", "/emergency/reset-request", "/emergency/reset", "/keeri/start", "/keeri/callback"]);
  return async (req, _res, next) => {
    const token = beforeSession.has(req.path) ? null : readToken(req, secure);
    const result = token ? await standing(token) : "ok";
    if (result === "ended") throw authRequired();
    if (result === "unconfirmed")
      throw new HttpError(401, "ADMIN_ACCESS_UNCONFIRMED", "We couldn't confirm your access with Keeri. Try again in a minute.");
    next();
  };
}

/**
 * The sign-in round trip, registered wherever staff sign in with Keeri:
 *   /api/admin/keeri/start     send the browser to Keeri, with a one-off state value remembered in a cookie
 *   /api/admin/keeri/callback  check the state, swap Keeri's code server to server, start the session
 * A person only ever leaves for Keeri's configured address and only ever comes back to /admin:
 * neither route takes a destination from the request.
 */
export function registerKeeriSignInRoutes(app: Express, db: PrismaClient, secure: boolean, signIn: AdminSignIn & { mode: "keeri" }, webOrigin: string) {
  const config = signIn.ready;
  const limiter = () => rateLimit({
    windowMs: 15 * 60_000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false,
    message: { code: "ADMIN_LOGIN_LIMIT", message: "Too many sign-in attempts. Try again later." },
  });
  const home = (res: Response, outcome?: "denied" | "failed" | "unavailable") => {
    res.set("Referrer-Policy", "no-referrer");
    res.redirect(303, outcome ? `/admin?sign_in=${outcome}` : "/admin");
  };

  app.get("/api/admin/keeri/start", limiter(), (_req, res) => {
    if (!config) return home(res, "unavailable");
    const state = randomBytes(32).toString("base64url");
    res.cookie(stateCookie(secure), state, { ...stateCookieOptions(secure), maxAge: stateLifetimeMs });
    const target = new URL("/sign-in/authorize", config.adminOrigin);
    target.searchParams.set("client_id", config.clientId);
    target.searchParams.set("redirect_uri", callbackUrl(webOrigin));
    target.searchParams.set("state", state);
    res.set("Referrer-Policy", "no-referrer");
    res.redirect(303, target.toString());
  });

  app.get("/api/admin/keeri/callback", limiter(), async (req, res) => {
    // The state is used once, whatever happens next.
    const expected = readState(req, secure);
    res.clearCookie(stateCookie(secure), stateCookieOptions(secure));
    const state = single(req.query.state);
    // No cookie, or a state that is not the one this browser was sent out with: somebody else's link.
    if (!config || !expected || !sameText(expected, state)) return home(res, "failed");
    if (single(req.query.error) === "access_denied") return home(res, "denied");
    const code = single(req.query.code);
    if (!/^[A-Za-z0-9_-]{20,200}$/.test(code)) return home(res, "failed");

    const answer = await exchangeKeeriCode(config, code, callbackUrl(webOrigin));
    if (answer.status !== "allowed") return home(res, answer.status === "invalid" ? "failed" : answer.status);
    let token: string | null;
    try {
      token = await startKeeriSession(db, answer.staff, readToken(req, secure), signIn.emergencyEmail);
    } catch (error) {
      // Two first sign-ins by one person at the same moment: the second finds the row the first made.
      if (!isUniqueViolation(error)) throw error;
      return home(res, "failed");
    }
    if (!token) return home(res, "denied");
    setSessionCookie(res, token, secure);
    home(res);
  });
}
