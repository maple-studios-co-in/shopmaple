type Entry = { expiresAt: number; value?: unknown; pending?: Promise<unknown> };

/** Only public catalogue reads belong here; never cache carts, accounts or checkout. */
export function createCatalogueCache({
  ttlMs = 30_000,
  maxEntries = 64,
  now = Date.now,
}: { ttlMs?: number; maxEntries?: number; now?: () => number } = {}) {
  const entries = new Map<string, Entry>();
  return async function read<T>(key: string, load: () => Promise<T>): Promise<T> {
    let entry = entries.get(key);
    if (entry && !entry.pending && entry.expiresAt <= now()) {
      entries.delete(key);
      entry = undefined;
    }
    if (!entry) {
      entry = { expiresAt: 0 };
      const current = entry;
      current.pending = Promise.resolve().then(load).then(value => {
        current.value = value;
        current.expiresAt = now() + ttlMs;
        current.pending = undefined;
        return value;
      }, error => {
        if (entries.get(key) === current) entries.delete(key);
        throw error;
      });
    }
    // Refresh recency without extending freshness. Eviction never cancels a reader.
    entries.delete(key);
    entries.set(key, entry);
    while (entries.size > maxEntries) entries.delete(entries.keys().next().value!);
    const value = entry.pending ? await entry.pending : entry.value;
    return structuredClone(value) as T;
  };
}
