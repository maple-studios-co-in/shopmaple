import { ContentPage } from "@/components/content-page";
import type { resolveEditorialContent } from "@/lib/editorial-content-defaults";

type Policy = ReturnType<typeof resolveEditorialContent>["policies"][string];

/** A policy is shown as a page built in the page editor: its title, then its rich text. */
export function PolicyArticle({ policy, slug }: { policy: Policy; slug: string }) {
  return <ContentPage page={{ slug, title: policy.title, description: "", body: "", content: policy.content, banner: null }} />;
}
