import type { SiteChrome } from "@shopmaple/contracts";
import { helpChromeFrom } from "@/components/store/help-page";
import { PolicyDocument } from "@/components/store/policy-document";
import type { resolveEditorialContent } from "@/lib/editorial-content-defaults";

type Policy = ReturnType<typeof resolveEditorialContent>["policies"][string];

/**
 * A policy is written in the page editor and shown as its Help page; the footer gives the Help tabs and
 * the customer care contact.
 */
export function PolicyArticle({ policy, slug, footer }: { policy: Policy; slug: string; footer: SiteChrome["footer"] }) {
  return <PolicyDocument slug={slug} title={policy.title} content={policy.content} chrome={helpChromeFrom(footer)} />;
}
