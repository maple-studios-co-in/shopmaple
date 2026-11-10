import Link from "next/link";
import type { ReturnsPageContent } from "@shopmaple/contracts";
import { HelpPage, type HelpChrome } from "./help-page";
import { ReturnLookupForm } from "./return-lookup-form";

/**
 * Return & Exchange (Figma 150:3952, mobile 150:4558): the Help page head with the page's editable heading and
 * line, "Find your order", the care team's number, and what to have ready before raising a request.
 */
export function ReturnExchange({ content, chrome }: { content: ReturnsPageContent; chrome: HelpChrome }) {
  return (
    <HelpPage
      chrome={chrome}
      current="/returns"
      title={content.heading}
      opening={<p>{content.intro}</p>}
      photo="/media/policies/return-exchange.jpg"
      titleScale="compact"
    >
      <div className="flex flex-col items-center gap-6 pt-8 pb-12 lg:pt-[60px] lg:pb-20">
        <ReturnLookupForm care={chrome.care} />
        <p data-return-help className="text-center text-[15px] leading-[23px] font-medium text-maple">
          Need help? <a href={`tel:${chrome.care.phone}`} className="ml-1 hover:underline">{chrome.care.phoneLabel}</a>
        </p>
        <section data-return-guidance aria-labelledby="return-guidance-title" className="flex w-full max-w-[800px] flex-col gap-3 pt-6">
          <h2 id="return-guidance-title" className="text-[22px] leading-[34px] font-medium">Before you raise a request</h2>
          <p className="text-[16px] leading-[25px]">
            Report manufacturing defects or transit damage within 24–48 hours of delivery. Keep your order details and clear photos or videos ready. Claims are subject to inspection and approval by Maple Furnishers.
          </p>
          <p>
            <Link href="/policies/refund-policy" className="text-[15px] leading-[23px] font-medium text-maple after:ml-[7px] after:content-['↗'] hover:underline">
              {content.policyLabel}
            </Link>
          </p>
        </section>
      </div>
    </HelpPage>
  );
}
