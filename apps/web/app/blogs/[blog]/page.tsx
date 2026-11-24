import { notFound } from "next/navigation";
import { BlogIndex } from "@/components/blog-index";
import { getPublishedContent } from "@/lib/content";
import { resolveEditorialContent } from "@/lib/editorial-content-defaults";
import { resolveHomeMerchandising } from "@/lib/home-merchandising-defaults";
import { pageDescription } from "@/lib/seo";
/** Every blog on the site: the imported ones staff kept and the ones staff added (owner, 24 Nov 2026). */
export async function generateMetadata({
  params,
}: {
  params: Promise<{
    blog: string;
  }>;
}) {
  const { blog } = await params;
  const content = await getPublishedContent();
  const { blogs } = resolveEditorialContent(content.editorialContent, content.authoredArticles, content.templateMedia);
  const record = blogs.find((item) => item.handle === blog);
  return {
    title: record?.title || "Blogs",
    ...(record?.description ? { description: pageDescription(record.description) } : {}),
    ...(record ? { alternates: { canonical: `/blogs/${blog}` } } : {}),
  };
}
export default async function BlogPage({
  params,
}: {
  params: Promise<{
    blog: string;
  }>;
}) {
  const { blog } = await params;
  const content = await getPublishedContent();
  const { blogs } = resolveEditorialContent(content.editorialContent, content.authoredArticles, content.templateMedia);
  const record = blogs.find((item) => item.handle === blog);
  if (!record) notFound();
  // Shop Bestsellers under the stories shows the homepage's bestsellers, as staff pick them.
  return <BlogIndex blog={blog} title={record.title} articles={record.articles} bestsellers={resolveHomeMerchandising(content.homeMerchandising).bestsellers} media={content.templateMedia} />;
}
