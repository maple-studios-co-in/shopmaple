import { HomePage, homeArtworkProducts } from "@/components/home-page";
import { StoryLanding, storyArtworkProducts } from "@/components/category-story";
import type { StorefrontDocument } from "@/lib/content";
import { getProductPhotos } from "@/lib/product-photos";

/**
 * The pages whose artwork can stand in from Keeri product photos (owner, 11 Nov 2026): each reads the photos its
 * un-uploaded placements need, then renders as before. Used by the routes and by staff previews alike.
 */
export async function HomeWithArtwork({ content }: { content: StorefrontDocument }) {
  const photos = await getProductPhotos(homeArtworkProducts(content));
  return HomePage({ content, photos });
}

export async function StoryWithArtwork({ content }: { content: StorefrontDocument }) {
  const photos = await getProductPhotos(storyArtworkProducts(content.storyPage, content.templateMedia));
  return <StoryLanding content={content.storyPage} media={content.templateMedia} photos={photos} />;
}
