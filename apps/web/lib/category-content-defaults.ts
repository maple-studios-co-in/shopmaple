import {
  categoryPageSlugs,
  categoryPageSectionKeys,
  categoryTileKeys,
  categoryValueKeys,
  type CategoryPageContent,
  type CategoryPageSlug,
  type CategorySectionKey,
} from "@shopmaple/contracts";
import categories from "@/data/landing-categories.json";

export type LandingSection = {
  key: CategorySectionKey;
  type: string;
  columns?: number;
  width?: number;
  height?: number;
  desktop?: string;
  mobile?: string;
  items?: {
    key: string;
    href?: string;
    title: string;
    image: string;
    body?: string;
  }[];
  heading?: string;
  eyebrow?: string;
  handles?: string[];
  collection?: string;
  viewAll?: boolean;
};

function sourceSections(slug: CategoryPageSlug): LandingSection[] {
  return categories[slug].sections.map((section, index) => {
    const source = section as Omit<LandingSection, "key">;
    const itemKeys =
      source.type === "categories"
        ? categoryTileKeys[slug]
        : categoryValueKeys[slug];
    return {
      ...source,
      key: categoryPageSectionKeys[slug][index]!,
      ...(source.items && {
        items: source.items.map((item, itemIndex) => ({
          ...item,
          key: itemKeys[itemIndex]!,
        })),
      }),
    };
  });
}

export const defaultCategoryPages: CategoryPageContent[] =
  categoryPageSlugs.map((slug) => ({
    slug,
    title: categories[slug].title,
    introduction: categories[slug].description,
    sections: sourceSections(slug).map((section) => ({
      key: section.key,
      enabled: true,
      ...(section.heading !== undefined && { heading: section.heading }),
      ...(section.eyebrow !== undefined && { eyebrow: section.eyebrow }),
      ...(section.items && {
        items: section.items.map((item) => ({
          key: item.key,
          title: item.title,
          ...(item.body !== undefined && { body: item.body }),
        })),
      }),
    })),
  }));

/** Omitted sections/items retain original defaults; explicit order applies only to sections. */
export function resolveCategoryPageContent(
  slug: CategoryPageSlug,
  overrides: CategoryPageContent[] = [],
): CategoryPageContent {
  const defaults = defaultCategoryPages.find((page) => page.slug === slug)!;
  const override = overrides.find((page) => page.slug === slug);
  if (!override) return structuredClone(defaults);
  const orderedKeys = [
    ...override.sections.map((section) => section.key),
    ...defaults.sections
      .map((section) => section.key)
      .filter(
        (key) => !override.sections.some((section) => section.key === key),
      ),
  ];
  return {
    slug,
    title: override.title,
    introduction: override.introduction,
    sections: orderedKeys.map((key) => {
      const original = defaults.sections.find(
        (section) => section.key === key,
      )!;
      const edited = override.sections.find((section) => section.key === key);
      return {
        ...original,
        ...edited,
        ...(original.items && {
          items: original.items.map((item) => ({
            ...item,
            ...edited?.items?.find((update) => update.key === item.key),
          })),
        }),
      };
    }),
  };
}

export function resolveCategoryPage(
  slug: CategoryPageSlug,
  overrides: CategoryPageContent[] = [],
) {
  const content = resolveCategoryPageContent(slug, overrides);
  const sources = sourceSections(slug);
  return {
    title: content.title,
    description: content.introduction,
    sections: content.sections
      .filter((section) => section.enabled)
      .map((section) => {
        const source = sources.find((item) => item.key === section.key)!;
        return {
          ...source,
          ...(section.heading !== undefined && { heading: section.heading }),
          ...(section.eyebrow !== undefined && { eyebrow: section.eyebrow }),
          ...(source.items && {
            items: source.items.map((item) => ({
              ...item,
              ...section.items?.find((update) => update.key === item.key),
            })),
          }),
        };
      }),
  };
}
