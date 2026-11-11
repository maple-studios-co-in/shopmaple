import Link from "next/link";
import { LoginForm } from "@/components/account/auth/auth-forms";
import { AuthShell } from "@/components/account/auth/auth-shell";
import { prepareAuthPage } from "@/lib/account/auth-page";
import { getPublishedContent } from "@/lib/content";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in", robots: { index: false, follow: false } };

/** /account/login (Figma 392:1652). `?next=` (a path on this site) is where signing in returns to. */
export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { next, preview } = await prepareAuthPage(searchParams);
  // From the checkout, a guest goes back to it; otherwise to the shop.
  const guest = next.startsWith("/checkout") ? "/checkout" : "/";
  return (
    <AuthShell
      editorial="login" media={preview ? undefined : (await getPublishedContent()).templateMedia}
      aside={<p className="auth-aside-line">Just browsing?&nbsp; <Link href={guest}>Continue as guest</Link></p>}
    >
      <LoginForm next={next} preview={preview} />
    </AuthShell>
  );
}
