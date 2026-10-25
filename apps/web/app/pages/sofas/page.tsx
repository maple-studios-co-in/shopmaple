import { CategoryLanding } from "@/components/category-landing";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sofas" };
export default function Page() {
  return <CategoryLanding slug="sofas" />;
}
