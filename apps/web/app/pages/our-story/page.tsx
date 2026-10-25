import { StoryLanding } from "@/components/category-story";
import { getPublishedContent } from "@/lib/content";
import { resolveStoryPageContent } from "@/lib/story-content-defaults";
export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const content = resolveStoryPageContent((await getPublishedContent()).storyPage);
  return { title: content.title };
}
export default async function Page() {
  return <StoryLanding content={(await getPublishedContent()).storyPage} />;
}
