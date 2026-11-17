import { AuthPageView } from "@/components/account/auth/auth-pages";
import { prepareAuthPage } from "@/lib/account/auth-page";
import { getPublishedContent } from "@/lib/content";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reset your password", robots: { index: false, follow: false } };

/** /account/forgot-password ("Forgot password?" on Figma 392:1652), drawn as the login page: an emailed code, then a new
 * password, which also signs in. */
export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { next, preview } = await prepareAuthPage(searchParams);
  return <AuthPageView kind="forgot-password" next={next} preview={preview} media={preview ? undefined : (await getPublishedContent()).templateMedia} />;
}
