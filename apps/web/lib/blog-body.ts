import type { EditorialNode } from "@shopmaple/contracts";

/**
 * The photographs through an imported article (owner, 10 Nov 2026): "first the image then its related text, then the
 * second image then its related text, then the third" — three pictures, each 16:9, each opening the part of the story
 * it shows. The imported articles carry no pictures beyond the hero, so each is given Maple's own room photography,
 * chosen for its parts, and the text is divided into three where it turns to a new point: never after a lead-in that
 * ends in a colon, inside a run of bullets, or under a heading.
 * `focus` is where the 16:9 frame holds the picture; `product` names the piece it shows, when it is one of the store's.
 */
export type BodyPicture = { src: string; alt: string; width: number; height: number; focus: string; product?: { name: string; href: string } };

const shopify = (file: string) => `https://cdn.shopify.com/s/files/1/0691/8651/9229/files/${file}`;
const photo = {
  // Maple's own room photography: the homepage's editorial and Nimbus photos.
  dining: { src: "/media/home/editorial-right.webp", alt: "A woman pouring coffee at a dining table with sunflowers, cream upholstered chairs and a pug", width: 1323, height: 979, focus: "50% 38%" },
  pedestal: { src: "/media/home/editorial-left.webp", alt: "A marble dining table on a fluted pedestal beside a tall window", width: 944, height: 944, focus: "50% 72%" },
  aero: { src: "/media/home/editorial-flip-aero.webp", alt: "A teal velvet chair on walnut legs beside a bright window and a marble side table", width: 800, height: 800, focus: "50% 58%", product: { name: "Aero dining chair", href: "/products/aero-dining-chair" } },
  runo: { src: "/media/home/editorial-flip-runo.webp", alt: "An oval walnut dining table with cream upholstered chairs in a sunlit room", width: 800, height: 800, focus: "50% 60%" },
  seno: { src: "/media/home/editorial-flip-seno.webp", alt: "A marble-topped dining table on a brass pedestal with cream upholstered chairs", width: 800, height: 800, focus: "50% 62%" },
  varyn: { src: "/media/home/editorial-flip-varyn.webp", alt: "A round walnut dining table with sage upholstered chairs in warm evening light", width: 800, height: 800, focus: "50% 58%" },
  terra: { src: "/media/home/nimbus-terra.webp", alt: "The Terra sofa set and armchairs around a round walnut table in a sunlit lounge", width: 1600, height: 732, focus: "50% 55%" },
  clouds: { src: "/media/home/nimbus-clouds.webp", alt: "White sofas, lounge chairs and a coffee table set among soft clouds", width: 1537, height: 1023, focus: "50% 55%" },
  // The collection pages' hero photographs (lib/collection-hero-photos.ts), each of a piece the store sells.
  aria: { src: shopify("2.1_05395d32-eee4-420c-b3fd-d66df462f2bb.png?v=1783922389"), alt: "A grey channel-tufted sofa and two armchairs with blue cushions around a low cream table", width: 1536, height: 1024, focus: "50% 62%", product: { name: "Aria 5-seater sofa", href: "/products/aria-5-seater-sofa" } },
  orvane: { src: shopify("both_0c29b634-10a2-4ebc-9ca3-28188d47a02d.png?v=1776159321"), alt: "Two houndstooth accent chairs beside a candlelit table under a glowing ring light in a deep green room", width: 1536, height: 1024, focus: "50% 58%", product: { name: "Orvane accent chair", href: "/products/orvane-accent-chair" } },
  sora: { src: shopify("6.1_1.png?v=1783923471"), alt: "Two olive green sofas on gold legs around a round gold-framed glass coffee table", width: 1587, height: 992, focus: "50% 55%", product: { name: "Sora 5-seater sofa", href: "/products/sora-5-seater-sofa" } },
  nova: { src: shopify("File_2026-05-27T11_42_27.516Z.webp?v=1780471191"), alt: "A marble-topped dining table on a dark base inlaid with brass, in a warm marble room", width: 1537, height: 1022, focus: "50% 66%", product: { name: "Nova dining table", href: "/products/nova-dining-table" } },
  aileron: { src: shopify("Gemini_Generated_Image_omfoktomfoktomfo.png?v=1778160420"), alt: "A cream upholstered bed with a tall panelled headboard, pendant lamps and a bench at its foot", width: 2528, height: 1685, focus: "50% 62%", product: { name: "Aileron signature bed", href: "/products/aileron-signature-bed" } },
  arden: { src: shopify("9D25AA03-9581-46B1-B8BC-749AE7B9A95C.webp?v=1781938509"), alt: "A walnut console cabinet with sculpted handles, a candle and a bowl on top", width: 1254, height: 1254, focus: "50% 58%", product: { name: "Arden console cabinet", href: "/products/arden-console-cabinet" } },
} satisfies Record<string, BodyPicture>;
type Photo = keyof typeof photo;

/** Each story's three photographs, in the order of the parts they open. */
const storyPhotos: Record<string, Photo[]> = {
  "how-to-measure-furniture-before-ordering-online": ["sora", "runo", "aria"],
  "what-should-be-finalised-first-furniture-flooring-or-lighting": ["terra", "aria", "orvane"],
  "furniture-delivery-access-guide-will-your-furniture-actually-fit-through-the-door": ["sora", "aileron", "arden"],
  "best-wood-for-furniture-in-indian-climate-humidity-heat-and-maintenance": ["arden", "pedestal", "varyn"],
  "standard-dining-table-size-guide-for-indian-homes": ["nova", "runo", "seno"],
  "why-every-successful-cafe-has-three-types-of-seating": ["aero", "dining", "orvane"],
  "how-luxury-hotels-design-seating-that-makes-guests-stay-longer": ["terra", "orvane", "clouds"],
  "luxury-furniture-trends-2026-what-defined-the-first-half-of-the-year-and-what-will-shape-the-months-ahead": ["clouds", "aileron", "sora"],
  "how-to-identify-quality-furniture-before-you-buy": ["arden", "aria", "pedestal"],
  "space-saving-furniture-ideas-for-small-homes": ["varyn", "aero", "arden"],
};
const otherStories: Photo[] = ["dining", "aria", "terra"];

export function storyPictures(handle: string): BodyPicture[] {
  return (storyPhotos[handle] ?? otherStories).map((name) => photo[name]);
}

/**
 * Imported text was hard-wrapped at the width it was written at, which leaves one-word lines at every other width.
 * A break inside a sentence (a word or comma before it, a lower-case word after it) reads as a space. A break after a
 * colon or full stop, before a bullet, number or capital, or next to another break stays; breaks that end a paragraph go.
 */
export function softenBreaks(nodes: EditorialNode[]): EditorialNode[] {
  return nodes.map((node) => {
    if (typeof node === "string" || node.tag === "br") return node;
    const children = softenBreaks(node.children);
    const isBreak = (item: EditorialNode | undefined) => !!item && typeof item !== "string" && item.tag === "br";
    const kept: EditorialNode[] = [];
    children.forEach((child, index) => {
      if (!isBreak(child)) return void kept.push(child);
      const rest = children.slice(index + 1);
      if (rest.every((item) => typeof item === "string" ? !item.trim() : item.tag === "br")) return;
      const before = children.slice(0, index).map(plain).join("").trimEnd();
      const after = rest.map(plain).join("").trimStart();
      const wrapped = !isBreak(children[index - 1]) && !isBreak(children[index + 1]) && /[\p{L}\p{N},]$/u.test(before) && /^[a-z]/.test(after);
      kept.push(wrapped ? " " : child);
    });
    return { ...node, children: kept };
  });
}

/** A run of the article's own text: whole nodes, or the items of a list that a picture divides (numbering carries on). */
export type TextPiece = { node: EditorialNode } | { list: "ol" | "ul"; start: number; items: EditorialNode[] };
export type BodySegment = { kind: "text"; pieces: TextPiece[] } | { kind: "picture"; picture: BodyPicture };

type Unit = { node: EditorialNode; list?: { tag: "ol" | "ul"; owner: number; index: number } };

const plain = (node: EditorialNode): string => typeof node === "string" ? node : node.children.map(plain).join("");
const bold = (node: EditorialNode): string => typeof node === "string" ? "" : ["strong", "b"].includes(node.tag) ? plain(node) : node.children.map(bold).join("");
const length = (unit: Unit) => plain(unit.node).replace(/\s+/g, " ").trim().length;

/** A line that only titles what follows: a heading, a numbered title, or a short paragraph set entirely in bold. */
function titleOnly(unit: Unit): boolean {
  const { node } = unit;
  if (typeof node === "string" || unit.list) return false;
  if (/^h[2-6]$/.test(node.tag)) return true;
  const text = plain(node).replace(/\s+/g, " ").trim();
  return text.length > 0 && text.length <= 90 && (/^\d+[.)]\s/.test(text) || bold(node).replace(/\s+/g, " ").trim().length >= text.length * 0.8);
}
/** Where the text turns to a new point: a title, or a list item that opens with its own bold title. */
function turns(unit: Unit): boolean {
  if (titleOnly(unit)) return true;
  if (!unit.list || typeof unit.node === "string") return false;
  const first = unit.node.children.find((child) => typeof child !== "string" || child.trim());
  return !!first && typeof first !== "string" && ["strong", "b"].includes(first.tag);
}

const blocks = new Set(["p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "table", "blockquote"]);

/**
 * The article's flow, with each list opened into its items so a picture may fall between two steps, and the plain
 * wrappers some imported articles put around all their paragraphs opened up.
 */
function units(content: EditorialNode[]): Unit[] {
  const flow: Unit[] = [];
  let lists = 0;
  const read = (nodes: EditorialNode[]) => nodes.forEach((node) => {
    if (typeof node === "string") {
      if (node.trim()) flow.push({ node });
      return;
    }
    if (node.tag === "div" && node.children.some((child) => typeof child !== "string" && blocks.has(child.tag))) return read(node.children);
    if (node.tag === "ol" || node.tag === "ul") {
      const items = node.children.filter((child) => typeof child !== "string" && child.tag === "li");
      const onlyItems = node.children.every((child) => typeof child === "string" ? !child.trim() : child.tag === "li");
      if (items.length >= 2 && onlyItems) {
        const owner = ++lists;
        items.forEach((item, index) => flow.push({ node: item, list: { tag: node.tag as "ol" | "ul", owner, index } }));
        return;
      }
    }
    flow.push({ node });
  });
  read(content);
  return flow;
}

/**
 * The story as picture, text, picture, text, picture, text: its text divided in three where it turns to a new point,
 * each part opened by its picture. A text too short to divide keeps fewer parts, each still opened by a picture.
 */
export function interleaveBody(content: EditorialNode[], pictures: BodyPicture[]): BodySegment[] {
  const flow = units(content);
  const sizes = flow.map(length);
  const total = sizes.reduce((sum, size) => sum + size, 0);
  if (pictures.length === 0 || total === 0) return [{ kind: "text", pieces: pieces(flow) }];
  const chosen = choose(candidates(flow, sizes, total), Math.min(pictures.length, 3) - 1, total);
  // Read the flow again, dividing it where the chosen breaks fall. A break inside a passage ends its first part there;
  // the rest carries on as a paragraph of its own (a list item's rest leaves the list: it starts a new point anyway).
  const segments: BodySegment[] = [{ kind: "picture", picture: pictures[0]! }];
  let run: Unit[] = [], shown = 1;
  const pause = () => {
    segments.push({ kind: "text", pieces: pieces(run) }, { kind: "picture", picture: pictures[shown++]! });
    run = [];
  };
  flow.forEach((unit, at) => {
    const inside = chosen.filter((item) => item.at === at && item.inner !== undefined).map((item) => item.inner!);
    if (inside.length > 0 && typeof unit.node !== "string") {
      const { node } = unit;
      let from = 0;
      inside.forEach((inner, part) => {
        const children = node.children.slice(from, inner);
        run.push(part === 0 ? { node: { ...node, children }, list: unit.list } : { node: { tag: "p", children } });
        pause();
        from = inner + 1;
      });
      run.push({ node: { tag: "p", children: node.children.slice(from) } });
    } else run.push(unit);
    if (chosen.some((item) => item.at === at && item.inner === undefined)) pause();
  });
  segments.push({ kind: "text", pieces: pieces(run) });
  return segments.filter((segment) => segment.kind === "picture" || segment.pieces.length > 0);
}

/** A place a picture may go: after unit `at`, or inside it before child `inner` (a line break). `read`: characters before it. */
type Break = { at: number; inner?: number; read: number; turn: boolean };

function candidates(flow: Unit[], sizes: number[], total: number): Break[] {
  const breaks: Break[] = [];
  const fits = (read: number) => read >= total * 0.12 && total - read >= total * 0.12;
  let read = 0;
  flow.forEach((unit, at) => {
    const { node } = unit;
    // Inside a long passage, where a line break leads into its next numbered or bold point.
    if (typeof node !== "string" && (node.tag === "p" || node.tag === "li")) {
      let within = 0;
      node.children.forEach((child, index) => {
        if (typeof child !== "string" && child.tag === "br" && index > 0) {
          const before = node.children.slice(0, index).map(plain).join("").trim();
          const rest = node.children.slice(index + 1);
          const after = rest.map(plain).join("").replace(/\s+/g, " ").trim();
          const first = rest.find((item) => typeof item !== "string" || item.trim());
          const opens = /^\d+[.)]\s/.test(after) || (!!first && typeof first !== "string" && ["strong", "b"].includes(first.tag));
          if (before && !before.endsWith(":") && after.length > 80 && opens && fits(read + within)) breaks.push({ at, inner: index, read: read + within, turn: true });
        }
        within += plain(child).replace(/\s+/g, " ").length;
      });
    }
    read += sizes[at]!;
    const next = flow[at + 1];
    if (!next) return;
    const before = plain(unit.node).trim(), after = plain(next.node).trim();
    if (!before || before.endsWith(":") || after.startsWith("•") || titleOnly(unit) || !fits(read)) return;
    breaks.push({ at, read, turn: turns(next) });
  });
  return breaks;
}

/**
 * The breaks that divide the text most evenly, preferring a turn to a new point, with at least a tenth of the story
 * between two pictures. Fewer pictures when the text offers no such places.
 */
function choose(breaks: Break[], wanted: number, total: number): Break[] {
  for (let count = wanted; count > 0; count--) {
    const targets = Array.from({ length: count }, (_, k) => (total * (k + 1)) / (count + 1));
    let best: Break[] = [], bestScore = Infinity;
    const walk = (from: number, picked: Break[], score: number) => {
      if (picked.length === count) {
        if (score < bestScore) { best = picked; bestScore = score; }
        return;
      }
      const target = targets[picked.length]!;
      for (let index = from; index < breaks.length; index++) {
        const item = breaks[index]!, previous = picked.at(-1);
        if (previous && item.read - previous.read < total * 0.1) continue;
        if (Math.abs(item.read - target) > total * 0.3) continue;
        walk(index + 1, [...picked, item], score + Math.abs(item.read - target) - (item.turn ? total * 0.06 : 0));
      }
    };
    walk(0, [], 0);
    if (best.length > 0) return best;
  }
  return [];
}

/** Units back into renderable pieces: consecutive items of one list become one list starting at its first item's number. */
function pieces(run: Unit[]): TextPiece[] {
  const out: TextPiece[] = [];
  let owner: number | null = null;
  for (const unit of run) {
    const last = out.at(-1);
    if (unit.list && last && "list" in last && owner === unit.list.owner) last.items.push(unit.node);
    else if (unit.list) {
      out.push({ list: unit.list.tag, start: unit.list.index + 1, items: [unit.node] });
      owner = unit.list.owner;
    } else {
      out.push({ node: unit.node });
      owner = null;
    }
  }
  return out;
}
