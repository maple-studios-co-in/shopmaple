/**
 * The logo screen shown while a catalogue page loads. It is a route's loading.tsx only below the layout that decides
 * whether the address exists: once this fallback streams, the status is fixed at 200, so a later notFound() cannot
 * answer 404 (see app/collections/[handle]/layout.tsx).
 */
export function MapleLoading() {
 return <div className="maple-loading" role="status" aria-live="polite">
  <img src="/media/footer/maple-logo.webp" alt="" width="180" height="84" />
  <span className="sr-only">Loading Maple Furnishers…</span>
 </div>;
}
