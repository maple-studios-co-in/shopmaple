import assert from "node:assert/strict";
import { test } from "node:test";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

test("all migrations deploy on an empty isolated database and preserve assignment and activity relations", async () => {
  const source = new URL(process.env.TEST_DATABASE_URL ?? "");
  assert.equal(source.hostname, "127.0.0.1");
  assert.equal(source.port, "55439");
  assert.equal(source.pathname, "/shopmaple_test");
  const name = `shopmaple_workflow_test_${randomBytes(6).toString("hex")}`;
  const target = new URL(source); target.pathname = `/${name}`;
  const pgDirectory = process.env.PG_BIN_DIRECTORY ?? (process.platform === "darwin" ? "/opt/homebrew/opt/postgresql@17/bin" : "/usr/lib/postgresql/17/bin");
  const pgEnv = { PATH: process.env.PATH, HOME: process.env.HOME, PGHOST: source.hostname, PGPORT: source.port, PGUSER: decodeURIComponent(source.username), PGPASSWORD: decodeURIComponent(source.password), PGCONNECT_TIMEOUT: "5" };
  const pg = (command: string) => spawnSync(join(pgDirectory, command), [name], { env: pgEnv, encoding: "utf8", timeout: 30000 });
  const created = pg("createdb"); assert.equal(created.status, 0, "Create dedicated disposable migration database");
  let db: PrismaClient | undefined;
  try {
    const migrated = spawnSync("npx", ["prisma", "migrate", "deploy", "--schema", "prisma/schema.prisma"], { env: { ...process.env, DATABASE_URL: target.href }, encoding: "utf8", timeout: 30000 });
    assert.equal(migrated.status, 0, `All migrations must deploy from empty database: ${migrated.stderr}`);
    db = new PrismaClient({ datasources: { db: { url: target.href } } });
    assert.equal(await db.enquiry.count({ where: { assignedToId: null } }), 0);
    assert.equal(await db.enquiryActivity.count(), 0);
  } finally {
    await db?.$disconnect();
    const dropped = pg("dropdb"); assert.equal(dropped.status, 0, "Remove owned disposable migration database");
  }
});
