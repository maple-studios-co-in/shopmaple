import Link from "next/link";
import type { ReturnsPageContent } from "@shopmaple/contracts";
import { ContactForm } from "./returns-form";
import { editorialPage, editorialTitle, textLink } from "./current-look";

/** /pages/returns: the refund policy link, the fixed enquiry-only notice and the plain enquiry form. */
export function ReturnsPage({ content }: { content: ReturnsPageContent }) {
  return (
    <section data-store data-returns-page className={editorialPage}>
      <h1 className={editorialTitle}>{content.heading}</h1>
      <p className="my-2.5">
        <Link href="/policies/refund-policy" className={textLink}>
          {content.policyLabel}
        </Link>
      </p>
      <p className="my-2.5">
        {content.intro}{" "}This form saves an enquiry; it does
        not automatically approve a return or issue a refund.
      </p>
      <div className="mt-7 max-w-[700px]">
        <ContactForm
          context={{
            product: "Return & Exchange",
            variant: "",
            sku: "",
            pincode: "",
          }}
        />
      </div>
    </section>
  );
}
