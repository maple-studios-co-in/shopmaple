import { resolveServicePages } from "@/lib/service-page-defaults";
import { notFound } from "next/navigation";
import { getPublishedContent } from "@/lib/content";
import { ContentPage } from "@/components/content-page";
import { BulkEnquiry, Contact } from "@/components/service-pages";
export async function generateMetadata({
  params,
}: {
  params: Promise<{
    slug: string;
  }>;
}) {
  const { slug } = await params;
  if (!["contact", "bulk-enquiry"].includes(slug)) {
    const page = (await getPublishedContent()).pages.find(
      (page) => page.slug === slug,
    );
    return {
      title: page?.title ?? "Page not found",
      description: page?.description,
      ...(page ? { alternates: { canonical: `/pages/${slug}` } } : {}),
    };
  }
  const content = resolveServicePages((await getPublishedContent()).servicePages);
  return { title: slug === "bulk-enquiry" ? content.bulk.title : content.contact.title, alternates: { canonical: `/pages/${slug}` } };
}
export default async function ContactPage({
  params,
  searchParams,
}: {
  params: Promise<{
    slug: string;
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  if (!["contact", "bulk-enquiry"].includes(slug)) {
    const page = (await getPublishedContent()).pages.find(
      (page) => page.slug === slug,
    );
    if (!page) notFound();
    return <ContentPage page={page} />;
  }
  const query = await searchParams;
  const text = (name: string, limit: number) =>
    typeof query[name] === "string" ? query[name].slice(0, limit) : "";
  const context = {
    product: text("product", 500),
    variant: text("variant", 300),
    sku: text("sku", 160),
    pincode:
      /^[1-9][0-9]{5}$/.test(text("pincode", 6)) &&
      typeof query.pincode === "string" &&
      query.pincode.length === 6
        ? query.pincode
        : "",
  };
  const content = resolveServicePages((await getPublishedContent()).servicePages);
  return slug === "bulk-enquiry" ? (
    <BulkEnquiry context={context} content={content.bulk} />
  ) : (
    <Contact context={context} content={content.contact} />
  );
}
