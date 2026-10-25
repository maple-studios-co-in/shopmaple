import { nimbusSectionKeys, type NimbusPageContent } from "@shopmaple/contracts";
import nimbus from "@/data/landing-nimbus.json";

const section = (key: string) => nimbus.sections.find(item => item.key === key)!;
const intro = section("section_E3gzag");
const origin = section("media_with_content_JLVGCA");
const principles = section("section_aGJjhK");
const series = section("section_BBYid8");
const project = section("section_PYMfcR");
const promises = section("section_hrKc6w");

/** Original rendered copy; the source snapshot and fixed media remain unchanged. */
export const defaultNimbusPage: NimbusPageContent = {
  title: "The Nimbus Collection",
  sections: nimbusSectionKeys.map(key => ({ key, enabled: true })),
  intro: { heading: intro.texts[0]!, body: intro.texts[1]! },
  roomTiles: [
    { key: "bedroom", title: "Bedroom" },
    { key: "living", title: "Living Room" },
    { key: "dining", title: "Dining Room" },
  ],
  origin: { eyebrow: origin.texts[0]!, heading: origin.texts[1]!, body: origin.texts[2]!.replace("cloud.Nimbus", "cloud.\n\nNimbus") },
  principles: {
    heading: "THE NIMBUS PRINCIPLES",
    items: (["comfort", "silhouettes", "luxury", "spaces"] as const).map((key, index) => ({
      key, title: principles.texts[index * 2]!, body: principles.texts[index * 2 + 1]!,
    })),
  },
  roomSlides: [
    { key: "living", label: "Living room" },
    { key: "bedroom", label: "Bedroom" },
    { key: "dining", label: "Dining room" },
  ],
  series: { eyebrow: series.texts[0]!, heading: series.texts[1]! },
  project: { heading: project.texts[0]!, body: project.texts[1]! },
  promises: (["custom", "delivery", "craft", "warranty"] as const).map((key, index) => ({ key, title: promises.texts[index]! })),
};

export function resolveNimbusPageContent(value?: NimbusPageContent): NimbusPageContent {
  return structuredClone(value ?? defaultNimbusPage);
}
