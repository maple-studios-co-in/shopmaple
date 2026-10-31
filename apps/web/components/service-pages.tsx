import type { EnquiryContext } from "@/components/contact-form";

export { HelpCenter as Contact } from "@/components/store/help-center";
export { BulkEnquiry } from "@/components/store/bulk-enquiry";
export const emptyEnquiryContext: EnquiryContext = { product: "", variant: "", sku: "", pincode: "" };
export { ReturnsPage as ReturnsPageContent } from "@/components/store/returns-page";
