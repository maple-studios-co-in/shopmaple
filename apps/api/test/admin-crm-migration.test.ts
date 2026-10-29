import assert from "node:assert/strict";
import { test } from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

const migrationName = "20261029010000_admin_crm";

test("CRM migration backfills contacts from existing enquiries, maps reviewed to contacted and is safe to re-run", async () => {
  const source = new URL(process.env.TEST_DATABASE_URL ?? "");
  assert.equal(source.hostname, "127.0.0.1"); assert.equal(source.port, "55439"); assert.equal(source.pathname, "/shopmaple_test");
  const name = `shopmaple_crm_test_${randomBytes(6).toString("hex")}`;
  const target = new URL(source); target.pathname = `/${name}`;
  const pgDirectory = process.env.PG_BIN_DIRECTORY ?? (process.platform === "darwin" ? "/opt/homebrew/opt/postgresql@17/bin" : "/usr/lib/postgresql/17/bin");
  const pgEnv = { PATH: process.env.PATH, HOME: process.env.HOME, PGHOST: source.hostname, PGPORT: source.port, PGUSER: decodeURIComponent(source.username), PGPASSWORD: decodeURIComponent(source.password), PGCONNECT_TIMEOUT: "5" };
  const pg = (command: string, args: string[] = []) => spawnSync(join(pgDirectory, command), [...args, name], { env: pgEnv, encoding: "utf8", timeout: 30000 });
  assert.equal(pg("createdb").status, 0, "Create owned disposable migration database");
  const temporary = mkdtempSync(join(tmpdir(), "shopmaple-crm-migration-"));
  let db: PrismaClient | undefined;
  const migrate = (schema: string) => {
    const result = spawnSync("npx", ["prisma", "migrate", "deploy", "--schema", schema], { env: { ...process.env, DATABASE_URL: target.href }, encoding: "utf8", timeout: 30000 });
    assert.equal(result.status, 0, `Migration must deploy successfully: ${result.stderr}`);
  };
  try {
    cpSync(resolve("prisma"), join(temporary, "prisma"), { recursive: true, filter: path => !path.includes(migrationName) });
    migrate(join(temporary, "prisma/schema.prisma"));
    const legacy = new PrismaClient({ datasources: { db: { url: target.href } } });
    const ids = Array.from({ length: 5 }, () => `enq_${randomUUID()}`);
    const context = JSON.stringify({ product: "Aero", variant: "", sku: "", pincode: "" });
    // Reviewer's case: a@ with phone P; b@ used P (an unverified phone) and later Q; one legacy reviewed row; one placeholder phone.
    await legacy.$executeRawUnsafe(`INSERT INTO "Enquiry" ("id","idempotencyHash","payloadHash","kind","name","email","phone","message","context","status","version","createdAt") VALUES
      ('${ids[0]}','i0','p','contact','Asha Rao','Asha@Example.invalid','+91 12345 00001','Synthetic','${context}','new',0,'2026-10-01T00:00:00Z'),
      ('${ids[1]}','i1','p','project','A. Rao','asha@example.invalid','','Synthetic','${context}','reviewed',1,'2026-10-02T00:00:00Z'),
      ('${ids[2]}','i2','p','bulk','B Person','b@example.invalid','1234500001','Synthetic','${context}','new',0,'2026-10-03T00:00:00Z'),
      ('${ids[3]}','i3','p','contact','B Person','b@example.invalid','+91 12345 00002','Synthetic','${context}','new',0,'2026-10-04T00:00:00Z'),
      ('${ids[4]}','i4','p','contact','Placeholder','p@example.invalid','0000000000','Synthetic','${context}','new',0,'2026-10-05T00:00:00Z')`);
    await legacy.$disconnect();
    migrate(resolve("prisma/schema.prisma"));
    db = new PrismaClient({ datasources: { db: { url: target.href } } });
    const statuses = await db.$queryRawUnsafe<Array<{ status: string; version: number }>>(`SELECT "status","version" FROM "Enquiry" ORDER BY "createdAt"`);
    assert.deepEqual(statuses.map(row => row.status), ["new", "contacted", "new", "new", "new"], "reviewed maps to contacted; other statuses unchanged");
    assert.equal(statuses[1]!.version, 1, "migration does not advance enquiry versions");
    const linked = async () => db!.$queryRawUnsafe<Array<{ id: string; contactId: string | null }>>(`SELECT "id","contactId" FROM "Enquiry" ORDER BY "createdAt"`);
    const rows = await linked();
    assert.ok(rows.every(row => row.contactId), "every existing enquiry gains a contact");
    assert.equal(rows[0]!.contactId, rows[1]!.contactId, "email match is case-insensitive");
    assert.equal(rows[2]!.contactId, rows[3]!.contactId, "both of b@'s enquiries belong to b@");
    assert.notEqual(rows[0]!.contactId, rows[2]!.contactId, "a shared, unverified phone never merges two emails");
    assert.notEqual(rows[0]!.contactId, rows[4]!.contactId);
    const contacts = await db.$queryRawUnsafe<Array<{ id: string; emailKey: string; phoneKey: string | null; name: string; email: string }>>(`SELECT "id","emailKey","phoneKey","name","email" FROM "Contact" ORDER BY "createdAt","id"`);
    assert.equal(contacts.length, 3);
    const asha = contacts.find(contact => contact.id === rows[0]!.contactId)!, b = contacts.find(contact => contact.id === rows[2]!.contactId)!, placeholder = contacts.find(contact => contact.id === rows[4]!.contactId)!;
    assert.deepEqual([asha.emailKey, asha.phoneKey, asha.name, asha.email], ["asha@example.invalid", "911234500001", "Asha Rao", "asha@example.invalid"], "the earliest enquiry names the contact; phone is stored, not keyed");
    assert.equal(b.phoneKey, "911234500001", "two contacts may carry the same normalised phone");
    assert.equal(placeholder.phoneKey, null, "placeholder phones are never keyed");
    // Re-running the migration SQL must neither duplicate contacts nor relink enquiries.
    const rerun = pg("psql", ["-v", "ON_ERROR_STOP=1", "-q", "-f", resolve(`prisma/migrations/${migrationName}/migration.sql`), "-d"]);
    assert.equal(rerun.status, 0, `Migration SQL must be idempotent: ${rerun.stderr}`);
    assert.equal(Number((await db.$queryRawUnsafe<Array<{ count: bigint }>>(`SELECT count(*) AS count FROM "Contact"`))[0]!.count), 3);
    assert.deepEqual(await linked(), rows);
    // An enquiry written by an old instance during a non-atomic swap has no contact: the re-runnable backfill links it.
    const straggler = `enq_${randomUUID()}`;
    await db.$executeRawUnsafe(`INSERT INTO "Enquiry" ("id","idempotencyHash","payloadHash","kind","name","email","phone","message","context","status","version","createdAt") VALUES ('${straggler}','i5','p','contact','Straggler','ASHA@example.invalid','','Synthetic','${context}','new',0,'2026-10-06T00:00:00Z')`);
    const { backfillContacts } = await import("../src/contacts-backfill.js");
    const first = await backfillContacts(db);
    assert.deepEqual(first, { contactsCreated: 0, enquiriesLinked: 1 });
    assert.equal((await linked()).find(row => row.id === straggler)?.contactId, asha.id, "the straggler joins Asha by email");
    assert.deepEqual(await backfillContacts(db), { contactsCreated: 0, enquiriesLinked: 0 }, "a second run changes nothing");
    assert.equal(await db.followUpTask.count(), 0);
    // The status check constraint rejects the retired legacy value.
    await assert.rejects(db.$executeRawUnsafe(`UPDATE "Enquiry" SET "status"='reviewed' WHERE "id"='${ids[1]}'`), /check constraint|violates/i);
  } finally {
    await db?.$disconnect();
    rmSync(temporary, { recursive: true, force: true });
    assert.equal(pg("dropdb").status, 0, "Remove owned disposable migration database");
  }
});
