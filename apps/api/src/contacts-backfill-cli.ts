import { PrismaClient } from "@prisma/client";
import { backfillContacts } from "./contacts-backfill.js";
/** Usage, from apps/api: `npx tsx --env-file=../../.env src/contacts-backfill-cli.ts`. Safe to re-run. */
async function main() {
  const db = new PrismaClient();
  try {
    const result = await backfillContacts(db);
    console.log(`Contacts created: ${result.contactsCreated}. Enquiries linked: ${result.enquiriesLinked}.`);
  } finally {
    await db.$disconnect();
  }
}
main().catch(() => { console.error("Contact backfill did not complete. Check the database connection and rerun; it is safe to repeat."); process.exitCode = 1; });
