import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

// "Maple / Typography" (Figma 180:639): DM Sans Medium for headings and labels, Red Hat Display Regular for reading text,
// and the logo left as its own artwork. The admin keeps its own typeface.
const web = fileURLToPath(new URL("..", import.meta.url));
const read = (path: string) => readFileSync(join(web, path), "utf8");
const walk = (dir: string): string[] => readdirSync(join(web, dir)).flatMap((name) => {
  const path = join(dir, name);
  return statSync(join(web, path)).isDirectory() ? walk(path) : [path];
});
const retired = /Newsreader|Barlow|Manrope|Pinyon/;
// The admin has its own type (admin.css, components/admin); these lines only name fallbacks there.
const storefront = (path: string) => !/admin/.test(path);
const sheets = walk("styles").concat(walk("components").filter((path) => path.endsWith(".css"))).filter(storefront);
const sources = [...walk("components"), ...walk("app"), ...walk("lib")].filter((path) => /\.tsx?$/.test(path) && storefront(path));

test("no storefront stylesheet or component names a retired typeface", () => {
  const found = [...sheets, ...sources].flatMap((path) => read(path).split("\n").flatMap((line, index) => retired.test(line) ? [`${relative(web, join(web, path))}:${index + 1} ${line.trim().slice(0, 100)}`] : []));
  assert.deepEqual(found, []);
});

test("the two typefaces are the storefront's only font tokens", () => {
  const tailwind = read("styles/tailwind.css");
  assert.match(tailwind, /--font-heading:\s*"DM Sans Variable"/, "the variable font, whose optical sizes the frames draw with");
  assert.match(tailwind, /--font-text:\s*"Red Hat Display"/);
  for (const token of ["--font-manrope", "--font-redhat", "--font-body", "--font-serif", "--font-product"]) assert.ok(!tailwind.includes(token), `${token} is retired`);
  for (const path of sources) assert.doesNotMatch(read(path), /\bfont-(?:serif|body|product|redhat|manrope)\b/, `${path} still uses a retired font utility`);
});

test("every element falls to the right face by default: text in Red Hat Display, headings in DM Sans Medium", () => {
  const storefrontCss = read("styles/storefront.css");
  assert.match(storefrontCss, /body\s*\{[^}]*font-family:\s*var\(--font-text\)/);
  assert.match(storefrontCss, /h1,\s*h2,\s*h3\s*\{[^}]*font-family:\s*var\(--font-heading\)[^}]*font-weight:\s*500/);
  // The redesigned pages reset headings inside [data-store]; the reset must land on the heading face, at no extra weight.
  assert.match(read("styles/tailwind.css"), /:where\(\[data-store\]\) :is\(h1, h2, h3, h4, h5, h6\) \{[^}]*font: inherit;[^}]*font-family: var\(--font-heading\);[^}]*font-weight: 500;/);
});

test("the classic homepage's own variables point at the same two faces", () => {
  const impact = read("styles/home-impact.css");
  assert.doesNotMatch(impact, /--impact-(?:serif|body|sans|script)/, "one set of names, not four");
});

test("nothing draws a heading in a weight or slant the sheet does not have", () => {
  const headingShorthand = /font:\s*(?:italic\s+)?(\d{3})\s+[^;]*var\(--font-heading\)/g;
  // A slanted heading uses DM Sans's own italic, which the layout loads, never a slant the browser fakes. The owner
  // asked for the statement band's "custom-built" in italic again (10 Nov 2026).
  const italicLoaded = read("app/layout.tsx").includes("@fontsource-variable/dm-sans/opsz-italic.css");
  for (const path of sheets) {
    for (const match of read(path).matchAll(headingShorthand)) assert.equal(match[1], "500", `${path}: ${match[0]}`);
    if (!italicLoaded) assert.doesNotMatch(read(path), /font:\s*italic[^;]*var\(--font-heading\)/, `${path} slants a heading`);
  }
  assert.ok(italicLoaded, "DM Sans's italic is loaded for the headings that use it");
});

test("the layout loads the two faces with the weights the sheet uses, and no others", () => {
  const layout = read("app/layout.tsx");
  for (const file of ["@fontsource-variable/dm-sans/opsz", "@fontsource-variable/dm-sans/opsz-italic", "@fontsource/red-hat-display/400", "@fontsource/red-hat-display/500", "@fontsource/red-hat-display/600", "@fontsource/red-hat-display/700", "@fontsource/red-hat-display/400-italic"]) assert.ok(layout.includes(`${file}.css`), file);
  assert.doesNotMatch(layout, /@fontsource\/(?:barlow|newsreader|pinyon-script|manrope)/);
  assert.ok(!layout.includes("shopify-fonts.css"), "the old store's font files are retired with their faces");
  assert.equal(existsSync(join(web, "styles/shopify-fonts.css")), false);
  assert.equal(existsSync(join(web, "public/fonts/shopify")), false);
  const pkg = JSON.parse(read("package.json")) as { dependencies: Record<string, string> };
  for (const name of ["@fontsource/barlow", "@fontsource/newsreader", "@fontsource/pinyon-script", "@fontsource/manrope"]) assert.equal(pkg.dependencies[name], undefined, name);
  for (const name of ["@fontsource-variable/dm-sans", "@fontsource/red-hat-display"]) assert.ok(pkg.dependencies[name], name);
});

test("the logo stays artwork: the header and footer draw it as an image, not as set type", () => {
  assert.match(read("components/footer.tsx"), /maple-logo\.webp/);
  assert.match(read("components/header.tsx"), /alt="Maple Furnishers"/);
});
