import type { Metadata } from "next";
import { AdminDashboard } from "@/components/admin/dashboard";
import { defaultStorefrontContent } from "@/lib/content-defaults";
import "@fontsource-variable/geist";
import "@/styles/admin.css";
export const metadata: Metadata = {
  title: "Shop admin",
  robots: { index: false, follow: false },
};
export default function AdminPage() {
  return <AdminDashboard initialContent={defaultStorefrontContent} />;
}
