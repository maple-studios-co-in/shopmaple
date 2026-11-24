/**
 * Content that is over the whole-document limit (1 MiB since 24 Nov 2026) while every entry in it is valid alone:
 * twenty full pages and twenty full policies, about 1.1 MiB together. A contract test spreads it over its own valid
 * document to show that its section still counts toward the limit and is not exempt from it.
 */
export const overTheContentLimit = () => ({
  pages: Array.from({ length: 20 }, (_, index) => ({ slug: `large-page-${index}`, title: "Page", description: "Description", body: "x".repeat(8000), banner: null })),
  editorialContent: {
    policies: Array.from({ length: 20 }, (_, index) => ({ slug: `large-policy-${index}`, title: "Policy", content: Array(3).fill("x".repeat(16000)) as string[] })),
    blogs: [],
    articles: [],
  },
});

/** The message the whole-document limit refuses with. */
export const contentLimitMessage = "Content exceeds 1 MiB";
