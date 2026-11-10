import { bulkSectionKeys, legacyBulkSectionKeys, type BulkPageContent } from "@shopmaple/contracts";

type Trust = BulkPageContent["trust"];
type BulkPromise = Trust["items"][number];
/** A bulk page with every field present: what the page and the editor work from. */
export type ResolvedBulkPage = Omit<{ [K in keyof BulkPageContent]-?: NonNullable<BulkPageContent[K]> }, "trust" | "cities"> & {
  trust: Required<Omit<Trust, "items">> & { items: Required<BulkPromise>[] };
  cities: Required<BulkPageContent["cities"]>;
};

/** The original template's rendered copy, which the live store still published on 10 Nov 2026. */
export const legacyBulkPage: BulkPageContent = {
  title: "Bulk Enquiry",
  eyebrow: "Place Your Bulk Orders",
  heading: "Home Interior",
  subtitle: "Work 1:1 with expert interior designers",
  sections: legacyBulkSectionKeys.map(key => ({ key, enabled: true })),
  cities: { eyebrow: "We Are Serving", heading: "20+ Cities" },
  trust: {
    heading: "Trusted By Designers, Businesses & Modern Spaces",
    metricValue: "100+",
    metricLabel: "Projects Delivered",
    items: [
      { key: "price", title: "Price match guarantee" },
      { key: "quality", title: "250+ Steps Quality Check" },
      { key: "materials", title: "Premium Materials" },
      { key: "custom", title: "Custom Solutions" },
    ],
  },
  process: {
    eyebrow: "Here’s How We Bring Your Dream Space to Life",
    heading: "How it Works",
    steps: [
      { key: "meet", title: "Meet Your Designer", body: "Bring your ideas, inspirations, and budget. Our expert designer will understand your needs and start shaping a plan that fits your lifestyle." },
      { key: "design", title: "Finalize Your Design", body: "Work one-on-one with your designer to refine the details. Get realistic 3D renders so you can visualize your space before it comes to life." },
      { key: "deliver", title: "Bring It Home", body: "Relax while we handle the rest — from crafting to installation. Shop directly from your design and watch your dream home come alive." },
    ],
  },
  business: {
    badge: "★ TRUSTED BY BUSINESSES",
    heading: "Looking for Bulk Orders?",
    body: "Source directly from one of India's trusted furnishing suppliers. Hotels, Interior Designers, Contractors, Offices, Retailers & Project Buyers can place large-volume requirements through our IndiaMART business channel.",
    features: ["Factory & Wholesale Pricing", "Bulk Quantity Support", "Custom Sizes & Specifications", "Dedicated Business Assistance", "PAN India Delivery"],
    cta: "Request Bulk Quote",
    trust: "Secure • Verified • Trusted by Businesses",
  },
};

/** What a promise says under its title, for promises staff kept from the original template. */
const promiseBodies: Record<BulkPromise["key"], string> = {
  custom: "Sizes, finishes and materials tailored to the project.",
  materials: "Thoughtful selections for the look, feel and use of your space.",
  quality: "A considered process, from production through finishing.",
  delivery: "Coordinate your project requirements with our team.",
  price: "Factory pricing for project quantities.",
};

/** The owner's redesign (Figma 298:924, 10 Nov 2026). A line break in a heading or subtitle is kept on wide screens. */
export const defaultBulkPage: ResolvedBulkPage = {
  title: "Bulk Enquiry",
  eyebrow: "Maple / Projects & partnerships",
  heading: "Spaces with purpose.\nFurniture with presence.",
  subtitle: "Considered furniture, crafted around your vision.\nFor residences, hospitality and spaces of business.",
  heroCta: "Request a proposal",
  heroNote: "Designers / Hospitality / Workspaces / Homes",
  sections: bulkSectionKeys.map(key => ({ key, enabled: true })),
  figures: [
    { key: "checks", value: "250+", label: "Quality-check steps" },
    { key: "cities", value: "20+", label: "Cities served" },
    { key: "workshop", value: "In-house", label: "Crafted in Delhi" },
  ],
  trust: {
    eyebrow: "The Maple advantage",
    heading: "Your brief. Our craft.",
    body: "From a statement piece to a complete project, the details stay personal.",
    metricValue: "100+",
    metricLabel: "Projects delivered",
    items: (["custom", "materials", "quality", "delivery"] as const).map(key => ({
      key,
      title: { custom: "Custom specifications", materials: "Premium materials", quality: "Quality at every step", delivery: "Delivery across India" }[key],
      body: promiseBodies[key],
    })),
  },
  process: {
    eyebrow: "From first idea to finished space",
    heading: "A clear path from brief to delivery.",
    steps: [
      { key: "meet", title: "Meet your designer", body: "Share your ideas, inspiration and budget. We’ll shape the requirements around your space." },
      { key: "design", title: "Refine every detail", body: "Work one-to-one on materials, finishes and design. Visualize the space with 3D renders." },
      { key: "deliver", title: "Bring it home", body: "Move from approved designs into crafting, delivery and installation." },
    ],
  },
  proposal: {
    eyebrow: "Let’s build something lasting",
    heading: "Your vision,\nin the making.",
    body: "Share what you know now. Our team can help work through the details with you.",
    contactHeading: "Prefer a conversation?",
    formHeading: "Request a project proposal",
    note: "We’ll use these details to discuss your project and proposal.",
    cta: "Request proposal",
    referencesTitle: "Add plans, moodboards or references",
    referencesNote: "Optional — share files with your project brief",
  },
  business: {
    badge: "For large-volume requirements",
    heading: "Source directly.\nBuild with confidence.",
    body: "Hotels, interior designers, contractors, offices, retailers and project buyers can also connect through our IndiaMART business channel.",
    features: ["Factory & wholesale pricing", "Bulk quantity support", "Custom sizes & specifications", "Dedicated business assistance"],
    cta: "Request bulk quote",
    trust: legacyBulkPage.business.trust,
  },
  cities: {
    eyebrow: "From Delhi, across India",
    heading: "20+ cities. One dedicated team.",
    body: "Delhi · Mumbai · Bengaluru · Hyderabad · Kolkata · Chennai · Jaipur · and more",
  },
};

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/** The redesign's words where a revision still holds the original template's word for word; staff's own words stay. */
const kept = <T,>(value: T, legacy: T, redesign: T): T => structuredClone(same(value, legacy) ? redesign : value);
const promiseWords = (items: readonly BulkPromise[]) => items.map(item => [item.key, item.title, item.body ?? null]);

/**
 * The page as it renders. The live store had published the original template's copy unchanged, so that copy reads as the
 * redesign does. The figures band and the proposal form join an older list of regions after the opening and the process,
 * shown or hidden as the regions they grew from were: the trust promises held the projects count, the opening the form.
 */
export function resolveBulkPage(value?: BulkPageContent): ResolvedBulkPage {
  if (!value) return structuredClone(defaultBulkPage);
  const was = legacyBulkPage, now = defaultBulkPage;
  const sections = structuredClone(value.sections);
  for (const [added, anchor, source] of [["figures", "hero", "trust"], ["proposal", "process", "hero"]] as const) {
    if (sections.some(section => section.key === added)) continue;
    const enabled = sections.find(section => section.key === source)?.enabled ?? true;
    sections.splice(sections.findIndex(section => section.key === anchor) + 1, 0, { key: added, enabled });
  }
  return {
    title: value.title,
    eyebrow: kept(value.eyebrow, was.eyebrow, now.eyebrow),
    heading: kept(value.heading, was.heading, now.heading),
    subtitle: kept(value.subtitle, was.subtitle, now.subtitle),
    heroCta: value.heroCta ?? now.heroCta,
    heroNote: value.heroNote ?? now.heroNote,
    sections,
    figures: structuredClone(value.figures ?? now.figures),
    trust: {
      eyebrow: value.trust.eyebrow ?? now.trust.eyebrow,
      heading: kept(value.trust.heading, was.trust.heading, now.trust.heading),
      body: value.trust.body ?? now.trust.body,
      metricValue: value.trust.metricValue,
      metricLabel: kept(value.trust.metricLabel, was.trust.metricLabel, now.trust.metricLabel),
      items: same(promiseWords(value.trust.items), promiseWords(was.trust.items)) ? structuredClone(now.trust.items)
        : value.trust.items.map(item => ({ key: item.key, title: item.title, body: item.body ?? promiseBodies[item.key] })),
    },
    process: {
      eyebrow: kept(value.process.eyebrow, was.process.eyebrow, now.process.eyebrow),
      heading: kept(value.process.heading, was.process.heading, now.process.heading),
      steps: value.process.steps.map(step => {
        const before = was.process.steps.find(item => item.key === step.key)!, after = now.process.steps.find(item => item.key === step.key)!;
        return { key: step.key, title: kept(step.title, before.title, after.title), body: kept(step.body, before.body, after.body) };
      }),
    },
    proposal: structuredClone(value.proposal ?? now.proposal),
    business: {
      badge: kept(value.business.badge, was.business.badge, now.business.badge),
      heading: kept(value.business.heading, was.business.heading, now.business.heading),
      body: kept(value.business.body, was.business.body, now.business.body),
      features: kept(value.business.features, was.business.features, now.business.features),
      cta: kept(value.business.cta, was.business.cta, now.business.cta),
      trust: value.business.trust,
    },
    cities: {
      eyebrow: kept(value.cities.eyebrow, was.cities.eyebrow, now.cities.eyebrow),
      heading: kept(value.cities.heading, was.cities.heading, now.cities.heading),
      body: value.cities.body ?? now.cities.body,
    },
  };
}
