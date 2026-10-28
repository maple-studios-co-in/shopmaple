import { HomePage } from "@/components/storefront/home-page";
import { getPublishedContent } from "@/lib/content";

export const dynamic = "force-dynamic";

export default async function Home() {
  // Render the shared page directly so the route returns the same element tree as before.
  return HomePage({ content: await getPublishedContent() });
}
