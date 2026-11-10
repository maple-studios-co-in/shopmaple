import { ContentImage } from "@/components/content-image";
import type { BlogImage } from "@/lib/blog";

/** A story's picture at its reserved size: Shopify's artwork comes resized from Shopify's edge; only the first loads at once. */
export function StoryPicture({ image, sizes, eager = false, alt = image.alt }: { image: BlogImage; sizes: string; eager?: boolean; alt?: string }) {
  return (
    <ContentImage src={image.src} alt={alt} width={image.width} height={image.height} sizes={sizes}
      loading={eager ? "eager" : "lazy"} {...(eager ? { fetchPriority: "high" as const } : {})} />
  );
}
