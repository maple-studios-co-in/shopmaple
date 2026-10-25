import Link from "next/link";
import { ContactForm } from "@/components/contact-form";
import { getPublishedContent } from "@/lib/content";
import { resolveServicePages } from "@/lib/service-page-defaults";
export async function generateMetadata() {
  return { title: resolveServicePages((await getPublishedContent()).servicePages).returns.title };
}
export default async function ReturnsPage() {
  const content = resolveServicePages((await getPublishedContent()).servicePages).returns;
  return (
    <section className="editorial-page">
      <h1>{content.heading}</h1>
      <p>
        <Link href="/policies/refund-policy">
          {content.policyLabel}
        </Link>
      </p>
      <p>
        {content.intro}{" "}This form saves an enquiry; it does
        not automatically approve a return or issue a refund.
      </p>
      <ContactForm
        context={{
          product: "Return & Exchange",
          variant: "",
          sku: "",
          pincode: "",
        }}
      />
    </section>
  );
}
