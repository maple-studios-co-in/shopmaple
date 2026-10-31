"use client";
import { button, emptyCopy, emptyState, pageTitle } from "@/components/store/current-look";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section data-store data-empty-state className={emptyState}>
      <h1 className={pageTitle}>We couldn’t load this page</h1>
      <p className={emptyCopy}>Please try again in a moment. Your saved cart has not been changed.</p>
      <button className={`${button} mt-3`} onClick={reset}>
        Try again
      </button>
    </section>
  );
}
