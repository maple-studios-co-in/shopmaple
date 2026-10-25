import { storyChapterKeys, storySectionKeys, type StoryPageContent } from "@shopmaple/contracts";
import story from "@/data/landing-story.json";

const belief = story.sections.find(section => section.key === "media_with_content_be4kK3")!;
const timeline = story.sections.find(section => section.key === "1777584986bee6da6f")!.custom[0] as Record<string, string | number | boolean>;

/** Original rendered copy and line breaks; the source snapshot remains unchanged. */
export const defaultStoryPage: StoryPageContent = {
  title: "Our Story",
  heroHeading: ["MADE DIFFERENT,", "BY DESIGN"],
  tagline: "Furniture tailored to your narrative.",
  beliefEyebrow: belief.texts[0]!,
  beliefHeading: ["Maple doesn't believe in loud luxury.", "It believes in presence"],
  beliefBody: belief.texts[2]!,
  filmHeading: ["It's", "what", "stays"],
  journeyHeading: "The Maple Journey",
  sections: storySectionKeys.map(key => ({ key, enabled: true })),
  timeline: storyChapterKeys.map((key, index) => ({
    key,
    date: String(timeline[`item_${index + 1}_date`]),
    title: String(timeline[`item_${index + 1}_title`]),
    body: String(timeline[`item_${index + 1}_description`]),
  })),
};

export function resolveStoryPageContent(value?: StoryPageContent): StoryPageContent {
  return structuredClone(value ?? defaultStoryPage);
}
