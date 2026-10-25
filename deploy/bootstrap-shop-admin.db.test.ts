import assert from "node:assert/strict";
import { after, test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).hostname !== "127.0.0.1" || new URL(url).port !== "55439" || new URL(url).pathname !== "/shopmaple_test")
    throw Error("Dedicated local shopmaple_test database required");
const db = new PrismaClient({ datasources: { db: { url } } });
const directory = await mkdtemp(join(tmpdir(), "shop-admin-bootstrap-db-"));
const email = "aditya@maplefurnishers.com";
let ownedId: string | undefined;
after(async () => { if (ownedId) {
    await db.shopAdminSession.deleteMany({ where: { adminId: ownedId } });
    await db.shopAdmin.delete({ where: { id: ownedId } });
} await db.$disconnect(); await rm(directory, { recursive: true, force: true }); });
function run(file: string, input: string, expected = "shopmaple_test", cwd = process.cwd()) {
    return new Promise<{
        code: number | null;
        output: string;
    }>((resolveResult, reject) => {
        const child = spawn("bash", [resolve("deploy/bootstrap-shop-admin.sh"), file, expected], { stdio: ["pipe", "pipe", "pipe"], cwd, env: { ...process.env, DATABASE_URL: "postgresql://invalid:invalid@unrelated.invalid:5432/not_the_test_database", NODE_ENV: "production" } });
        let output = "";
        child.stdout.on("data", v => output += v);
        child.stderr.on("data", v => output += v);
        child.on("error", reject);
        child.on("close", code => resolveResult({ code, output }));
        child.stdin.end(input);
    });
}
test("owner helper provisions from another working directory and refuses duplicate resets", async () => {
    assert.equal(await db.shopAdmin.count({ where: { email } }), 0, "test owns only a previously absent owner fixture");
    const file = join(directory, "private.env");
    await writeFile(file, `DATABASE_URL=${url}\nNODE_ENV=test\n`, { mode: 0o600 });
    const password = randomBytes(32).toString("hex");
    const result = await run("private.env", password + "\n", "shopmaple_test", directory);
    assert.equal(result.code, 0);
    const admin = await db.shopAdmin.findUnique({ where: { email } });
    if (admin)
        ownedId = admin.id;
    assert.ok(admin, "owner helper must create its publisher identity");
    assert.equal(admin.role, "publisher");
    assert.ok(!result.output.includes(password));
    assert.ok(!admin.passwordHash.includes(password));
    assert.notEqual((await run(file, randomBytes(32).toString("hex"))).code, 0);
    assert.equal((await db.shopAdmin.findUniqueOrThrow({ where: { email } })).passwordHash, admin.passwordHash);
});
test("owner helper refuses unrecognized database targets before accepting a password", async () => {
    const file = join(directory, "remote.env");
    await writeFile(file, 'DATABASE_URL="postgresql://invalid:invalid@remote.invalid:5432/shopmaple_store"\nNODE_ENV=production\n', { mode: 0o600 });
    const result = await run(file, randomBytes(32).toString("hex"));
    assert.notEqual(result.code, 0);
    assert.match(result.output, /unrecognized shop database target/);
});
test("explicit database scope refuses a different recognized target before provisioning", async () => {
    const file = join(directory, "scope.env");
    await writeFile(file, `DATABASE_URL=${url}\nNODE_ENV=test\n`, { mode: 0o600 });
    const result = await run(file, randomBytes(32).toString("hex"), "shopmaple_store");
    assert.notEqual(result.code, 0);
    assert.match(result.output, /database target/);
});
