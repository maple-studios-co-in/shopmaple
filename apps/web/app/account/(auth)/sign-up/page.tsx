import { SignUpForm } from "@/components/account/auth/auth-forms";
import { AuthShell } from "@/components/account/auth/auth-shell";
import { prepareAuthPage } from "@/lib/account/auth-page";
import { getPublishedContent } from "@/lib/content";

export const dynamic = "force-dynamic";
export const metadata = { title: "Create your account", robots: { index: false, follow: false } };

/** /account/sign-up (Figma 392:1697): the details, then the code emailed to prove the address. */
export default async function SignUpPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { next, preview } = await prepareAuthPage(searchParams);
  return (
    <AuthShell editorial="sign-up" media={preview ? undefined : (await getPublishedContent()).templateMedia} aside={<p className="auth-aside-line">Thoughtfully made. Personally yours.</p>}>
      <SignUpForm next={next} preview={preview} />
    </AuthShell>
  );
}
