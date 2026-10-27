import assert from "node:assert/strict";
import { test } from "node:test";
import { installShutdown } from "../src/server-lifecycle.js";
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

test("shutdown stops workers first, closes the listener, drains in-flight cycles, then disconnects and exits once", async () => {
  const order: string[] = [];
  let finishOrders!: () => void;
  const ordersDraining = new Promise<void>((resolve) => { finishOrders = resolve; });
  const handlers = new Map<string, () => void>();
  let closeListener!: () => void;
  installShutdown({
    server: { close: (cb: () => void) => { order.push("server.close"); closeListener = cb; } },
    db: { $disconnect: async () => { order.push("db.disconnect"); } },
    runners: [
      { stop: async () => { order.push("enquiries.stop"); } },
      null,
      { stop: async () => { order.push("orders.stop"); await ordersDraining; order.push("orders.drained"); } },
    ],
    exit: (code) => { order.push(`exit:${code}`); },
    signals: { on: (signal, handler) => { handlers.set(signal, handler); } },
  });
  assert.deepEqual([...handlers.keys()].sort(), ["SIGINT", "SIGTERM"]);
  handlers.get("SIGTERM")!();
  handlers.get("SIGINT")!();
  await flush();
  assert.deepEqual(order, ["enquiries.stop", "orders.stop", "server.close"], "a second signal must not restart shutdown");
  closeListener();
  await flush();
  assert.deepEqual(order.slice(3), [], "the database stays connected while a worker cycle is still persisting");
  finishOrders();
  await flush();
  assert.deepEqual(order.slice(3), ["orders.drained", "db.disconnect", "exit:0"]);
});
