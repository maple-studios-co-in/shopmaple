import { HomePage, homeArtworkProducts } from "@/components/home-page";
import { getProductPhotos } from "@/lib/product-photos";
import { getPublishedContent } from "@/lib/content";
import { readInstagramFeed } from "@/lib/instagram-feed";

export const dynamic = "force-dynamic";
export const metadata = { alternates: { canonical: "/" } };

export default async function Home() {
  // The Instagram feed is read alongside the content; its posts replace the staff-edited ones when there are any.
  const [content, feed] = await Promise.all([getPublishedContent(), readInstagramFeed()]);
  // Keeri product photos stand in for the artwork staff have not uploaded (components/hero.tsx).
  const photos = await getProductPhotos(homeArtworkProducts(content));
  // Expanded in place so the route's server/client prop boundary is unchanged.
  return HomePage({ content: feed.length ? { ...content, instagramPosts: feed } : content, photos });
}
