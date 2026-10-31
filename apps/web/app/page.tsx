import { HomePage } from "@/components/home-page";
import { getPublishedContent } from "@/lib/content";

export const dynamic = "force-dynamic";
export const metadata = { alternates: { canonical: "/" } };

export default async function Home() {
  // Expanded in place so the route's server/client prop boundary is unchanged.
  return HomePage({ content: await getPublishedContent() });
}
