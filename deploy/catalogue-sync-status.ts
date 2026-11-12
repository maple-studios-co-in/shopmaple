// The catalogue sync's last outcome, for the store monitor: when it last succeeded and, after a failure, a fixed reason
// code. Written atomically (private file, then rename). Recording is best effort: it never changes the sync's result.
import { closeSync, constants, fsyncSync, openSync, readFileSync, renameSync, rmSync, writeSync } from "node:fs";

type Outcome = { ok: true; totalProducts?: number; totalVariants?: number } | { ok: false; reason: string };
const code = /^[A-Z][A-Z0-9_]{2,63}$/;

/** Only a fixed identifier leaves the process; messages can carry addresses, tokens or database URLs. */
export function reasonCode(error: unknown): string {
  if (error && typeof error === "object") {
    const { code: errorCode, message } = error as { code?: unknown; message?: unknown };
    if (typeof errorCode === "string" && code.test(errorCode)) return errorCode;
    if (typeof message === "string" && code.test(message)) return message;
  }
  return "UNEXPECTED";
}

function previous(path: string): { lastSuccessAt: string | null; consecutiveFailures: number } {
  try {
    const value = JSON.parse(readFileSync(path, "utf8"));
    return {
      lastSuccessAt: typeof value.lastSuccessAt === "string" ? value.lastSuccessAt : null,
      consecutiveFailures: Number.isSafeInteger(value.consecutiveFailures) ? value.consecutiveFailures : 0,
    };
  } catch {
    return { lastSuccessAt: null, consecutiveFailures: 0 };
  }
}

export function recordSyncOutcome(path: string | undefined, outcome: Outcome, now = new Date()): void {
  if (!path) return;
  const at = now.toISOString();
  const before = previous(path);
  const record = outcome.ok
    ? {
        version: 1, ok: true, at, lastSuccessAt: at, consecutiveFailures: 0,
        ...(Number.isSafeInteger(outcome.totalProducts) ? { totalProducts: outcome.totalProducts } : {}),
        ...(Number.isSafeInteger(outcome.totalVariants) ? { totalVariants: outcome.totalVariants } : {}),
      }
    : {
        version: 1, ok: false, at, lastSuccessAt: before.lastSuccessAt,
        consecutiveFailures: before.consecutiveFailures + 1,
        reason: code.test(outcome.reason) ? outcome.reason : "UNEXPECTED",
      };
  const temporary = `${path}.${process.pid}.tmp`;
  const fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try {
    const bytes = Buffer.from(`${JSON.stringify(record)}\n`);
    let offset = 0;
    while (offset < bytes.length) offset += writeSync(fd, bytes, offset);
    fsyncSync(fd);
  } catch (error) {
    closeSync(fd);
    rmSync(temporary, { force: true });
    throw error;
  }
  closeSync(fd);
  renameSync(temporary, path);
}
