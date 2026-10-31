import { jsonLdText } from "@/lib/seo";

/** schema.org data for search and answer engines. `jsonLdText` escapes every character that could close the script. */
export function JsonLd({ data }: { data: object | (object | null)[] }) {
  const blocks = [data].flat().filter((block): block is object => block !== null);
  if (!blocks.length) return null;
  // nosemgrep: typescript.react.security.audit.react-dangerouslysetinnerhtml.react-dangerouslysetinnerhtml -- JSON from our own structured-data builders, escaped by jsonLdText (no <, >, &, U+2028/9 survive)
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdText(blocks.length === 1 ? blocks[0] : blocks) }} />;
}
