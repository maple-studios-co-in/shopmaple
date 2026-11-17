import { AuthPageView } from "@/components/account/auth/auth-pages";
import { prepareAuthPage } from "@/lib/account/auth-page";
import { getPublishedContent } from "@/lib/content";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in", robots: { index: false, follow: false } };

/** /account/login (Figma 392:1652). `?next=` (a path on this site) is where signing in returns to. */
export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { next, preview } = await prepareAuthPage(searchParams);
  return <AuthPageView kind="login" next={next} preview={preview} media={preview ? undefined : (await getPublishedContent()).templateMedia} />;
}
