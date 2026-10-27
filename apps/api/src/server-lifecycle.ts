/** Graceful shutdown shared by every background runner the server starts.
 *
 * Order on the first signal: stop every runner (no new cycles; in-flight cycles keep
 * running), stop accepting connections, wait for the in-flight cycles to drain, then
 * disconnect the database and exit. Later signals are ignored. Leased worker rows make
 * a hard kill safe too: an unfinished lease simply expires and another cycle retries. */
export function installShutdown(deps: {
  server: { close(callback: () => void): unknown };
  db: { $disconnect(): Promise<unknown> };
  runners: Array<{ stop(): Promise<void> } | null | undefined>;
  exit: (code: number) => void;
  signals?: { on(signal: string, handler: () => void): unknown };
}) {
  const signals = deps.signals ?? process;
  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    const drained = Promise.all(deps.runners.map((runner) => runner?.stop()));
    deps.server.close(() => {
      void drained.then(() => deps.db.$disconnect()).then(() => deps.exit(0));
    });
  };
  for (const signal of ["SIGINT", "SIGTERM"]) signals.on(signal, shutdown);
  return shutdown;
}
