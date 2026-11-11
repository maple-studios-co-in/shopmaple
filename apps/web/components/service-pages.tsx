import type { ReturnsPageContent, SiteChrome } from "@shopmaple/contracts";
import type { EnquiryContext } from "@/lib/enquiry-context";
import { helpChromeFrom } from "@/components/store/help-page";
import { ReturnExchange } from "@/components/store/return-exchange";

export const emptyEnquiryContext: EnquiryContext = { product: "", variant: "", sku: "", pincode: "" };
// The contact page is its own file since the redesign (Figma 298:511, owner 10 Nov 2026).
export { ContactPage as Contact } from "@/components/contact-page";
// So is Bulk Enquiry (Figma 298:924, owner 10 Nov 2026).
export { BulkEnquiry } from "@/components/bulk-enquiry-page";
/** Return & Exchange is the last of the Help pages (see components/store/return-exchange.tsx). */
export function ReturnsPageContent({ content, footer }: { content: ReturnsPageContent; footer: SiteChrome["footer"] }) {
  return <ReturnExchange content={content} chrome={helpChromeFrom(footer)} />;
}
