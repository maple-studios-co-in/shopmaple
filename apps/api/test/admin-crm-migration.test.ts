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
    const ids = Array.from({ length: 4 }, () => `enq_${randomUUID()}`);
    const base = { payloadHash: "p", context: { product: "Aero", variant: "", sku: "", pincode: "" }, message: "Synthetic" };
    // Same person twice with different email casing; one phone-only match; one legacy reviewed row.
    await legacy.$executeRawUnsafe(`INSERT INTO "Enquiry" ("id","idempotencyHash","payloadHash","kind","name","email","phone","message","context","status","version","createdAt") VALUES
      ('${ids[0]}','i0','p','contact','Asha Rao','Asha@Example.invalid','+91 98765 43210','${base.message}','${JSON.stringify(base.context)}','new',0,'2026-10-01T00:00:00Z'),
      ('${ids[1]}','i1','p','project','A. Rao','asha@example.invalid','','${base.message}','${JSON.stringify(base.context)}','reviewed',1,'2026-10-02T00:00:00Z'),
      ('${ids[2]}','i2','p','bulk','Asha (work)','asha.work@example.invalid','9876543210','${base.message}','${JSON.stringify(base.context)}','new',0,'2026-10-03T00:00:00Z'),
      ('${ids[3]}','i3','p','contact','Other Person','other@example.invalid','','${base.message}','${JSON.stringify(base.context)}','new',0,'2026-10-04T00:00:00Z')`);
    await legacy.$disconnect();
    migrate(resolve("prisma/schema.prisma"));
    db = new PrismaClient({ datasources: { db: { url: target.href } } });
    const statuses = await db.$queryRawUnsafe<Array<{ status: string; version: number }>>(`SELECT "status","version" FROM "Enquiry" ORDER BY "createdAt"`);
    assert.deepEqual(statuses.map(row => row.status), ["new", "contacted", "new", "new"], "reviewed maps to contacted; other statuses unchanged");
    assert.equal(statuses[1]!.version, 1, "migration does not advance enquiry versions");
    const rows = await db.$queryRawUnsafe<Array<{ id: string; status: string; contactId: string | null; version: number }>>(`SELECT "id","status","contactId","version" FROM "Enquiry" ORDER BY "createdAt"`);
    assert.ok(rows.every(row => row.contactId), "every existing enquiry gains a contact");
    assert.equal(rows[0]!.contactId, rows[1]!.contactId, "email match is case-insensitive");
    assert.equal(rows[0]!.contactId, rows[2]!.contactId, "a different email with the same normalised phone joins the existing contact");
    assert.notEqual(rows[0]!.contactId, rows[3]!.contactId);
    const contacts = await db.$queryRawUnsafe<Array<{ id: string; emailKey: string; phoneKey: string | null; name: string; email: string; phone: string }>>(`SELECT "id","emailKey","phoneKey","name","email","phone" FROM "Contact" ORDER BY "createdAt","id"`);
    assert.equal(contacts.length, 2);
    const asha = contacts.find(contact => contact.id === rows[0]!.contactId)!;
    assert.equal(asha.emailKey, "asha@example.invalid"); assert.equal(asha.phoneKey, "919876543210");
    assert.equal(asha.name, "Asha Rao", "the earliest enquiry provides the contact name");
    assert.equal(asha.email, "asha@example.invalid");
    // Re-running the migration SQL must neither duplicate contacts nor relink enquiries.
    const rerun = pg("psql", ["-v", "ON_ERROR_STOP=1", "-q", "-f", resolve(`prisma/migrations/${migrationName}/migration.sql`), "-d"]);
    assert.equal(rerun.status, 0, `Migration SQL must be idempotent: ${rerun.stderr}`);
    assert.equal(Number((await db.$queryRawUnsafe<Array<{ count: bigint }>>(`SELECT count(*) AS count FROM "Contact"`))[0]!.count), 2);
    assert.deepEqual(await db.$queryRawUnsafe(`SELECT "id","contactId" FROM "Enquiry" ORDER BY "createdAt"`), rows.map(({ id, contactId }) => ({ id, contactId })));
    assert.equal(await db.followUpTask.count(), 0);
    // The status check constraint rejects the retired legacy value.
    await assert.rejects(db.$executeRawUnsafe(`UPDATE "Enquiry" SET "status"='reviewed' WHERE "id"='${ids[1]}'`), /check constraint|violates/i);
  } finally {
    await db?.$disconnect();
    rmSync(temporary, { recursive: true, force: true });
    assert.equal(pg("dropdb").status, 0, "Remove owned disposable migration database");
  }
});
