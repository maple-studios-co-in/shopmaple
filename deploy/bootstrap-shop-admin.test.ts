import assert from "node:assert/strict";
import { after, test } from "node:test";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const directory = await mkdtemp(join(tmpdir(), "shop-admin-bootstrap-"));
after(async () => rm(directory, { recursive: true, force: true }));
function run(args: string[], input: string) {
    return new Promise<{
        code: number | null;
        output: string;
    }>((resolveResult, reject) => {
        const child = spawn("bash", [resolve("deploy/bootstrap-shop-admin.sh"), ...args], { stdio: ["pipe", "pipe", "pipe"], env: process.env });
        let output = "";
        child.stdout.on("data", v => output += v);
        child.stderr.on("data", v => output += v);
        child.on("error", reject);
        child.stdin.on("error", (error: NodeJS.ErrnoException) => {
            // Early validation can close stdin; the exit status still determines success.
            if (error.code !== "EPIPE") reject(error);
        });
        child.on("close", code => resolveResult({ code, output }));
        child.stdin.end(input);
    });
}
test("bootstrap wrapper reports early argument rejection with pending stdin", async () => {
    // Exceed the pipe buffer so the wrapper exits with a write still pending.
    const input = randomBytes(1024 * 1024).toString("hex");
    await assert.doesNotReject(async () => {
        const result = await run([], input);
        assert.equal(result.code, 1);
        assert.match(result.output, /Usage: bootstrap-shop-admin\.sh/);
        assert.ok(!result.output.includes(input.slice(0, 64)));
    }, "early CLI rejection must return its exit status and diagnostic despite closed stdin");
});
test("bootstrap wrapper refuses missing arguments and readable environment files before provisioning", async () => {
    const password = randomBytes(32).toString("hex");
    const missing = await run([], password);
    assert.notEqual(missing.code, 0, "missing private environment path must fail");
    const file = join(directory, "unsafe.env");
    await writeFile(file, "DATABASE_URL=not-a-url\n", { mode: 0o644 });
    const unsafe = await run([file], password);
    assert.notEqual(unsafe.code, 0);
    assert.match(unsafe.output, /permissions/);
    assert.ok(!unsafe.output.includes(password));
});
