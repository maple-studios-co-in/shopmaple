import { AuthPageView } from "@/components/account/auth/auth-pages";
import { prepareAuthPage } from "@/lib/account/auth-page";
import { getPublishedContent } from "@/lib/content";

export const dynamic = "force-dynamic";
export const metadata = { title: "Create your account", robots: { index: false, follow: false } };

/** /account/sign-up (Figma 392:1697): the details, then the code emailed to prove the address. */
export default async function SignUpPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { next, preview } = await prepareAuthPage(searchParams);
  return <AuthPageView kind="sign-up" next={next} preview={preview} media={preview ? undefined : (await getPublishedContent()).templateMedia} />;
}
