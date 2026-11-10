import { CategoryLanding } from "@/components/category-landing";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chairs" };
export default function Page() {
  return <CategoryLanding slug="chairs" />;
}
