import type { MetadataRoute } from "next";
import { robotsRules, seoSettings } from "@/lib/seo";

// Read at request time, so turning SEO_INDEXING on needs a restart, not a rebuild.
export const dynamic = "force-dynamic";
export default function robots(): MetadataRoute.Robots {
  return robotsRules(seoSettings(process.env));
}
