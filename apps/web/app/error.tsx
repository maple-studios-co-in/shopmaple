"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="empty-state">
      <h1>We couldn’t load this page</h1>
      <p>Please try again in a moment. Your saved cart has not been changed.</p>
      <button className="button" onClick={reset}>
        Try again
      </button>
    </section>
  );
}
