/*
 * Utilities for the storefront's current look (paper, ink, burgundy, Manrope), shared by the
 * pages re-skinned onto Tailwind without visual change: blog, policies, content pages, returns,
 * 404, error and cart. Each string restates what the legacy rules and the global element rules
 * gave, since the [data-store] base neutralises the latter.
 *
 * Breakpoints: Tailwind's max-[N] means `width < N`, so max-[701px] is the legacy
 * `max-width: 700px` and max-[750px] and max-[1001px] are `max-width: 749px` and `1000px`.
 */

/** The burgundy button (legacy `.button`). */
export const button =
  "inline-flex min-h-12 items-center justify-center gap-3 border border-brand bg-brand px-6 py-[13px] font-medium text-white transition-[background,color] duration-150 ease-[ease] hover:bg-[#571710]";

/** The borderless 32 x 40 icon button (legacy `.icon-button`). */
export const iconButton =
  "relative inline-flex h-10 w-8 items-center justify-center border-0 bg-transparent p-[5px] hover:text-brand [&_svg]:size-5 [&_svg]:stroke-[1.6]";

/** Page title in the serif (the global `h1` rule). */
export const pageTitle =
  "font-serif text-[48px] font-medium leading-[1.13] tracking-[-0.025em] max-[701px]:text-[36px]";

/** Section heading in the serif (the global `h2` rule at the 30 px the drawer and empty states use). */
export const panelTitle = "font-serif text-[30px] font-medium leading-[1.13]";

/** A centred message with a call to action (legacy `.empty-state`); its paragraphs use `emptyCopy`. */
export const emptyState =
  "flex min-h-[340px] flex-col items-center justify-center gap-3 px-6 py-[60px] text-center max-[701px]:px-4 max-[701px]:py-10";
export const emptyCopy = "my-2.5 max-w-[520px]";

/** The narrow editorial column for policies, articles and the returns page (legacy `.editorial-page`). */
export const editorialPage =
  "mx-auto max-w-[1040px] px-7 pt-10 pb-20 max-[750px]:px-[18px] max-[750px]:pt-6 max-[750px]:pb-12";
export const editorialTitle =
  "my-7 font-serif text-[clamp(32px,4vw,54px)] font-medium leading-[1.15] tracking-[-0.025em] text-brand max-[750px]:text-[34px]";
export const breadcrumbs = "flex flex-wrap gap-4 text-[13px] text-[#756d64]";
export const textLink = "hover:underline hover:underline-offset-[5px]";

/**
 * Rich text from published content (policy and article bodies, structured pages): legacy
 * `.store-prose`, plus what the global element rules and the browser's own defaults gave the
 * headings, paragraphs and lists the [data-store] base resets.
 */
export const storeProse = [
  "text-[16px] leading-[1.85] text-[#49423c] wrap-anywhere",
  "[&_:is(h2,h3)]:mt-9 [&_:is(h2,h3)]:mb-4 [&_:is(h2,h3)]:font-serif [&_:is(h2,h3)]:font-medium [&_:is(h2,h3)]:leading-[1.2] [&_:is(h2,h3)]:text-brand",
  "[&_h2]:text-[30px] [&_h3]:text-[24px]",
  "[&_h4]:my-[1.33em] [&_h4]:font-bold [&_h5]:my-[1.67em] [&_h5]:text-[0.83em] [&_h5]:font-bold [&_h6]:my-[2.33em] [&_h6]:text-[0.67em] [&_h6]:font-bold",
  "[&_p]:my-3.5 [&_li]:my-2",
  "[&_:is(ul,ol)]:my-[1em] [&_:is(ul,ol)]:ps-10 [&_ul]:list-disc [&_ol]:list-decimal",
  "[&_:is(ul,ol)_:is(ul,ol)]:my-0 [&_:is(ul,ol)_ul]:list-[circle] [&_:is(ul,ol)_:is(ul,ol)_ul]:list-[square]",
  "[&>div>div]:border-b [&>div>div]:border-[#e7e0d8] [&>div>div]:py-5",
  "[&_table]:block [&_table]:w-full [&_table]:border-collapse [&_table]:overflow-auto [&_table]:wrap-normal",
  "[&_table:focus-visible]:outline-2 [&_table:focus-visible]:outline-offset-3 [&_table:focus-visible]:outline-brand",
  "[&_:is(td,th)]:border [&_:is(td,th)]:border-[#e7e0d8] [&_:is(td,th)]:p-3",
  "[&_a:hover]:underline [&_a:hover]:underline-offset-[5px]",
].join(" ");
