import { z } from "zod";

export const categoryPageSlugs = ["sofas", "tables", "chairs"] as const;
export type CategoryPageSlug = (typeof categoryPageSlugs)[number];
export const categorySectionKeys = [
  "hero",
  "categories",
  "sale",
  "bestsellers",
  "outdoor-banner",
  "primary-products",
  "bedroom-banner",
  "bedroom-products",
  "living-banner",
  "living-products",
  "dining-banner",
  "consoles",
  "difference-divider",
  "difference-heading",
  "values",
  "paired-divider",
  "paired-products",
] as const;
export type CategorySectionKey = (typeof categorySectionKeys)[number];

// These identities describe the preserved source sections, never their edited order.
export const categoryPageSectionKeys: Record<
  CategoryPageSlug,
  readonly CategorySectionKey[]
> = {
  sofas: categorySectionKeys.filter(
    (key) => key !== "dining-banner" && key !== "consoles",
  ),
  tables: categorySectionKeys,
  chairs: categorySectionKeys.filter(
    (key) => key !== "dining-banner" && key !== "consoles",
  ),
};
export const categoryTileKeys: Record<CategoryPageSlug, readonly string[]> = {
  sofas: [
    "sofa-set-designs",
    "wooden-sofas",
    "sofa-cum-beds",
    "recliners",
    "l-shape-sofa",
    "fabric-sofas",
    "chesterfield-sofas",
    "3-seater-sofas",
    "2-seater-sofas",
    "bedroom-sofa",
  ],
  tables: [
    "side-table",
    "dinings",
    "bar",
    "consoles",
    "sofa-table",
    "tv-media-units",
  ],
  chairs: [
    "accent-chair",
    "bedroom-chair",
    "dining-chair",
    "iconic-bar-chair",
    "lounge-wing-chair",
    "rocking-chair",
  ],
};
export const categoryValueKeys: Record<CategoryPageSlug, readonly string[]> = {
  sofas: ["grain", "edge", "fabric", "polish"],
  tables: [
    "quiet-luxury",
    "built-for-real-living",
    "ages-beautifully",
    "strength",
  ],
  chairs: [
    "quiet-luxury",
    "built-for-real-living",
    "ages-beautifully",
    "strength",
  ],
};
const text = (max: number) =>
  z
    .string()
    .max(max)
    .refine(
      (value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value),
      "Control characters are not content",
    );
const headingSections = new Set<CategorySectionKey>([
  "bestsellers",
  "primary-products",
  "bedroom-products",
  "living-products",
  "consoles",
  "difference-heading",
  "paired-products",
]);
export const categoryPageContentSchema = z
  .object({
    slug: z.enum(categoryPageSlugs),
    title: text(160).min(1),
    introduction: text(8000),
    sections: z
      .array(
        z
          .object({
            key: z.enum(categorySectionKeys),
            enabled: z.boolean(),
            heading: text(160).optional(),
            eyebrow: text(160).optional(),
            items: z
              .array(
                z
                  .object({
                    key: z
                      .string()
                      .max(80)
                      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
                    title: text(160).min(1),
                    body: text(600).optional(),
                  })
                  .strict(),
              )
              .max(10)
              .optional(),
          })
          .strict(),
      )
      .max(17),
  })
  .strict()
  .superRefine((page, ctx) => {
    const seen = new Set<string>();
    page.sections.forEach((section, index) => {
      const issue = (message: string) =>
        ctx.addIssue({ code: "custom", path: ["sections", index], message });
      if (!categoryPageSectionKeys[page.slug].includes(section.key))
        issue("Section does not belong to this category page");
      if (seen.has(section.key)) issue("Section identities must be unique");
      seen.add(section.key);
      if (section.heading !== undefined && !headingSections.has(section.key))
        issue("This section has no editable heading");
      if (section.eyebrow !== undefined && section.key !== "difference-heading")
        issue("This section has no editable eyebrow");
      if (section.items !== undefined) {
        const validKeys =
          section.key === "categories"
            ? categoryTileKeys[page.slug]
            : section.key === "values"
              ? categoryValueKeys[page.slug]
              : [];
        if (section.key !== "categories" && section.key !== "values")
          issue("This section has no editable items");
        const items = new Set<string>();
        for (const item of section.items) {
          if (!validKeys.includes(item.key))
            issue("Item does not belong to this section");
          if (items.has(item.key)) issue("Item identities must be unique");
          items.add(item.key);
          if (item.body !== undefined && section.key !== "values")
            issue("Category tiles have no editable body");
        }
      }
    });
  });
export type CategoryPageContent = z.infer<typeof categoryPageContentSchema>;
export type CategorySectionContent = CategoryPageContent["sections"][number];
