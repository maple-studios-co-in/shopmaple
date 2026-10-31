export default function Loading() {
 return <div data-store data-loading className="grid min-h-dvh place-content-center bg-[#faf8f4]" role="status" aria-live="polite">
  <img src="/media/footer/maple-logo.webp" alt="" width="180" height="84" className="h-auto w-[180px] animate-loading-pulse motion-reduce:animate-none" />
  <span className="sr-only">Loading Maple Furnishers…</span>
 </div>;
}
