import type { PrismaClient } from "@prisma/client";
import type { Express, Request, RequestHandler, Response } from "express";
import { rateLimit } from "express-rate-limit";
import { HttpError } from "../cart.js";
import { networkKey } from "../network.js";
import type { SignInCodeMessage } from "./config.js";
import {
  clearSessionCookie,
  clearSignInNonceCookie,
  newSignInNonce,
  readSessionToken,
  readSignInNonce,
  sessionCookie,
  signInNonceCookie,
} from "./security.js";
import { createAccountService, type AccountServiceOptions } from "./service.js";

/** What app.ts needs to switch customer accounts on; absent (null) keeps every /api/account route a 404. */
export interface AccountOptions extends AccountServiceOptions {
  /** Emails the code (or, in development without a mail service, prints it). Must not throw. */
  sendCode(message: SignInCodeMessage): Promise<void>;
  /** The in-memory flood guard on sign-in start and verify, per network: default 20 a minute each. */
  requestGuard?: { limit: number; windowMs: number };
}

/** The client's network (IPv4 address or IPv6 /64), from the address Express resolved through the trusted proxy. */
const clientNetwork = (req: Request) => networkKey(req.ip ?? req.socket.remoteAddress ?? "unknown");

/**
 * JSON routes under /api/account (contract: @shopmaple/contracts/account). Mounted after app.ts's Origin check, so
 * every write must come from WEB_ORIGIN. Responses are private and never stored.
 */
export function registerAccountRoutes(app: Express, db: PrismaClient, options: AccountOptions & { secureCookies: boolean }) {
  const secure = options.secureCookies;
  const accounts = createAccountService(db, options);
  const token = (req: Request) => readSessionToken(req.headers.cookie, secure);
  const forget = (res: Response) => {
    const { name, options: cookie } = clearSessionCookie(secure);
    res.clearCookie(name, cookie);
  };
  /** Every start answers with a sign-in cookie: the new code's, or else the browser's current one (still good for a code
   * it already has), so a limit never shows in the headers either. */
  const answerStart = (req: Request, res: Response, nonce?: string) => {
    const { name, value, options: cookie } = signInNonceCookie(nonce ?? readSignInNonce(req.headers.cookie, secure) ?? newSignInNonce(), secure);
    res.cookie(name, value, cookie).status(202).json({ ok: true });
  };
  /** Before any database work: a burst from one network gets the normal answer and costs nothing (20 a minute each). */
  const guard = (whenLimited: RequestHandler) =>
    rateLimit({
      windowMs: options.requestGuard?.windowMs ?? 60_000,
      limit: options.requestGuard?.limit ?? 20,
      standardHeaders: false,
      legacyHeaders: false,
      keyGenerator: (req) => clientNetwork(req),
      handler: whenLimited,
    });
  /** The signed-in customer; a missing, forged, expired or signed-out cookie is cleared and answered 401. */
  async function signedIn(req: Request, res: Response) {
    try {
      return await accounts.sessionCustomer(token(req));
    } catch (error) {
      if (error instanceof HttpError && error.status === 401 && req.headers.cookie?.includes(clearSessionCookie(secure).name + "="))
        forget(res);
      throw error;
    }
  }

  app.use("/api/account", (_req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    next();
  });

  app.post("/api/account/sign-in/start", guard((req, res) => answerStart(req, res)), async (req, res) => {
    const previousNonce = readSignInNonce(req.headers.cookie, secure);
    const nonce = newSignInNonce();
    const issued = await accounts.startSignIn(req.body, { network: clientNetwork(req), previousNonce, nonce });
    // The same answer whether a code was sent, the address is new, or a limit was hit; delivery happens after it.
    answerStart(req, res, issued ? nonce : undefined);
    if (issued) void options.sendCode(issued).catch(() => console.error("Sign-in code delivery failed"));
  });
  app.post(
    "/api/account/sign-in/verify",
    guard((_req, res) => {
      res.status(400).json({ code: "TOO_MANY_ATTEMPTS", message: "Too many tries. Ask for a new code, or try again later." });
    }),
    async (req, res) => {
      const { token: issued, customer } = await accounts.verifySignIn(req.body, {
        previousToken: token(req),
        nonce: readSignInNonce(req.headers.cookie, secure),
        network: clientNetwork(req),
      });
      const session = sessionCookie(issued, secure);
      const signIn = clearSignInNonceCookie(secure);
      res.cookie(session.name, session.value, session.options).clearCookie(signIn.name, signIn.options).json({ customer });
    },
  );
  app.post(
    "/api/account/sign-in/password",
    guard((_req, res) => {
      res.status(400).json({ code: "TOO_MANY_ATTEMPTS", message: "Too many tries. Reset your password with an emailed code, or try again later." });
    }),
    async (req, res) => {
      const { token: issued, customer } = await accounts.passwordSignIn(req.body, { previousToken: token(req), network: clientNetwork(req) });
      const session = sessionCookie(issued, secure);
      res.cookie(session.name, session.value, session.options).json({ customer });
    },
  );
  app.post("/api/account/sign-out", async (req, res) => {
    await accounts.signOut(token(req));
    forget(res);
    res.status(204).end();
  });

  app.get("/api/account", async (req, res) => {
    res.json(await accounts.overview(await signedIn(req, res)));
  });
  app.patch("/api/account", async (req, res) => {
    res.json(await accounts.updateProfile(await signedIn(req, res), req.body));
  });

  app.get("/api/account/orders", async (req, res) => {
    res.json({ orders: await accounts.listOrders(await signedIn(req, res)) });
  });
  app.get("/api/account/orders/:number", async (req, res) => {
    res.json(await accounts.getOrder(await signedIn(req, res), req.params.number));
  });

  app.get("/api/account/addresses", async (req, res) => {
    res.json({ addresses: await accounts.listAddresses(await signedIn(req, res)) });
  });
  app.post("/api/account/addresses", async (req, res) => {
    res.status(201).json(await accounts.createAddress(await signedIn(req, res), req.body));
  });
  app.patch("/api/account/addresses/:id", async (req, res) => {
    res.json(await accounts.updateAddress(await signedIn(req, res), req.params.id, req.body));
  });
  app.delete("/api/account/addresses/:id", async (req, res) => {
    res.json(await accounts.deleteAddress(await signedIn(req, res), req.params.id));
  });
}
