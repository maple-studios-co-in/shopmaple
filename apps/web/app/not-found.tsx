import Link from "next/link";
import { button, emptyCopy, emptyState, pageTitle } from "@/components/store/current-look";
export default function NotFound() {
  return (
    <section data-store data-empty-state className={emptyState}>
      <h1 className={pageTitle}>We couldn’t find that page</h1>
      <p className={emptyCopy}>Let’s help you find a piece you’ll love.</p>
      <Link className={`${button} mt-3`} href="/collections/all">
        Explore furniture
      </Link>
    </section>
  );
}
