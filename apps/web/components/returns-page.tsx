import Link from "next/link";
import type { ServicePagesContent } from "@shopmaple/contracts";
import { ContactForm } from "@/components/contact-form";
/** The Return & Exchange page from resolved service page content. */
export function ReturnsPage({ content }: { content: ServicePagesContent["returns"] }) {
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
