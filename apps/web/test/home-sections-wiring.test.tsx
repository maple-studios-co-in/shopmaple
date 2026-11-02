import assert from "node:assert/strict";
import test from "node:test";
import { storefrontContentSchema } from "@shopmaple/contracts";
import { defaultStorefrontContent } from "../lib/content-defaults";
import { defaultHomeDetails, resolveHomeDetails } from "../lib/home-details-defaults";

// "Pull up a chair" and "Find your feel" were added after the first published documents. A document
// without them keeps its sections and shows nothing new; a draft that adds them starts from these words.
test("the editorial and compare sections start from the Impact Layout's words", () => {
  assert.deepEqual(defaultHomeDetails.editorial, {
    title: "Pull up a chair", text: "There's always something worth staying for.", cta: "Shop Dining", href: "/collections/dinings",
    leftImage: "/media/home/editorial-left.webp", leftAlt: "A marble dining table on a fluted pedestal beside a tall window",
    rightImage: "/media/home/editorial-right.webp", rightAlt: "A woman pouring coffee at a dining table with sunflowers, cream upholstered chairs and a pug",
  });
  assert.deepEqual(defaultHomeDetails.compare, {
    eyebrow: "Find your feel", heading: "Two ways to unwind",
    lede: "Explore distinct silhouettes and choose the one that feels at home in your space.",
    left: { handle: "aera-swivel-lounge-chair", label: "Aera" }, right: { handle: "caro", label: "Caro" },
  });
  assert.equal(storefrontContentSchema.safeParse(defaultStorefrontContent).success, true, "and the default draft is a valid document");
});

test("details published earlier gain the new sections' defaults without losing their own copy", () => {
  const { editorial, compare, ...older } = structuredClone(defaultHomeDetails);
  older.hero.cta = "See everything";
  const resolved = resolveHomeDetails(older);
  assert.equal(resolved.hero.cta, "See everything");
  assert.deepEqual(resolved.editorial, editorial);
  assert.deepEqual(resolved.compare, compare);
  const edited = structuredClone(defaultHomeDetails);
  edited.compare = { ...edited.compare!, heading: "Pick a side" };
  assert.equal(resolveHomeDetails(edited).compare.heading, "Pick a side");
  assert.deepEqual(resolveHomeDetails(undefined), defaultHomeDetails);
});
