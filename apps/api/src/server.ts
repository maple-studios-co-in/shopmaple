import { isAbsolute } from "node:path";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { createApp } from "./app.js";
import { composeCommerce, loadCommerceConfig } from "./commerce-composition.js";
import { loadEnquiryDeliveryConfig } from "./enquiry-delivery-provider.js";
import { processEnquiryDeliveries, processKeeriLeadDeliveries } from "./enquiry-delivery-worker.js";
import { loadKeeriLeadsConfig } from "./keeri-leads.js";
import { startEnquiryDeliveryRunner } from "./enquiry-delivery-runner.js";
import { installShutdown } from "./server-lifecycle.js";
import { loadInstagramFeedConfig, refreshInstagramFeed } from "./instagram-feed.js";
import { loadKeeriReviewsConfig } from "./reviews.js";
import { createSignInCodeSender, loadAccountConfig } from "./account/config.js";
import { backfillOrderLinks } from "./orders/order-links.js";
import { loadKeeriOrderEventsConfig } from "./orders/keeri-events.js";
import { loadAdminSignIn } from "./admin/keeri-sign-in.js";
const env = z
  .object({
    DATABASE_URL: z.url(),
    WEB_ORIGIN: z.url().default("http://localhost:3000"),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4100),
    API_HOST: z.string().default("127.0.0.1"),
    API_TRUST_PROXY_LOOPBACK: z.enum(["true", "false"]).default("false"),
    SHOP_MEDIA_ROOT: z
      .string()
      .refine(isAbsolute, "Media root must be absolute")
      .optional(),
    CATALOG_MODE: z.literal("preview").default("preview"),
    ADMIN_PREVIEW_SECRET: z.string().min(32).max(256).optional(),
  })
  .parse(process.env);
if (
  env.API_TRUST_PROXY_LOOPBACK === "true" &&
  !["127.0.0.1", "::1"].includes(env.API_HOST)
)
  throw new Error("Trusted local proxy requires a loopback-bound API");
const enquiryDelivery = loadEnquiryDeliveryConfig(process.env);
// Website enquiries also go to Keeri as leads only with KEERI_LEADS_ENABLED=true; a missing key stops startup.
const keeriLeads = loadKeeriLeadsConfig(process.env);
// Checkout is off unless CHECKOUT_ENABLED=true and every commerce value is valid.
const commerceConfig = loadCommerceConfig(process.env);
// The homepage Instagram feed is off (staff-edited posts) until every private Meta setting is present.
const instagramFeed = loadInstagramFeedConfig(process.env);
// Customer accounts: on by default only with NODE_ENV=development or test. Anything else (unset included) is production:
// off until CUSTOMER_ACCOUNTS_ENABLED=true, which then also needs ACCOUNT_CODE_SECRET, the order mail settings and
// API_TRUST_PROXY_LOOPBACK=true, or startup fails here. A development API without mail prints codes instead.
const accountConfig = loadAccountConfig(process.env);
const accountScope = /^[a-z0-9_-]{1,100}$/.test(process.env.KEERI_MERCHANT_SCOPE ?? "") ? process.env.KEERI_MERCHANT_SCOPE : undefined;
// Order progress from Keeri: off until KEERI_DELIVERY_WEBHOOK_SECRET is set (with a merchant scope), and Keeri keeps
// its events queued until then.
const keeriOrderEvents = loadKeeriOrderEventsConfig(process.env, commerceConfig?.keeri.merchantScope ?? accountScope);
// Shop admin staff sign in with shop passwords unless ADMIN_SIGN_IN=keeri, which hands that to Keeri.
const adminSignIn = loadAdminSignIn(process.env);
const db = new PrismaClient();
// With accounts on, the buyer's order email opens the order in their account, which works on any device.
const commerce = commerceConfig ? composeCommerce(db, commerceConfig, { accountLinks: accountConfig !== null }) : null;
// Orders the previous release froze or captured after the migration ran get their email key and MF number now.
void backfillOrderLinks(db).catch(() => console.error("Order number catch-up failed; it runs again at the next start."));
const server = createApp(
  db,
  {
    webOrigin: new URL(env.WEB_ORIGIN).origin,
    catalogMode: env.CATALOG_MODE,
    mediaRoot: env.SHOP_MEDIA_ROOT,
    previewSecret: env.ADMIN_PREVIEW_SECRET,
    secureCookies: process.env.NODE_ENV === "production",
    trustProxyLoopback: env.API_TRUST_PROXY_LOOPBACK === "true",
    seoIndexing: process.env.SEO_INDEXING === "on",
    enquiryDelivery,
    keeriLeads,
    keeriReviews: loadKeeriReviewsConfig(process.env),
    catalogueMedia: process.env.KEERI_ORIGIN && process.env.KEERI_CATALOGUE_TOKEN ? { origin: process.env.KEERI_ORIGIN, token: process.env.KEERI_CATALOGUE_TOKEN } : undefined,
    checkout: commerce?.checkout,
    keeriOrderEvents,
    instagramFeed,
    adminSignIn,
    accounts: accountConfig
      ? {
          codeSecret: accountConfig.codeSecret,
          merchantScope: commerceConfig?.keeri.merchantScope ?? accountScope,
          sendCode: createSignInCodeSender(accountConfig.email, { production: accountConfig.production }),
        }
      : null,
  },
  commerce?.commerce,
).listen(env.API_PORT, env.API_HOST, () =>
  console.log(
    "Maple API listening on " +
      env.API_HOST +
      ":" +
      env.API_PORT +
      (commerce ? " (preview catalogue; checkout enabled" : " (preview; checkout disabled") +
      (accountConfig ? "; customer accounts on" : "; customer accounts off") +
      (adminSignIn.mode === "keeri" ? (adminSignIn.ready ? "; admin sign-in with Keeri)" : "; admin sign-in with Keeri NOT usable)") : ")"),
  ),
);
const deliveryRunner = enquiryDelivery || keeriLeads
  ? startEnquiryDeliveryRunner(
      async () => {
        // Keeri first, so the staff email built in the same cycle can link the new lead. A Keeri
        // failure must not stop the email, so both run before any error is reported.
        let failed = false;
        if (keeriLeads) await processKeeriLeadDeliveries(db, keeriLeads).catch(() => { failed = true; });
        if (enquiryDelivery) await processEnquiryDeliveries(db, enquiryDelivery, undefined, undefined, undefined, keeriLeads?.adminOrigin).catch(() => { failed = true; });
        if (failed) throw new Error("Enquiry delivery cycle failed");
      },
      () => console.error("Enquiry delivery cycle failed; queued work remains recoverable."),
    )
  : null;
const orderRunner = commerce
  ? startEnquiryDeliveryRunner(
      () => commerce.runWorkers(),
      () => console.error("Order worker cycle failed; queued payments and orders remain recoverable."),
      5_000,
    )
  : null;
// Checks every 15 minutes; a refresh runs only when three hours have passed, on one worker at a time.
const instagramRunner = instagramFeed
  ? startEnquiryDeliveryRunner(
      () => refreshInstagramFeed(db, instagramFeed),
      () => console.error("Instagram feed cycle failed; the last good posts remain on the homepage."),
      15 * 60_000,
    )
  : null;
installShutdown({
  server,
  db,
  runners: [deliveryRunner, orderRunner, instagramRunner],
  exit: (code) => process.exit(code),
});
