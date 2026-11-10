import { storyChapterKeys, storySectionKeys, type StoryPageContent } from "@shopmaple/contracts";
import story from "@/data/landing-story.json";

const belief = story.sections.find(section => section.key === "media_with_content_be4kK3")!;
const timeline = story.sections.find(section => section.key === "1777584986bee6da6f")!.custom[0] as Record<string, string | number | boolean>;

/** A story page with every field present: what the page and the editor work from. */
export type ResolvedStoryPage = { [K in keyof StoryPageContent]-?: NonNullable<StoryPageContent[K]> };

/** The original template's rendered copy and line breaks; the source snapshot remains unchanged. */
export const legacyStoryPage: StoryPageContent = {
  title: "Our Story",
  heroHeading: ["MADE DIFFERENT,", "BY DESIGN"],
  tagline: "Furniture tailored to your narrative.",
  beliefEyebrow: belief.texts[0]!,
  beliefHeading: ["Maple doesn't believe in loud luxury.", "It believes in presence"],
  beliefBody: belief.texts[2]!,
  filmHeading: ["It's", "what", "stays"],
  journeyHeading: "The Maple Journey",
  sections: [{ key: "hero", enabled: true }, { key: "belief-film", enabled: true }, { key: "journey", enabled: true }, { key: "cities", enabled: true }],
  timeline: storyChapterKeys.map((key, index) => ({
    key,
    date: String(timeline[`item_${index + 1}_date`]),
    title: String(timeline[`item_${index + 1}_title`]),
    body: String(timeline[`item_${index + 1}_description`]),
  })),
};

/** The owner's redesign (Figma 293:1093, slider 293:1434; 10 Nov 2026). A blank line in a body starts a paragraph. */
export const defaultStoryPage: ResolvedStoryPage = {
  title: "Our Story",
  heroEyebrow: "Our Story / Made in Delhi",
  heroHeading: ["Made different,", "by design."],
  tagline: "Furniture tailored to your narrative.",
  heroBody: "A family pursuit. A Delhi workshop. A belief that good furniture should feel as strong as it looks.",
  heroCta: "Explore the Maple journey",
  principles: [
    { key: "handmade", title: "Handmade", body: "Crafted in-house, with care." },
    { key: "unique-designs", title: "Unique designs", body: "Considered for everyday living." },
    { key: "bespoke-pieces", title: "Bespoke pieces", body: "Your space. Your finish. Your way." },
  ],
  beliefEyebrow: "Our Belief",
  beliefHeading: ["Luxury is not loud.", "It is what stays."],
  beliefBody: "The weight of a table that does not wobble after five years. The way a well-upholstered chair holds its shape through an Indian summer. The quiet satisfaction of sitting in something built for your specific room.\n\nMaple began as a family pursuit to build something that lasts. The workshop in Delhi is still where everything happens, and every piece we ship carries the same brief it started with: build it right.",
  filmHeading: legacyStoryPage.filmHeading,
  journeyEyebrow: "The Maple Journey",
  journeyHeading: "Built over time. Made for yours.",
  sections: storySectionKeys.map(key => ({ key, enabled: true })),
  timeline: [
    { key: "chapter-1", date: "2015", title: "The craft begins.", body: "Our journey began in 2015, working under another brand name with a small workshop, a hands-on team, and a simple belief: good furniture should feel as strong as it looks.\n\nStarted by Pradeep Agrawal, the foundation came from a family business built around furniture, materials, and everyday customer needs." },
    { key: "chapter-2", date: "2015–2022", title: "Learning from\nIndian homes.", body: "Our core focus was sofas for homeowners. This phase taught us what Indian homes truly need: comfort, durability, practical design, and furniture that can survive everyday use.\n\nIt also revealed a gap: premium furniture that felt personal, well-made, and dependable." },
    { key: "chapter-3", date: "2023", title: "Maple Furnishers\nis formed.", body: "In 2023, Maple Furnishers was formally established as a legal entity.\n\nWe took our manufacturing vision forward with a clearer identity, stronger systems, and a deeper commitment to premium furniture made in-house." },
    { key: "chapter-4", date: "2024", title: "Customization becomes\nour identity.", body: "By 2024, customization became the heart of Maple. From sofas and beds to dining, chairs and tables, we began building around each customer’s space, taste, comfort and lifestyle.\n\nWe also moved into a bigger workshop to support better production, quality control and refined execution." },
    { key: "chapter-5", date: "2026", title: "The online shift.", body: "In 2026, Maple began expanding its digital presence through its website and social media.\n\nA new chapter in making our work accessible and reaching homeowners, interior designers, architects and furniture buyers beyond our immediate network." },
    { key: "chapter-6", date: "Today", title: "Quiet luxury,\nbuilt in-house.", body: "Today, Maple stands for premium custom furniture, customer-centric execution and quiet luxury.\n\nLuxury should be felt in the finish, comfort, proportions and the way a piece continues to serve a home for years." },
    { key: "chapter-7", date: "Tomorrow", title: "Built for homes\nacross India.", body: "Our vision is to expand delivery across India while staying true to what built Maple: honest craftsmanship, thoughtful customization, premium work and furniture made with real care." },
  ],
  invitationHeading: "Your story deserves its own furniture.",
  invitationBody: "Bring us your space, your materials and the way you want to live.",
  invitationCta: "Start a conversation",
};

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const retiredCopy = ["title", "heroHeading", "tagline", "beliefEyebrow", "beliefHeading", "beliefBody", "journeyHeading"] as const;

/**
 * The page as it renders. Copy a revision still holds word for word from the original template reads as the redesign
 * does (the live store had published that copy unchanged); anything staff wrote stays. The principles band and the
 * invitation join an older list of sections, after the hero and at the end.
 */
export function resolveStoryPageContent(value?: StoryPageContent): ResolvedStoryPage {
  if (!value) return structuredClone(defaultStoryPage);
  const page: ResolvedStoryPage = { ...structuredClone(defaultStoryPage), ...structuredClone(value) };
  for (const key of retiredCopy) if (same(value[key], legacyStoryPage[key])) Object.assign(page, { [key]: structuredClone(defaultStoryPage[key]) });
  page.timeline = page.timeline.map(chapter => {
    const was = legacyStoryPage.timeline.find(item => item.key === chapter.key)!;
    const now = defaultStoryPage.timeline.find(item => item.key === chapter.key)!;
    return {
      key: chapter.key,
      date: chapter.date === was.date ? now.date : chapter.date,
      title: chapter.title === was.title ? now.title : chapter.title,
      body: chapter.body === was.body ? now.body : chapter.body,
    };
  });
  if (!page.sections.some(item => item.key === "principles"))
    page.sections.splice(page.sections.findIndex(item => item.key === "hero") + 1, 0, { key: "principles", enabled: true });
  if (!page.sections.some(item => item.key === "invitation")) page.sections.push({ key: "invitation", enabled: true });
  return page;
}
