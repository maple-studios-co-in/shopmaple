const key = "maple-recent-products-v1";
export const isProductHandle = (value: unknown): value is string =>
  typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 200;

/** Only public handles are retained on this browser. Prices and searches are never stored. */
export function recentProducts(): string[] {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw || raw.length > 2048) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length > 8 || !parsed.every(isProductHandle)) return [];
    return [...new Set(parsed)];
  } catch { return []; }
}
export function recordProductVisit(handle: string) {
  if (!isProductHandle(handle)) return;
  try { window.localStorage.setItem(key, JSON.stringify([handle, ...recentProducts().filter(item => item !== handle)].slice(0, 8))); }
  catch { /* Private browsing can disable storage; browsing still works. */ }
}
export function clearRecentProducts(): boolean {
  try { window.localStorage.removeItem(key); return true; } catch { return false; }
}
