import assert from "node:assert/strict";
import { test } from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

test("delivery migration deploys fresh and upgrades without backfilling or losing existing enquiries", async () => {
  const source = new URL(process.env.TEST_DATABASE_URL ?? "");
  assert.equal(source.hostname, "127.0.0.1"); assert.equal(source.port, "55439"); assert.equal(source.pathname, "/shopmaple_test");
  const name = `shopmaple_delivery_test_${randomBytes(6).toString("hex")}`;
  const target = new URL(source); target.pathname = `/${name}`;
  const pgDirectory = process.env.PG_BIN_DIRECTORY ?? (process.platform === "darwin" ? "/opt/homebrew/opt/postgresql@17/bin" : "/usr/lib/postgresql/17/bin");
  const pgEnv = { PATH: process.env.PATH, HOME: process.env.HOME, PGHOST: source.hostname, PGPORT: source.port, PGUSER: decodeURIComponent(source.username), PGPASSWORD: decodeURIComponent(source.password), PGCONNECT_TIMEOUT: "5" };
  const pg = (command: string) => spawnSync(join(pgDirectory, command), [name], { env: pgEnv, encoding: "utf8", timeout: 30000 });
  const created = pg("createdb"); assert.equal(created.status, 0, "Create owned disposable migration database");
  const temporary = mkdtempSync(join(tmpdir(), "shopmaple-delivery-migration-"));
  let db: PrismaClient | undefined;
  const migrate = (schema: string) => {
    const result = spawnSync("npx", ["prisma", "migrate", "deploy", "--schema", schema], { env: { ...process.env, DATABASE_URL: target.href }, encoding: "utf8", timeout: 30000 });
    assert.equal(result.status, 0, "Migration must deploy successfully");
  };
  try {
    cpSync(resolve("prisma"), join(temporary, "prisma"), { recursive: true, filter: path => !path.includes("20261027070000_enquiry_delivery") });
    migrate(join(temporary, "prisma/schema.prisma"));
    db = new PrismaClient({ datasources: { db: { url: target.href } } });
    const id = `enq_${randomUUID()}`;
    await db.enquiry.create({ data: { id, idempotencyHash: "migration-synthetic-idempotency", payloadHash: "migration-synthetic-payload", kind: "project", name: "Synthetic", email: "synthetic@example.invalid", phone: "", message: "Retain existing enquiry", context: {} } });
    await db.$disconnect();
    migrate(resolve("prisma/schema.prisma"));
    db = new PrismaClient({ datasources: { db: { url: target.href } } });
    assert.equal((await db.enquiry.findUniqueOrThrow({ where: { id } })).message, "Retain existing enquiry");
    assert.equal(await db.enquiryDelivery.count(), 0);
    const delivery = await db.enquiryDelivery.create({ data: { enquiryId: id, configurationHash: "a".repeat(64) } });
    assert.equal(delivery.attempts, 0); assert.equal(delivery.status, "queued");
    await assert.rejects(db.enquiry.delete({ where: { id } }));
    await assert.rejects(db.enquiryDelivery.create({ data: { enquiryId: id, configurationHash: "a".repeat(64) } }));
    await assert.rejects(db.enquiryDelivery.update({ where: { id: delivery.id }, data: { attempts: 6 } }));
    await assert.rejects(db.enquiryDelivery.update({ where: { id: delivery.id }, data: { status: "delivered" } }));
  } finally {
    await db?.$disconnect(); rmSync(temporary, { recursive: true, force: true });
    const dropped = pg("dropdb"); assert.equal(dropped.status, 0, "Remove owned disposable migration database");
  }
  const fresh = pg("createdb"); assert.equal(fresh.status, 0);
  try {
    migrate(resolve("prisma/schema.prisma"));
    db = new PrismaClient({ datasources: { db: { url: target.href } } });
    assert.equal(await db.enquiryDelivery.count(), 0); assert.equal(await db.enquiryDeliveryRetryAudit.count(), 0);
  } finally { await db?.$disconnect(); assert.equal(pg("dropdb").status, 0); }
});
