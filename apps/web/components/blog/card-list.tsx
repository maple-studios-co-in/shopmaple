"use client";
import { Children, cloneElement, isValidElement, useState, type ReactElement, type ReactNode } from "react";

/**
 * The listing's cards (Figma 268:4185), `step` at a time with Load more under them. Every card is in the page from the
 * start, the later ones hidden, so search engines and a browser without script see them all (the noscript rule shows
 * them and puts the button away).
 */
export function BlogCardList({ step, children }: { step: number; children: ReactNode }) {
  const cards = Children.toArray(children).filter(isValidElement) as ReactElement<{ hidden?: boolean }>[];
  const [shown, setShown] = useState(step);
  return (
    <>
      <div data-blog-cards className="blog-cards">
        {cards.map((card, at) => cloneElement(card, { hidden: at >= shown ? true : undefined }))}
      </div>
      {cards.length > shown && (
        <button type="button" data-load-more className="blog-load-more" onClick={() => setShown((count) => count + step)}>Load more</button>
      )}
      {cards.length > step && (
        <noscript><style>{"[data-blog-card][hidden]{display:grid!important}[data-load-more]{display:none!important}"}</style></noscript>
      )}
    </>
  );
}
