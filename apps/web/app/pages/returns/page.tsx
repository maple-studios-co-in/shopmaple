import Link from "next/link";
import { ContactForm } from "@/components/contact-form";
export const metadata = { title: "Return & Exchange" };
export default function ReturnsPage() {
  return (
    <section className="editorial-page">
      <h1>Return &amp; Exchange</h1>
      <p>
        <Link href="/policies/refund-policy">
          Cancellation, Return &amp; Refund Policy
        </Link>
      </p>
      <p>
        Contact our team about your order. This form saves an enquiry; it does
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
